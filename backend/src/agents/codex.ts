import { BaseAgent } from './base.js';
import {
  AgentEvent,
  AgentInput,
  ExecutionContext,
  CodexNodeConfig,
  AgentStructuredOutput,
} from '../workflows/types.js';
import type {
  ThreadEvent,
  ThreadItem,
  CommandExecutionItem,
  FileChangeItem,
  McpToolCallItem,
  WebSearchItem,
  TodoListItem,
  ErrorItem,
} from '@openai/codex-sdk';
import { SDKMCPServersConfig } from '../mcp/config-converter.js';

// Note: These types represent the expected Codex SDK interface
// Actual imports would be:
// import { Codex } from '@openai/codex-sdk';

interface CodexThread {
  runStreamed(
    prompt: string,
    turnOptions?: CodexTurnOptions
  ): Promise<{ events: AsyncGenerator<ThreadEvent> }>;
}

interface CodexClient {
  startThread(options?: CodexThreadOptions): CodexThread;
  resumeThread(threadId: string, options?: CodexThreadOptions): CodexThread;
}

interface CodexThreadOptions {
  model?: string;
  sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';
  approvalPolicy?: 'untrusted' | 'on-request' | 'on-failure' | 'never';
  modelReasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  workingDirectory?: string;
  mcpServers?: SDKMCPServersConfig;
}

/**
 * MCP configuration for Codex agent.
 */
export interface CodexMCPConfig {
  mcpServers: SDKMCPServersConfig;
  env?: Record<string, string>;
}

interface CodexTurnOptions {
  outputSchema?: unknown;
  signal?: AbortSignal;
}

function getTextDelta(
  textByItemId: Map<string, string>,
  itemId: string,
  nextText: string
): string {
  const previous = textByItemId.get(itemId) ?? '';
  textByItemId.set(itemId, nextText);
  if (!nextText || nextText === previous) {
    return '';
  }
  return nextText.startsWith(previous) ? nextText.slice(previous.length) : nextText;
}

/**
 * Recursively ensure all object schemas meet OpenAI's strict requirements:
 * - additionalProperties: false
 * - required array must include every key in properties
 */
function ensureStrictSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const result = { ...schema };

  // For object schemas, ensure additionalProperties and required
  if (result.type === 'object') {
    if (result.additionalProperties === undefined) {
      result.additionalProperties = false;
    }

    // Ensure required includes all property keys
    if (result.properties && typeof result.properties === 'object') {
      const propKeys = Object.keys(result.properties as Record<string, unknown>);
      const existingRequired = Array.isArray(result.required) ? result.required as string[] : [];
      const missingRequired = propKeys.filter((key) => !existingRequired.includes(key));
      if (missingRequired.length > 0) {
        result.required = [...existingRequired, ...missingRequired];
      }
    }
  }

  // Recursively process nested properties
  if (result.properties && typeof result.properties === 'object') {
    const props: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(result.properties as Record<string, unknown>)) {
      if (value && typeof value === 'object') {
        props[key] = ensureStrictSchema(value as Record<string, unknown>);
      } else {
        props[key] = value;
      }
    }
    result.properties = props;
  }

  // Process items for arrays
  if (result.items && typeof result.items === 'object') {
    result.items = ensureStrictSchema(result.items as Record<string, unknown>);
  }

  // Process anyOf, oneOf, allOf
  for (const combiner of ['anyOf', 'oneOf', 'allOf']) {
    if (Array.isArray(result[combiner])) {
      result[combiner] = (result[combiner] as unknown[]).map((item) =>
        item && typeof item === 'object'
          ? ensureStrictSchema(item as Record<string, unknown>)
          : item
      );
    }
  }

  return result;
}

function parseOutputSchema(schemaText: string): unknown {
  try {
    const schema = JSON.parse(schemaText);
    // Ensure the schema meets OpenAI's strict requirements
    if (schema && typeof schema === 'object') {
      return ensureStrictSchema(schema as Record<string, unknown>);
    }
    return schema;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Invalid JSON schema for structured output: ${message}`);
  }
}

/**
 * Transform a Codex ThreadItem into AgentEvents.
 * Maps Codex-specific items to unified tool-use/tool-result events.
 */
function transformItemToEvents(
  item: ThreadItem,
  eventType: 'started' | 'updated' | 'completed',
  textByItemId: Map<string, string>
): AgentEvent[] {
  const events: AgentEvent[] = [];

  switch (item.type) {
    case 'agent_message': {
      const delta = getTextDelta(textByItemId, item.id, item.text);
      if (delta) {
        events.push({ type: 'text-delta', content: delta });
      }
      break;
    }

    case 'reasoning': {
      if (eventType === 'completed') {
        events.push({ type: 'thinking', content: item.text });
      }
      break;
    }

    case 'command_execution': {
      const cmdItem = item as CommandExecutionItem;
      if (eventType === 'started') {
        events.push({
          type: 'tool-use',
          id: cmdItem.id,
          name: 'Bash',
          input: { command: cmdItem.command },
        });
      } else if (eventType === 'completed') {
        let result = cmdItem.aggregated_output || '';
        if (cmdItem.exit_code !== undefined && cmdItem.exit_code !== 0) {
          result += `\n[Exit code: ${cmdItem.exit_code}]`;
        }
        events.push({
          type: 'tool-result',
          name: cmdItem.id,
          result: result || '(no output)',
        });
      }
      break;
    }

    case 'file_change': {
      const fileItem = item as FileChangeItem;
      if (eventType === 'started') {
        const changeDescriptions = fileItem.changes.map(
          (c) => `${c.kind}: ${c.path}`
        );
        events.push({
          type: 'tool-use',
          id: fileItem.id,
          name: 'FileChange',
          input: { changes: changeDescriptions },
        });
      } else if (eventType === 'completed') {
        const status = fileItem.status === 'completed' ? 'Success' : 'Failed';
        const summary = fileItem.changes
          .map((c) => `${c.kind}: ${c.path}`)
          .join('\n');
        events.push({
          type: 'tool-result',
          name: fileItem.id,
          result: `${status}\n${summary}`,
        });
      }
      break;
    }

    case 'mcp_tool_call': {
      const mcpItem = item as McpToolCallItem;
      if (eventType === 'started') {
        events.push({
          type: 'tool-use',
          id: mcpItem.id,
          name: `${mcpItem.server}:${mcpItem.tool}`,
          input: mcpItem.arguments as Record<string, unknown>,
        });
      } else if (eventType === 'completed') {
        let result: string;
        if (mcpItem.error) {
          result = `Error: ${mcpItem.error.message}`;
        } else if (mcpItem.result) {
          result = JSON.stringify(mcpItem.result.structured_content ?? mcpItem.result.content, null, 2);
        } else {
          result = '(no result)';
        }
        events.push({
          type: 'tool-result',
          name: mcpItem.id,
          result,
        });
      }
      break;
    }

    case 'web_search': {
      const searchItem = item as WebSearchItem;
      if (eventType === 'started') {
        events.push({
          type: 'tool-use',
          id: searchItem.id,
          name: 'WebSearch',
          input: { query: searchItem.query },
        });
      } else if (eventType === 'completed') {
        events.push({
          type: 'tool-result',
          name: searchItem.id,
          result: `Search completed for: ${searchItem.query}`,
        });
      }
      break;
    }

    case 'todo_list': {
      const todoItem = item as TodoListItem;
      // Emit todo-list events for real-time UI updates
      if (todoItem.items.length > 0) {
        events.push({
          type: 'todo-list',
          items: todoItem.items.map((t) => ({
            text: t.text,
            completed: t.completed,
          })),
        });
      }
      break;
    }

    case 'error': {
      const errorItem = item as ErrorItem;
      events.push({ type: 'error', message: errorItem.message });
      break;
    }
  }

  return events;
}

/**
 * OpenAI Codex SDK wrapper implementing the BaseAgent interface.
 * Provides execution with thread management for conversation continuity.
 * Supports structured outputs.
 */
export class CodexAgent extends BaseAgent {
  private config: CodexNodeConfig;
  private mcpConfig?: CodexMCPConfig;
  private codex: CodexClient | null = null;
  private thread: CodexThread | null = null;
  private threadId?: string;
  private structuredOutput?: AgentStructuredOutput;

  constructor(config: CodexNodeConfig, mcpConfig?: CodexMCPConfig) {
    super();
    this.config = config;
    this.mcpConfig = mcpConfig;
  }

  async *execute(
    input: AgentInput,
    context: ExecutionContext
  ): AsyncGenerator<AgentEvent, void, unknown> {
    const abortController = this.createAbortController();
    this.structuredOutput = undefined;
    const outputSchema = input.outputConfig?.schema
      ? parseOutputSchema(input.outputConfig.schema)
      : undefined;
    const useStructuredOutput = Boolean(outputSchema);

    try {
      // Dynamically import the Codex SDK
      const { Codex } = await import('@openai/codex-sdk');
      this.codex = new Codex() as unknown as CodexClient;

      const threadOptions: CodexThreadOptions = {
        model: this.config.model,
        sandboxMode: this.config.sandbox,
        approvalPolicy: this.config.approvalPolicy,
        modelReasoningEffort: this.config.reasoningEffort,
        workingDirectory: input.workingDirectory || context.workingDirectory,
      };

      // Add MCP servers if configured
      if (this.mcpConfig?.mcpServers && Object.keys(this.mcpConfig.mcpServers).length > 0) {
        threadOptions.mcpServers = this.mcpConfig.mcpServers;
        console.log(`[CodexAgent] MCP servers configured: ${Object.keys(this.mcpConfig.mcpServers).join(', ')}`);
      }

      // Start or resume a thread
      if (input.sessionId) {
        this.thread = this.codex.resumeThread(input.sessionId, threadOptions);
        this.threadId = input.sessionId;
      } else {
        this.thread = this.codex.startThread(threadOptions);
      }

      // Build the prompt from userQuery
      const prompt = this.buildPrompt(input);

      // Yield that we're starting
      yield { type: 'text-delta', content: `Starting Codex agent: ${this.config.name}\n` };

      // Check for abort before running
      if (abortController.signal.aborted) {
        yield { type: 'error', message: 'Execution interrupted' };
        return;
      }

      const textByItemId = new Map<string, string>();
      let finalResponse = '';
      let streamedText = '';
      let completeEmitted = false;

      const { events } = await this.thread.runStreamed(prompt, {
        signal: abortController.signal,
        outputSchema,
      });

      for await (const event of events) {
        if (abortController.signal.aborted) {
          yield { type: 'error', message: 'Execution interrupted' };
          return;
        }

        switch (event.type) {
          case 'thread.started':
            this.threadId = event.thread_id;
            break;

          case 'item.started':
          case 'item.updated':
          case 'item.completed': {
            const item: ThreadItem = event.item;
            const eventType = event.type === 'item.started'
              ? 'started'
              : event.type === 'item.updated'
                ? 'updated'
                : 'completed';

            // Transform the item to AgentEvents using the unified function
            const agentEvents = transformItemToEvents(item, eventType, textByItemId);
            for (const agentEvent of agentEvents) {
              yield agentEvent;

              // Track text for final response
              if (agentEvent.type === 'text-delta') {
                streamedText += agentEvent.content;
              }
            }

            // Capture final response from completed agent_message
            if (item.type === 'agent_message' && event.type === 'item.completed') {
              finalResponse = item.text;
            }
            break;
          }

          case 'turn.completed':
            if (!completeEmitted) {
              yield { type: 'complete', result: finalResponse || streamedText };
              completeEmitted = true;
            }
            break;

          case 'turn.failed':
            yield {
              type: 'error',
              message: event.error?.message || 'Unknown error',
            };
            return;

          case 'error':
            yield {
              type: 'error',
              message: event.message || 'Unknown error',
            };
            return;

          default:
            break;
        }
      }

      if (!completeEmitted) {
        yield { type: 'complete', result: finalResponse || streamedText };
      }

      if (useStructuredOutput) {
        const raw = finalResponse || streamedText;
        if (!raw) {
          throw new Error('Structured output requested, but no response was returned');
        }
        try {
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          this.structuredOutput = {
            format: 'json',
            filePath: input.outputConfig?.filePath || '',
            content: typeof raw === 'string' ? raw : JSON.stringify(raw),
            parsedJson: parsed,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          throw new Error(`Failed to parse structured output JSON: ${message}`);
        }
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        yield { type: 'error', message: 'Execution interrupted' };
      } else {
        yield {
          type: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    } finally {
      this.cleanup();
    }
  }

  private buildPrompt(input: AgentInput): string {
    return input.prompt;
  }

  /**
   * Get the current thread ID for resumption.
   */
  getThreadId(): string | undefined {
    return this.threadId;
  }

  /**
   * Get the current session ID for resumption (alias for getThreadId).
   */
  getSessionId(): string | undefined {
    return this.threadId;
  }

  /**
   * Get the structured output from the last execution.
   */
  getStructuredOutput(): AgentStructuredOutput | undefined {
    return this.structuredOutput;
  }

  /**
   * Override cleanup to also clear SDK references.
   */
  protected cleanup(): void {
    super.cleanup();
    this.thread = null;
  }
}

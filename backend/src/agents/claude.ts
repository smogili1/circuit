import { BaseAgent } from './base.js';
import {
  AgentEvent,
  AgentInput,
  ExecutionContext,
  ClaudeNodeConfig,
  AgentStructuredOutput,
} from '../workflows/types.js';
import { SDKMCPServersConfig } from '../mcp/config-converter.js';

// MCP configuration for the agent
interface MCPAgentConfig {
  mcpServers: SDKMCPServersConfig;
  env: Record<string, string>;
  allowedToolPatterns: string[];  // Tool patterns like 'mcp__server-name__*' or specific tool names
}

// Note: These types represent the expected SDK interface
// Actual imports would be:
// import { query, ClaudeAgentOptions, AssistantMessage, TextBlock, ToolUseBlock, ToolResultBlock, ResultMessage } from '@anthropic-ai/claude-agent-sdk';

interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  id?: string;  // tool_use block id
  input?: Record<string, unknown>;
  thinking?: string;
  tool_use_id?: string;  // tool_result reference
  content?: unknown;
}

type MessageContent = ContentBlock[] | string | Record<string, unknown>;

interface ClaudeMessage {
  type: string;
  // For 'assistant' and 'user' types, content is nested inside a 'message' property
  message?: {
    role?: string;
    content?: MessageContent;
  };
  // For 'result' type, these fields are at top level
  subtype?: string;
  result?: string;
  structured_output?: unknown;
  errors?: string[];
  tool_use_result?: unknown;
  parent_tool_use_id?: string | null;
  session_id?: string;
}

function parseOutputSchema(schemaText: string): unknown {
  try {
    return JSON.parse(schemaText);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Invalid JSON schema for structured output: ${message}`);
  }
}

function normalizeContentBlocks(message: ClaudeMessage): ContentBlock[] {
  const content = message.message?.content;
  if (content === undefined || content === null) {
    return [];
  }
  if (Array.isArray(content)) {
    return content;
  }
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }
  return [{ type: 'text', text: formatToolResult(content) }];
}

function formatToolResult(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (content === null || content === undefined) {
    return '';
  }
  try {
    return JSON.stringify(content, null, 2);
  } catch (error) {
    return String(content);
  }
}

/**
 * Claude Agent SDK wrapper implementing the BaseAgent interface.
 * Provides streaming execution with support for tool use and interruption.
 * Supports structured outputs.
 */
export class ClaudeAgent extends BaseAgent {
  private config: ClaudeNodeConfig;
  private mcpConfig?: MCPAgentConfig;
  private sessionId?: string;
  private structuredOutput?: AgentStructuredOutput;
  // Store reference to the active stream so we can close it on interrupt
  private activeStream?: AsyncIterable<unknown> & { close?: () => void };

  constructor(config: ClaudeNodeConfig, mcpConfig?: MCPAgentConfig) {
    super();
    this.config = config;
    this.mcpConfig = mcpConfig;
  }

  /**
   * Interrupt the currently running execution.
   * Closes the SDK stream to break out of the blocking for-await loop.
   */
  async interrupt(): Promise<void> {
    console.log('[ClaudeAgent] Interrupt called');
    // First abort the controller to signal we want to stop
    await super.interrupt();

    // Then close the active stream if it exists
    // This breaks the for-await loop that may be blocked waiting for the next message
    if (this.activeStream) {
      const iterator = this.activeStream[Symbol.asyncIterator]?.();
      if (iterator?.return) {
        try {
          await iterator.return(undefined);
        } catch (e) {
          // Ignore errors when closing the stream
          console.log('[ClaudeAgent] Error closing stream:', e);
        }
      }
      if (typeof this.activeStream.close === 'function') {
        try {
          this.activeStream.close();
        } catch (e) {
          console.log('[ClaudeAgent] Error closing query:', e);
        }
      }
      this.activeStream = undefined;
    }
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

    console.log('[ClaudeAgent] Starting execution with input:', JSON.stringify(input, null, 2).slice(0, 500));

    try {
      // Build the prompt from userQuery
      const prompt = this.buildPrompt(input);
      console.log('[ClaudeAgent] Built prompt:', prompt.slice(0, 500));

      // Dynamically import the Claude Agent SDK
      console.log('[ClaudeAgent] Importing Claude SDK...');
      const { query } = await import('@anthropic-ai/claude-agent-sdk');
      console.log('[ClaudeAgent] SDK imported successfully');

      // Combine regular tools with MCP tool patterns
      const allowedTools = [...(this.config.tools || [])];
      if (this.mcpConfig?.allowedToolPatterns) {
        allowedTools.push(...this.mcpConfig.allowedToolPatterns);
      }

      // Build options object, only including defined values
      const options: Record<string, unknown> = {
        cwd: input.workingDirectory || context.workingDirectory,
        model: this.config.model,
        abortController,
      };

      // Only add allowedTools if there are any
      if (allowedTools.length > 0) {
        options.allowedTools = allowedTools;
      }

      // Only add systemPrompt if defined
      if (this.config.systemPrompt) {
        options.systemPrompt = this.config.systemPrompt;
      }

      // Only add resume/sessionId if defined
      const sessionId = input.sessionId || this.sessionId;
      if (sessionId) {
        options.resume = sessionId;
      }

      // Only add outputFormat if schema is defined
      if (outputSchema) {
        options.outputFormat = { type: 'json_schema', schema: outputSchema };
      }

      // Only set maxTurns if explicitly configured
      if (this.config.maxTurns !== undefined) {
        options.maxTurns = this.config.maxTurns;
      }

      // Add MCP servers if configured
      if (this.mcpConfig) {
        options.mcpServers = this.mcpConfig.mcpServers;
        if (Object.keys(this.mcpConfig.env).length > 0) {
          options.env = { ...process.env, ...this.mcpConfig.env };
        }
        console.log('[ClaudeAgent] MCP servers configured:', Object.keys(this.mcpConfig.mcpServers));
      }

      console.log('[ClaudeAgent] Calling query with options:', options);

      const stream = query({
        prompt,
        options,
      });

      // Store reference to stream so we can close it on interrupt
      this.activeStream = stream;

      console.log('[ClaudeAgent] Stream created, iterating...');
      for await (const message of stream) {
        console.log('[ClaudeAgent] Received message:', JSON.stringify(message).slice(0, 200));
        const resultMessage = message as ClaudeMessage;
        // Check for abort
        if (abortController.signal.aborted) {
          yield { type: 'error', message: 'Execution interrupted' };
          return;
        }

        // Capture session ID for future resumption (must be outside inner loop
        // because transformMessage returns empty array for 'system' messages)
        if (
          resultMessage.type === 'system' &&
          resultMessage.subtype === 'init'
        ) {
          this.sessionId = resultMessage.session_id;
          console.log('[ClaudeAgent] Captured session ID:', this.sessionId);
        }

        if (resultMessage.type === 'result' && resultMessage.structured_output !== undefined) {
          const content = JSON.stringify(resultMessage.structured_output);
          this.structuredOutput = {
            format: 'json',
            filePath: input.outputConfig?.filePath || '',
            content,
            parsedJson: resultMessage.structured_output,
          };
        }

        // Transform Claude SDK messages to unified AgentEvents
        const events = this.transformMessage(resultMessage);
        for (const event of events) {
          yield event;
        }
      }
    } catch (error) {
      yield {
        type: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      this.activeStream = undefined;
      this.cleanup();
    }
  }

  private buildPrompt(input: AgentInput): string {
    return input.prompt;
  }

  private transformMessage(message: ClaudeMessage): AgentEvent[] {
    const events: AgentEvent[] = [];

    if (message.type === 'assistant') {
      for (const block of normalizeContentBlocks(message)) {
        if (block.type === 'text' && block.text) {
          events.push({ type: 'text-delta', content: block.text });
        } else if (block.type === 'tool_use' && block.name) {
          const input = block.input && typeof block.input === 'object'
            ? block.input as Record<string, unknown>
            : {};
          events.push({
            type: 'tool-use',
            id: block.id,
            name: block.name,
            input,
          });

          if (block.name === 'TodoWrite') {
            const todos = (input as { todos?: unknown }).todos;
            if (Array.isArray(todos)) {
              events.push({
                type: 'todo-list',
                items: todos.map((t) => {
                  const todo = t as { content?: string; status?: string; activeForm?: string };
                  return {
                    text: todo.activeForm || todo.content || '',
                    completed: todo.status === 'completed',
                  };
                }),
              });
            }
          }
        } else if (block.type === 'thinking') {
          const thinking = block.thinking ?? block.text;
          if (thinking) {
            events.push({ type: 'thinking', content: thinking });
          }
        }
      }
    } else if (message.type === 'user') {
      const blocks = normalizeContentBlocks(message);
      for (const block of blocks) {
        if (block.type === 'tool_result') {
          const resultContent = block.content ?? block.text;
          events.push({
            type: 'tool-result',
            name: block.tool_use_id || 'tool',
            result: formatToolResult(resultContent),
          });
        }
      }
      if (blocks.length === 0 && message.tool_use_result !== undefined) {
        events.push({
          type: 'tool-result',
          name: message.parent_tool_use_id || 'tool',
          result: formatToolResult(message.tool_use_result),
        });
      }
    } else if (message.type === 'result') {
      if (message.subtype === 'success') {
        events.push({ type: 'complete', result: message.result || '' });
      } else {
        const errorMessage = message.errors && message.errors.length > 0
          ? message.errors.join('\n')
          : message.subtype || 'Unknown error';
        events.push({ type: 'error', message: errorMessage });
      }
    }

    return events;
  }

  /**
   * Get the current session ID for resumption.
   */
  getSessionId(): string | undefined {
    return this.sessionId;
  }

  /**
   * Get the structured output from the last execution.
   */
  getStructuredOutput(): AgentStructuredOutput | undefined {
    return this.structuredOutput;
  }

}

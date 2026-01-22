/**
 * Shared utilities and generic executor for agent nodes (Claude and Codex).
 * Contains common functions and the main execution logic used by both agent types.
 */

import path from 'path';
import fs from 'fs';
import {
  ExecutionResult,
  ExecutorContext,
  ExecutorEmitter,
} from './types.js';
import {
  WorkflowNode,
  AgentInput,
  AgentSessionState,
  AgentEvent,
  ApprovalNodeConfig,
  AgentStructuredOutput,
  ExecutionContext,
  RejectionHandlerConfig,
  ConversationMode,
  AgentOutputConfig,
} from '../../workflows/types.js';
import { ExecutionError, ErrorCodes } from '../errors.js';

// =============================================================================
// Shared Utility Functions
// =============================================================================

/**
 * Check if any predecessor is an approval node that rejected.
 * Returns the rejection feedback if found.
 */
export function getRejectionFeedback(
  nodeId: string,
  context: ExecutorContext
): { feedback: string; approvalNodeName: string } | null {
  const predecessorIds = context.getPredecessorIds(nodeId);

  for (const predId of predecessorIds) {
    const predNode = context.nodes.find((n) => n.id === predId);
    if (!predNode || predNode.type !== 'approval') continue;

    const predOutput = context.getNodeOutput(predId) as {
      approved?: boolean;
      feedback?: string;
    } | undefined;

    if (predOutput && predOutput.approved === false && predOutput.feedback) {
      return {
        feedback: predOutput.feedback,
        approvalNodeName: (predNode.data as ApprovalNodeConfig).name,
      };
    }
  }

  return null;
}

/**
 * Get stored session state for this node.
 */
export function getSessionState(
  nodeId: string,
  context: ExecutorContext
): AgentSessionState | null {
  const state = context.getVariable(`agent.session.${nodeId}`) as AgentSessionState | undefined;
  return state || null;
}

/**
 * Store session state for this node.
 */
export function setSessionState(
  nodeId: string,
  state: AgentSessionState,
  context: ExecutorContext
): void {
  context.setVariable(`agent.session.${nodeId}`, state);
}

// =============================================================================
// Generic Agent Executor Types
// =============================================================================

/**
 * Common agent config fields used by the generic executor.
 * Uses Partial types to match schema-inferred types where properties may be undefined.
 */
export interface AgentNodeConfig {
  name: string;
  userQuery: string;
  model?: string;
  workingDirectory?: string;
  outputConfig?: AgentOutputConfig;
  conversationMode?: ConversationMode;
  rejectionHandler?: Partial<RejectionHandlerConfig>;
}

/**
 * Interface for agents that can be used with the generic executor.
 */
export interface ExecutableAgent {
  execute(input: AgentInput, context: ExecutionContext): AsyncGenerator<AgentEvent, void, unknown>;
  getSessionId(): string | undefined;
  getStructuredOutput(): AgentStructuredOutput | undefined;
}

/**
 * Options for the generic agent executor.
 */
export interface GenericAgentExecutorOptions<TConfig extends AgentNodeConfig, TMCPConfig> {
  /** Node type name for logging */
  nodeType: string;
  /** Extract the agent config from node data */
  getConfig: (node: WorkflowNode) => TConfig;
  /** Build MCP configuration from node config */
  buildMCPConfig: (config: TConfig) => Promise<TMCPConfig | null>;
  /** Create the agent instance */
  createAgent: (config: TConfig, mcpConfig: TMCPConfig | undefined) => ExecutableAgent;
  /** Interpolate config-specific fields (e.g., systemPrompt for Claude, baseInstructions for Codex) */
  interpolateConfig: (config: TConfig, context: ExecutorContext) => TConfig;
  /** Handle agent-specific events (e.g., tool-use for Claude). Return true if handled. */
  handleEvent?: (
    event: AgentEvent,
    transcriptParts: string[],
    flushText: () => void
  ) => boolean;
}

// =============================================================================
// Generic Agent Executor
// =============================================================================

/**
 * Generic executor for agent nodes.
 * Handles common logic for Claude and Codex agents:
 * - Session continuation for rejection loops and persist mode
 * - Run count tracking
 * - Retry count management
 * - Prompt building with rejection feedback
 * - Working directory validation
 * - Event streaming and transcript accumulation
 * - Structured output handling
 * - Session state storage
 */
export async function executeAgentNode<TConfig extends AgentNodeConfig, TMCPConfig>(
  node: WorkflowNode,
  context: ExecutorContext,
  emit: ExecutorEmitter,
  options: GenericAgentExecutorOptions<TConfig, TMCPConfig>
): Promise<ExecutionResult> {
  const { nodeType, getConfig, buildMCPConfig, createAgent, interpolateConfig, handleEvent } = options;

  console.log(`[${nodeType}Executor] Executing node: ${node.id} (${node.data.name})`);

  const config = getConfig(node);
  if (!config.userQuery || config.userQuery.trim() === '') {
    throw new ExecutionError({
      code: ErrorCodes.MISSING_INPUT,
      message: `userQuery is required for node ${config.name}`,
      recoverable: false,
      nodeId: node.id,
    });
  }

  // Check for rejection feedback (indicates this is a retry after user rejected)
  const rejectionInfo = getRejectionFeedback(node.id, context);
  const existingSession = getSessionState(node.id, context);

  // Determine if we should continue the session:
  // 1. Rejection handler with continueSession enabled, OR
  // 2. conversationMode is 'persist' and we have an existing session (loop re-execution)
  const shouldContinueSessionForRejection =
    rejectionInfo &&
    existingSession &&
    config.rejectionHandler?.enabled &&
    config.rejectionHandler?.continueSession;

  const shouldContinueSessionForLoop =
    !rejectionInfo &&
    existingSession &&
    config.conversationMode === 'persist';

  const shouldContinueSession = shouldContinueSessionForRejection || shouldContinueSessionForLoop;

  // Calculate run count for this execution
  const previousRunCount = existingSession?.runCount || 0;
  const currentRunCount = previousRunCount + 1;

  // Store runCount as a variable for reference interpolation (e.g., {{NodeName.runCount}})
  context.setVariable(`node.${node.id}.runCount`, currentRunCount);

  // Check retry count
  if (rejectionInfo && config.rejectionHandler?.enabled) {
    const retryCount = existingSession?.retryCount || 0;
    const maxRetries = config.rejectionHandler.maxRetries || 3;

    if (retryCount >= maxRetries) {
      const onMaxRetries = config.rejectionHandler.onMaxRetries || 'fail';

      if (onMaxRetries === 'fail') {
        throw new ExecutionError({
          code: ErrorCodes.AGENT_ERROR,
          message: `Maximum retries (${maxRetries}) exceeded for node ${config.name}`,
          recoverable: false,
          nodeId: node.id,
        });
      } else if (onMaxRetries === 'skip') {
        return {
          output: existingSession?.lastOutput || '',
          metadata: { skipped: true, reason: 'max_retries_exceeded' },
        };
      }
      // 'approve-anyway' continues execution
    }
  }

  // Clone config and interpolate references in text fields
  const interpolatedConfig = interpolateConfig({ ...config }, context);

  // Build MCP server configuration
  const mcpConfig = await buildMCPConfig(config);

  // Create the agent with MCP config
  const agent = createAgent(interpolatedConfig, mcpConfig || undefined);

  // Collect predecessor outputs (available for reference interpolation)
  const previousOutputs = context.getPredecessorOutputs(node.id);

  // Check if any successor requires JSON input
  const requiresJsonOutput = context.successorRequiresJson(node.id);

  // Get output config from node config, or generate default
  const outputDirectory = context.getOutputDirectory();
  const outputConfig = config.outputConfig || {
    format: requiresJsonOutput ? 'json' : 'text',
    filePath: path.join(outputDirectory, `${node.id}.${requiresJsonOutput ? 'json' : 'txt'}`),
  };

  // Build prompt from userQuery (with rejection feedback when needed)
  let prompt: string;
  if (rejectionInfo && shouldContinueSession) {
    // Build feedback prompt for same-session retry
    const feedbackTemplate =
      config.rejectionHandler?.feedbackTemplate ||
      `The user rejected your previous output.\nFeedback from ${rejectionInfo.approvalNodeName}: {{feedback}}\nPlease revise your response accordingly.`;

    prompt = feedbackTemplate.replace('{{feedback}}', rejectionInfo.feedback);
    prompt = context.interpolate(prompt);
  } else if (rejectionInfo && config.rejectionHandler?.enabled) {
    // New session retry - include feedback in prompt context
    const feedbackTemplate =
      config.rejectionHandler?.feedbackTemplate ||
      `Previous attempt was rejected.\nUser feedback: {{feedback}}\nPlease address this feedback in your response.`;

    const feedbackPrefix = feedbackTemplate.replace('{{feedback}}', rejectionInfo.feedback);
    prompt = `${feedbackPrefix}\n\n${context.interpolate(config.userQuery)}`;
  } else {
    prompt = context.interpolate(config.userQuery);
  }

  const workingDirectory = context.getWorkingDirectory(config.workingDirectory);

  // Validate working directory exists (spawn fails with misleading ENOENT if cwd doesn't exist)
  if (!fs.existsSync(workingDirectory)) {
    throw new ExecutionError({
      code: ErrorCodes.VALIDATION_FAILED,
      message: `Working directory does not exist: ${workingDirectory}`,
      recoverable: false,
      nodeId: node.id,
    });
  }

  const input: AgentInput = {
    prompt,
    previousOutputs,
    workingDirectory,
    outputConfig,
    requiresJsonOutput,
    sessionId: shouldContinueSession ? existingSession!.sessionId : undefined,
  };

  let result = '';
  const transcriptParts: string[] = [];
  let textBuffer = '';
  let sawText = false;
  let accumulatedTranscript = existingSession?.accumulatedTranscript || '';

  const flushText = () => {
    if (textBuffer) {
      transcriptParts.push(`[assistant]\n${textBuffer}`);
      textBuffer = '';
    }
  };

  // Add run header for clarity in logs
  transcriptParts.push(`=== ${config.name} (Run #${currentRunCount}) ===`);
  transcriptParts.push(`Prompt:\n${prompt}`);

  // Emit run-start event so frontend can display a visual separator between runs
  emit.emit('event', {
    type: 'node-output',
    nodeId: node.id,
    event: {
      type: 'run-start',
      runCount: currentRunCount,
      nodeName: config.name,
    },
  });

  try {
    for await (const event of agent.execute(input, context.executionContext)) {
      // Check if execution was aborted
      if (context.abortSignal.aborted) {
        throw new ExecutionError({
          code: ErrorCodes.AGENT_ERROR,
          message: 'Execution interrupted',
          recoverable: false,
          nodeId: node.id,
        });
      }

      emit.emit('event', {
        type: 'node-output',
        nodeId: node.id,
        event,
      });

      // Let agent-specific handler process the event first
      if (handleEvent && handleEvent(event, transcriptParts, flushText)) {
        continue;
      }

      // Handle common events
      switch (event.type) {
        case 'text-delta':
          result += event.content;
          textBuffer += event.content;
          sawText = true;
          break;

        case 'complete':
          result = event.result;
          if (!sawText && event.result) {
            transcriptParts.push(`[assistant]\n${event.result}`);
          }
          break;

        case 'thinking':
          flushText();
          transcriptParts.push(`[thinking]\n${event.content}`);
          break;

        case 'error':
          flushText();
          transcriptParts.push(`[error]\n${event.message}`);
          throw new ExecutionError({
            code: ErrorCodes.AGENT_ERROR,
            message: event.message,
            recoverable: false,
            nodeId: node.id,
          });

        default:
          break;
      }
    }
  } finally {
    flushText();

    // Build this run's transcript
    const currentRunTranscript = transcriptParts.join('\n\n');

    // Accumulate transcripts: append to existing accumulated transcript
    // This preserves history across all runs (both persist and fresh modes)
    accumulatedTranscript = accumulatedTranscript
      ? `${accumulatedTranscript}\n\n${currentRunTranscript}`
      : currentRunTranscript;

    // Store the full accumulated transcript so downstream nodes see complete history
    context.setVariable(`node.${node.id}.transcript`, accumulatedTranscript);

    // Also store this run's transcript separately for granular access if needed
    context.setVariable(`node.${node.id}.transcript.run${currentRunCount}`, currentRunTranscript);
  }

  // Get structured output if available
  const structuredOutput = agent.getStructuredOutput();
  let finalOutput: unknown;

  // Build output object with standard fields plus any structured output
  if (structuredOutput?.parsedJson !== undefined) {
    // Merge structured output with standard fields
    finalOutput = {
      ...(typeof structuredOutput.parsedJson === 'object' ? structuredOutput.parsedJson : {}),
      result: typeof structuredOutput.parsedJson === 'object' ? structuredOutput.parsedJson : result,
      runCount: currentRunCount,
      transcript: accumulatedTranscript,
    };
  } else {
    // Text output - wrap in standard object
    finalOutput = {
      result,
      runCount: currentRunCount,
      transcript: accumulatedTranscript,
    };
  }

  // Store session state for potential retry and loop tracking
  const sessionId = agent.getSessionId();
  if (sessionId) {
    const prevRetryCount = existingSession?.retryCount || 0;
    const newSessionState: AgentSessionState = {
      sessionId,
      nodeId: node.id,
      conversationHistory: [], // SDK handles history internally
      lastOutput: finalOutput,
      retryCount: rejectionInfo ? prevRetryCount + 1 : 0,
      runCount: currentRunCount,
      accumulatedTranscript,
      createdAt: existingSession?.createdAt || new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
    };
    setSessionState(node.id, newSessionState, context);
  }

  return {
    output: finalOutput,
    metadata: {
      model: config.model,
      hasStructuredOutput: !!structuredOutput,
      isRetry: !!rejectionInfo,
      retryCount: existingSession?.retryCount || 0,
      runCount: currentRunCount,
    },
    structuredOutput,
  };
}

/**
 * Approval node executor.
 * Pauses workflow execution until user approves or rejects.
 * Supports rejection feedback loops back to agent nodes.
 */

import {
  NodeExecutor,
  ExecutionResult,
  ValidationResult,
  ExecutorContext,
  ExecutorEmitter,
} from './types.js';
import {
  WorkflowNode,
  ApprovalNodeConfig,
  ApprovalRequest,
  ApprovalResponse,
} from '../../workflows/types.js';

// Map of pending approvals: executionId:nodeId -> resolver
const pendingApprovals = new Map<
  string,
  {
    resolve: (response: ApprovalResponse) => void;
    reject: (error: Error) => void;
    timeoutId?: NodeJS.Timeout;
  }
>();

/**
 * Generate a unique key for pending approval lookup
 */
function getApprovalKey(executionId: string, nodeId: string): string {
  return `${executionId}:${nodeId}`;
}

/**
 * Submit an approval response from the client.
 * Called by the WebSocket handler when user submits approval.
 */
export function submitApproval(
  executionId: string,
  nodeId: string,
  response: ApprovalResponse
): boolean {
  const key = getApprovalKey(executionId, nodeId);
  const pending = pendingApprovals.get(key);

  if (!pending) {
    return false;
  }

  // Clear timeout if set
  if (pending.timeoutId) {
    clearTimeout(pending.timeoutId);
  }

  // Resolve the promise
  pending.resolve(response);
  pendingApprovals.delete(key);

  return true;
}

/**
 * Cancel a pending approval (e.g., when execution is interrupted)
 */
export function cancelApproval(executionId: string, nodeId: string): boolean {
  const key = getApprovalKey(executionId, nodeId);
  const pending = pendingApprovals.get(key);

  if (!pending) {
    return false;
  }

  if (pending.timeoutId) {
    clearTimeout(pending.timeoutId);
  }

  pending.reject(new Error('Approval cancelled'));
  pendingApprovals.delete(key);

  return true;
}

/**
 * Cancel all pending approvals for an execution
 */
export function cancelAllApprovals(executionId: string): void {
  for (const [key, pending] of pendingApprovals.entries()) {
    if (key.startsWith(`${executionId}:`)) {
      if (pending.timeoutId) {
        clearTimeout(pending.timeoutId);
      }
      pending.reject(new Error('Execution interrupted'));
      pendingApprovals.delete(key);
    }
  }
}

/**
 * Gather display data from selected inputs
 */
function gatherDisplayData(
  config: ApprovalNodeConfig,
  context: ExecutorContext
): Record<string, unknown> {
  const displayData: Record<string, unknown> = {};

  for (const selection of config.inputSelections) {
    const nodeId = context.nodeNameToId.get(selection.nodeName) || selection.nodeId;
    const nodeOutput = context.getNodeOutput(nodeId);

    if (nodeOutput === undefined) {
      continue;
    }

    // If no specific fields selected, include entire output
    if (selection.fields.length === 0) {
      displayData[selection.nodeName] = nodeOutput;
      continue;
    }

    // Extract specific fields
    const selectedFields: Record<string, unknown> = {};
    for (const field of selection.fields) {
      const value = getNestedValue(nodeOutput, field);
      if (value !== undefined) {
        selectedFields[field] = value;
      }
    }
    displayData[selection.nodeName] = selectedFields;
  }

  return displayData;
}

/**
 * Get a nested value from an object using dot notation
 */
function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Executor for approval nodes.
 * Waits for user approval and branches based on the response.
 */
export const approvalExecutor: NodeExecutor = {
  nodeType: 'approval',

  validate(node: WorkflowNode): ValidationResult | null {
    const config = node.data as ApprovalNodeConfig;

    if (!config.promptMessage || config.promptMessage.trim() === '') {
      return {
        valid: false,
        error: 'Prompt message is required',
      };
    }

    if (!config.inputSelections || config.inputSelections.length === 0) {
      return {
        valid: false,
        error: 'At least one input selection is required',
      };
    }

    if (config.timeoutMinutes !== undefined && config.timeoutMinutes < 0) {
      return {
        valid: false,
        error: 'Timeout must be a positive number',
      };
    }

    return null;
  },

  async execute(
    node: WorkflowNode,
    context: ExecutorContext,
    emit: ExecutorEmitter
  ): Promise<ExecutionResult> {
    const config = node.data as ApprovalNodeConfig;
    const executionId = context.executionContext.executionId;

    // Gather display data from selected inputs
    const displayData = gatherDisplayData(config, context);

    // Interpolate the prompt message
    const promptMessage = context.interpolate(config.promptMessage);

    // Calculate timeout
    const timeoutAt = config.timeoutMinutes
      ? new Date(Date.now() + config.timeoutMinutes * 60 * 1000).toISOString()
      : undefined;

    // Build the approval request
    const approvalRequest: ApprovalRequest = {
      nodeId: node.id,
      nodeName: config.name,
      promptMessage,
      feedbackPrompt: config.feedbackPrompt,
      displayData,
      timeoutAt,
    };

    // Emit waiting event
    emit.emit('event', {
      type: 'node-waiting',
      nodeId: node.id,
      nodeName: config.name,
      approval: approvalRequest,
    });

    // Create a promise that waits for approval
    const response = await new Promise<ApprovalResponse>((resolve, reject) => {
      const key = getApprovalKey(executionId, node.id);

      // Set up timeout if configured
      let timeoutId: NodeJS.Timeout | undefined;
      if (config.timeoutMinutes) {
        timeoutId = setTimeout(() => {
          const pending = pendingApprovals.get(key);
          if (pending) {
            pendingApprovals.delete(key);

            // Handle timeout based on config
            const action = config.timeoutAction || 'reject';
            if (action === 'fail') {
              reject(new Error('Approval timed out'));
            } else {
              resolve({
                approved: action === 'approve',
                feedback: action === 'reject' ? 'Timed out waiting for approval' : undefined,
                respondedAt: new Date().toISOString(),
              });
            }
          }
        }, config.timeoutMinutes * 60 * 1000);
      }

      // Register the pending approval
      pendingApprovals.set(key, { resolve, reject, timeoutId });

      // Handle abort signal
      context.abortSignal.addEventListener('abort', () => {
        const pending = pendingApprovals.get(key);
        if (pending) {
          if (pending.timeoutId) {
            clearTimeout(pending.timeoutId);
          }
          pendingApprovals.delete(key);
          reject(new Error('Execution interrupted'));
        }
      });
    });

    // Build the output
    const output = {
      approved: response.approved,
      feedback: response.feedback,
      respondedAt: response.respondedAt,
      displayedData: displayData,
    };

    // Store the response for downstream reference
    context.setVariable(`node.${node.id}.approved`, response.approved);
    context.setVariable(`node.${node.id}.feedback`, response.feedback || '');

    return {
      output,
      metadata: {
        approved: response.approved,
        hadFeedback: !!response.feedback,
        timedOut: response.feedback === 'Timed out waiting for approval',
      },
    };
  },

  /**
   * Determine which output handle is active based on approval.
   */
  getOutputHandle(result: ExecutionResult, node: WorkflowNode): string | null {
    const output = result.output as { approved: boolean };
    return output.approved ? 'approved' : 'rejected';
  },
};

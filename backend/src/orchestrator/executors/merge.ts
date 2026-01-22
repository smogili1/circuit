/**
 * Merge node executor.
 * Combines outputs from multiple predecessor nodes.
 */

import {
  NodeExecutor,
  ExecutionResult,
  ExecutorContext,
  ExecutorEmitter,
} from './types.js';
import { WorkflowNode, MergeNodeConfig } from '../../workflows/types.js';

/**
 * Executor for merge nodes.
 * Waits for all predecessors and combines their outputs.
 */
export const mergeExecutor: NodeExecutor = {
  nodeType: 'merge',

  async execute(
    node: WorkflowNode,
    context: ExecutorContext,
    emit: ExecutorEmitter
  ): Promise<ExecutionResult> {
    const config = node.data as MergeNodeConfig;
    const predecessorIds = context.getPredecessorIds(node.id);
    const previousOutputs = context.getPredecessorOutputs(node.id);

    // Build merged output with node names as keys for better reference
    const merged: Record<string, unknown> = {};
    for (const [nodeId, output] of Object.entries(previousOutputs)) {
      const nodeName = context.getNodeName(nodeId);
      merged[nodeName] = output;
    }

    return {
      output: merged,
      metadata: {
        strategy: config.strategy,
        inputCount: predecessorIds.length,
        mergedKeys: Object.keys(merged),
      },
    };
  },
};

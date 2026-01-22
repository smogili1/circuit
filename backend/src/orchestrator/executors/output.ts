/**
 * Output node executor.
 * Collects the final workflow output from preceding nodes.
 */

import {
  NodeExecutor,
  ExecutionResult,
  ExecutorContext,
  ExecutorEmitter,
} from './types.js';
import { WorkflowNode } from '../../workflows/types.js';

/**
 * Executor for output nodes.
 * Passes through predecessor output as-is.
 */
export const outputExecutor: NodeExecutor = {
  nodeType: 'output',

  async execute(
    node: WorkflowNode,
    context: ExecutorContext,
    _emit: ExecutorEmitter
  ): Promise<ExecutionResult> {
    const previousOutputs = context.getPredecessorOutputs(node.id);

    // If single input, return it directly; otherwise return all
    const values = Object.values(previousOutputs);
    const output = values.length === 1 ? values[0] : previousOutputs;

    return {
      output,
      metadata: {
        inputCount: values.length,
      },
    };
  },
};

/**
 * Input node executor.
 * Passes the workflow input to downstream nodes.
 */

import { NodeExecutor, ExecutionResult, ExecutorContext, ExecutorEmitter } from './types.js';
import { WorkflowNode } from '../../workflows/types.js';

/**
 * Executor for input nodes.
 * Input nodes receive the workflow input directly and pass it downstream.
 */
export const inputExecutor: NodeExecutor = {
  nodeType: 'input',

  async execute(
    node: WorkflowNode,
    context: ExecutorContext,
    emit: ExecutorEmitter
  ): Promise<ExecutionResult> {
    // Input nodes simply pass through the workflow input
    const output = context.getWorkflowInput();

    return { output };
  },
};

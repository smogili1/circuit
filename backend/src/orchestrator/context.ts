import { ExecutionContext } from '../workflows/types.js';
import type { ExecutionSummary } from '../executions/storage.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Creates a new execution context for a workflow run.
 */
export function createExecutionContext(
  workflowId: string,
  workingDirectory: string = process.cwd()
): ExecutionContext {
  return {
    workflowId,
    executionId: uuidv4(),
    nodeOutputs: new Map(),
    variables: new Map(),
    workingDirectory,
  };
}

/**
 * Creates a replay execution context pre-seeded with prior outputs.
 */
export function createReplayExecutionContext(
  workflowId: string,
  sourceExecution: ExecutionSummary,
  nodeOutputs: Map<string, unknown>,
  workingDirectory?: string
): ExecutionContext {
  const resolvedWorkingDirectory =
    workingDirectory || sourceExecution.workingDirectory || process.cwd();

  return {
    workflowId,
    executionId: uuidv4(),
    nodeOutputs: new Map(nodeOutputs),
    variables: new Map(),
    workingDirectory: resolvedWorkingDirectory,
  };
}

/**
 * Gets the outputs from predecessor nodes for a given node.
 */
export function getPredecessorOutputs(
  context: ExecutionContext,
  predecessorIds: string[]
): Record<string, unknown> {
  const outputs: Record<string, unknown> = {};

  for (const id of predecessorIds) {
    const output = context.nodeOutputs.get(id);
    if (output !== undefined) {
      outputs[id] = output;
    }
  }

  return outputs;
}

/**
 * Sets the output for a node.
 */
export function setNodeOutput(
  context: ExecutionContext,
  nodeId: string,
  output: unknown
): void {
  context.nodeOutputs.set(nodeId, output);
}

/**
 * Gets the output for a node.
 */
export function getNodeOutput(
  context: ExecutionContext,
  nodeId: string
): unknown | undefined {
  return context.nodeOutputs.get(nodeId);
}

/**
 * Sets a variable in the context.
 */
export function setVariable(
  context: ExecutionContext,
  name: string,
  value: unknown
): void {
  context.variables.set(name, value);
}

/**
 * Gets a variable from the context.
 */
export function getVariable(
  context: ExecutionContext,
  name: string
): unknown | undefined {
  return context.variables.get(name);
}

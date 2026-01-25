/**
 * Workflow validation for pre-execution checks.
 * Ensures workflow structure is valid before execution starts.
 */

import { Workflow, WorkflowNode, WorkflowEdge } from '../workflows/types.js';
import type { ExecutionSummary } from '../executions/storage.js';

export interface ValidationError {
  code: string;
  message: string;
  nodeId?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ReplayConfiguration {
  workflowId: string;
  sourceExecutionId: string;
  fromNodeId: string;
  seedNodeOutputs: Map<string, unknown>;
  nodesToSkip: string[];
  nodesToExecute: string[];
}

export interface ReplayValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  affectedNodes: {
    reused: string[];
    reExecuted: string[];
    new: string[];
  };
}

/**
 * Get all nodes reachable from a starting node via outgoing edges.
 */
function getReachableNodes(startId: string, edges: WorkflowEdge[]): Set<string> {
  const reachable = new Set<string>();
  const queue = [startId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (reachable.has(current)) continue;
    reachable.add(current);

    const successors = edges.filter((e) => e.source === current).map((e) => e.target);
    queue.push(...successors);
  }

  return reachable;
}

function getPredecessorIds(nodeId: string, edges: WorkflowEdge[]): string[] {
  return edges.filter((edge) => edge.target === nodeId).map((edge) => edge.source);
}

function getSuccessorIds(nodeId: string, edges: WorkflowEdge[]): string[] {
  return edges.filter((edge) => edge.source === nodeId).map((edge) => edge.target);
}

function getAllAncestorIds(nodeId: string, edges: WorkflowEdge[]): string[] {
  const ancestors = new Set<string>();
  const queue = getPredecessorIds(nodeId, edges);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === nodeId || ancestors.has(current)) continue;
    ancestors.add(current);
    queue.push(...getPredecessorIds(current, edges));
  }

  return Array.from(ancestors);
}

function getAllDescendantIds(nodeId: string, edges: WorkflowEdge[]): string[] {
  const descendants = new Set<string>();
  const queue = getSuccessorIds(nodeId, edges);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === nodeId || descendants.has(current)) continue;
    descendants.add(current);
    queue.push(...getSuccessorIds(current, edges));
  }

  return Array.from(descendants);
}

/**
 * Validate a workflow before execution.
 * Returns validation errors if the workflow is invalid.
 */
export function validateWorkflow(workflow: Workflow): ValidationResult {
  const errors: ValidationError[] = [];

  // 1. Check for exactly one input node
  const inputNodes = workflow.nodes.filter((n) => n.type === 'input');
  if (inputNodes.length === 0) {
    errors.push({
      code: 'MISSING_INPUT',
      message: 'Workflow must have an input node',
    });
  } else if (inputNodes.length > 1) {
    errors.push({
      code: 'DUPLICATE_INPUT',
      message: `Workflow has ${inputNodes.length} input nodes, but only 1 is allowed. Delete the extra input nodes.`,
    });
  }

  // 2. Check for exactly one output node
  const outputNodes = workflow.nodes.filter((n) => n.type === 'output');
  if (outputNodes.length === 0) {
    errors.push({
      code: 'MISSING_OUTPUT',
      message: 'Workflow must have an output node',
    });
  } else if (outputNodes.length > 1) {
    errors.push({
      code: 'DUPLICATE_OUTPUT',
      message: `Workflow has ${outputNodes.length} output nodes, but only 1 is allowed. Delete the extra output nodes.`,
    });
  }

  // 3. Check input node has outgoing connections
  if (inputNodes.length === 1) {
    const inputNode = inputNodes[0];
    const outgoingEdges = workflow.edges.filter((e) => e.source === inputNode.id);
    if (outgoingEdges.length === 0) {
      errors.push({
        code: 'INPUT_NOT_CONNECTED',
        message: 'Input node must be connected to at least one other node',
        nodeId: inputNode.id,
      });
    }
  }

  // 4. Check output node has incoming connections
  if (outputNodes.length === 1) {
    const outputNode = outputNodes[0];
    const incomingEdges = workflow.edges.filter((e) => e.target === outputNode.id);
    if (incomingEdges.length === 0) {
      errors.push({
        code: 'OUTPUT_NOT_CONNECTED',
        message: 'Output node must have at least one incoming connection',
        nodeId: outputNode.id,
      });
    }
  }

  // 5. Check for orphaned nodes (not reachable from input)
  if (inputNodes.length === 1) {
    const reachable = getReachableNodes(inputNodes[0].id, workflow.edges);

    for (const node of workflow.nodes) {
      // Skip input node itself
      if (node.type === 'input') continue;

      if (!reachable.has(node.id)) {
        errors.push({
          code: 'ORPHANED_NODE',
          message: `Node "${node.data.name}" is not reachable from the input node. Connect it to the workflow or remove it.`,
          nodeId: node.id,
        });
      }
    }
  }

  // 6. Check output is reachable from input
  if (inputNodes.length === 1 && outputNodes.length === 1) {
    const reachable = getReachableNodes(inputNodes[0].id, workflow.edges);
    if (!reachable.has(outputNodes[0].id)) {
      errors.push({
        code: 'OUTPUT_NOT_REACHABLE',
        message: 'Output node is not reachable from the input node. Create a path from input to output.',
        nodeId: outputNodes[0].id,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateReplayConfiguration(
  workflow: Workflow,
  sourceExecution: ExecutionSummary,
  fromNodeId: string
): ReplayValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (sourceExecution.workflowId !== workflow.id) {
    errors.push('Source execution does not belong to the selected workflow.');
  }

  const fromNode = workflow.nodes.find((node) => node.id === fromNodeId);
  if (!fromNode) {
    errors.push('Replay start node does not exist in the current workflow.');
  }

  const sourceNodes = sourceExecution.nodes || {};
  const sourceNodeIds = new Set(Object.keys(sourceNodes));
  const currentNodeIds = new Set(workflow.nodes.map((node) => node.id));

  const newNodes = workflow.nodes
    .filter((node) => !sourceNodeIds.has(node.id) && node.type !== 'input')
    .map((node) => node.id);

  if (sourceNodeIds.size > 0) {
    const removedNodes = Array.from(sourceNodeIds).filter(
      (nodeId) => !currentNodeIds.has(nodeId)
    );
    if (newNodes.length > 0 || removedNodes.length > 0) {
      warnings.push(
        'Workflow structure has changed since the source execution; replay may not be fully compatible.'
      );
    }
  } else {
    warnings.push('Source execution does not include node history; replay validation is limited.');
  }

  const reExecuted = fromNode
    ? [fromNodeId, ...getAllDescendantIds(fromNodeId, workflow.edges)]
    : [];

  const reused: string[] = [];
  if (fromNode) {
    const ancestorIds = getAllAncestorIds(fromNodeId, workflow.edges);
    for (const ancestorId of ancestorIds) {
      const summary = sourceNodes[ancestorId];
      if (!summary) {
        errors.push(`Upstream node "${ancestorId}" is missing in the source execution.`);
        continue;
      }
      if (summary.status === 'complete') {
        reused.push(ancestorId);
      } else {
        errors.push(`Upstream node "${ancestorId}" did not complete in the source execution.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    affectedNodes: {
      reused,
      reExecuted,
      new: newNodes,
    },
  };
}

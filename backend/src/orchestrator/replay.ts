import {
  CheckpointState,
  NodeState,
  NodeStatus,
  ReplayCheckpoint,
  ReplayError,
  ReplayInfo,
  ReplayWarning,
  Workflow,
  WorkflowEdge,
  WorkflowSnapshot,
} from '../workflows/types.js';
import { executorRegistry } from './executors/index.js';

type ReplayPlan = {
  replayNodeIds: Set<string>;
  inactiveNodeIds: Set<string>;
  errors: ReplayError[];
};

function getPredecessorIds(nodeId: string, edges: WorkflowEdge[]): string[] {
  return edges.filter((edge) => edge.target === nodeId).map((edge) => edge.source);
}

function getSuccessorIds(nodeId: string, edges: WorkflowEdge[]): string[] {
  return edges.filter((edge) => edge.source === nodeId).map((edge) => edge.target);
}

function getAncestorIds(nodeId: string, edges: WorkflowEdge[]): Set<string> {
  const ancestors = new Set<string>();
  const queue = getPredecessorIds(nodeId, edges);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (ancestors.has(current)) continue;
    ancestors.add(current);
    queue.push(...getPredecessorIds(current, edges));
  }

  return ancestors;
}

function getDescendantIds(nodeId: string, edges: WorkflowEdge[]): Set<string> {
  const descendants = new Set<string>();
  const queue = getSuccessorIds(nodeId, edges);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (descendants.has(current)) continue;
    descendants.add(current);
    queue.push(...getSuccessorIds(current, edges));
  }

  return descendants;
}

function getReachableFrom(startId: string, edges: WorkflowEdge[]): Set<string> {
  const reachable = new Set<string>();
  const queue = [startId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    queue.push(...getSuccessorIds(current, edges));
  }

  return reachable;
}

function isReusableStatus(status: NodeStatus | undefined): boolean {
  return status === 'complete' || status === 'skipped';
}

function extractNodeIdFromVariableKey(key: string): string | null {
  if (key.startsWith('node.')) {
    const parts = key.split('.');
    return parts.length > 1 ? parts[1] : null;
  }
  if (key.startsWith('agent.session.')) {
    const parts = key.split('.');
    return parts.length > 2 ? parts[2] : null;
  }
  return null;
}

function buildEdgeKey(edge: WorkflowEdge): string {
  return [
    edge.source,
    edge.sourceHandle || '',
    edge.target,
    edge.targetHandle || '',
    edge.edgeType || '',
  ].join('|');
}

function compareWorkflowSnapshot(
  snapshot: WorkflowSnapshot | undefined,
  workflow: Workflow
): ReplayWarning[] {
  if (!snapshot) {
    return [
      {
        type: 'workflow-snapshot-missing',
        message: 'Workflow snapshot missing for source execution.',
      },
    ];
  }

  const warnings: ReplayWarning[] = [];
  const snapshotNodes = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const currentNodes = new Map(workflow.nodes.map((node) => [node.id, node]));

  for (const [nodeId, node] of snapshotNodes) {
    if (!currentNodes.has(nodeId)) {
      warnings.push({
        type: 'node-removed',
        message: `Node "${node.data.name}" was removed since this execution.`,
        nodeId,
      });
    }
  }

  for (const [nodeId, node] of currentNodes) {
    if (!snapshotNodes.has(nodeId)) {
      warnings.push({
        type: 'node-added',
        message: `Node "${node.data.name}" was added after this execution.`,
        nodeId,
      });
    }
  }

  for (const [nodeId, snapshotNode] of snapshotNodes) {
    const currentNode = currentNodes.get(nodeId);
    if (!currentNode) continue;
    const typeChanged = snapshotNode.type !== currentNode.type;
    const dataChanged = JSON.stringify(snapshotNode.data) !== JSON.stringify(currentNode.data);
    if (typeChanged || dataChanged) {
      warnings.push({
        type: 'node-changed',
        message: `Node "${snapshotNode.data.name}" configuration changed since this execution.`,
        nodeId,
      });
    }
  }

  const snapshotEdges = new Set(snapshot.edges.map(buildEdgeKey));
  const currentEdges = new Set(workflow.edges.map(buildEdgeKey));
  let edgesChanged = snapshotEdges.size !== currentEdges.size;

  if (!edgesChanged) {
    for (const edgeKey of snapshotEdges) {
      if (!currentEdges.has(edgeKey)) {
        edgesChanged = true;
        break;
      }
    }
  }

  if (edgesChanged) {
    warnings.push({
      type: 'edge-changed',
      message: 'Workflow connections changed since this execution.',
    });
  }

  return warnings;
}

export function buildCheckpointState(
  nodeStates: Map<string, NodeState>,
  nodeOutputs: Map<string, unknown>,
  variables: Map<string, unknown>
): CheckpointState {
  const stateRecord: Record<string, { status: NodeStatus; error?: string }> = {};

  for (const [nodeId, state] of nodeStates.entries()) {
    stateRecord[nodeId] = { status: state.status, error: state.error };
  }

  return {
    capturedAt: new Date().toISOString(),
    nodeStates: stateRecord,
    nodeOutputs: Object.fromEntries(nodeOutputs.entries()),
    variables: Object.fromEntries(variables.entries()),
  };
}

export function filterReplayVariables(
  variables: Record<string, unknown>,
  replayNodeIds: Set<string>
): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(variables)) {
    const nodeId = extractNodeIdFromVariableKey(key);
    if (nodeId && replayNodeIds.has(nodeId)) {
      continue;
    }
    filtered[key] = value;
  }
  return filtered;
}

export function computeInactiveBranchNodes(
  workflow: Workflow,
  checkpoint: CheckpointState,
  replayNodeIds: Set<string>
): Set<string> {
  const inactiveNodes = new Set<string>();

  for (const node of workflow.nodes) {
    if (replayNodeIds.has(node.id)) continue;

    const state = checkpoint.nodeStates[node.id];
    if (!state || state.status !== 'complete') continue;

    const executor = executorRegistry.get(node.type);
    if (!executor?.getOutputHandle) continue;

    const output = checkpoint.nodeOutputs[node.id];
    if (output === undefined) continue;

    const activeHandle = executor.getOutputHandle({ output }, node);
    if (!activeHandle) continue;

    const outgoing = workflow.edges.filter((edge) => edge.source === node.id);
    for (const edge of outgoing) {
      if (!edge.sourceHandle) continue;
      if (edge.sourceHandle === activeHandle) continue;
      for (const targetId of getReachableFrom(edge.target, workflow.edges)) {
        inactiveNodes.add(targetId);
      }
    }
  }

  return inactiveNodes;
}

export function buildReplayPlan(
  workflow: Workflow,
  checkpoint: CheckpointState,
  fromNodeId: string
): ReplayPlan {
  const errors: ReplayError[] = [];
  const nodeIds = new Set(workflow.nodes.map((node) => node.id));

  if (!nodeIds.has(fromNodeId)) {
    errors.push({
      type: 'invalid-node',
      message: 'Selected node does not exist in the current workflow.',
      nodeId: fromNodeId,
    });
    return { replayNodeIds: new Set(), inactiveNodeIds: new Set(), errors };
  }

  const replayNodeIds = getDescendantIds(fromNodeId, workflow.edges);
  replayNodeIds.add(fromNodeId);

  const ancestors = getAncestorIds(fromNodeId, workflow.edges);
  for (const ancestorId of ancestors) {
    const state = checkpoint.nodeStates[ancestorId];
    if (!state || !isReusableStatus(state.status)) {
      errors.push({
        type: 'dependency-missing',
        message: 'Missing completed output for an upstream dependency.',
        nodeId: ancestorId,
      });
      continue;
    }

    if (state.status === 'complete' && checkpoint.nodeOutputs[ancestorId] === undefined) {
      errors.push({
        type: 'dependency-missing',
        message: 'Completed ancestor output is missing from the checkpoint.',
        nodeId: ancestorId,
      });
    }
  }

  const inactiveNodeIds = computeInactiveBranchNodes(workflow, checkpoint, replayNodeIds);
  if (inactiveNodeIds.has(fromNodeId)) {
    errors.push({
      type: 'inactive-branch',
      message: 'Selected node is on an inactive branch. Replay from the branch condition instead.',
      nodeId: fromNodeId,
    });
  }

  return { replayNodeIds, inactiveNodeIds, errors };
}

export function buildReplayInfo(
  workflow: Workflow,
  sourceExecutionId: string,
  checkpoint: CheckpointState | null,
  workflowSnapshot?: WorkflowSnapshot
): ReplayInfo {
  const warnings: ReplayWarning[] = compareWorkflowSnapshot(workflowSnapshot, workflow);
  const errors: ReplayError[] = [];

  if (!checkpoint) {
    errors.push({
      type: 'missing-checkpoint',
      message: 'Checkpoint data is not available for this execution.',
    });
    return {
      sourceExecutionId,
      workflowId: workflow.id,
      checkpoints: [],
      warnings,
      errors,
    };
  }

  const inactiveNodeIds = computeInactiveBranchNodes(workflow, checkpoint, new Set());
  const checkpoints: ReplayCheckpoint[] = workflow.nodes.map((node) => {
    const state = checkpoint.nodeStates[node.id];
    const status = state?.status ?? (inactiveNodeIds.has(node.id) ? 'skipped' : 'pending');
    const ancestors = getAncestorIds(node.id, workflow.edges);
    let replayable = true;
    let reason: string | undefined;

    for (const ancestorId of ancestors) {
      const ancestorState = checkpoint.nodeStates[ancestorId];
      if (!ancestorState || !isReusableStatus(ancestorState.status)) {
        replayable = false;
        reason = 'Missing completed upstream dependency';
        break;
      }
    }

    if (replayable && inactiveNodeIds.has(node.id)) {
      replayable = false;
      reason = 'Node is on an inactive branch';
    }

    return {
      nodeId: node.id,
      nodeName: node.data.name,
      status,
      replayable,
      reason,
    };
  });

  return {
    sourceExecutionId,
    workflowId: workflow.id,
    checkpoints,
    warnings,
    errors,
  };
}

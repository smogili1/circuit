import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { Workflow, WorkflowNode, WorkflowSnapshot } from '../workflows/types.js';
import { updateWorkflow } from '../workflows/storage.js';
import type { EvolutionMode, MutationOp, WorkflowEvolution } from './evolution-types.js';

export interface WorkflowDiff {
  addedNodes: string[];
  removedNodes: string[];
  changedNodes: string[];
  addedEdges: string[];
  removedEdges: string[];
}

export interface EvolutionHistoryRecord {
  timestamp: string;
  workflowId: string;
  executionId?: string;
  nodeId: string;
  mode: EvolutionMode;
  evolution: WorkflowEvolution;
  applied: boolean;
  validationErrors?: string[];
  beforeSnapshot?: WorkflowSnapshot;
  afterSnapshot?: WorkflowSnapshot;
  diff?: WorkflowDiff;
}

const EVOLUTIONS_DIR =
  process.env.EVOLUTIONS_DIR || path.join(process.cwd(), '..', 'data', 'evolutions');

function cloneWorkflow(workflow: Workflow): Workflow {
  return {
    ...workflow,
    nodes: workflow.nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      data: JSON.parse(JSON.stringify(node.data)) as WorkflowNode['data'],
    })),
    edges: workflow.edges.map((edge) => ({ ...edge })),
  };
}

function isNumericSegment(segment: string): boolean {
  return /^[0-9]+$/.test(segment);
}

const SAFE_PATH_BLACKLIST = new Set(['__proto__', 'prototype', 'constructor']);

function setNestedValue(target: Record<string, unknown>, pathSegments: string[], value: unknown): void {
  let current: unknown = target;

  for (let index = 0; index < pathSegments.length - 1; index += 1) {
    const segment = pathSegments[index];
    if (SAFE_PATH_BLACKLIST.has(segment)) {
      return;
    }
    const nextSegment = pathSegments[index + 1];
    const key = isNumericSegment(segment) ? Number(segment) : segment;

    if (typeof current !== 'object' || current === null) {
      return;
    }

    const record = current as Record<string, unknown>;
    if (record[key as keyof typeof record] === undefined) {
      record[key as keyof typeof record] = isNumericSegment(nextSegment) ? [] : {};
    }

    current = record[key as keyof typeof record];
  }

  if (typeof current !== 'object' || current === null) {
    return;
  }

  const lastSegment = pathSegments[pathSegments.length - 1];
  if (SAFE_PATH_BLACKLIST.has(lastSegment)) {
    return;
  }
  const lastKey = isNumericSegment(lastSegment) ? Number(lastSegment) : lastSegment;
  (current as Record<string, unknown>)[lastKey as keyof typeof current] = value;
}

export function describeWorkflowDiff(before: WorkflowSnapshot, after: WorkflowSnapshot): WorkflowDiff {
  const beforeNodes = new Map(before.nodes.map((node) => [node.id, node]));
  const afterNodes = new Map(after.nodes.map((node) => [node.id, node]));
  const beforeEdges = new Set(before.edges.map((edge) => edge.id));
  const afterEdges = new Set(after.edges.map((edge) => edge.id));

  const addedNodes: string[] = [];
  const removedNodes: string[] = [];
  const changedNodes: string[] = [];

  for (const [nodeId, node] of afterNodes.entries()) {
    if (!beforeNodes.has(nodeId)) {
      addedNodes.push(nodeId);
    } else if (JSON.stringify(beforeNodes.get(nodeId)) !== JSON.stringify(node)) {
      changedNodes.push(nodeId);
    }
  }

  for (const nodeId of beforeNodes.keys()) {
    if (!afterNodes.has(nodeId)) {
      removedNodes.push(nodeId);
    }
  }

  const addedEdges: string[] = [];
  const removedEdges: string[] = [];

  for (const edgeId of afterEdges) {
    if (!beforeEdges.has(edgeId)) {
      addedEdges.push(edgeId);
    }
  }

  for (const edgeId of beforeEdges) {
    if (!afterEdges.has(edgeId)) {
      removedEdges.push(edgeId);
    }
  }

  return {
    addedNodes,
    removedNodes,
    changedNodes,
    addedEdges,
    removedEdges,
  };
}

export function createEvolutionSnapshot(workflow: Workflow): WorkflowSnapshot {
  return {
    id: workflow.id,
    name: workflow.name,
    nodes: workflow.nodes,
    edges: workflow.edges,
    capturedAt: new Date().toISOString(),
  };
}

function applyMutation(workflow: Workflow, mutation: MutationOp): void {
  switch (mutation.op) {
    case 'update-node-config': {
      const node = workflow.nodes.find((item) => item.id === mutation.nodeId);
      if (!node) throw new Error(`Node not found: ${mutation.nodeId}`);
      const pathSegments = mutation.path.split('.');
      setNestedValue(node.data as Record<string, unknown>, pathSegments, mutation.value);
      break;
    }
    case 'update-prompt': {
      const node = workflow.nodes.find((item) => item.id === mutation.nodeId);
      if (!node) throw new Error(`Node not found: ${mutation.nodeId}`);
      const pathSegments = mutation.field.split('.');
      setNestedValue(node.data as Record<string, unknown>, pathSegments, mutation.newValue);
      break;
    }
    case 'update-model': {
      const node = workflow.nodes.find((item) => item.id === mutation.nodeId);
      if (!node) throw new Error(`Node not found: ${mutation.nodeId}`);
      (node.data as Record<string, unknown>).model = mutation.newModel;
      break;
    }
    case 'add-node': {
      workflow.nodes.push(mutation.node);
      if (mutation.connectFrom) {
        workflow.edges.push({
          id: uuidv4(),
          source: mutation.connectFrom,
          target: mutation.node.id,
        });
      }
      if (mutation.connectTo) {
        workflow.edges.push({
          id: uuidv4(),
          source: mutation.node.id,
          target: mutation.connectTo,
        });
      }
      break;
    }
    case 'remove-node': {
      workflow.nodes = workflow.nodes.filter((node) => node.id !== mutation.nodeId);
      workflow.edges = workflow.edges.filter(
        (edge) => edge.source !== mutation.nodeId && edge.target !== mutation.nodeId
      );
      break;
    }
    case 'add-edge': {
      workflow.edges.push(mutation.edge);
      break;
    }
    case 'remove-edge': {
      workflow.edges = workflow.edges.filter((edge) => edge.id !== mutation.edgeId);
      break;
    }
    case 'update-workflow-setting': {
      if (mutation.field === 'name') {
        workflow.name = mutation.value as string;
      }
      if (mutation.field === 'description') {
        workflow.description = mutation.value as string;
      }
      if (mutation.field === 'workingDirectory') {
        workflow.workingDirectory = mutation.value as string;
      }
      break;
    }
    default:
      break;
  }
}

export async function applyEvolution(
  workflow: Workflow,
  evolution: WorkflowEvolution
): Promise<Workflow> {
  const beforeSnapshot = createEvolutionSnapshot(workflow);
  const working = cloneWorkflow(workflow);

  for (const mutation of evolution.mutations) {
    applyMutation(working, mutation);
  }

  const updates: Partial<Pick<Workflow, 'name' | 'description' | 'workingDirectory' | 'nodes' | 'edges'>> = {
    nodes: working.nodes,
    edges: working.edges,
  };

  if (working.name !== workflow.name) updates.name = working.name;
  if (working.description !== workflow.description) updates.description = working.description;
  if (working.workingDirectory !== workflow.workingDirectory) {
    updates.workingDirectory = working.workingDirectory;
  }

  const updated = await updateWorkflow(workflow.id, updates);
  if (!updated) {
    throw new Error(`Workflow not found: ${workflow.id}`);
  }

  const afterSnapshot = createEvolutionSnapshot(updated);
  const diff = describeWorkflowDiff(beforeSnapshot, afterSnapshot);
  console.log(
    `[Evolution] Applied ${evolution.mutations.length} mutation(s): ` +
      `${diff.addedNodes.length} node(s) added, ` +
      `${diff.removedNodes.length} node(s) removed, ` +
      `${diff.addedEdges.length} edge(s) added, ` +
      `${diff.removedEdges.length} edge(s) removed.`
  );

  return updated;
}

async function ensureEvolutionDir(workflowId: string): Promise<string> {
  const dir = path.join(EVOLUTIONS_DIR, workflowId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function getEvolutionHistoryPath(workflowId: string): string {
  return path.join(EVOLUTIONS_DIR, workflowId, 'history.jsonl');
}

export async function appendEvolutionHistory(record: EvolutionHistoryRecord): Promise<void> {
  await ensureEvolutionDir(record.workflowId);
  const line = JSON.stringify(record);
  await fs.appendFile(getEvolutionHistoryPath(record.workflowId), `${line}\n`, 'utf-8');
}

export async function readEvolutionHistory(workflowId: string): Promise<EvolutionHistoryRecord[]> {
  const filePath = getEvolutionHistoryPath(workflowId);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    if (!content.trim()) return [];
    return content
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as EvolutionHistoryRecord);
  } catch {
    return [];
  }
}

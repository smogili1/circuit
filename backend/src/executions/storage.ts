import { promises as fs } from 'fs';
import path from 'path';
import { ExecutionEvent, NodeStatus, Workflow } from '../workflows/types.js';

export type ExecutionStatus = 'running' | 'complete' | 'error' | 'interrupted';

export interface ExecutionEventRecord {
  timestamp: string;
  event: ExecutionEvent;
}

export interface ExecutionNodeSummary {
  nodeId: string;
  nodeName?: string;
  status: NodeStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  result?: unknown;
}

export interface ExecutionSummary {
  executionId: string;
  workflowId: string;
  workflowName?: string;
  input: string;
  replay?: ReplayMetadata;
  status: ExecutionStatus;
  startedAt: string;
  completedAt?: string;
  finalResult?: unknown;
  error?: string;
  workingDirectory?: string;
  outputDirectory?: string;
  nodes?: Record<string, ExecutionNodeSummary>;
}

export interface ReplayMetadata {
  sourceExecutionId: string;
  fromNodeId: string;
}

// Directory for storing execution history (in top-level data/ folder)
const EXECUTIONS_DIR =
  process.env.EXECUTIONS_DIR || path.join(process.cwd(), '..', 'data', 'executions');

async function ensureExecutionsDir(): Promise<void> {
  await fs.mkdir(EXECUTIONS_DIR, { recursive: true });
}

function getWorkflowDir(workflowId: string): string {
  return path.join(EXECUTIONS_DIR, workflowId);
}

function getExecutionDir(workflowId: string, executionId: string): string {
  return path.join(getWorkflowDir(workflowId), executionId);
}

function getSummaryPath(workflowId: string, executionId: string): string {
  return path.join(getExecutionDir(workflowId, executionId), 'summary.json');
}

function getEventsPath(workflowId: string, executionId: string): string {
  return path.join(getExecutionDir(workflowId, executionId), 'events.jsonl');
}

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tmpPath, filePath);
}

export async function initializeExecutionStorage(): Promise<void> {
  await ensureExecutionsDir();
}

export async function createExecutionSummary(
  workflow: Workflow,
  executionId: string,
  input: string,
  replay?: ReplayMetadata
): Promise<ExecutionSummary> {
  await ensureExecutionsDir();

  const summary: ExecutionSummary = {
    executionId,
    workflowId: workflow.id,
    workflowName: workflow.name,
    input,
    replay,
    status: 'running',
    startedAt: new Date().toISOString(),
    workingDirectory: workflow.workingDirectory,
    outputDirectory: path.join(
      workflow.workingDirectory || process.cwd(),
      '.workflow-outputs',
      executionId
    ),
    nodes: {},
  };

  const summaryPath = getSummaryPath(workflow.id, executionId);
  await writeJsonFile(summaryPath, summary);

  const eventsPath = getEventsPath(workflow.id, executionId);
  await fs.mkdir(path.dirname(eventsPath), { recursive: true });
  await fs.writeFile(eventsPath, '', 'utf-8');

  return summary;
}

export async function readExecutionSummary(
  workflowId: string,
  executionId: string
): Promise<ExecutionSummary | null> {
  const summaryPath = getSummaryPath(workflowId, executionId);
  try {
    const content = await fs.readFile(summaryPath, 'utf-8');
    return JSON.parse(content) as ExecutionSummary;
  } catch {
    return null;
  }
}

export async function listExecutionSummaries(
  workflowId: string
): Promise<ExecutionSummary[]> {
  await ensureExecutionsDir();
  const workflowDir = getWorkflowDir(workflowId);

  try {
    const entries = await fs.readdir(workflowDir, { withFileTypes: true });
    const summaries: ExecutionSummary[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const summary = await readExecutionSummary(workflowId, entry.name);
      if (summary) {
        summaries.push(summary);
      }
    }

    return summaries.sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  } catch {
    return [];
  }
}

export async function appendExecutionEvent(
  workflowId: string,
  executionId: string,
  record: ExecutionEventRecord
): Promise<void> {
  const eventsPath = getEventsPath(workflowId, executionId);
  const line = `${JSON.stringify(record)}\n`;
  await fs.appendFile(eventsPath, line, 'utf-8');
}

export async function readExecutionEvents(
  workflowId: string,
  executionId: string
): Promise<ExecutionEventRecord[]> {
  const eventsPath = getEventsPath(workflowId, executionId);
  try {
    const content = await fs.readFile(eventsPath, 'utf-8');
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as ExecutionEventRecord);
  } catch {
    return [];
  }
}

export function extractNodeOutputsFromEvents(
  events: ExecutionEventRecord[]
): Map<string, unknown> {
  const outputs = new Map<string, unknown>();
  const startedNodes = new Set<string>();

  for (const record of events) {
    const event = record.event;
    if (event.type === 'node-start') {
      startedNodes.add(event.nodeId);
      continue;
    }

    if (event.type === 'node-complete' && startedNodes.has(event.nodeId)) {
      outputs.set(event.nodeId, event.result);
    }
  }

  return outputs;
}

export async function updateExecutionSummary(
  workflowId: string,
  executionId: string,
  updates: Partial<ExecutionSummary>
): Promise<ExecutionSummary | null> {
  const summary = await readExecutionSummary(workflowId, executionId);
  if (!summary) return null;
  const updated = { ...summary, ...updates };
  await writeJsonFile(getSummaryPath(workflowId, executionId), updated);
  return updated;
}

export async function saveExecutionSummary(
  workflowId: string,
  executionId: string,
  summary: ExecutionSummary
): Promise<void> {
  await writeJsonFile(getSummaryPath(workflowId, executionId), summary);
}

export function applyExecutionEventToSummary(
  summary: ExecutionSummary,
  record: ExecutionEventRecord
): ExecutionSummary {
  const { event, timestamp } = record;
  const nodes = summary.nodes || {};

  switch (event.type) {
    case 'execution-start':
      return {
        ...summary,
        status: 'running',
        startedAt: summary.startedAt || timestamp,
      };
    case 'node-start':
      nodes[event.nodeId] = {
        nodeId: event.nodeId,
        nodeName: event.nodeName,
        status: 'running',
        startedAt: timestamp,
      };
      return { ...summary, nodes };
    case 'node-complete':
      nodes[event.nodeId] = {
        ...(nodes[event.nodeId] || { nodeId: event.nodeId }),
        status: 'complete',
        completedAt: timestamp,
      };
      return { ...summary, nodes };
    case 'node-error':
      nodes[event.nodeId] = {
        ...(nodes[event.nodeId] || { nodeId: event.nodeId }),
        status: 'error',
        completedAt: timestamp,
        error: event.error,
      };
      return { ...summary, nodes };
    case 'execution-complete':
      return {
        ...summary,
        status: 'complete',
        completedAt: timestamp,
        finalResult: event.result,
      };
    case 'execution-error':
      return {
        ...summary,
        status: 'error',
        completedAt: timestamp,
        error: event.error,
      };
    default:
      return summary;
  }
}

import { promises as fs } from 'fs';
import path from 'path';
import {
  CheckpointState,
  ExecutionEvent,
  NodeStatus,
  Workflow,
  WorkflowSnapshot,
} from '../workflows/types.js';

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
  status: ExecutionStatus;
  startedAt: string;
  completedAt?: string;
  finalResult?: unknown;
  error?: string;
  workingDirectory?: string;
  outputDirectory?: string;
  nodes?: Record<string, ExecutionNodeSummary>;
  workflowSnapshot?: WorkflowSnapshot;
  sourceExecutionId?: string;
  replayFromNodeId?: string;
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

function getCheckpointPath(workflowId: string, executionId: string): string {
  return path.join(getExecutionDir(workflowId, executionId), 'checkpoint.json');
}

export function buildWorkflowSnapshot(workflow: Workflow): WorkflowSnapshot {
  return {
    id: workflow.id,
    name: workflow.name,
    nodes: workflow.nodes,
    edges: workflow.edges,
    capturedAt: new Date().toISOString(),
  };
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
  await markOrphanedExecutions();
}

/**
 * Mark any executions that were left in 'running' status as 'interrupted'.
 * This handles the case where the server crashed or was terminated while
 * executions were in progress.
 */
async function markOrphanedExecutions(): Promise<void> {
  try {
    const entries = await fs.readdir(EXECUTIONS_DIR, { withFileTypes: true });
    let orphanedCount = 0;

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const workflowId = entry.name;
      const summaries = await listExecutionSummaries(workflowId);

      for (const summary of summaries) {
        if (summary.status === 'running') {
          // Mark execution as interrupted
          const updatedNodes = { ...summary.nodes };
          for (const [nodeId, node] of Object.entries(updatedNodes)) {
            if (node.status === 'running') {
              updatedNodes[nodeId] = {
                ...node,
                status: 'error',
                completedAt: new Date().toISOString(),
                error: 'Server terminated while node was running',
              };
            }
          }

          await updateExecutionSummary(workflowId, summary.executionId, {
            status: 'interrupted',
            completedAt: new Date().toISOString(),
            error: 'Server terminated while execution was in progress',
            nodes: updatedNodes,
          });

          orphanedCount++;
          console.log(
            `[ExecutionStorage] Marked orphaned execution: ${summary.executionId} (workflow: ${workflowId})`
          );
        }
      }
    }

    if (orphanedCount > 0) {
      console.log(`[ExecutionStorage] Marked ${orphanedCount} orphaned execution(s) as interrupted`);
    }
  } catch (error) {
    // Directory might not exist yet, that's fine
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[ExecutionStorage] Error marking orphaned executions:', error);
    }
  }
}

export async function createExecutionSummary(
  workflow: Workflow,
  executionId: string,
  input: string
): Promise<ExecutionSummary> {
  await ensureExecutionsDir();

  const summary: ExecutionSummary = {
    executionId,
    workflowId: workflow.id,
    workflowName: workflow.name,
    input,
    status: 'running',
    startedAt: new Date().toISOString(),
    workingDirectory: workflow.workingDirectory,
    outputDirectory: path.join(
      workflow.workingDirectory || process.cwd(),
      '.workflow-outputs',
      executionId
    ),
    workflowSnapshot: buildWorkflowSnapshot(workflow),
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

export async function saveExecutionCheckpoint(
  workflowId: string,
  executionId: string,
  checkpoint: CheckpointState
): Promise<void> {
  await writeJsonFile(getCheckpointPath(workflowId, executionId), checkpoint);
}

export async function readExecutionCheckpoint(
  workflowId: string,
  executionId: string
): Promise<CheckpointState | null> {
  const checkpointPath = getCheckpointPath(workflowId, executionId);
  try {
    const content = await fs.readFile(checkpointPath, 'utf-8');
    return JSON.parse(content) as CheckpointState;
  } catch {
    return null;
  }
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

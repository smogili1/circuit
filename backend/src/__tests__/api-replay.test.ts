/**
 * Integration tests for replay API endpoint logic
 * Tests the business logic behind GET /replay-info and POST /validate-replay endpoints
 */

import {
  buildReplayInfo,
  validateReplayEligibility,
} from '../orchestrator/replay';
import { CheckpointState, Workflow, WorkflowSnapshot } from '../workflows/types';

// Mock the storage functions
jest.mock('../workflows/storage', () => ({
  getWorkflow: jest.fn(),
  initializeStorage: jest.fn(),
  reloadWorkflows: jest.fn(),
}));

jest.mock('../executions/storage', () => ({
  readExecutionSummary: jest.fn(),
  readExecutionCheckpoint: jest.fn(),
}));

// Import mocked modules
import { getWorkflow } from '../workflows/storage';
import { readExecutionSummary, readExecutionCheckpoint } from '../executions/storage';

// Helper to simulate API endpoint logic
async function handleReplayInfo(workflowId: string, executionId: string) {
  const workflow = getWorkflow(workflowId);
  if (!workflow) {
    return { status: 404, body: { error: 'Workflow not found' } };
  }

  const summary = await readExecutionSummary(workflowId, executionId);
  if (!summary) {
    return { status: 404, body: { error: 'Execution not found' } };
  }

  const checkpoint = await readExecutionCheckpoint(workflowId, executionId);
  const replayInfo = buildReplayInfo(
    workflow,
    executionId,
    checkpoint,
    summary.workflowSnapshot
  );
  return { status: 200, body: replayInfo };
}

async function handleValidateReplay(
  workflowId: string,
  executionId: string,
  fromNodeId?: string
) {
  if (!fromNodeId) {
    return { status: 400, body: { error: 'fromNodeId is required' } };
  }

  const workflow = getWorkflow(workflowId);
  if (!workflow) {
    return { status: 404, body: { error: 'Workflow not found' } };
  }

  const summary = await readExecutionSummary(workflowId, executionId);
  if (!summary) {
    return { status: 404, body: { error: 'Execution not found' } };
  }

  const checkpoint = await readExecutionCheckpoint(workflowId, executionId);
  const validation = validateReplayEligibility(
    workflow,
    executionId,
    checkpoint,
    summary.workflowSnapshot,
    fromNodeId
  );
  return { status: 200, body: validation };
}

function createMockWorkflow(nodeIds: string[]): Workflow {
  return {
    id: 'test-workflow',
    name: 'Test Workflow',
    nodes: nodeIds.map((id, index) => ({
      id,
      type: index === 0 ? 'input' : 'output',
      position: { x: index * 100, y: 0 },
      data: { type: index === 0 ? 'input' : 'output', name: `Node ${id}` } as any,
    })),
    edges: nodeIds.slice(0, -1).map((id, index) => ({
      id: `edge-${index}`,
      source: id,
      target: nodeIds[index + 1],
    })),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createMockCheckpoint(
  states: Record<string, { status: 'pending' | 'running' | 'complete' | 'error' | 'skipped'; error?: string }>,
  outputs: Record<string, unknown> = {}
): CheckpointState {
  return {
    capturedAt: new Date().toISOString(),
    nodeStates: states,
    nodeOutputs: outputs,
    variables: {},
  };
}

describe('API /replay-info', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns replay info for valid execution', async () => {
    const workflow = createMockWorkflow(['A', 'B', 'C']);
    const checkpoint = createMockCheckpoint(
      {
        A: { status: 'complete' },
        B: { status: 'complete' },
        C: { status: 'complete' },
      },
      { A: 'a', B: 'b', C: 'c' }
    );

    (getWorkflow as jest.Mock).mockReturnValue(workflow);
    (readExecutionSummary as jest.Mock).mockResolvedValue({
      executionId: 'exec-1',
      workflowId: 'test-workflow',
      input: 'test',
      status: 'complete',
      workflowSnapshot: {
        id: 'test-workflow',
        nodes: workflow.nodes,
        edges: workflow.edges,
        capturedAt: new Date().toISOString(),
      },
    });
    (readExecutionCheckpoint as jest.Mock).mockResolvedValue(checkpoint);

    const response = await handleReplayInfo('test-workflow', 'exec-1');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('sourceExecutionId', 'exec-1');
    expect(response.body).toHaveProperty('workflowId', 'test-workflow');
    const body = response.body as any;
    expect(body).toHaveProperty('checkpoints');
    expect(body).toHaveProperty('warnings');
    expect(body).toHaveProperty('errors');
    expect(body).toHaveProperty('isReplayBlocked');
    expect(body.checkpoints.length).toBe(3);
    body.checkpoints.forEach((checkpoint: any) => {
      expect(checkpoint).toHaveProperty('nodeId');
      expect(checkpoint).toHaveProperty('nodeName');
      expect(checkpoint).toHaveProperty('status');
      expect(checkpoint).toHaveProperty('replayable');
    });
  });

  it('returns 404 for non-existent workflow', async () => {
    (getWorkflow as jest.Mock).mockReturnValue(null);

    const response = await handleReplayInfo('invalid', 'exec-1');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Workflow not found' });
  });

  it('returns 404 for non-existent execution', async () => {
    const workflow = createMockWorkflow(['A', 'B']);
    (getWorkflow as jest.Mock).mockReturnValue(workflow);
    (readExecutionSummary as jest.Mock).mockResolvedValue(null);

    const response = await handleReplayInfo('test-workflow', 'invalid');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Execution not found' });
  });

  it('handles execution without checkpoint data', async () => {
    const workflow = createMockWorkflow(['A', 'B']);
    (getWorkflow as jest.Mock).mockReturnValue(workflow);
    (readExecutionSummary as jest.Mock).mockResolvedValue({
      executionId: 'exec-1',
      workflowId: 'test-workflow',
      input: 'test',
      status: 'complete',
    });
    (readExecutionCheckpoint as jest.Mock).mockResolvedValue(null);

    const response = await handleReplayInfo('test-workflow', 'exec-1');

    expect(response.status).toBe(200);
    const body = response.body as any;
    expect(body.isReplayBlocked).toBe(true);
    expect(body.errors).toContainEqual(
      expect.objectContaining({
        type: 'missing-checkpoint',
      })
    );
    expect(body.checkpoints).toEqual([]);
  });
});

describe('API /validate-replay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('validates specific node for replay', async () => {
    const workflow = createMockWorkflow(['A', 'B', 'C']);
    const checkpoint = createMockCheckpoint(
      {
        A: { status: 'complete' },
        B: { status: 'complete' },
        C: { status: 'complete' },
      },
      { A: 'a', B: 'b', C: 'c' }
    );

    (getWorkflow as jest.Mock).mockReturnValue(workflow);
    (readExecutionSummary as jest.Mock).mockResolvedValue({
      executionId: 'exec-1',
      workflowId: 'test-workflow',
      input: 'test',
      status: 'complete',
      workflowSnapshot: {
        id: 'test-workflow',
        nodes: workflow.nodes,
        edges: workflow.edges,
        capturedAt: new Date().toISOString(),
      },
    });
    (readExecutionCheckpoint as jest.Mock).mockResolvedValue(checkpoint);

    const response = await handleValidateReplay('test-workflow', 'exec-1', 'B');

    expect(response.status).toBe(200);
    const body = response.body as any;
    expect(body).toHaveProperty('isBlocked');
    expect(body).toHaveProperty('blockingReasons');
    expect(body).toHaveProperty('warnings');
    expect(body).toHaveProperty('replayableNodeIds');
    expect(Array.isArray(body.blockingReasons)).toBe(true);
    expect(Array.isArray(body.warnings)).toBe(true);
    expect(Array.isArray(body.replayableNodeIds)).toBe(true);
    expect(typeof body.isBlocked).toBe('boolean');
  });

  it('returns 400 when fromNodeId is missing', async () => {
    const response = await handleValidateReplay('test-workflow', 'exec-1', undefined);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'fromNodeId is required' });
  });

  it('returns blocking validation for removed node', async () => {
    const workflow = createMockWorkflow(['A', 'B']); // C removed
    const originalWorkflow = createMockWorkflow(['A', 'B', 'C']);
    const checkpoint = createMockCheckpoint(
      {
        A: { status: 'complete' },
        B: { status: 'complete' },
        C: { status: 'complete' },
      },
      { A: 'a', B: 'b', C: 'c' }
    );

    (getWorkflow as jest.Mock).mockReturnValue(workflow);
    (readExecutionSummary as jest.Mock).mockResolvedValue({
      executionId: 'exec-1',
      workflowId: 'test-workflow',
      input: 'test',
      status: 'complete',
      workflowSnapshot: {
        id: 'test-workflow',
        nodes: originalWorkflow.nodes,
        edges: originalWorkflow.edges,
        capturedAt: new Date().toISOString(),
      },
    });
    (readExecutionCheckpoint as jest.Mock).mockResolvedValue(checkpoint);

    const response = await handleValidateReplay('test-workflow', 'exec-1', 'B');

    expect(response.status).toBe(200);
    const body = response.body as any;
    expect(body.isBlocked).toBe(true);
    expect(body.blockingReasons.length).toBeGreaterThan(0);
    expect(body.blockingReasons.some((r: string) => r.includes('removed'))).toBe(true);
  });

  it('returns 404 for non-existent workflow', async () => {
    (getWorkflow as jest.Mock).mockReturnValue(null);

    const response = await handleValidateReplay('invalid', 'exec-1', 'A');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Workflow not found' });
  });

  it('returns 404 for non-existent execution', async () => {
    const workflow = createMockWorkflow(['A', 'B']);
    (getWorkflow as jest.Mock).mockReturnValue(workflow);
    (readExecutionSummary as jest.Mock).mockResolvedValue(null);

    const response = await handleValidateReplay('test-workflow', 'invalid', 'A');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Execution not found' });
  });
});

describe('Multiple replay validations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('catches multiple blocking issues', async () => {
    const workflow = createMockWorkflow(['A', 'D']); // B removed, D added
    const originalWorkflow = createMockWorkflow(['A', 'B', 'C']);
    const checkpoint = createMockCheckpoint(
      {
        A: { status: 'complete' },
        B: { status: 'complete' },
        C: { status: 'complete' },
      },
      { A: 'a', B: 'b', C: 'c' }
    );

    (getWorkflow as jest.Mock).mockReturnValue(workflow);
    (readExecutionSummary as jest.Mock).mockResolvedValue({
      executionId: 'exec-1',
      workflowId: 'test-workflow',
      input: 'test',
      status: 'complete',
      workflowSnapshot: {
        id: 'test-workflow',
        nodes: originalWorkflow.nodes,
        edges: originalWorkflow.edges,
        capturedAt: new Date().toISOString(),
      },
    });
    (readExecutionCheckpoint as jest.Mock).mockResolvedValue(checkpoint);

    const response = await handleValidateReplay('test-workflow', 'exec-1', 'A');

    expect(response.status).toBe(200);
    const body = response.body as any;
    expect(body.isBlocked).toBe(true);
    expect(body.blockingReasons.length).toBeGreaterThan(1);
    expect(body.blockingReasons.some((r: string) => r.includes('removed'))).toBe(true);
    expect(body.blockingReasons.some((r: string) => r.includes('added'))).toBe(true);
  });

  it('allows replay with warnings but no blockers', async () => {
    const workflow = createMockWorkflow(['A', 'B', 'C']);
    // Change node config
    workflow.nodes[1].data = { ...workflow.nodes[1].data, name: 'Modified B' };

    const originalWorkflow = createMockWorkflow(['A', 'B', 'C']);
    const checkpoint = createMockCheckpoint(
      {
        A: { status: 'complete' },
        B: { status: 'complete' },
        C: { status: 'complete' },
      },
      { A: 'a', B: 'b', C: 'c' }
    );

    (getWorkflow as jest.Mock).mockReturnValue(workflow);
    (readExecutionSummary as jest.Mock).mockResolvedValue({
      executionId: 'exec-1',
      workflowId: 'test-workflow',
      input: 'test',
      status: 'complete',
      workflowSnapshot: {
        id: 'test-workflow',
        nodes: originalWorkflow.nodes,
        edges: originalWorkflow.edges,
        capturedAt: new Date().toISOString(),
      },
    });
    (readExecutionCheckpoint as jest.Mock).mockResolvedValue(checkpoint);

    const response = await handleValidateReplay('test-workflow', 'exec-1', 'B');

    expect(response.status).toBe(200);
    const body = response.body as any;
    expect(body.isBlocked).toBe(false);
    expect(body.warnings.length).toBeGreaterThan(0);
  });
});

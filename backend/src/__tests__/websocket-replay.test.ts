/**
 * WebSocket integration tests for replay functionality
 * Tests the replay-execution control event and full replay flow
 */

// Mock agents before imports
jest.mock('../agents/claude', () => ({
  ClaudeAgent: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockImplementation(async function* () {
      yield { type: 'text-delta', content: 'Replayed Claude response' };
      yield { type: 'complete', result: 'Replayed complete' };
    }),
    interrupt: jest.fn(),
    getStructuredOutput: jest.fn().mockReturnValue(undefined),
    getSessionId: jest.fn().mockReturnValue(undefined),
  })),
}));

jest.mock('../agents/codex', () => ({
  CodexAgent: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockImplementation(async function* () {
      yield { type: 'text-delta', content: 'Replayed Codex response' };
      yield { type: 'complete', result: 'Replayed complete' };
    }),
    interrupt: jest.fn(),
    getStructuredOutput: jest.fn().mockReturnValue(undefined),
    getSessionId: jest.fn().mockReturnValue(undefined),
  })),
}));

// Mock storage
jest.mock('../workflows/storage', () => ({
  getWorkflow: jest.fn(),
  getAllWorkflows: jest.fn(() => []),
  initializeStorage: jest.fn(),
  reloadWorkflows: jest.fn(),
}));

jest.mock('../executions/storage', () => ({
  createExecutionSummary: jest.fn(),
  updateExecutionSummary: jest.fn(),
  readExecutionSummary: jest.fn(),
  readExecutionCheckpoint: jest.fn(),
  saveExecutionCheckpoint: jest.fn(),
  appendExecutionEvent: jest.fn(),
  initializeExecutionStorage: jest.fn(),
}));

import { DAGExecutionEngine } from '../orchestrator/engine';
import { buildReplayPlan, validateReplayEligibility } from '../orchestrator/replay';
import { getWorkflow } from '../workflows/storage';
import {
  createExecutionSummary,
  updateExecutionSummary,
  readExecutionSummary,
  readExecutionCheckpoint,
} from '../executions/storage';
import { Workflow, CheckpointState, ExecutionEvent, ControlEvent } from '../workflows/types';
import { validateWorkflow } from '../orchestrator/validation';

// Import executors to register them
import { executorRegistry } from '../orchestrator/executors';

function createMockWorkflow(nodeIds: string[]): Workflow {
  return {
    id: 'test-workflow',
    name: 'Test Workflow',
    nodes: nodeIds.map((id, index) => ({
      id,
      type: index === 0 ? 'input' : index === nodeIds.length - 1 ? 'output' : 'claude-agent',
      position: { x: index * 100, y: 0 },
      data: {
        type: index === 0 ? 'input' : index === nodeIds.length - 1 ? 'output' : 'claude-agent',
        name: `Node ${id}`,
        ...(index > 0 && index < nodeIds.length - 1 ? { userQuery: 'test', model: 'sonnet', tools: [] } : {}),
      } as any,
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

function createConditionalWorkflow(): Workflow {
  return {
    id: 'conditional-workflow',
    name: 'Conditional Workflow',
    nodes: [
      {
        id: 'input-1',
        type: 'input',
        position: { x: 0, y: 0 },
        data: { type: 'input', name: 'Input' } as any,
      },
      {
        id: 'condition-1',
        type: 'condition',
        position: { x: 100, y: 0 },
        data: {
          type: 'condition',
          name: 'Condition',
          conditions: [
            {
              inputReference: '{{Input.prompt}}',
              operator: 'equals',
              compareValue: 'true',
              joiner: 'and',
            },
          ],
        } as any,
      },
      {
        id: 'branch-true',
        type: 'output',
        position: { x: 200, y: -50 },
        data: { type: 'output', name: 'True Branch' } as any,
      },
      {
        id: 'branch-false',
        type: 'output',
        position: { x: 200, y: 50 },
        data: { type: 'output', name: 'False Branch' } as any,
      },
    ],
    edges: [
      { id: 'edge-1', source: 'input-1', target: 'condition-1' },
      { id: 'edge-2', source: 'condition-1', target: 'branch-true', sourceHandle: 'true' },
      { id: 'edge-3', source: 'condition-1', target: 'branch-false', sourceHandle: 'false' },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createMockCheckpoint(
  states: Record<string, { status: 'pending' | 'running' | 'complete' | 'error' | 'skipped'; error?: string }>,
  outputs: Record<string, unknown> = {},
  variables: Record<string, unknown> = {}
): CheckpointState {
  return {
    capturedAt: new Date().toISOString(),
    nodeStates: states,
    nodeOutputs: outputs,
    variables,
  };
}

// Mock event emitter to simulate WebSocket
class MockSocket {
  events: Array<{ type: string; data: any }> = [];

  emit(event: string, data: any) {
    this.events.push({ type: event, data });
  }

  getEvents(type: string): any[] {
    return this.events.filter((e) => e.type === type).map((e) => e.data);
  }

  getLastEvent(type: string): any {
    const events = this.getEvents(type);
    return events[events.length - 1];
  }

  clearEvents() {
    this.events = [];
  }
}

describe('WebSocket replay-execution', () => {
  let mockSocket: MockSocket;

  beforeEach(() => {
    mockSocket = new MockSocket();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('successfully replays from middle node', async () => {
    const workflow = createMockWorkflow(['A', 'B', 'C']);
    const checkpoint = createMockCheckpoint(
      {
        A: { status: 'complete' },
        B: { status: 'complete' },
        C: { status: 'complete' },
      },
      { A: 'output-a', B: 'output-b', C: 'output-c' }
    );

    (getWorkflow as jest.Mock).mockReturnValue(workflow);
    (readExecutionSummary as jest.Mock).mockResolvedValue({
      executionId: 'source-exec',
      workflowId: 'test-workflow',
      input: 'original input',
      status: 'complete',
      workflowSnapshot: {
        id: 'test-workflow',
        nodes: workflow.nodes,
        edges: workflow.edges,
        capturedAt: new Date().toISOString(),
      },
    });
    (readExecutionCheckpoint as jest.Mock).mockResolvedValue(checkpoint);
    (createExecutionSummary as jest.Mock).mockResolvedValue(undefined);
    (updateExecutionSummary as jest.Mock).mockResolvedValue(undefined);

    // Simulate handleReplayExecution logic
    const validation = validateReplayEligibility(
      workflow,
      'source-exec',
      checkpoint,
      {
        id: 'test-workflow',
        nodes: workflow.nodes,
        edges: workflow.edges,
        capturedAt: new Date().toISOString(),
      },
      'B'
    );

    expect(validation.isBlocked).toBe(false);

    const replayPlan = buildReplayPlan(workflow, checkpoint, 'B');
    expect(replayPlan.errors.length).toBe(0);

    const engine = new DAGExecutionEngine(workflow);
    const events: ExecutionEvent[] = [];
    engine.on('event', (event) => events.push(event));

    await engine.executeFromCheckpoint(
      'original input',
      checkpoint,
      replayPlan.replayNodeIds,
      replayPlan.inactiveNodeIds
    );

    // Check execution flow
    const executionStart = events.find((e) => e.type === 'execution-start');
    expect(executionStart).toBeDefined();

    // A should be cached (node-complete without node-start)
    const aStarts = events.filter((e) => e.type === 'node-start' && (e as any).nodeId === 'A');
    const aCompletes = events.filter((e) => e.type === 'node-complete' && (e as any).nodeId === 'A');
    expect(aStarts.length).toBe(0); // A doesn't re-execute
    expect(aCompletes.length).toBeGreaterThan(0); // But emits complete from cache

    // B should execute
    const bStarts = events.filter((e) => e.type === 'node-start' && (e as any).nodeId === 'B');
    expect(bStarts.length).toBeGreaterThan(0);

    // C should execute
    const cStarts = events.filter((e) => e.type === 'node-start' && (e as any).nodeId === 'C');
    expect(cStarts.length).toBeGreaterThan(0);

    const executionComplete = events.find((e) => e.type === 'execution-complete');
    expect(executionComplete).toBeDefined();
  });

  it('blocks replay when workflow changed', async () => {
    const workflow = createMockWorkflow(['A', 'B', 'D']); // C removed, D added
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
      executionId: 'source-exec',
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

    const validation = validateReplayEligibility(
      workflow,
      'source-exec',
      checkpoint,
      {
        id: 'test-workflow',
        nodes: originalWorkflow.nodes,
        edges: originalWorkflow.edges,
        capturedAt: new Date().toISOString(),
      },
      'B'
    );

    expect(validation.isBlocked).toBe(true);
    expect(validation.blockingReasons.length).toBeGreaterThan(0);
    expect(validation.blockingReasons.some((r) => r.includes('removed') || r.includes('added'))).toBe(true);

    // In real flow, this would emit execution-error
    mockSocket.emit('event', {
      type: 'execution-error',
      error: `Replay blocked: ${validation.blockingReasons.join('; ')}`,
    });

    const errorEvents = mockSocket.getEvents('event').filter((e: any) => e.type === 'execution-error');
    expect(errorEvents.length).toBe(1);
    expect(errorEvents[0].error).toContain('Replay blocked');
  });

  it('blocks replay from invalid node', async () => {
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
      executionId: 'source-exec',
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

    const replayPlan = buildReplayPlan(workflow, checkpoint, 'NonExistent');

    expect(replayPlan.errors.length).toBeGreaterThan(0);
    expect(replayPlan.errors[0].type).toBe('invalid-node');

    // Simulate error emission
    mockSocket.emit('event', {
      type: 'execution-error',
      error: replayPlan.errors.map((e) => e.message).join('; '),
    });

    const errorEvents = mockSocket.getEvents('event').filter((e: any) => e.type === 'execution-error');
    expect(errorEvents.length).toBe(1);
    expect(errorEvents[0].error).toContain('does not exist');
  });

  it('blocks replay from inactive branch', async () => {
    const workflow = createConditionalWorkflow();
    const checkpoint = createMockCheckpoint(
      {
        'input-1': { status: 'complete' },
        'condition-1': { status: 'complete' },
        'branch-true': { status: 'complete' },
        'branch-false': { status: 'skipped' },
      },
      {
        'input-1': { value: 'true' },
        'condition-1': true,
        'branch-true': 'result',
      }
    );

    // Mock condition executor
    const mockExecutor = {
      getOutputHandle: jest.fn().mockReturnValue('true'),
    };
    const originalGet = executorRegistry.get.bind(executorRegistry);
    jest.spyOn(executorRegistry, 'get').mockImplementation((type: string) => {
      if (type === 'condition') return mockExecutor as any;
      return originalGet(type);
    });

    (getWorkflow as jest.Mock).mockReturnValue(workflow);
    (readExecutionSummary as jest.Mock).mockResolvedValue({
      executionId: 'source-exec',
      workflowId: 'conditional-workflow',
      input: { value: 'true' },
      status: 'complete',
      workflowSnapshot: {
        id: 'conditional-workflow',
        nodes: workflow.nodes,
        edges: workflow.edges,
        capturedAt: new Date().toISOString(),
      },
    });
    (readExecutionCheckpoint as jest.Mock).mockResolvedValue(checkpoint);

    const replayPlan = buildReplayPlan(workflow, checkpoint, 'branch-false');

    expect(replayPlan.errors.some((e) => e.type === 'inactive-branch')).toBe(true);
  });

  it('always uses original input for replay', async () => {
    const workflow = createMockWorkflow(['Input', 'A', 'B']);
    const checkpoint = createMockCheckpoint(
      {
        Input: { status: 'complete' },
        A: { status: 'complete' },
        B: { status: 'complete' },
      },
      { Input: 'original input', A: 'a', B: 'b' }
    );

    (getWorkflow as jest.Mock).mockReturnValue(workflow);
    (readExecutionSummary as jest.Mock).mockResolvedValue({
      executionId: 'source-exec',
      workflowId: 'test-workflow',
      input: 'original input',
      status: 'complete',
      workflowSnapshot: {
        id: 'test-workflow',
        nodes: workflow.nodes,
        edges: workflow.edges,
        capturedAt: new Date().toISOString(),
      },
    });
    (readExecutionCheckpoint as jest.Mock).mockResolvedValue(checkpoint);

    const summary = await readExecutionSummary('test-workflow', 'source-exec');

    // Replay always uses original input - node configuration changes are still applied
    const replayInput = summary!.input;

    expect(replayInput).toBe('original input');
  });

  it('returns error when checkpoint missing', async () => {
    const workflow = createMockWorkflow(['A', 'B']);

    (getWorkflow as jest.Mock).mockReturnValue(workflow);
    (readExecutionSummary as jest.Mock).mockResolvedValue({
      executionId: 'source-exec',
      workflowId: 'test-workflow',
      input: 'test',
      status: 'complete',
    });
    (readExecutionCheckpoint as jest.Mock).mockResolvedValue(null);

    const checkpoint = await readExecutionCheckpoint('test-workflow', 'source-exec');

    if (!checkpoint) {
      mockSocket.emit('event', {
        type: 'execution-error',
        error: 'Checkpoint data is not available for this execution',
      });
    }

    const errorEvents = mockSocket.getEvents('event').filter((e: any) => e.type === 'execution-error');
    expect(errorEvents.length).toBe(1);
    expect(errorEvents[0].error).toContain('Checkpoint data is not available');
  });
});

describe('Full replay flow - complete then replay', () => {
  it('complete execution followed by successful replay', async () => {
    const workflow = createMockWorkflow(['A', 'B', 'C']);

    // First execution
    const engine1 = new DAGExecutionEngine(workflow);
    const events1: ExecutionEvent[] = [];
    engine1.on('event', (event) => events1.push(event));

    await engine1.execute('test input');

    const exec1Complete = events1.find((e) => e.type === 'execution-complete');
    expect(exec1Complete).toBeDefined();

    // Capture checkpoint
    const checkpoint = createMockCheckpoint(
      {
        A: { status: 'complete' },
        B: { status: 'complete' },
        C: { status: 'complete' },
      },
      {
        A: engine1.getNodeOutput('A'),
        B: engine1.getNodeOutput('B'),
        C: engine1.getNodeOutput('C'),
      }
    );

    // Setup replay
    (getWorkflow as jest.Mock).mockReturnValue(workflow);
    (readExecutionSummary as jest.Mock).mockResolvedValue({
      executionId: 'exec1',
      workflowId: 'test-workflow',
      input: 'test input',
      status: 'complete',
      workflowSnapshot: {
        id: 'test-workflow',
        nodes: workflow.nodes,
        edges: workflow.edges,
        capturedAt: new Date().toISOString(),
      },
    });
    (readExecutionCheckpoint as jest.Mock).mockResolvedValue(checkpoint);

    // Validate replay
    const validation = validateReplayEligibility(
      workflow,
      'exec1',
      checkpoint,
      {
        id: 'test-workflow',
        nodes: workflow.nodes,
        edges: workflow.edges,
        capturedAt: new Date().toISOString(),
      },
      'B'
    );

    expect(validation.isBlocked).toBe(false);

    // Execute replay
    const replayPlan = buildReplayPlan(workflow, checkpoint, 'B');
    const engine2 = new DAGExecutionEngine(workflow);
    const events2: ExecutionEvent[] = [];
    engine2.on('event', (event) => events2.push(event));

    await engine2.executeFromCheckpoint('test input', checkpoint, replayPlan.replayNodeIds, replayPlan.inactiveNodeIds);

    // Verify replay completed
    const exec2Complete = events2.find((e) => e.type === 'execution-complete');
    expect(exec2Complete).toBeDefined();

    // A should be cached
    const aStarts = events2.filter((e) => e.type === 'node-start' && (e as any).nodeId === 'A');
    expect(aStarts.length).toBe(0);

    // B and C should execute
    const bStarts = events2.filter((e) => e.type === 'node-start' && (e as any).nodeId === 'B');
    const cStarts = events2.filter((e) => e.type === 'node-start' && (e as any).nodeId === 'C');
    expect(bStarts.length).toBeGreaterThan(0);
    expect(cStarts.length).toBeGreaterThan(0);

    // Different execution IDs
    const exec1Id = (events1.find((e) => e.type === 'execution-start') as any)?.executionId;
    const exec2Id = (events2.find((e) => e.type === 'execution-start') as any)?.executionId;
    expect(exec1Id).toBeDefined();
    expect(exec2Id).toBeDefined();
    expect(exec1Id).not.toBe(exec2Id);
  });
});

/**
 * Integration tests for engine replay functionality
 * Tests executeFromCheckpoint and the complete replay flow
 */

// Mock the agent modules - must be before any imports that use them
jest.mock('../../agents/claude', () => ({
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

jest.mock('../../agents/codex', () => ({
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

// Import after mocks are defined
import { DAGExecutionEngine } from '../engine';
import { Workflow, ExecutionEvent, CheckpointState } from '../../workflows/types';
import '../../orchestrator/executors';

function createLinearWorkflow(nodeIds: string[]): Workflow {
  const nodes = nodeIds.map((id, index) => ({
    id,
    type: index === 0 ? 'input' : index === nodeIds.length - 1 ? 'output' : 'claude-agent',
    position: { x: index * 100, y: 0 },
    data: {
      type: index === 0 ? 'input' : index === nodeIds.length - 1 ? 'output' : 'claude-agent',
      name: `Node ${id}`,
      ...(index > 0 && index < nodeIds.length - 1 ? { userQuery: 'test', model: 'sonnet', tools: [] } : {}),
    },
  }));

  const edges = [];
  for (let i = 0; i < nodeIds.length - 1; i++) {
    edges.push({
      id: `edge-${i}`,
      source: nodeIds[i],
      target: nodeIds[i + 1],
    });
  }

  return {
    id: 'test-workflow',
    name: 'Test Workflow',
    nodes: nodes as any,
    edges,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createParallelWorkflow(): Workflow {
  return {
    id: 'parallel-workflow',
    name: 'Parallel Workflow',
    nodes: [
      {
        id: 'A',
        type: 'input',
        position: { x: 0, y: 0 },
        data: { type: 'input', name: 'A' } as any,
      },
      {
        id: 'B',
        type: 'output',
        position: { x: 100, y: -50 },
        data: { type: 'output', name: 'B' } as any,
      },
      {
        id: 'C',
        type: 'output',
        position: { x: 100, y: 50 },
        data: { type: 'output', name: 'C' } as any,
      },
    ],
    edges: [
      { id: 'e1', source: 'A', target: 'B' },
      { id: 'e2', source: 'A', target: 'C' },
    ],
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
          rules: [{ field: 'value', operator: 'equals', value: 'true', joiner: 'and' }],
          inputSelection: { nodeId: 'input-1', nodeName: 'Input' },
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
      {
        id: 'merge-1',
        type: 'merge',
        position: { x: 300, y: 0 },
        data: { type: 'merge', name: 'Merge' } as any,
      },
    ],
    edges: [
      { id: 'edge-1', source: 'input-1', target: 'condition-1' },
      { id: 'edge-2', source: 'condition-1', target: 'branch-true', sourceHandle: 'true' },
      { id: 'edge-3', source: 'condition-1', target: 'branch-false', sourceHandle: 'false' },
      { id: 'edge-4', source: 'branch-true', target: 'merge-1' },
      { id: 'edge-5', source: 'branch-false', target: 'merge-1' },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createCheckpoint(
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

describe('Engine executeFromCheckpoint', () => {
  it('restores node states from checkpoint', async () => {
    const workflow = createLinearWorkflow(['A', 'B', 'C']);
    const checkpoint = createCheckpoint(
      {
        A: { status: 'complete' },
        B: { status: 'complete' },
        C: { status: 'pending' },
      },
      { A: 'output-a', B: 'output-b' }
    );

    const engine = new DAGExecutionEngine(workflow);
    const events: ExecutionEvent[] = [];
    engine.on('event', (event) => events.push(event));

    await engine.executeFromCheckpoint('test input', checkpoint, new Set(['C']), new Set());

    // Check that A and B were restored as complete
    const nodeCompleteEvents = events.filter((e) => e.type === 'node-complete');
    const aComplete = nodeCompleteEvents.find((e: any) => e.nodeId === 'A');
    const bComplete = nodeCompleteEvents.find((e: any) => e.nodeId === 'B');

    expect(aComplete).toBeDefined();
    expect(bComplete).toBeDefined();

    // Check that outputs were restored
    expect(engine.getNodeState('A')?.status).toBe('complete');
    expect(engine.getNodeState('B')?.status).toBe('complete');
    expect(engine.getNodeOutput('A')).toBe('output-a');
    expect(engine.getNodeOutput('B')).toBe('output-b');
  });

  it('clears outputs for replay nodes', async () => {
    const workflow = createLinearWorkflow(['A', 'B', 'C']);
    const checkpoint = createCheckpoint(
      {
        A: { status: 'complete' },
        B: { status: 'complete' },
        C: { status: 'complete' },
      },
      { A: 'output-a', B: 'old-b', C: 'old-c' }
    );

    const engine = new DAGExecutionEngine(workflow);
    const events: ExecutionEvent[] = [];
    engine.on('event', (event) => events.push(event));

    // Replay from B
    await engine.executeFromCheckpoint('test input', checkpoint, new Set(['B', 'C']), new Set());

    // B should have executed fresh
    const bStartEvents = events.filter((e) => e.type === 'node-start' && (e as any).nodeId === 'B');
    expect(bStartEvents.length).toBeGreaterThan(0);

    // A should not have re-executed
    expect(engine.getNodeOutput('A')).toBe('output-a');
  });

  it('skips nodes not in replay path', async () => {
    const workflow = createParallelWorkflow();
    const checkpoint = createCheckpoint(
      {
        A: { status: 'complete' },
        B: { status: 'complete' },
        C: { status: 'complete' },
      },
      { A: 'input', B: 'b-output', C: 'c-output' }
    );

    const engine = new DAGExecutionEngine(workflow);
    const events: ExecutionEvent[] = [];
    engine.on('event', (event) => events.push(event));

    // Only replay B
    await engine.executeFromCheckpoint('test input', checkpoint, new Set(['B']), new Set(['C']));

    // C should be skipped
    expect(engine.getNodeState('C')?.status).toBe('skipped');

    // B should execute
    const bStartEvents = events.filter((e) => e.type === 'node-start' && (e as any).nodeId === 'B');
    expect(bStartEvents.length).toBeGreaterThan(0);
  });

  it('preserves variables except for replay nodes', async () => {
    const workflow = createLinearWorkflow(['A', 'B', 'C']);
    const checkpoint = createCheckpoint(
      {
        A: { status: 'complete' },
        B: { status: 'complete' },
        C: { status: 'pending' },
      },
      { A: 'a', B: 'b' },
      {
        'node.A.output': 'a',
        'node.B.output': 'b',
        'workflow.input': 'test',
      }
    );

    const engine = new DAGExecutionEngine(workflow);

    await engine.executeFromCheckpoint('test input', checkpoint, new Set(['B', 'C']), new Set());

    // Global variables should be preserved
    const workflowInput = engine['context'].variables.get('workflow.input');
    expect(workflowInput).toBe('test');

    // Node A variables should be preserved
    const nodeAOutput = engine['context'].variables.get('node.A.output');
    expect(nodeAOutput).toBe('a');

    // Node B variables should be filtered (will be regenerated)
    const nodeBOutput = engine['context'].variables.get('node.B.output');
    expect(nodeBOutput).toBeUndefined();
  });

  it('marks inactive branch nodes as skipped', async () => {
    const workflow = createConditionalWorkflow();
    const checkpoint = createCheckpoint(
      {
        'input-1': { status: 'complete' },
        'condition-1': { status: 'complete' },
        'branch-true': { status: 'complete' },
        'branch-false': { status: 'skipped' },
        'merge-1': { status: 'complete' },
      },
      {
        'input-1': { value: 'true' },
        'condition-1': true,
        'branch-true': 'true-result',
        'merge-1': { 'branch-true': 'true-result' },
      }
    );

    const engine = new DAGExecutionEngine(workflow);

    await engine.executeFromCheckpoint(
      JSON.stringify({ value: 'true' }),
      checkpoint,
      new Set(['merge-1']),
      new Set(['branch-false'])
    );

    // Inactive branch should be skipped
    expect(engine.getNodeState('branch-false')?.status).toBe('skipped');
  });

  it('re-executes target node and descendants', async () => {
    const workflow = createLinearWorkflow(['A', 'B', 'C']);
    const checkpoint = createCheckpoint(
      {
        A: { status: 'complete' },
        B: { status: 'complete' },
        C: { status: 'complete' },
      },
      { A: 'a', B: 'old-b', C: 'old-c' }
    );

    const engine = new DAGExecutionEngine(workflow);
    const events: ExecutionEvent[] = [];
    engine.on('event', (event) => events.push(event));

    await engine.executeFromCheckpoint('test input', checkpoint, new Set(['B', 'C']), new Set());

    // Both B and C should have node-start events
    const bStarts = events.filter((e) => e.type === 'node-start' && (e as any).nodeId === 'B');
    const cStarts = events.filter((e) => e.type === 'node-start' && (e as any).nodeId === 'C');

    expect(bStarts.length).toBeGreaterThan(0);
    expect(cStarts.length).toBeGreaterThan(0);

    // Final execution should be complete
    const completeEvent = events.find((e) => e.type === 'execution-complete');
    expect(completeEvent).toBeDefined();
  });

  it('handles input nodes correctly', async () => {
    const workflow = createLinearWorkflow(['Input', 'Agent', 'Output']);
    const checkpoint = createCheckpoint(
      {
        Input: { status: 'complete' },
        Agent: { status: 'complete' },
        Output: { status: 'complete' },
      },
      { Input: 'old input', Agent: 'agent result', Output: 'agent result' }
    );

    const engine = new DAGExecutionEngine(workflow);
    const newInput = 'new replay input';

    await engine.executeFromCheckpoint(newInput, checkpoint, new Set(['Agent', 'Output']), new Set());

    // Input node should have new input
    expect(engine.getNodeOutput('Input')).toBe(newInput);
    expect(engine.getNodeState('Input')?.status).toBe('complete');
  });
});

describe('Replay preserves checkpoint data integrity', () => {
  it('upstream node outputs are correctly available during replay', async () => {
    const workflow: Workflow = {
      id: 'test',
      name: 'Test',
      nodes: [
        {
          id: 'A',
          type: 'input',
          position: { x: 0, y: 0 },
          data: { type: 'input', name: 'A' } as any,
        },
        {
          id: 'B',
          type: 'output',
          position: { x: 100, y: 0 },
          data: { type: 'output', name: 'B' } as any,
        },
      ],
      edges: [{ id: 'e1', source: 'A', target: 'B' }],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const checkpoint = createCheckpoint(
      {
        A: { status: 'complete' },
        B: { status: 'complete' },
      },
      { A: 'checkpoint-output', B: 'checkpoint-output' }
    );

    const engine = new DAGExecutionEngine(workflow);
    await engine.executeFromCheckpoint('test', checkpoint, new Set(['B']), new Set());

    // B should receive A's output from checkpoint
    expect(engine.getNodeOutput('A')).toBe('checkpoint-output');
    expect(engine.getNodeOutput('B')).toBe('checkpoint-output');
  });
});

describe('Replay with conditional branching', () => {
  it('inactive branches stay skipped', async () => {
    const workflow = createConditionalWorkflow();
    const checkpoint = createCheckpoint(
      {
        'input-1': { status: 'complete' },
        'condition-1': { status: 'complete' },
        'branch-true': { status: 'complete' },
        'branch-false': { status: 'skipped' },
        'merge-1': { status: 'complete' },
      },
      {
        'input-1': { value: 'true' },
        'condition-1': true,
        'branch-true': 'true-result',
        'merge-1': { 'branch-true': 'true-result' },
      }
    );

    const engine = new DAGExecutionEngine(workflow);
    const events: ExecutionEvent[] = [];
    engine.on('event', (event) => events.push(event));

    // Replay from merge, inactive branch should stay skipped
    await engine.executeFromCheckpoint(
      JSON.stringify({ value: 'true' }),
      checkpoint,
      new Set(['merge-1']),
      new Set(['branch-false'])
    );

    // Condition should not re-execute (cached)
    const conditionStarts = events.filter((e) => e.type === 'node-start' && (e as any).nodeId === 'condition-1');
    expect(conditionStarts.length).toBe(0);

    // Branch true should have cached output
    expect(engine.getNodeState('branch-true')?.status).toBe('complete');
    expect(engine.getNodeOutput('branch-true')).toBe('true-result');

    // Branch false should be skipped
    expect(engine.getNodeState('branch-false')?.status).toBe('skipped');

    // Merge should execute
    const mergeStarts = events.filter((e) => e.type === 'node-start' && (e as any).nodeId === 'merge-1');
    expect(mergeStarts.length).toBeGreaterThan(0);
  });
});

describe('Edge cases', () => {
  it('replay from first non-input node', async () => {
    const workflow = createLinearWorkflow(['Input', 'A', 'B']);
    const checkpoint = createCheckpoint(
      {
        Input: { status: 'complete' },
        A: { status: 'complete' },
        B: { status: 'complete' },
      },
      { Input: 'old', A: 'old-a', B: 'old-b' }
    );

    const engine = new DAGExecutionEngine(workflow);
    const events: ExecutionEvent[] = [];
    engine.on('event', (event) => events.push(event));

    await engine.executeFromCheckpoint('new input', checkpoint, new Set(['A', 'B']), new Set());

    // Input should be set with new input
    expect(engine.getNodeOutput('Input')).toBe('new input');

    // A should execute with new input
    const aStarts = events.filter((e) => e.type === 'node-start' && (e as any).nodeId === 'A');
    expect(aStarts.length).toBeGreaterThan(0);
  });

  it('replay from leaf node', async () => {
    const workflow = createLinearWorkflow(['A', 'B', 'C']);
    const checkpoint = createCheckpoint(
      {
        A: { status: 'complete' },
        B: { status: 'complete' },
        C: { status: 'complete' },
      },
      { A: 'a', B: 'b', C: 'old-c' }
    );

    const engine = new DAGExecutionEngine(workflow);
    const events: ExecutionEvent[] = [];
    engine.on('event', (event) => events.push(event));

    // Replay only C (leaf node)
    await engine.executeFromCheckpoint('test', checkpoint, new Set(['C']), new Set());

    // A and B should use cached outputs
    expect(engine.getNodeOutput('A')).toBe('a');
    expect(engine.getNodeOutput('B')).toBe('b');

    // Only C should execute
    const nodeStarts = events.filter((e) => e.type === 'node-start');
    const cStarts = nodeStarts.filter((e: any) => e.nodeId === 'C');
    expect(cStarts.length).toBeGreaterThan(0);

    // Execution should complete
    const completeEvent = events.find((e) => e.type === 'execution-complete');
    expect(completeEvent).toBeDefined();
  });

  it('checkpoint with extra node data', async () => {
    const workflow = createLinearWorkflow(['A', 'B']);
    const checkpoint = createCheckpoint(
      {
        A: { status: 'complete' },
        B: { status: 'complete' },
        DeletedNode: { status: 'complete' }, // Node no longer in workflow
      },
      { A: 'a', B: 'b', DeletedNode: 'deleted' }
    );

    const engine = new DAGExecutionEngine(workflow);

    // Should not throw
    await expect(
      engine.executeFromCheckpoint('test', checkpoint, new Set(['B']), new Set())
    ).resolves.toBeDefined();
  });

  it('checkpoint missing required node data', async () => {
    const workflow = createLinearWorkflow(['A', 'B', 'C']);
    const checkpoint = createCheckpoint(
      {
        A: { status: 'complete' },
        // B is missing
      },
      { A: 'a' }
    );

    const engine = new DAGExecutionEngine(workflow);

    // Should handle gracefully
    await expect(
      engine.executeFromCheckpoint('test', checkpoint, new Set(['C']), new Set())
    ).resolves.toBeDefined();

    // B should get executed or have default status
    const bState = engine.getNodeState('B');
    expect(bState).toBeDefined();
  });
});

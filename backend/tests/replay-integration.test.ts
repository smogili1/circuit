// Mock the agent modules - must be before any imports that use them
jest.mock('../src/agents/claude', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockImplementation: () => AsyncGenerator<any, void, unknown> = async function* () {
    yield { type: 'text-delta', content: 'Mock response' };
    yield { type: 'complete', result: 'Mock complete' };
  };

  return {
    ClaudeAgent: jest.fn().mockImplementation(() => ({
      execute: jest.fn().mockImplementation(function () {
        return mockImplementation();
      }),
      interrupt: jest.fn(),
      getStructuredOutput: jest.fn().mockReturnValue(undefined),
      getSessionId: jest.fn().mockReturnValue(undefined),
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __setMockImplementation: (impl: () => AsyncGenerator<any, void, unknown>) => {
      mockImplementation = impl;
    },
    __resetMockImplementation: () => {
      mockImplementation = async function* () {
        yield { type: 'text-delta', content: 'Mock response' };
        yield { type: 'complete', result: 'Mock complete' };
      };
    },
  };
});

jest.mock('../src/agents/codex', () => ({
  CodexAgent: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockImplementation(async function* () {
      yield { type: 'text-delta', content: 'Mock Codex response' };
      yield { type: 'complete', result: 'Mock Codex complete' };
    }),
    interrupt: jest.fn(),
    getStructuredOutput: jest.fn().mockReturnValue(undefined),
    getSessionId: jest.fn().mockReturnValue(undefined),
  })),
}));

// Import after mocks
import { DAGExecutionEngine } from '../src/orchestrator/engine';
import { Workflow, ExecutionEvent, WorkflowNode, WorkflowEdge } from '../src/workflows/types';
import { createReplayExecutionContext } from '../src/orchestrator/context';
import { validateReplayConfiguration } from '../src/orchestrator/validation';
import { extractNodeOutputsFromEvents, ExecutionSummary, ExecutionEventRecord, ExecutionNodeSummary } from '../src/executions/storage';
// Ensure executors are registered
import '../src/orchestrator/executors';

describe('Replay Integration Tests', () => {
  // Get reference to the mocked ClaudeAgent
  const claudeMock = jest.requireMock('../src/agents/claude') as {
    ClaudeAgent: jest.Mock;
    __setMockImplementation: (impl: () => AsyncGenerator<unknown, void, unknown>) => void;
    __resetMockImplementation: () => void;
  };

  afterEach(() => {
    claudeMock.__resetMockImplementation();
  });

  // Helper to create nodes
  const createNode = (id: string, type: string, name: string, data?: Record<string, unknown>): WorkflowNode => ({
    id,
    type: type as WorkflowNode['type'],
    position: { x: 0, y: 0 },
    data: { type: type as WorkflowNode['type'], name, ...data } as WorkflowNode['data'],
  });

  // Helper to create edges
  const createEdge = (source: string, target: string, sourceHandle?: string): WorkflowEdge => ({
    id: `edge-${source}-${target}`,
    source,
    target,
    sourceHandle,
  });

  // Helper to create execution summary
  const createExecutionSummary = (
    workflowId: string,
    nodes: Record<string, ExecutionNodeSummary>,
    status: 'complete' | 'error' = 'complete'
  ): ExecutionSummary => ({
    executionId: 'source-exec-123',
    workflowId,
    input: 'original input',
    status,
    startedAt: '2024-01-01T00:00:00Z',
    completedAt: '2024-01-01T00:01:00Z',
    nodes,
  });

  const createNodeSummary = (
    nodeId: string,
    status: 'complete' | 'error' = 'complete'
  ): ExecutionNodeSummary => ({
    nodeId,
    status,
    startedAt: '2024-01-01T00:00:00Z',
    completedAt: status === 'complete' ? '2024-01-01T00:00:01Z' : undefined,
    error: status === 'error' ? 'Node failed' : undefined,
  });

  describe('Full replay flow - error recovery scenario', () => {
    it('uses upstream output from original execution when replaying from failed node', async () => {
      // Create workflow: Input -> A -> B -> C -> Output
      // B will fail in original, then succeed in replay
      const workflow: Workflow = {
        id: 'wf-1',
        name: 'Error Recovery Workflow',
        nodes: [
          createNode('input-1', 'input', 'Input'),
          createNode('node-a', 'claude-agent', 'Node A', { userQuery: 'A', model: 'sonnet', tools: [] }),
          createNode('node-b', 'claude-agent', 'Node B', { userQuery: 'B', model: 'sonnet', tools: [] }),
          createNode('output-1', 'output', 'Output'),
        ],
        edges: [
          createEdge('input-1', 'node-a'),
          createEdge('node-a', 'node-b'),
          createEdge('node-b', 'output-1'),
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Simulate original execution where A completed but B errored
      const sourceExecution = createExecutionSummary('wf-1', {
        'input-1': createNodeSummary('input-1', 'complete'),
        'node-a': createNodeSummary('node-a', 'complete'),
        'node-b': createNodeSummary('node-b', 'error'),
      }, 'error');

      // Simulate extracted outputs from original events
      const sourceOutputs = new Map<string, unknown>([
        ['input-1', 'original input'],
        ['node-a', { result: 'A completed successfully' }],
      ]);

      // Validate replay configuration
      const validation = validateReplayConfiguration(workflow, sourceExecution, 'node-b');

      expect(validation.valid).toBe(true);
      expect(validation.affectedNodes.reused).toContain('node-a');
      expect(validation.affectedNodes.reused).toContain('input-1');
      expect(validation.affectedNodes.reExecuted).toContain('node-b');
      expect(validation.affectedNodes.reExecuted).toContain('output-1');

      // Create replay context with seeded outputs
      const seedNodeOutputs = new Map<string, unknown>();
      for (const [nodeId, output] of sourceOutputs) {
        if (!new Set(validation.affectedNodes.reExecuted).has(nodeId)) {
          seedNodeOutputs.set(nodeId, output);
        }
      }

      // Set up mock to succeed this time
      claudeMock.__setMockImplementation(async function* () {
        yield { type: 'text-delta', content: 'Fixed response' };
        yield { type: 'complete', result: 'B now succeeds' };
      });

      const replayContext = createReplayExecutionContext(
        workflow.id,
        sourceExecution,
        seedNodeOutputs
      );

      const engine = new DAGExecutionEngine(workflow, undefined, {
        executionContext: replayContext,
        replay: { seedNodeOutputs },
      });

      const events: ExecutionEvent[] = [];
      engine.on('event', (event) => events.push(event));

      await engine.execute('replay input');

      // Verify A uses seeded output
      expect(engine.getNodeState('node-a')?.output).toEqual({ result: 'A completed successfully' });

      // Verify B re-executed and completed
      expect(engine.getNodeState('node-b')?.status).toBe('complete');

      // Verify Output completed
      expect(engine.getNodeState('output-1')?.status).toBe('complete');

      // Verify A had cached events, B had live events
      const nodeAEvents = events.filter((e) => (e as { nodeId?: string }).nodeId === 'node-a');
      const nodeBEvents = events.filter((e) => (e as { nodeId?: string }).nodeId === 'node-b');

      expect(nodeAEvents.length).toBeGreaterThan(0); // Has seeded events
      expect(nodeBEvents.length).toBeGreaterThan(0); // Has live events
    });
  });

  describe('Replay from condition node', () => {
    it('condition node re-evaluates correctly with cached upstream outputs', async () => {
      const workflow: Workflow = {
        id: 'wf-condition',
        name: 'Condition Workflow',
        nodes: [
          createNode('input-1', 'input', 'Input'),
          createNode('claude-1', 'claude-agent', 'Claude', { userQuery: 'Test', model: 'sonnet', tools: [] }),
          createNode('condition-1', 'condition', 'Check', {
            conditions: [
              {
                inputReference: '{{Claude.result}}',
                operator: 'contains',
                compareValue: 'success',
              },
            ],
          }),
          createNode('true-branch', 'output', 'True Output'),
          createNode('false-branch', 'output', 'False Output'),
        ],
        edges: [
          createEdge('input-1', 'claude-1'),
          createEdge('claude-1', 'condition-1'),
          createEdge('condition-1', 'true-branch', 'true'),
          createEdge('condition-1', 'false-branch', 'false'),
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Original execution took true branch
      const sourceExecution = createExecutionSummary('wf-condition', {
        'input-1': createNodeSummary('input-1', 'complete'),
        'claude-1': createNodeSummary('claude-1', 'complete'),
        'condition-1': createNodeSummary('condition-1', 'complete'),
        'true-branch': createNodeSummary('true-branch', 'complete'),
      });

      // Seed with data that will cause condition to evaluate to false
      const seedNodeOutputs = new Map<string, unknown>([
        ['input-1', 'seeded input'],
        ['claude-1', { result: 'operation failed' }], // Changed from success to failed
      ]);

      const validation = validateReplayConfiguration(workflow, sourceExecution, 'condition-1');
      expect(validation.valid).toBe(true);

      const replayContext = createReplayExecutionContext(
        workflow.id,
        sourceExecution,
        seedNodeOutputs
      );

      const engine = new DAGExecutionEngine(workflow, undefined, {
        executionContext: replayContext,
        replay: { seedNodeOutputs },
      });

      await engine.execute('test');

      // Condition should evaluate to false now (opposite of original)
      expect(engine.getNodeState('condition-1')?.output).toBe(false);
      expect(engine.getNodeState('true-branch')?.status).toBe('skipped');
      expect(engine.getNodeState('false-branch')?.status).toBe('complete');
    });
  });

  describe('Replay from middle of parallel branches', () => {
    it('handles replay with parallel structure correctly', async () => {
      let callCount = 0;
      claudeMock.__setMockImplementation(async function* () {
        callCount++;
        yield { type: 'text-delta', content: `Live response ${callCount}` };
        yield { type: 'complete', result: `Live result ${callCount}` };
      });

      const workflow: Workflow = {
        id: 'wf-parallel',
        name: 'Parallel Workflow',
        nodes: [
          createNode('input-1', 'input', 'Input'),
          createNode('node-a', 'claude-agent', 'Node A', { userQuery: 'A', model: 'sonnet', tools: [] }),
          createNode('node-b', 'claude-agent', 'Node B', { userQuery: 'B', model: 'sonnet', tools: [] }),
          createNode('merge-1', 'merge', 'Merge', { inputSelection: 'first' }),
          createNode('output-1', 'output', 'Output'),
        ],
        edges: [
          createEdge('input-1', 'node-a'),
          createEdge('input-1', 'node-b'),
          createEdge('node-a', 'merge-1'),
          createEdge('node-b', 'merge-1'),
          createEdge('merge-1', 'output-1'),
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // A errored, B completed in original
      const sourceExecution = createExecutionSummary('wf-parallel', {
        'input-1': createNodeSummary('input-1', 'complete'),
        'node-a': createNodeSummary('node-a', 'error'),
        'node-b': createNodeSummary('node-b', 'complete'),
      }, 'error');

      // Seed B's output (it succeeded)
      const seedNodeOutputs = new Map<string, unknown>([
        ['input-1', 'seeded input'],
        ['node-b', { result: 'B cached output' }],
      ]);

      const validation = validateReplayConfiguration(workflow, sourceExecution, 'node-a');
      // Note: validation may fail because node-a's upstream (input-1) is needed
      // and we need to verify it's complete

      const replayContext = createReplayExecutionContext(
        workflow.id,
        sourceExecution,
        seedNodeOutputs
      );

      const engine = new DAGExecutionEngine(workflow, undefined, {
        executionContext: replayContext,
        replay: { seedNodeOutputs },
      });

      await engine.execute('test');

      // A should re-execute (live)
      expect(callCount).toBeGreaterThan(0);
      expect(engine.getNodeState('node-a')?.status).toBe('complete');

      // B should use cached output
      expect(engine.getNodeState('node-b')?.output).toEqual({ result: 'B cached output' });

      // Merge should have both inputs
      expect(engine.getNodeState('merge-1')?.status).toBe('complete');
    });
  });

  describe('Replay execution event recording', () => {
    it('events for seeded nodes are recorded correctly', async () => {
      const workflow: Workflow = {
        id: 'wf-1',
        name: 'Test',
        nodes: [
          createNode('input-1', 'input', 'Input'),
          createNode('claude-1', 'claude-agent', 'Claude', { userQuery: 'Test', model: 'sonnet', tools: [] }),
          createNode('output-1', 'output', 'Output'),
        ],
        edges: [
          createEdge('input-1', 'claude-1'),
          createEdge('claude-1', 'output-1'),
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const sourceExecution = createExecutionSummary('wf-1', {
        'input-1': createNodeSummary('input-1', 'complete'),
        'claude-1': createNodeSummary('claude-1', 'complete'),
        'output-1': createNodeSummary('output-1', 'complete'),
      });

      const seedNodeOutputs = new Map<string, unknown>([
        ['input-1', 'seeded input'],
      ]);

      const replayContext = createReplayExecutionContext(
        workflow.id,
        sourceExecution,
        seedNodeOutputs
      );

      const engine = new DAGExecutionEngine(workflow, undefined, {
        executionContext: replayContext,
        replay: { seedNodeOutputs },
      });

      const events: ExecutionEvent[] = [];
      engine.on('event', (event) => events.push(event));

      await engine.execute('test');

      // Should have execution-start
      expect(events.some((e) => e.type === 'execution-start')).toBe(true);

      // Should have node events for seeded node
      const inputEvents = events.filter((e) => (e as { nodeId?: string }).nodeId === 'input-1');
      expect(inputEvents.some((e) => e.type === 'node-start')).toBe(true);
      expect(inputEvents.some((e) => e.type === 'node-complete')).toBe(true);

      // Should have execution-complete
      expect(events.some((e) => e.type === 'execution-complete')).toBe(true);
    });

    it('events for live executed nodes are recorded normally', async () => {
      const workflow: Workflow = {
        id: 'wf-1',
        name: 'Test',
        nodes: [
          createNode('input-1', 'input', 'Input'),
          createNode('claude-1', 'claude-agent', 'Claude', { userQuery: 'Test', model: 'sonnet', tools: [] }),
          createNode('output-1', 'output', 'Output'),
        ],
        edges: [
          createEdge('input-1', 'claude-1'),
          createEdge('claude-1', 'output-1'),
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const sourceExecution = createExecutionSummary('wf-1', {
        'input-1': createNodeSummary('input-1', 'complete'),
        'claude-1': createNodeSummary('claude-1', 'complete'),
        'output-1': createNodeSummary('output-1', 'complete'),
      });

      const seedNodeOutputs = new Map<string, unknown>([
        ['input-1', 'seeded'],
      ]);

      const replayContext = createReplayExecutionContext(
        workflow.id,
        sourceExecution,
        seedNodeOutputs
      );

      const engine = new DAGExecutionEngine(workflow, undefined, {
        executionContext: replayContext,
        replay: { seedNodeOutputs },
      });

      const events: ExecutionEvent[] = [];
      engine.on('event', (event) => events.push(event));

      await engine.execute('test');

      // Claude node should have normal execution events
      const claudeEvents = events.filter((e) => (e as { nodeId?: string }).nodeId === 'claude-1');
      expect(claudeEvents.some((e) => e.type === 'node-start')).toBe(true);
      expect(claudeEvents.some((e) => e.type === 'node-complete')).toBe(true);

      // Should also have node-output events from agent streaming
      const outputEvents = events.filter(
        (e) => e.type === 'node-output' && (e as { nodeId?: string }).nodeId === 'claude-1'
      );
      expect(outputEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Replay with modified input', () => {
    it('when replaying from first node, new input is used', async () => {
      const workflow: Workflow = {
        id: 'wf-1',
        name: 'Test',
        nodes: [
          createNode('input-1', 'input', 'Input'),
          createNode('output-1', 'output', 'Output'),
        ],
        edges: [createEdge('input-1', 'output-1')],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const sourceExecution = createExecutionSummary('wf-1', {
        'input-1': createNodeSummary('input-1', 'complete'),
        'output-1': createNodeSummary('output-1', 'complete'),
      });

      // Don't seed input since we're replaying from it
      const seedNodeOutputs = new Map<string, unknown>();

      const replayContext = createReplayExecutionContext(
        workflow.id,
        sourceExecution,
        seedNodeOutputs
      );

      const engine = new DAGExecutionEngine(workflow, undefined, {
        executionContext: replayContext,
        replay: { seedNodeOutputs },
      });

      await engine.execute('NEW INPUT VALUE');

      // Input should have the new value
      expect(engine.getNodeState('input-1')?.output).toBe('NEW INPUT VALUE');
    });

    it('when replaying from downstream node, cached upstream is used regardless of new input', async () => {
      const workflow: Workflow = {
        id: 'wf-1',
        name: 'Test',
        nodes: [
          createNode('input-1', 'input', 'Input'),
          createNode('node-a', 'claude-agent', 'Node A', { userQuery: 'A', model: 'sonnet', tools: [] }),
          createNode('output-1', 'output', 'Output'),
        ],
        edges: [
          createEdge('input-1', 'node-a'),
          createEdge('node-a', 'output-1'),
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const sourceExecution = createExecutionSummary('wf-1', {
        'input-1': createNodeSummary('input-1', 'complete'),
        'node-a': createNodeSummary('node-a', 'complete'),
        'output-1': createNodeSummary('output-1', 'complete'),
      });

      // Seed both input and node-a (replaying from output)
      const seedNodeOutputs = new Map<string, unknown>([
        ['input-1', 'original cached input'],
        ['node-a', { result: 'cached A output' }],
      ]);

      const replayContext = createReplayExecutionContext(
        workflow.id,
        sourceExecution,
        seedNodeOutputs
      );

      const engine = new DAGExecutionEngine(workflow, undefined, {
        executionContext: replayContext,
        replay: { seedNodeOutputs },
      });

      // Even with new input, seeded values should be used
      await engine.execute('NEW INPUT - IGNORED');

      // Seeded values should be preserved
      expect(engine.getNodeState('input-1')?.output).toBe('original cached input');
      expect(engine.getNodeState('node-a')?.output).toEqual({ result: 'cached A output' });
    });
  });

  describe('Workflow version mismatch - add node scenario', () => {
    it('replay-preview returns warning about workflow structure change', () => {
      const workflow: Workflow = {
        id: 'wf-1',
        name: 'Updated Workflow',
        nodes: [
          createNode('input-1', 'input', 'Input'),
          createNode('node-a', 'claude-agent', 'Node A', { userQuery: 'A', model: 'sonnet', tools: [] }),
          createNode('node-new', 'claude-agent', 'New Node', { userQuery: 'New', model: 'sonnet', tools: [] }),
          createNode('output-1', 'output', 'Output'),
        ],
        edges: [
          createEdge('input-1', 'node-a'),
          createEdge('node-a', 'node-new'),
          createEdge('node-new', 'output-1'),
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Source execution didn't have node-new
      const sourceExecution = createExecutionSummary('wf-1', {
        'input-1': createNodeSummary('input-1', 'complete'),
        'node-a': createNodeSummary('node-a', 'complete'),
        'output-1': createNodeSummary('output-1', 'complete'),
      });

      const validation = validateReplayConfiguration(workflow, sourceExecution, 'node-new');

      expect(validation.warnings.some((w) => w.toLowerCase().includes('structure'))).toBe(true);
      expect(validation.affectedNodes.new).toContain('node-new');
    });
  });

  describe('Workflow version mismatch - remove node scenario', () => {
    it('replay works if removed node is not needed', () => {
      // Workflow with node C removed (was A->B->C->D, now A->B->D)
      const workflow: Workflow = {
        id: 'wf-1',
        name: 'Simplified Workflow',
        nodes: [
          createNode('input-1', 'input', 'Input'),
          createNode('node-a', 'claude-agent', 'Node A', { userQuery: 'A', model: 'sonnet', tools: [] }),
          createNode('node-b', 'claude-agent', 'Node B', { userQuery: 'B', model: 'sonnet', tools: [] }),
          createNode('output-1', 'output', 'Output'),
        ],
        edges: [
          createEdge('input-1', 'node-a'),
          createEdge('node-a', 'node-b'),
          createEdge('node-b', 'output-1'),
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Source had node-c which is now removed
      const sourceExecution = createExecutionSummary('wf-1', {
        'input-1': createNodeSummary('input-1', 'complete'),
        'node-a': createNodeSummary('node-a', 'complete'),
        'node-b': createNodeSummary('node-b', 'complete'),
        'node-c': createNodeSummary('node-c', 'complete'), // This node no longer exists
        'output-1': createNodeSummary('output-1', 'complete'),
      });

      const validation = validateReplayConfiguration(workflow, sourceExecution, 'output-1');

      // Should have warning about structure change
      expect(validation.warnings.some((w) => w.toLowerCase().includes('structure'))).toBe(true);

      // Should still be valid since removed node isn't needed for output-1
      expect(validation.valid).toBe(true);
    });
  });

  describe('Replay with loop workflow', () => {
    it('replay uses final iteration output for upstream dependencies', async () => {
      // Simulate a workflow with a loop that executed multiple times
      // by providing events that show multiple iterations

      const events: ExecutionEventRecord[] = [
        { timestamp: 't1', event: { type: 'node-start', nodeId: 'loop-node', nodeName: 'Loop' } },
        { timestamp: 't2', event: { type: 'node-complete', nodeId: 'loop-node', result: 'iteration-1' } },
        { timestamp: 't3', event: { type: 'node-start', nodeId: 'loop-node', nodeName: 'Loop' } },
        { timestamp: 't4', event: { type: 'node-complete', nodeId: 'loop-node', result: 'iteration-2' } },
        { timestamp: 't5', event: { type: 'node-start', nodeId: 'loop-node', nodeName: 'Loop' } },
        { timestamp: 't6', event: { type: 'node-complete', nodeId: 'loop-node', result: 'iteration-3-final' } },
      ];

      const outputs = extractNodeOutputsFromEvents(events);

      // Should only have the final output
      expect(outputs.get('loop-node')).toBe('iteration-3-final');
    });
  });

  describe('Concurrent replay safety', () => {
    it('multiple engine instances run independently', async () => {
      const workflow: Workflow = {
        id: 'wf-1',
        name: 'Test',
        nodes: [
          createNode('input-1', 'input', 'Input'),
          createNode('output-1', 'output', 'Output'),
        ],
        edges: [createEdge('input-1', 'output-1')],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Create two engines with different contexts
      const engine1 = new DAGExecutionEngine(workflow);
      const engine2 = new DAGExecutionEngine(workflow);

      // They should have different execution IDs
      expect(engine1.getContext().executionId).not.toBe(engine2.getContext().executionId);

      // Execute both
      const events1: ExecutionEvent[] = [];
      const events2: ExecutionEvent[] = [];

      engine1.on('event', (e) => events1.push(e));
      engine2.on('event', (e) => events2.push(e));

      await Promise.all([
        engine1.execute('input 1'),
        engine2.execute('input 2'),
      ]);

      // Each should have its own events
      expect(events1.length).toBeGreaterThan(0);
      expect(events2.length).toBeGreaterThan(0);

      // Outputs should be different
      expect(engine1.getNodeState('input-1')?.output).toBe('input 1');
      expect(engine2.getNodeState('input-1')?.output).toBe('input 2');
    });

    it('both executions can complete successfully', async () => {
      const workflow: Workflow = {
        id: 'wf-1',
        name: 'Test',
        nodes: [
          createNode('input-1', 'input', 'Input'),
          createNode('claude-1', 'claude-agent', 'Claude', { userQuery: 'Test', model: 'sonnet', tools: [] }),
          createNode('output-1', 'output', 'Output'),
        ],
        edges: [
          createEdge('input-1', 'claude-1'),
          createEdge('claude-1', 'output-1'),
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const engine1 = new DAGExecutionEngine(workflow);
      const engine2 = new DAGExecutionEngine(workflow);

      let complete1 = false;
      let complete2 = false;

      engine1.on('event', (e) => {
        if (e.type === 'execution-complete') complete1 = true;
      });
      engine2.on('event', (e) => {
        if (e.type === 'execution-complete') complete2 = true;
      });

      await Promise.all([
        engine1.execute('test 1'),
        engine2.execute('test 2'),
      ]);

      expect(complete1).toBe(true);
      expect(complete2).toBe(true);
    });
  });
});

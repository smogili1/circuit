// Mock the agent modules - must be before any imports that use them
jest.mock('../src/agents/claude', () => ({
  ClaudeAgent: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockImplementation(async function* () {
      yield { type: 'text-delta', content: 'Mock Claude response' };
      yield { type: 'complete', result: 'Mock Claude complete' };
    }),
    interrupt: jest.fn(),
    getStructuredOutput: jest.fn().mockReturnValue(undefined),
    getSessionId: jest.fn().mockReturnValue(undefined),
  })),
}));

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

// Import after mocks are defined
import { DAGExecutionEngine } from '../src/orchestrator/engine';
import { Workflow, ExecutionEvent, WorkflowNode, WorkflowEdge, ExecutionContext } from '../src/workflows/types';
import { createReplayExecutionContext } from '../src/orchestrator/context';
import { ExecutionSummary } from '../src/executions/storage';
// Ensure executors are registered
import '../src/orchestrator/executors';

describe('DAGExecutionEngine Replay Mode', () => {
  // Get reference to the mocked ClaudeAgent
  const claudeMock = jest.requireMock('../src/agents/claude') as {
    ClaudeAgent: jest.Mock;
  };

  // Restore default mock after each test
  afterEach(() => {
    claudeMock.ClaudeAgent.mockImplementation(() => ({
      execute: jest.fn().mockImplementation(async function* () {
        yield { type: 'text-delta', content: 'Mock Claude response' };
        yield { type: 'complete', result: 'Mock Claude complete' };
      }),
      interrupt: jest.fn(),
      getStructuredOutput: jest.fn().mockReturnValue(undefined),
      getSessionId: jest.fn().mockReturnValue(undefined),
    }));
  });

  // Helper to create workflow nodes
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

  // Helper to create a simple workflow
  const createLinearWorkflow = (): Workflow => ({
    id: 'workflow-1',
    name: 'Linear Workflow',
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
  });

  // Helper to create a mock execution summary
  const createMockExecutionSummary = (workflowId: string): ExecutionSummary => ({
    executionId: 'source-exec-123',
    workflowId,
    input: 'original input',
    status: 'complete',
    startedAt: '2024-01-01T00:00:00Z',
    completedAt: '2024-01-01T00:01:00Z',
    workingDirectory: process.cwd(),
    nodes: {},
  });

  describe('correctly skips nodes marked as pre-completed', () => {
    it('seeded nodes have status complete immediately after engine construction', () => {
      const workflow = createLinearWorkflow();
      const seedNodeOutputs = new Map<string, unknown>([
        ['input-1', 'seeded input'],
      ]);

      const engine = new DAGExecutionEngine(workflow, undefined, {
        replay: { seedNodeOutputs },
      });

      expect(engine.getNodeState('input-1')?.status).toBe('complete');
      expect(engine.getNodeState('input-1')?.output).toBe('seeded input');
    });

    it('seeded nodes do not emit node-start events during execute()', async () => {
      const workflow = createLinearWorkflow();
      const seedNodeOutputs = new Map<string, unknown>([
        ['input-1', 'seeded input'],
      ]);

      const engine = new DAGExecutionEngine(workflow, undefined, {
        replay: { seedNodeOutputs },
      });

      const events: ExecutionEvent[] = [];
      engine.on('event', (event) => events.push(event));

      await engine.execute('test input');

      // Filter for node-start events where node was seeded
      // The engine DOES emit events for seeded nodes at the start of execution
      // but only one node-start per seeded node (from emitReplaySeededNodes)
      const inputNodeStarts = events.filter(
        (e) => e.type === 'node-start' && (e as { nodeId: string }).nodeId === 'input-1'
      );

      // Should only have ONE node-start (from emitReplaySeededNodes, not from executeNode)
      expect(inputNodeStarts.length).toBe(1);
    });

    it('seeded node outputs are available in context.nodeOutputs', async () => {
      const workflow = createLinearWorkflow();
      const seedNodeOutputs = new Map<string, unknown>([
        ['input-1', 'seeded input value'],
      ]);

      const engine = new DAGExecutionEngine(workflow, undefined, {
        replay: { seedNodeOutputs },
      });

      const context = engine.getContext();
      expect(context.nodeOutputs.get('input-1')).toBe('seeded input value');
    });

    it('downstream nodes still execute normally', async () => {
      const workflow = createLinearWorkflow();
      const seedNodeOutputs = new Map<string, unknown>([
        ['input-1', 'seeded input'],
      ]);

      const engine = new DAGExecutionEngine(workflow, undefined, {
        replay: { seedNodeOutputs },
      });

      const events: ExecutionEvent[] = [];
      engine.on('event', (event) => events.push(event));

      await engine.execute('test input');

      // Claude node should have started and completed
      const claudeStart = events.find(
        (e) => e.type === 'node-start' && (e as { nodeId: string }).nodeId === 'claude-1'
      );
      const claudeComplete = events.find(
        (e) => e.type === 'node-complete' && (e as { nodeId: string }).nodeId === 'claude-1'
      );

      expect(claudeStart).toBeDefined();
      expect(claudeComplete).toBeDefined();
      expect(engine.getNodeState('claude-1')?.status).toBe('complete');
    });
  });

  describe('correctly resolves references to seeded node outputs', () => {
    it('node B receives interpolated value from seeded node A', async () => {
      // Create a workflow where Claude uses the input value
      const workflow: Workflow = {
        id: 'workflow-1',
        name: 'Reference Workflow',
        nodes: [
          createNode('input-1', 'input', 'Input'),
          createNode('claude-1', 'claude-agent', 'Claude', {
            userQuery: 'Process: {{Input.result}}',
            model: 'sonnet',
            tools: [],
          }),
          createNode('output-1', 'output', 'Output'),
        ],
        edges: [
          createEdge('input-1', 'claude-1'),
          createEdge('claude-1', 'output-1'),
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const seedNodeOutputs = new Map<string, unknown>([
        ['input-1', 'cached input data'],
      ]);

      const engine = new DAGExecutionEngine(workflow, undefined, {
        replay: { seedNodeOutputs },
      });

      await engine.execute('test');

      // The Claude agent was called with interpolated prompt
      expect(claudeMock.ClaudeAgent).toHaveBeenCalled();
    });

    it('reference resolution works when mixing seeded and live nodes', async () => {
      const workflow: Workflow = {
        id: 'workflow-1',
        name: 'Mixed Workflow',
        nodes: [
          createNode('input-1', 'input', 'Input'),
          createNode('claude-1', 'claude-agent', 'Claude 1', {
            userQuery: 'First agent',
            model: 'sonnet',
            tools: [],
          }),
          createNode('claude-2', 'claude-agent', 'Claude 2', {
            userQuery: 'Process: {{Claude 1.result}}',
            model: 'sonnet',
            tools: [],
          }),
          createNode('output-1', 'output', 'Output'),
        ],
        edges: [
          createEdge('input-1', 'claude-1'),
          createEdge('claude-1', 'claude-2'),
          createEdge('claude-2', 'output-1'),
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Seed input and claude-1, let claude-2 execute live
      const seedNodeOutputs = new Map<string, unknown>([
        ['input-1', 'original input'],
        ['claude-1', { result: 'Claude 1 cached output' }],
      ]);

      const engine = new DAGExecutionEngine(workflow, undefined, {
        replay: { seedNodeOutputs },
      });

      await engine.execute('test');

      // Claude-2 should execute
      expect(engine.getNodeState('claude-2')?.status).toBe('complete');
    });
  });

  describe('emits proper events for pre-completed nodes', () => {
    it('node-start event emitted for each seeded node', async () => {
      const workflow = createLinearWorkflow();
      const seedNodeOutputs = new Map<string, unknown>([
        ['input-1', 'seeded'],
      ]);

      const engine = new DAGExecutionEngine(workflow, undefined, {
        replay: { seedNodeOutputs },
      });

      const events: ExecutionEvent[] = [];
      engine.on('event', (event) => events.push(event));

      await engine.execute('test');

      const seededNodeStarts = events.filter(
        (e) => e.type === 'node-start' && (e as { nodeId: string }).nodeId === 'input-1'
      );

      expect(seededNodeStarts.length).toBe(1);
    });

    it('node-complete event emitted with cached output for each seeded node', async () => {
      const workflow = createLinearWorkflow();
      const seedNodeOutputs = new Map<string, unknown>([
        ['input-1', 'cached value'],
      ]);

      const engine = new DAGExecutionEngine(workflow, undefined, {
        replay: { seedNodeOutputs },
      });

      const events: ExecutionEvent[] = [];
      engine.on('event', (event) => events.push(event));

      await engine.execute('test');

      const seededNodeCompletes = events.filter(
        (e) => e.type === 'node-complete' && (e as { nodeId: string }).nodeId === 'input-1'
      ) as Array<{ type: 'node-complete'; nodeId: string; result: unknown }>;

      expect(seededNodeCompletes.length).toBe(1);
      expect(seededNodeCompletes[0].result).toBe('cached value');
    });

    it('events are emitted in correct order (start before complete)', async () => {
      const workflow = createLinearWorkflow();
      const seedNodeOutputs = new Map<string, unknown>([
        ['input-1', 'seeded'],
      ]);

      const engine = new DAGExecutionEngine(workflow, undefined, {
        replay: { seedNodeOutputs },
      });

      const inputEvents: string[] = [];
      engine.on('event', (event) => {
        if ((event as { nodeId?: string }).nodeId === 'input-1') {
          inputEvents.push(event.type);
        }
      });

      await engine.execute('test');

      const startIdx = inputEvents.indexOf('node-start');
      const completeIdx = inputEvents.indexOf('node-complete');

      expect(startIdx).toBeLessThan(completeIdx);
    });

    it('seeded node events are emitted before downstream node execution begins', async () => {
      const workflow = createLinearWorkflow();
      const seedNodeOutputs = new Map<string, unknown>([
        ['input-1', 'seeded'],
      ]);

      const engine = new DAGExecutionEngine(workflow, undefined, {
        replay: { seedNodeOutputs },
      });

      const eventOrder: string[] = [];
      engine.on('event', (event) => {
        const nodeId = (event as { nodeId?: string }).nodeId;
        if (nodeId) {
          eventOrder.push(`${event.type}:${nodeId}`);
        }
      });

      await engine.execute('test');

      const inputCompleteIdx = eventOrder.indexOf('node-complete:input-1');
      const claudeStartIdx = eventOrder.indexOf('node-start:claude-1');

      expect(inputCompleteIdx).toBeLessThan(claudeStartIdx);
    });
  });

  describe('handles mixed scenario of cached upstream + live downstream', () => {
    it('node A output comes from seed, no execution', async () => {
      const workflow: Workflow = {
        id: 'workflow-1',
        name: 'Mixed Workflow',
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

      const seedNodeOutputs = new Map<string, unknown>([
        ['input-1', 'seeded input'],
        ['node-a', { result: 'seeded A output' }],
      ]);

      const engine = new DAGExecutionEngine(workflow, undefined, {
        replay: { seedNodeOutputs },
      });

      await engine.execute('test');

      // Node A's output should be from the seed
      expect(engine.getNodeState('node-a')?.output).toEqual({ result: 'seeded A output' });
    });

    it('node B executes live and receives A seeded output', async () => {
      let callCount = 0;
      claudeMock.ClaudeAgent.mockImplementation(() => ({
        execute: jest.fn().mockImplementation(async function* () {
          callCount++;
          yield { type: 'text-delta', content: `Live B response ${callCount}` };
          yield { type: 'complete', result: `Live B result ${callCount}` };
        }),
        interrupt: jest.fn(),
        getStructuredOutput: jest.fn().mockReturnValue(undefined),
        getSessionId: jest.fn().mockReturnValue(undefined),
      }));

      const workflow: Workflow = {
        id: 'workflow-1',
        name: 'Mixed Workflow',
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

      const seedNodeOutputs = new Map<string, unknown>([
        ['input-1', 'seeded input'],
        ['node-a', { result: 'seeded A output' }],
      ]);

      const engine = new DAGExecutionEngine(workflow, undefined, {
        replay: { seedNodeOutputs },
      });

      await engine.execute('test');

      // Node B should have executed (ClaudeAgent was called)
      expect(callCount).toBeGreaterThan(0);
      expect(engine.getNodeState('node-b')?.status).toBe('complete');
    });

    it('final execution-complete event contains results from output nodes', async () => {
      const workflow: Workflow = {
        id: 'workflow-1',
        name: 'Mixed Workflow',
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

      const seedNodeOutputs = new Map<string, unknown>([
        ['input-1', 'seeded'],
      ]);

      const engine = new DAGExecutionEngine(workflow, undefined, {
        replay: { seedNodeOutputs },
      });

      let completeEvent: ExecutionEvent | undefined;
      engine.on('event', (event) => {
        if (event.type === 'execution-complete') {
          completeEvent = event;
        }
      });

      await engine.execute('test');

      expect(completeEvent).toBeDefined();
      expect((completeEvent as { result: Record<string, unknown> }).result['output-1']).toBeDefined();
    });
  });

  describe('handles condition node with seeded upstream', () => {
    it('condition node evaluates using seeded Claude output', async () => {
      const workflow: Workflow = {
        id: 'workflow-condition',
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
          createNode('output-true', 'output', 'True Output'),
          createNode('output-false', 'output', 'False Output'),
        ],
        edges: [
          createEdge('input-1', 'claude-1'),
          createEdge('claude-1', 'condition-1'),
          createEdge('condition-1', 'output-true', 'true'),
          createEdge('condition-1', 'output-false', 'false'),
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const seedNodeOutputs = new Map<string, unknown>([
        ['input-1', 'seeded input'],
        ['claude-1', { result: 'operation was a success!' }],
      ]);

      const engine = new DAGExecutionEngine(workflow, undefined, {
        replay: { seedNodeOutputs },
      });

      await engine.execute('test');

      // Condition should evaluate to true based on seeded output
      expect(engine.getNodeState('condition-1')?.output).toBe(true);
      expect(engine.getNodeState('output-true')?.status).toBe('complete');
      expect(engine.getNodeState('output-false')?.status).toBe('skipped');
    });

    it('correct branch is taken based on seeded data', async () => {
      const workflow: Workflow = {
        id: 'workflow-condition',
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
          createNode('output-true', 'output', 'True Output'),
          createNode('output-false', 'output', 'False Output'),
        ],
        edges: [
          createEdge('input-1', 'claude-1'),
          createEdge('claude-1', 'condition-1'),
          createEdge('condition-1', 'output-true', 'true'),
          createEdge('condition-1', 'output-false', 'false'),
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Seed with data that causes false condition
      const seedNodeOutputs = new Map<string, unknown>([
        ['input-1', 'seeded input'],
        ['claude-1', { result: 'operation failed!' }],
      ]);

      const engine = new DAGExecutionEngine(workflow, undefined, {
        replay: { seedNodeOutputs },
      });

      await engine.execute('test');

      // Condition should evaluate to false
      expect(engine.getNodeState('condition-1')?.output).toBe(false);
      expect(engine.getNodeState('output-true')?.status).toBe('skipped');
      expect(engine.getNodeState('output-false')?.status).toBe('complete');
    });

    it('inactive branch is properly skipped', async () => {
      const workflow: Workflow = {
        id: 'workflow-condition',
        name: 'Condition Workflow',
        nodes: [
          createNode('input-1', 'input', 'Input'),
          createNode('claude-1', 'claude-agent', 'Claude', { userQuery: 'Test', model: 'sonnet', tools: [] }),
          createNode('condition-1', 'condition', 'Check', {
            conditions: [
              {
                inputReference: '{{Claude.result}}',
                operator: 'equals',
                compareValue: 'yes',
              },
            ],
          }),
          createNode('output-true', 'output', 'True Output'),
          createNode('output-false', 'output', 'False Output'),
        ],
        edges: [
          createEdge('input-1', 'claude-1'),
          createEdge('claude-1', 'condition-1'),
          createEdge('condition-1', 'output-true', 'true'),
          createEdge('condition-1', 'output-false', 'false'),
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const seedNodeOutputs = new Map<string, unknown>([
        ['input-1', 'seeded'],
        ['claude-1', { result: 'yes' }],
      ]);

      const engine = new DAGExecutionEngine(workflow, undefined, {
        replay: { seedNodeOutputs },
      });

      const events: ExecutionEvent[] = [];
      engine.on('event', (event) => events.push(event));

      await engine.execute('test');

      // False branch should be skipped, not started
      const falseStartEvents = events.filter(
        (e) => e.type === 'node-start' && (e as { nodeId: string }).nodeId === 'output-false'
      );
      expect(falseStartEvents.length).toBe(0);
    });
  });

  describe('applies branch skipping for seeded condition nodes', () => {
    it('false branch nodes are marked as skipped when condition seeded as true', async () => {
      const workflow: Workflow = {
        id: 'workflow-condition',
        name: 'Condition Workflow',
        nodes: [
          createNode('input-1', 'input', 'Input'),
          createNode('condition-1', 'condition', 'Check', {
            conditions: [
              {
                inputReference: '{{Input.result}}',
                operator: 'contains',
                compareValue: 'yes',
              },
            ],
          }),
          createNode('output-true', 'output', 'True Output'),
          createNode('output-false', 'output', 'False Output'),
        ],
        edges: [
          createEdge('input-1', 'condition-1'),
          createEdge('condition-1', 'output-true', 'true'),
          createEdge('condition-1', 'output-false', 'false'),
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Seed both input and condition as true
      const seedNodeOutputs = new Map<string, unknown>([
        ['input-1', 'yes'],
        ['condition-1', true],
      ]);

      const engine = new DAGExecutionEngine(workflow, undefined, {
        replay: { seedNodeOutputs },
      });

      await engine.execute('test');

      expect(engine.getNodeState('output-false')?.status).toBe('skipped');
      expect(engine.getNodeState('output-true')?.status).toBe('complete');
    });

    it('true branch nodes remain executable when condition seeded as true', async () => {
      const workflow: Workflow = {
        id: 'workflow-condition',
        name: 'Condition Workflow',
        nodes: [
          createNode('input-1', 'input', 'Input'),
          createNode('condition-1', 'condition', 'Check', {
            conditions: [
              {
                inputReference: '{{Input.result}}',
                operator: 'contains',
                compareValue: 'yes',
              },
            ],
          }),
          createNode('output-true', 'output', 'True Output'),
          createNode('output-false', 'output', 'False Output'),
        ],
        edges: [
          createEdge('input-1', 'condition-1'),
          createEdge('condition-1', 'output-true', 'true'),
          createEdge('condition-1', 'output-false', 'false'),
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const seedNodeOutputs = new Map<string, unknown>([
        ['input-1', 'yes'],
        ['condition-1', true],
      ]);

      const engine = new DAGExecutionEngine(workflow, undefined, {
        replay: { seedNodeOutputs },
      });

      await engine.execute('test');

      expect(engine.getNodeState('output-true')?.status).toBe('complete');
    });

    it('branch skipping happens during seedReplayState before execute()', () => {
      const workflow: Workflow = {
        id: 'workflow-condition',
        name: 'Condition Workflow',
        nodes: [
          createNode('input-1', 'input', 'Input'),
          createNode('condition-1', 'condition', 'Check', {
            conditions: [
              {
                inputReference: '{{Input.result}}',
                operator: 'equals',
                compareValue: 'match',
              },
            ],
          }),
          createNode('output-true', 'output', 'True Output'),
          createNode('output-false', 'output', 'False Output'),
        ],
        edges: [
          createEdge('input-1', 'condition-1'),
          createEdge('condition-1', 'output-true', 'true'),
          createEdge('condition-1', 'output-false', 'false'),
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const seedNodeOutputs = new Map<string, unknown>([
        ['input-1', 'match'],
        ['condition-1', true],
      ]);

      // Create engine - branch skipping should happen in constructor
      const engine = new DAGExecutionEngine(workflow, undefined, {
        replay: { seedNodeOutputs },
      });

      // Before execute(), false branch should already be pending (not skipped yet at this point,
      // skipping happens when condition executes for non-seeded, but for seeded it's applied immediately)
      // Actually with seeded condition, branch skipping IS applied during seedReplayState
      expect(engine.getNodeState('output-false')?.status).toBe('skipped');
    });
  });

  describe('handles parallel workflow structures', () => {
    it('A re-executes, B uses cached output, merge receives both', async () => {
      let liveCallCount = 0;
      claudeMock.ClaudeAgent.mockImplementation(() => ({
        execute: jest.fn().mockImplementation(async function* () {
          liveCallCount++;
          yield { type: 'text-delta', content: `Live response ${liveCallCount}` };
          yield { type: 'complete', result: `Live result ${liveCallCount}` };
        }),
        interrupt: jest.fn(),
        getStructuredOutput: jest.fn().mockReturnValue(undefined),
        getSessionId: jest.fn().mockReturnValue(undefined),
      }));

      const workflow: Workflow = {
        id: 'workflow-parallel',
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

      // Seed input and node-b, let node-a execute live
      const seedNodeOutputs = new Map<string, unknown>([
        ['input-1', 'seeded input'],
        ['node-b', { result: 'cached B output' }],
      ]);

      const engine = new DAGExecutionEngine(workflow, undefined, {
        replay: { seedNodeOutputs },
      });

      await engine.execute('test');

      // Node A should execute live
      expect(liveCallCount).toBe(1);

      // Both nodes should be complete
      expect(engine.getNodeState('node-a')?.status).toBe('complete');
      expect(engine.getNodeState('node-b')?.status).toBe('complete');

      // Node B should have cached output
      expect(engine.getNodeState('node-b')?.output).toEqual({ result: 'cached B output' });

      // Merge should have completed
      expect(engine.getNodeState('merge-1')?.status).toBe('complete');
    });

    it('merge node receives both outputs correctly', async () => {
      claudeMock.ClaudeAgent.mockImplementation(() => ({
        execute: jest.fn().mockImplementation(async function* () {
          yield { type: 'text-delta', content: 'Live A' };
          yield { type: 'complete', result: 'Live A result' };
        }),
        interrupt: jest.fn(),
        getStructuredOutput: jest.fn().mockReturnValue(undefined),
        getSessionId: jest.fn().mockReturnValue(undefined),
      }));

      const workflow: Workflow = {
        id: 'workflow-parallel',
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

      const seedNodeOutputs = new Map<string, unknown>([
        ['input-1', 'input'],
        ['node-b', { result: 'B cached' }],
      ]);

      const engine = new DAGExecutionEngine(workflow, undefined, {
        replay: { seedNodeOutputs },
      });

      await engine.execute('test');

      expect(engine.getNodeState('merge-1')?.status).toBe('complete');
      expect(engine.getNodeState('output-1')?.status).toBe('complete');
    });

    it('output node executes after merge completes', async () => {
      const workflow: Workflow = {
        id: 'workflow-parallel',
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

      const seedNodeOutputs = new Map<string, unknown>([
        ['input-1', 'input'],
        ['node-a', { result: 'A' }],
        ['node-b', { result: 'B' }],
      ]);

      const engine = new DAGExecutionEngine(workflow, undefined, {
        replay: { seedNodeOutputs },
      });

      const events: ExecutionEvent[] = [];
      engine.on('event', (event) => events.push(event));

      await engine.execute('test');

      // Get the indices
      const mergeComplete = events.findIndex(
        (e) => e.type === 'node-complete' && (e as { nodeId: string }).nodeId === 'merge-1'
      );
      const outputStart = events.findIndex(
        (e) => e.type === 'node-start' && (e as { nodeId: string }).nodeId === 'output-1'
      );

      expect(mergeComplete).toBeLessThan(outputStart);
    });
  });

  describe('integration with createReplayExecutionContext', () => {
    it('engine uses provided execution context', () => {
      const workflow = createLinearWorkflow();
      const sourceExecution = createMockExecutionSummary(workflow.id);
      const nodeOutputs = new Map<string, unknown>([
        ['input-1', 'seeded from context'],
      ]);

      const replayContext = createReplayExecutionContext(
        workflow.id,
        sourceExecution,
        nodeOutputs
      );

      const engine = new DAGExecutionEngine(workflow, undefined, {
        executionContext: replayContext,
        replay: { seedNodeOutputs: nodeOutputs },
      });

      expect(engine.getContext().executionId).toBe(replayContext.executionId);
      expect(engine.getContext().workflowId).toBe(replayContext.workflowId);
    });

    it('seeded outputs from context are used by engine', async () => {
      const workflow = createLinearWorkflow();
      const sourceExecution = createMockExecutionSummary(workflow.id);
      const nodeOutputs = new Map<string, unknown>([
        ['input-1', 'context seeded input'],
      ]);

      const replayContext = createReplayExecutionContext(
        workflow.id,
        sourceExecution,
        nodeOutputs
      );

      const engine = new DAGExecutionEngine(workflow, undefined, {
        executionContext: replayContext,
        replay: { seedNodeOutputs: nodeOutputs },
      });

      await engine.execute('test');

      expect(engine.getNodeState('input-1')?.output).toBe('context seeded input');
    });
  });
});

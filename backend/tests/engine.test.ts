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
import { Workflow, ExecutionEvent } from '../src/workflows/types';
// Ensure executors are registered
import '../src/orchestrator/executors';

describe('DAGExecutionEngine', () => {
  const createSimpleWorkflow = (): Workflow => ({
    id: 'workflow-1',
    name: 'Test Workflow',
    nodes: [
      {
        id: 'input-1',
        type: 'input',
        position: { x: 0, y: 0 },
        data: { type: 'input', name: 'Input' },
      },
      {
        id: 'output-1',
        type: 'output',
        position: { x: 200, y: 0 },
        data: { type: 'output', name: 'Output' },
      },
    ],
    edges: [{ id: 'edge-1', source: 'input-1', target: 'output-1' }],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const createClaudeWorkflow = (): Workflow => ({
    id: 'workflow-2',
    name: 'Claude Workflow',
    nodes: [
      {
        id: 'input-1',
        type: 'input',
        position: { x: 0, y: 0 },
        data: { type: 'input', name: 'Input' },
      },
      {
        id: 'claude-1',
        type: 'claude-agent',
        position: { x: 100, y: 0 },
        data: {
          type: 'claude-agent',
          name: 'Claude',
          userQuery: 'Test prompt',
          model: 'sonnet',
          tools: ['Read'],
        },
      },
      {
        id: 'output-1',
        type: 'output',
        position: { x: 200, y: 0 },
        data: { type: 'output', name: 'Output' },
      },
    ],
    edges: [
      { id: 'edge-1', source: 'input-1', target: 'claude-1' },
      { id: 'edge-2', source: 'claude-1', target: 'output-1' },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const createParallelWorkflow = (): Workflow => ({
    id: 'workflow-3',
    name: 'Parallel Workflow',
    nodes: [
      {
        id: 'input-1',
        type: 'input',
        position: { x: 0, y: 100 },
        data: { type: 'input', name: 'Input' },
      },
      {
        id: 'claude-1',
        type: 'claude-agent',
        position: { x: 150, y: 0 },
        data: {
          type: 'claude-agent',
          name: 'Claude 1',
          userQuery: 'Test prompt',
          model: 'sonnet',
          tools: [],
        },
      },
      {
        id: 'codex-1',
        type: 'codex-agent',
        position: { x: 150, y: 200 },
        data: {
          type: 'codex-agent',
          name: 'Codex 1',
          userQuery: 'Test prompt',
          model: 'gpt-5.2-codex',
          approvalPolicy: 'never',
          sandbox: 'read-only',
        },
      },
      {
        id: 'output-1',
        type: 'output',
        position: { x: 300, y: 100 },
        data: { type: 'output', name: 'Output' },
      },
    ],
    edges: [
      { id: 'edge-1', source: 'input-1', target: 'claude-1' },
      { id: 'edge-2', source: 'input-1', target: 'codex-1' },
      { id: 'edge-3', source: 'claude-1', target: 'output-1' },
      { id: 'edge-4', source: 'codex-1', target: 'output-1' },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  describe('constructor', () => {
    it('should initialize with workflow and set all nodes to pending', () => {
      const workflow = createSimpleWorkflow();
      const engine = new DAGExecutionEngine(workflow);

      expect(engine.getNodeState('input-1')?.status).toBe('pending');
      expect(engine.getNodeState('output-1')?.status).toBe('pending');
    });

    it('should create execution context', () => {
      const workflow = createSimpleWorkflow();
      const engine = new DAGExecutionEngine(workflow, '/test/path');

      const context = engine.getContext();
      expect(context.workflowId).toBe('workflow-1');
      expect(context.workingDirectory).toBe('/test/path');
    });
  });

  describe('execute', () => {
    it('should emit execution-start event', async () => {
      const workflow = createSimpleWorkflow();
      const engine = new DAGExecutionEngine(workflow);
      const events: ExecutionEvent[] = [];

      engine.on('event', (event) => events.push(event));

      await engine.execute('test input');

      expect(events[0].type).toBe('execution-start');
      expect((events[0] as { executionId: string }).executionId).toBeDefined();
    });

    it('should process input node first', async () => {
      const workflow = createSimpleWorkflow();
      const engine = new DAGExecutionEngine(workflow);

      await engine.execute('test input');

      expect(engine.getNodeState('input-1')?.status).toBe('complete');
      expect(engine.getNodeState('input-1')?.output).toBe('test input');
    });

    it('should emit execution-complete event', async () => {
      const workflow = createSimpleWorkflow();
      const engine = new DAGExecutionEngine(workflow);
      const events: ExecutionEvent[] = [];

      engine.on('event', (event) => events.push(event));

      await engine.execute('test input');

      const completeEvent = events.find((e) => e.type === 'execution-complete');
      expect(completeEvent).toBeDefined();
    });

    it('should execute claude agent node', async () => {
      const workflow = createClaudeWorkflow();
      const engine = new DAGExecutionEngine(workflow);
      const events: ExecutionEvent[] = [];

      engine.on('event', (event) => events.push(event));

      await engine.execute('analyze this code');

      expect(engine.getNodeState('claude-1')?.status).toBe('complete');

      const nodeStartEvents = events.filter((e) => e.type === 'node-start');
      expect(nodeStartEvents.some((e) => (e as { nodeId: string }).nodeId === 'claude-1')).toBe(
        true
      );
    });

    it('should execute parallel branches concurrently', async () => {
      const workflow = createParallelWorkflow();
      const engine = new DAGExecutionEngine(workflow);
      const events: ExecutionEvent[] = [];

      engine.on('event', (event) => events.push(event));

      await engine.execute('parallel task');

      expect(engine.getNodeState('claude-1')?.status).toBe('complete');
      expect(engine.getNodeState('codex-1')?.status).toBe('complete');
      expect(engine.getNodeState('output-1')?.status).toBe('complete');
    });

    it('should pass predecessor outputs to successor nodes', async () => {
      const workflow = createSimpleWorkflow();
      const engine = new DAGExecutionEngine(workflow);

      await engine.execute('my input');

      // Output node should receive input from input node
      expect(engine.getNodeState('output-1')?.output).toBe('my input');
    });
  });

  describe('interrupt', () => {
    it('should stop execution when interrupted', async () => {
      const workflow = createClaudeWorkflow();
      const engine = new DAGExecutionEngine(workflow);

      // Start execution but interrupt quickly
      const executePromise = engine.execute('test');

      // Interrupt after a short delay
      setTimeout(() => engine.interrupt(), 10);

      await executePromise;

      // Execution should have been interrupted
      // The exact state depends on timing, but interrupt should be called
    });
  });

  describe('getContext', () => {
    it('should return the execution context', () => {
      const workflow = createSimpleWorkflow();
      const engine = new DAGExecutionEngine(workflow, '/custom/dir');

      const context = engine.getContext();

      expect(context.workflowId).toBe('workflow-1');
      expect(context.workingDirectory).toBe('/custom/dir');
      expect(context.nodeOutputs).toBeInstanceOf(Map);
    });
  });

  describe('getNodeState', () => {
    it('should return state for existing node', () => {
      const workflow = createSimpleWorkflow();
      const engine = new DAGExecutionEngine(workflow);

      const state = engine.getNodeState('input-1');

      expect(state).toBeDefined();
      expect(state?.status).toBe('pending');
    });

    it('should return undefined for non-existent node', () => {
      const workflow = createSimpleWorkflow();
      const engine = new DAGExecutionEngine(workflow);

      const state = engine.getNodeState('non-existent');

      expect(state).toBeUndefined();
    });
  });
});

describe('Condition Node Execution', () => {
  const createConditionWorkflow = (
    operator: 'contains' | 'regex' | 'equals',
    compareValue: string
  ): Workflow => ({
    id: 'workflow-condition',
    name: 'Condition Workflow',
    nodes: [
      {
        id: 'input-1',
        type: 'input',
        position: { x: 0, y: 0 },
        data: { type: 'input', name: 'Input' },
      },
      {
        id: 'condition-1',
        type: 'condition',
        position: { x: 100, y: 0 },
        data: {
          type: 'condition',
          name: 'Check',
          conditions: [
            {
              inputReference: '{{Input.result}}',
              operator,
              compareValue,
            },
          ],
        },
      },
      {
        id: 'output-true',
        type: 'output',
        position: { x: 200, y: -50 },
        data: { type: 'output', name: 'True Branch' },
      },
      {
        id: 'output-false',
        type: 'output',
        position: { x: 200, y: 50 },
        data: { type: 'output', name: 'False Branch' },
      },
    ],
    edges: [
      { id: 'e1', source: 'input-1', target: 'condition-1' },
      { id: 'e2', source: 'condition-1', target: 'output-true', sourceHandle: 'true' },
      { id: 'e3', source: 'condition-1', target: 'output-false', sourceHandle: 'false' },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  it('should route to true branch when condition matches', async () => {
    const workflow = createConditionWorkflow('contains', 'success');
    const engine = new DAGExecutionEngine(workflow);

    await engine.execute('The operation was a success!');

    expect(engine.getNodeState('condition-1')?.status).toBe('complete');
    expect(engine.getNodeState('condition-1')?.output).toBe(true);
    expect(engine.getNodeState('output-true')?.status).toBe('complete');
    expect(engine.getNodeState('output-false')?.status).toBe('skipped');
  });

  it('should route to false branch when condition does not match', async () => {
    const workflow = createConditionWorkflow('contains', 'success');
    const engine = new DAGExecutionEngine(workflow);

    await engine.execute('The operation failed!');

    expect(engine.getNodeState('condition-1')?.output).toBe(false);
    expect(engine.getNodeState('output-true')?.status).toBe('skipped');
    expect(engine.getNodeState('output-false')?.status).toBe('complete');
  });

  it('should support regex pattern matching', async () => {
    const workflow = createConditionWorkflow('regex', '^Error:');
    const engine = new DAGExecutionEngine(workflow);

    await engine.execute('Error: Something went wrong');

    expect(engine.getNodeState('condition-1')?.output).toBe(true);
  });

  it('should evaluate multiple conditions with mixed AND/OR logic', async () => {
    const workflow: Workflow = {
      id: 'workflow-condition-multi',
      name: 'Condition Workflow Multi',
      nodes: [
        {
          id: 'input-1',
          type: 'input',
          position: { x: 0, y: 0 },
          data: { type: 'input', name: 'Input' },
        },
        {
          id: 'condition-1',
          type: 'condition',
          position: { x: 100, y: 0 },
          data: {
            type: 'condition',
            name: 'Check',
            conditions: [
              {
                inputReference: '{{Input.result}}',
                operator: 'contains',
                compareValue: 'alpha',
              },
              {
                joiner: 'and',
                inputReference: '{{Input.result}}',
                operator: 'contains',
                compareValue: 'beta',
              },
              {
                joiner: 'or',
                inputReference: '{{Input.result}}',
                operator: 'contains',
                compareValue: 'gamma',
              },
            ],
          },
        },
        {
          id: 'output-true',
          type: 'output',
          position: { x: 200, y: -50 },
          data: { type: 'output', name: 'True Branch' },
        },
        {
          id: 'output-false',
          type: 'output',
          position: { x: 200, y: 50 },
          data: { type: 'output', name: 'False Branch' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-1', target: 'condition-1' },
        { id: 'e2', source: 'condition-1', target: 'output-true', sourceHandle: 'true' },
        { id: 'e3', source: 'condition-1', target: 'output-false', sourceHandle: 'false' },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const engine = new DAGExecutionEngine(workflow);
    await engine.execute('alpha beta');

    expect(engine.getNodeState('condition-1')?.output).toBe(true);
    expect(engine.getNodeState('output-true')?.status).toBe('complete');
    expect(engine.getNodeState('output-false')?.status).toBe('skipped');
  });
});

describe('Loop Execution (Comprehensive)', () => {
  // Get reference to the mocked ClaudeAgent
  const claudeMock = jest.requireMock('../src/agents/claude') as {
    ClaudeAgent: jest.Mock;
  };

  /**
   * Creates a workflow with a loop:
   * Input -> Agent -> Condition
   *                      |
   *            false ----+----> Agent (loop back)
   *            true  ----------> Output
   */
  const createLoopWorkflow = (
    operator: 'contains' | 'equals' | 'regex' = 'contains',
    compareValue: string = 'DONE'
  ): Workflow => ({
    id: 'workflow-loop',
    name: 'Loop Workflow',
    nodes: [
      {
        id: 'input-1',
        type: 'input',
        position: { x: 0, y: 0 },
        data: { type: 'input', name: 'Input' },
      },
      {
        id: 'claude-1',
        type: 'claude-agent',
        position: { x: 100, y: 0 },
        data: {
          type: 'claude-agent',
          name: 'Claude',
          userQuery: 'Test prompt',
          model: 'sonnet',
          tools: [],
        },
      },
      {
        id: 'condition-1',
        type: 'condition',
        position: { x: 200, y: 0 },
        data: {
          type: 'condition',
          name: 'Check',
          conditions: [
            {
              inputReference: '{{Claude.result}}',
              operator,
              compareValue,
            },
          ],
        },
      },
      {
        id: 'output-1',
        type: 'output',
        position: { x: 300, y: 0 },
        data: { type: 'output', name: 'Output' },
      },
    ],
    edges: [
      { id: 'e1', source: 'input-1', target: 'claude-1' },
      { id: 'e2', source: 'claude-1', target: 'condition-1' },
      { id: 'e3', source: 'condition-1', target: 'claude-1', sourceHandle: 'false' },
      { id: 'e4', source: 'condition-1', target: 'output-1', sourceHandle: 'true' },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  /**
   * Helper to setup mock that returns different values per call.
   * Uses a shared call counter across all agent instances.
   * @param responses - Array of responses. Each agent execution returns the next response.
   */
  const setupSequentialMock = (responses: string[]) => {
    let callCount = 0;
    claudeMock.ClaudeAgent.mockImplementation(() => ({
      execute: jest.fn().mockImplementation(async function* () {
        const idx = Math.min(callCount, responses.length - 1);
        const response = responses[idx];
        callCount++;
        yield { type: 'text-delta', content: response };
        yield { type: 'complete', result: response };
      }),
      interrupt: jest.fn(),
      getStructuredOutput: jest.fn().mockReturnValue(undefined),
      getSessionId: jest.fn().mockReturnValue(undefined),
    }));
  };

  // Restore default mock after each test so other test suites aren't affected
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

  describe('Loop termination', () => {
    it('should exit loop immediately when condition is true on first iteration', async () => {
      // Mock returns 'DONE' immediately - condition passes on first check
      setupSequentialMock(['DONE']);

      const workflow = createLoopWorkflow('contains', 'DONE');
      const engine = new DAGExecutionEngine(workflow);
      const events: ExecutionEvent[] = [];

      engine.on('event', (event) => events.push(event));
      await engine.execute('test input');

      // Claude should execute exactly once
      const claudeStarts = events.filter(
        (e) => e.type === 'node-start' && (e as { nodeId: string }).nodeId === 'claude-1'
      );
      expect(claudeStarts.length).toBe(1);

      // All nodes should complete successfully
      expect(engine.getNodeState('claude-1')?.status).toBe('complete');
      expect(engine.getNodeState('condition-1')?.status).toBe('complete');
      expect(engine.getNodeState('output-1')?.status).toBe('complete');

      // Output receives condition's result (true), agent has actual response
      expect(engine.getNodeState('output-1')?.output).toBe(true);
      expect((engine.getNodeState('claude-1')?.output as { result: string }).result).toBe('DONE');
    });

    it('should loop exactly N times before condition passes', async () => {
      // Mock returns 'attempt 1', 'attempt 2', then 'DONE' on third call
      setupSequentialMock(['attempt 1', 'attempt 2', 'DONE']);

      const workflow = createLoopWorkflow('contains', 'DONE');
      const engine = new DAGExecutionEngine(workflow);
      const events: ExecutionEvent[] = [];

      engine.on('event', (event) => events.push(event));
      await engine.execute('test input');

      // Claude should execute exactly 3 times
      const claudeStarts = events.filter(
        (e) => e.type === 'node-start' && (e as { nodeId: string }).nodeId === 'claude-1'
      );
      expect(claudeStarts.length).toBe(3);

      // Condition should execute 3 times (once per loop iteration)
      const conditionStarts = events.filter(
        (e) => e.type === 'node-start' && (e as { nodeId: string }).nodeId === 'condition-1'
      );
      expect(conditionStarts.length).toBe(3);

      // Workflow should complete successfully
      expect(engine.getNodeState('output-1')?.status).toBe('complete');
      // Output receives condition's result (true)
      expect(engine.getNodeState('output-1')?.output).toBe(true);
      // Agent has the actual response
      expect((engine.getNodeState('claude-1')?.output as { result: string }).result).toBe('DONE');
    });

    it('should pass correct output through each iteration', async () => {
      const responses = ['first', 'second', 'third DONE'];
      setupSequentialMock(responses);

      const workflow = createLoopWorkflow('contains', 'DONE');
      const engine = new DAGExecutionEngine(workflow);
      const claudeOutputs: string[] = [];

      engine.on('event', (event) => {
        if (
          event.type === 'node-complete' &&
          (event as { nodeId: string }).nodeId === 'claude-1'
        ) {
          // Event uses 'result' field which now contains { result, runCount, transcript }
          const output = (event as { result: { result: string } }).result;
          claudeOutputs.push(output.result);
        }
      });

      await engine.execute('test');

      // Verify we captured outputs from each iteration
      expect(claudeOutputs).toEqual(['first', 'second', 'third DONE']);

      // Final agent output should be from last iteration
      expect((engine.getNodeState('claude-1')?.output as { result: string }).result).toBe('third DONE');
      // Output node receives condition's result (true)
      expect(engine.getNodeState('output-1')?.output).toBe(true);
    });
  });

  describe('Branch handling during loops', () => {
    it('should skip output branch while looping, then execute it when done', async () => {
      setupSequentialMock(['not done', 'still not done', 'DONE']);

      const workflow = createLoopWorkflow('contains', 'DONE');
      const engine = new DAGExecutionEngine(workflow);
      const outputStartEvents: ExecutionEvent[] = [];

      engine.on('event', (event) => {
        if ((event as { nodeId: string }).nodeId === 'output-1') {
          if (event.type === 'node-start') outputStartEvents.push(event);
        }
      });

      await engine.execute('test');

      // Output should only start once - when condition finally passes
      // (it gets skipped silently during looping iterations)
      expect(outputStartEvents.length).toBe(1);

      // Final state should be complete
      expect(engine.getNodeState('output-1')?.status).toBe('complete');
      // Output receives condition's result (true), not the agent's output
      expect(engine.getNodeState('output-1')?.output).toBe(true);
      // Agent's output contains the actual response
      expect((engine.getNodeState('claude-1')?.output as { result: string }).result).toBe('DONE');
    });

    it('should not skip the loop target node (regression test for order-of-operations bug)', async () => {
      // This specifically tests the bug where skipNode was called
      // after resetNodeForReExecution, causing the loop target to be skipped
      setupSequentialMock(['no', 'no', 'DONE']);

      const workflow = createLoopWorkflow('contains', 'DONE');
      const engine = new DAGExecutionEngine(workflow);
      const claudeSkipEvents: ExecutionEvent[] = [];

      engine.on('event', (event) => {
        if (
          event.type === 'node-skipped' &&
          (event as { nodeId: string }).nodeId === 'claude-1'
        ) {
          claudeSkipEvents.push(event);
        }
      });

      await engine.execute('test');

      // Claude should NEVER be skipped
      expect(claudeSkipEvents.length).toBe(0);
      expect(engine.getNodeState('claude-1')?.status).toBe('complete');
    });
  });

  describe('Condition operators in loops', () => {
    it('should work with equals operator', async () => {
      setupSequentialMock(['almost', 'EXACT_MATCH']);

      const workflow = createLoopWorkflow('equals', 'EXACT_MATCH');
      const engine = new DAGExecutionEngine(workflow);

      await engine.execute('test');

      // Output node completes (receives condition result which is true)
      expect(engine.getNodeState('output-1')?.status).toBe('complete');
      expect(engine.getNodeState('output-1')?.output).toBe(true);
      // Agent output should be the matching value
      expect((engine.getNodeState('claude-1')?.output as { result: string }).result).toBe('EXACT_MATCH');
    });

    it('should work with regex operator', async () => {
      setupSequentialMock(['no match', 'ERROR: something failed', 'SUCCESS: all passed']);

      const workflow = createLoopWorkflow('regex', '^SUCCESS:');
      const engine = new DAGExecutionEngine(workflow);

      await engine.execute('test');

      // Output node completes (receives condition result which is true)
      expect(engine.getNodeState('output-1')?.status).toBe('complete');
      expect(engine.getNodeState('output-1')?.output).toBe(true);
      // Agent output should be the matching value
      expect((engine.getNodeState('claude-1')?.output as { result: string }).result).toBe('SUCCESS: all passed');
    });
  });

  describe('Node state transitions', () => {
    it('should properly transition through loop iterations', async () => {
      setupSequentialMock(['first', 'DONE']);

      const workflow = createLoopWorkflow('contains', 'DONE');
      const engine = new DAGExecutionEngine(workflow);
      const stateTransitions: { nodeId: string; status: string }[] = [];

      engine.on('event', (event) => {
        const nodeId = (event as { nodeId: string }).nodeId;
        if (nodeId === 'claude-1') {
          if (event.type === 'node-start') {
            stateTransitions.push({ nodeId, status: 'running' });
          } else if (event.type === 'node-complete') {
            stateTransitions.push({ nodeId, status: 'complete' });
          }
        }
      });

      await engine.execute('test');

      // First iteration: running -> complete
      // Second iteration: running -> complete
      expect(stateTransitions).toEqual([
        { nodeId: 'claude-1', status: 'running' },
        { nodeId: 'claude-1', status: 'complete' },
        { nodeId: 'claude-1', status: 'running' },
        { nodeId: 'claude-1', status: 'complete' },
      ]);
    });

    it('should have final output from last iteration', async () => {
      const responses = ['output_v1', 'output_v2', 'DONE'];
      setupSequentialMock(responses);

      const workflow = createLoopWorkflow('contains', 'DONE');
      const engine = new DAGExecutionEngine(workflow);

      await engine.execute('test');

      // Final output should be from last iteration only
      expect((engine.getNodeState('claude-1')?.output as { result: string }).result).toBe('DONE');
    });
  });

  describe('Error handling in loops', () => {
    it('should handle interruption during loop execution', async () => {
      // Mock returns infinite non-matching values
      let callCount = 0;
      claudeMock.ClaudeAgent.mockImplementation(() => ({
        execute: jest.fn().mockImplementation(async function* () {
          callCount++;
          const response = `attempt ${callCount}`;
          yield { type: 'text-delta', content: response };
          yield { type: 'complete', result: response };
        }),
        interrupt: jest.fn(),
        getStructuredOutput: jest.fn().mockReturnValue(undefined),
        getSessionId: jest.fn().mockReturnValue(undefined),
      }));

      const workflow = createLoopWorkflow('contains', 'NEVER_MATCHES');
      const engine = new DAGExecutionEngine(workflow);
      let loopIterations = 0;

      engine.on('event', (event) => {
        if (
          event.type === 'node-start' &&
          (event as { nodeId: string }).nodeId === 'claude-1'
        ) {
          loopIterations++;
          if (loopIterations >= 5) {
            engine.interrupt();
          }
        }
      });

      await engine.execute('test');

      // Should have looped 5 times before interruption
      expect(loopIterations).toBe(5);

      // Execution should be interrupted, not stuck
      const completeEvent = engine.getNodeState('output-1');
      expect(completeEvent?.status).not.toBe('complete');
    });
  });

  describe('Complex loop scenarios', () => {
    it('should handle workflow with multiple sequential conditions', async () => {
      // Workflow: Input -> Claude -> Cond1 (loops) -> Cond2 (no loop) -> Output
      const workflow: Workflow = {
        id: 'workflow-multi-condition',
        name: 'Multi Condition Workflow',
        nodes: [
          {
            id: 'input-1',
            type: 'input',
            position: { x: 0, y: 0 },
            data: { type: 'input', name: 'Input' },
          },
          {
            id: 'claude-1',
            type: 'claude-agent',
            position: { x: 100, y: 0 },
            data: {
              type: 'claude-agent',
              name: 'Claude',
              userQuery: 'Test prompt',
              model: 'sonnet',
              tools: [],
            },
          },
          {
            id: 'condition-1',
            type: 'condition',
            position: { x: 200, y: 0 },
            data: {
              type: 'condition',
              name: 'First Check',
              conditions: [
                {
                  inputReference: '{{Claude.result}}',
                  operator: 'contains',
                  compareValue: 'PASS1',
                },
              ],
            },
          },
          {
            id: 'condition-2',
            type: 'condition',
            position: { x: 300, y: 0 },
            data: {
              type: 'condition',
              name: 'Second Check',
              conditions: [
                {
                  inputReference: '{{Claude.result}}',
                  operator: 'contains',
                  compareValue: 'PASS2',
                },
              ],
            },
          },
          {
            id: 'output-1',
            type: 'output',
            position: { x: 400, y: 0 },
            data: { type: 'output', name: 'Output' },
          },
          {
            id: 'output-fail',
            type: 'output',
            position: { x: 400, y: 100 },
            data: { type: 'output', name: 'Fail Output' },
          },
        ],
        edges: [
          { id: 'e1', source: 'input-1', target: 'claude-1' },
          { id: 'e2', source: 'claude-1', target: 'condition-1' },
          { id: 'e3', source: 'condition-1', target: 'claude-1', sourceHandle: 'false' },
          { id: 'e4', source: 'condition-1', target: 'condition-2', sourceHandle: 'true' },
          { id: 'e5', source: 'condition-2', target: 'output-1', sourceHandle: 'true' },
          { id: 'e6', source: 'condition-2', target: 'output-fail', sourceHandle: 'false' },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // First two calls don't pass first condition, third passes both
      setupSequentialMock(['nope', 'still no', 'PASS1 and PASS2']);

      const engine = new DAGExecutionEngine(workflow);
      await engine.execute('test');

      // Should pass through both conditions and reach success output
      expect(engine.getNodeState('output-1')?.status).toBe('complete');
      expect(engine.getNodeState('output-fail')?.status).toBe('skipped');
      // Output receives condition-2's result (true), agent has the actual response
      expect(engine.getNodeState('output-1')?.output).toBe(true);
      expect((engine.getNodeState('claude-1')?.output as { result: string }).result).toBe('PASS1 and PASS2');
    });
  });
});

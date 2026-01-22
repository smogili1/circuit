/**
 * Integration tests for Approval Node in workflow execution.
 * Tests workflow branching, rejection loops, and user interaction flows.
 */

// Mock the agent modules - must be before any imports that use them
jest.mock('../src/agents/claude', () => ({
  ClaudeAgent: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockImplementation(async function* () {
      yield { type: 'text-delta', content: 'Mock Claude response' };
      yield { type: 'complete', result: 'Mock Claude complete' };
    }),
    interrupt: jest.fn(),
    getStructuredOutput: jest.fn().mockReturnValue(undefined),
    getSessionId: jest.fn().mockReturnValue('session-123'),
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
    getSessionId: jest.fn().mockReturnValue('session-456'),
  })),
}));

// Import after mocks are defined
import { DAGExecutionEngine } from '../src/orchestrator/engine';
import { Workflow, ExecutionEvent } from '../src/workflows/types';
import { submitApproval, cancelAllApprovals } from '../src/orchestrator/executors/approval';
// Ensure executors are registered
import '../src/orchestrator/executors';

describe('Approval Workflow Integration', () => {
  // Get reference to the mocked ClaudeAgent
  const claudeMock = jest.requireMock('../src/agents/claude') as {
    ClaudeAgent: jest.Mock;
  };

  /**
   * Creates a workflow with approval gate:
   * Input -> Agent -> Approval -> Output (approved path)
   *                      |
   *                      +-----> Output (rejected path)
   */
  const createApprovalWorkflow = (): Workflow => ({
    id: 'workflow-approval',
    name: 'Approval Workflow',
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
          name: 'Agent',
          userQuery: 'Test prompt',
          model: 'sonnet',
          tools: [],
        },
      },
      {
        id: 'approval-1',
        type: 'approval',
        position: { x: 200, y: 0 },
        data: {
          type: 'approval',
          name: 'Review',
          promptMessage: 'Please review the agent output',
          inputSelections: [
            { nodeId: 'claude-1', nodeName: 'Agent', fields: ['result'] },
          ],
        },
      },
      {
        id: 'output-approved',
        type: 'output',
        position: { x: 300, y: -50 },
        data: { type: 'output', name: 'Approved Output' },
      },
      {
        id: 'output-rejected',
        type: 'output',
        position: { x: 300, y: 50 },
        data: { type: 'output', name: 'Rejected Output' },
      },
    ],
    edges: [
      { id: 'e1', source: 'input-1', target: 'claude-1' },
      { id: 'e2', source: 'claude-1', target: 'approval-1' },
      { id: 'e3', source: 'approval-1', target: 'output-approved', sourceHandle: 'approved' },
      { id: 'e4', source: 'approval-1', target: 'output-rejected', sourceHandle: 'rejected' },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  /**
   * Creates a workflow with rejection loop back to agent:
   * Input -> Agent -> Approval --(approved)--> Output
   *            ^          |
   *            +----------(rejected)
   */
  const createRejectionLoopWorkflow = (): Workflow => ({
    id: 'workflow-rejection-loop',
    name: 'Rejection Loop Workflow',
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
          name: 'Agent',
          userQuery: 'Test prompt',
          model: 'sonnet',
          tools: [],
          rejectionHandler: {
            enabled: true,
            continueSession: true,
            feedbackTemplate: 'User feedback: {{feedback}}. Please revise.',
            maxRetries: 3,
            onMaxRetries: 'fail',
          },
        },
      },
      {
        id: 'approval-1',
        type: 'approval',
        position: { x: 200, y: 0 },
        data: {
          type: 'approval',
          name: 'Review',
          promptMessage: 'Please review the output',
          inputSelections: [
            { nodeId: 'claude-1', nodeName: 'Agent', fields: [] },
          ],
          feedbackPrompt: 'What should be changed?',
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
      { id: 'e2', source: 'claude-1', target: 'approval-1' },
      { id: 'e3', source: 'approval-1', target: 'output-1', sourceHandle: 'approved' },
      { id: 'e4', source: 'approval-1', target: 'claude-1', sourceHandle: 'rejected' },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(() => {
    // Reset mock
    claudeMock.ClaudeAgent.mockImplementation(() => ({
      execute: jest.fn().mockImplementation(async function* () {
        yield { type: 'text-delta', content: 'Agent output' };
        yield { type: 'complete', result: 'Agent output' };
      }),
      interrupt: jest.fn(),
      getStructuredOutput: jest.fn().mockReturnValue(undefined),
      getSessionId: jest.fn().mockReturnValue('session-123'),
    }));
  });

  describe('Basic approval workflow', () => {
    it('should emit node-waiting event when reaching approval node', async () => {
      const workflow = createApprovalWorkflow();
      const engine = new DAGExecutionEngine(workflow);
      const events: ExecutionEvent[] = [];
      let executionId: string;

      engine.on('event', (event) => {
        events.push(event);

        if (event.type === 'execution-start') {
          executionId = (event as { executionId: string }).executionId;
        }

        // Auto-approve when we see the waiting event
        if (event.type === 'node-waiting') {
          setTimeout(() => {
            submitApproval(executionId, 'approval-1', {
              approved: true,
              respondedAt: new Date().toISOString(),
            });
          }, 10);
        }
      });

      await engine.execute('test input');

      // Should have emitted node-waiting
      const waitingEvent = events.find((e) => e.type === 'node-waiting');
      expect(waitingEvent).toBeDefined();
      expect((waitingEvent as { nodeId: string }).nodeId).toBe('approval-1');
    });

    it('should include approval request data in waiting event', async () => {
      const workflow = createApprovalWorkflow();
      const engine = new DAGExecutionEngine(workflow);
      let approvalRequest: unknown;
      let executionId: string;

      engine.on('event', (event) => {
        if (event.type === 'execution-start') {
          executionId = (event as { executionId: string }).executionId;
        }

        if (event.type === 'node-waiting') {
          approvalRequest = (event as { approval: unknown }).approval;
          setTimeout(() => {
            submitApproval(executionId, 'approval-1', {
              approved: true,
              respondedAt: new Date().toISOString(),
            });
          }, 10);
        }
      });

      await engine.execute('test');

      expect(approvalRequest).toMatchObject({
        nodeId: 'approval-1',
        nodeName: 'Review',
        promptMessage: 'Please review the agent output',
      });
    });

    it('should route to approved output when user approves', async () => {
      const workflow = createApprovalWorkflow();
      const engine = new DAGExecutionEngine(workflow);
      let executionId: string;

      engine.on('event', (event) => {
        if (event.type === 'execution-start') {
          executionId = (event as { executionId: string }).executionId;
        }
        if (event.type === 'node-waiting') {
          setTimeout(() => {
            submitApproval(executionId, 'approval-1', {
              approved: true,
              respondedAt: new Date().toISOString(),
            });
          }, 10);
        }
      });

      await engine.execute('test input');

      expect(engine.getNodeState('approval-1')?.status).toBe('complete');
      expect(engine.getNodeState('output-approved')?.status).toBe('complete');
      expect(engine.getNodeState('output-rejected')?.status).toBe('skipped');
    });

    it('should route to rejected output when user rejects', async () => {
      const workflow = createApprovalWorkflow();
      const engine = new DAGExecutionEngine(workflow);
      let executionId: string;

      engine.on('event', (event) => {
        if (event.type === 'execution-start') {
          executionId = (event as { executionId: string }).executionId;
        }
        if (event.type === 'node-waiting') {
          setTimeout(() => {
            submitApproval(executionId, 'approval-1', {
              approved: false,
              feedback: 'Needs improvement',
              respondedAt: new Date().toISOString(),
            });
          }, 10);
        }
      });

      await engine.execute('test input');

      expect(engine.getNodeState('approval-1')?.status).toBe('complete');
      expect(engine.getNodeState('output-approved')?.status).toBe('skipped');
      expect(engine.getNodeState('output-rejected')?.status).toBe('complete');
    });

    it('should store approval result with feedback', async () => {
      const workflow = createApprovalWorkflow();
      const engine = new DAGExecutionEngine(workflow);
      let executionId: string;

      engine.on('event', (event) => {
        if (event.type === 'execution-start') {
          executionId = (event as { executionId: string }).executionId;
        }
        if (event.type === 'node-waiting') {
          setTimeout(() => {
            submitApproval(executionId, 'approval-1', {
              approved: false,
              feedback: 'Please add more detail',
              respondedAt: '2024-01-01T12:00:00Z',
            });
          }, 10);
        }
      });

      await engine.execute('test');

      const approvalOutput = engine.getNodeState('approval-1')?.output as {
        approved: boolean;
        feedback: string;
      };
      expect(approvalOutput.approved).toBe(false);
      expect(approvalOutput.feedback).toBe('Please add more detail');
    });
  });

  describe('Rejection loop workflow', () => {
    it('should loop back to agent on rejection', async () => {
      // Setup mock that returns different values each call
      let callCount = 0;
      claudeMock.ClaudeAgent.mockImplementation(() => ({
        execute: jest.fn().mockImplementation(async function* () {
          callCount++;
          const response = callCount === 1 ? 'First attempt' : 'Revised output';
          yield { type: 'text-delta', content: response };
          yield { type: 'complete', result: response };
        }),
        interrupt: jest.fn(),
        getStructuredOutput: jest.fn().mockReturnValue(undefined),
        getSessionId: jest.fn().mockReturnValue('session-123'),
      }));

      const workflow = createRejectionLoopWorkflow();
      const engine = new DAGExecutionEngine(workflow);
      let approvalCount = 0;
      let executionId: string;

      engine.on('event', (event) => {
        if (event.type === 'execution-start') {
          executionId = (event as { executionId: string }).executionId;
        }
        if (event.type === 'node-waiting') {
          approvalCount++;

          setTimeout(() => {
            if (approvalCount === 1) {
              // First time: reject
              submitApproval(executionId, 'approval-1', {
                approved: false,
                feedback: 'Please add more detail',
                respondedAt: new Date().toISOString(),
              });
            } else {
              // Second time: approve
              submitApproval(executionId, 'approval-1', {
                approved: true,
                respondedAt: new Date().toISOString(),
              });
            }
          }, 10);
        }
      });

      await engine.execute('test input');

      // Agent should have executed twice
      expect(callCount).toBe(2);
      expect(approvalCount).toBe(2);

      // Workflow should complete successfully
      expect(engine.getNodeState('output-1')?.status).toBe('complete');
    });

    it('should track agent iterations in events', async () => {
      let callCount = 0;
      claudeMock.ClaudeAgent.mockImplementation(() => ({
        execute: jest.fn().mockImplementation(async function* () {
          callCount++;
          yield { type: 'complete', result: `Attempt ${callCount}` };
        }),
        interrupt: jest.fn(),
        getStructuredOutput: jest.fn().mockReturnValue(undefined),
        getSessionId: jest.fn().mockReturnValue('session-123'),
      }));

      const workflow = createRejectionLoopWorkflow();
      const engine = new DAGExecutionEngine(workflow);
      const agentStartEvents: ExecutionEvent[] = [];
      let approvalCount = 0;
      let executionId: string;

      engine.on('event', (event) => {
        if (event.type === 'execution-start') {
          executionId = (event as { executionId: string }).executionId;
        }
        if (event.type === 'node-start' && (event as { nodeId: string }).nodeId === 'claude-1') {
          agentStartEvents.push(event);
        }
        if (event.type === 'node-waiting') {
          approvalCount++;
          setTimeout(() => {
            submitApproval(executionId, 'approval-1', {
              approved: approvalCount >= 3,
              feedback: approvalCount < 3 ? `Revision ${approvalCount}` : undefined,
              respondedAt: new Date().toISOString(),
            });
          }, 10);
        }
      });

      await engine.execute('test');

      // Agent should start 3 times (initial + 2 rejections)
      expect(agentStartEvents.length).toBe(3);
      expect(engine.getNodeState('output-1')?.status).toBe('complete');
    });
  });

  describe('Interruption handling', () => {
    it('should cancel pending approval when execution is interrupted', async () => {
      const workflow = createApprovalWorkflow();
      const engine = new DAGExecutionEngine(workflow);
      let waitingReceived = false;
      let interruptPromise: Promise<void> | undefined;

      engine.on('event', (event) => {
        if (event.type === 'node-waiting') {
          waitingReceived = true;
          // Interrupt instead of approving - store promise to await later
          interruptPromise = new Promise<void>((resolve) => {
            setTimeout(async () => {
              await engine.interrupt();
              resolve();
            }, 10);
          });
        }
      });

      await engine.execute('test');
      // Wait for interrupt to complete
      if (interruptPromise) await interruptPromise;

      expect(waitingReceived).toBe(true);
      // Approval node should error due to interruption
      expect(engine.getNodeState('approval-1')?.status).toBe('error');
    });

    it('should clean up pending approvals on cancelAllApprovals', async () => {
      const workflow = createApprovalWorkflow();
      const engine = new DAGExecutionEngine(workflow);
      let executionId: string;
      let cancelPromise: Promise<void> | undefined;

      engine.on('event', (event) => {
        if (event.type === 'execution-start') {
          executionId = (event as { executionId: string }).executionId;
        }
        if (event.type === 'node-waiting') {
          // Cancel all approvals instead of responding
          cancelPromise = new Promise<void>((resolve) => {
            setTimeout(() => {
              cancelAllApprovals(executionId);
              resolve();
            }, 10);
          });
        }
      });

      await engine.execute('test');
      // Wait for cancellation to complete
      if (cancelPromise) await cancelPromise;

      // Should have errored due to cancellation
      expect(engine.getNodeState('approval-1')?.status).toBe('error');
    });
  });

  describe('Complex approval scenarios', () => {
    /**
     * Workflow with parallel branches, each needing approval:
     * Input -> Agent1 -> Approval1 -+
     *       -> Agent2 -> Approval2 -+-> Merge -> Output
     */
    const createParallelApprovalWorkflow = (): Workflow => ({
      id: 'workflow-parallel-approval',
      name: 'Parallel Approval Workflow',
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
          position: { x: 100, y: 0 },
          data: {
            type: 'claude-agent',
            name: 'Agent1',
            userQuery: 'Test prompt',
            model: 'sonnet',
            tools: [],
          },
        },
        {
          id: 'claude-2',
          type: 'claude-agent',
          position: { x: 100, y: 200 },
          data: {
            type: 'claude-agent',
            name: 'Agent2',
            userQuery: 'Test prompt',
            model: 'sonnet',
            tools: [],
          },
        },
        {
          id: 'approval-1',
          type: 'approval',
          position: { x: 200, y: 0 },
          data: {
            type: 'approval',
            name: 'Review1',
            promptMessage: 'Review Agent1',
            inputSelections: [{ nodeId: 'claude-1', nodeName: 'Agent1', fields: [] }],
          },
        },
        {
          id: 'approval-2',
          type: 'approval',
          position: { x: 200, y: 200 },
          data: {
            type: 'approval',
            name: 'Review2',
            promptMessage: 'Review Agent2',
            inputSelections: [{ nodeId: 'claude-2', nodeName: 'Agent2', fields: [] }],
          },
        },
        {
          id: 'merge-1',
          type: 'merge',
          position: { x: 300, y: 100 },
          data: { type: 'merge', name: 'Merge', strategy: 'wait-all' },
        },
        {
          id: 'output-1',
          type: 'output',
          position: { x: 400, y: 100 },
          data: { type: 'output', name: 'Output' },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-1', target: 'claude-1' },
        { id: 'e2', source: 'input-1', target: 'claude-2' },
        { id: 'e3', source: 'claude-1', target: 'approval-1' },
        { id: 'e4', source: 'claude-2', target: 'approval-2' },
        { id: 'e5', source: 'approval-1', target: 'merge-1', sourceHandle: 'approved' },
        { id: 'e6', source: 'approval-2', target: 'merge-1', sourceHandle: 'approved' },
        { id: 'e7', source: 'merge-1', target: 'output-1' },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    it('should handle multiple parallel approval nodes', async () => {
      const workflow = createParallelApprovalWorkflow();
      const engine = new DAGExecutionEngine(workflow);
      const approvedNodes = new Set<string>();
      let executionId: string;

      engine.on('event', (event) => {
        if (event.type === 'execution-start') {
          executionId = (event as { executionId: string }).executionId;
        }
        if (event.type === 'node-waiting') {
          const nodeId = (event as { nodeId: string }).nodeId;
          // Approve each node with a small delay
          setTimeout(() => {
            if (!approvedNodes.has(nodeId)) {
              approvedNodes.add(nodeId);
              submitApproval(executionId, nodeId, {
                approved: true,
                respondedAt: new Date().toISOString(),
              });
            }
          }, 10);
        }
      });

      await engine.execute('test');

      // Both approvals should have been processed
      expect(approvedNodes.size).toBe(2);
      expect(approvedNodes.has('approval-1')).toBe(true);
      expect(approvedNodes.has('approval-2')).toBe(true);

      // Workflow should complete
      expect(engine.getNodeState('output-1')?.status).toBe('complete');
    });

    it('should wait for all parallel approvals before merge', async () => {
      const workflow = createParallelApprovalWorkflow();
      const engine = new DAGExecutionEngine(workflow);
      let executionId: string;
      let mergeStarted = false;
      let approval1Completed = false;
      let approval2Completed = false;

      engine.on('event', (event) => {
        if (event.type === 'execution-start') {
          executionId = (event as { executionId: string }).executionId;
        }
        if (event.type === 'node-start' && (event as { nodeId: string }).nodeId === 'merge-1') {
          mergeStarted = true;
          // Merge should only start after both approvals are complete
          expect(approval1Completed).toBe(true);
          expect(approval2Completed).toBe(true);
        }
        if (event.type === 'node-complete') {
          const nodeId = (event as { nodeId: string }).nodeId;
          if (nodeId === 'approval-1') approval1Completed = true;
          if (nodeId === 'approval-2') approval2Completed = true;
        }
        if (event.type === 'node-waiting') {
          const nodeId = (event as { nodeId: string }).nodeId;
          // Stagger approvals to test ordering
          const delay = nodeId === 'approval-1' ? 20 : 40;
          setTimeout(() => {
            submitApproval(executionId, nodeId, {
              approved: true,
              respondedAt: new Date().toISOString(),
            });
          }, delay);
        }
      });

      await engine.execute('test');

      expect(mergeStarted).toBe(true);
      expect(engine.getNodeState('merge-1')?.status).toBe('complete');
    });
  });
});

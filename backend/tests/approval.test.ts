/**
 * Comprehensive tests for the approval executor.
 * Tests validation, approval/rejection flow, timeout handling,
 * and integration with rejection loops.
 */

import {
  approvalExecutor,
  submitApproval,
  cancelApproval,
  cancelAllApprovals,
} from '../src/orchestrator/executors/approval';
import { WorkflowNode, ApprovalNodeConfig, ApprovalResponse } from '../src/workflows/types';
import { ExecutorContext, ExecutorEmitter } from '../src/orchestrator/executors/types';
import { EventEmitter } from 'events';

// Helper to create a mock approval node
function createApprovalNode(config: Partial<ApprovalNodeConfig> = {}): WorkflowNode {
  return {
    id: 'approval-1',
    type: 'approval',
    position: { x: 0, y: 0 },
    data: {
      type: 'approval',
      name: 'Test Approval',
      promptMessage: 'Please review this output',
      inputSelections: [
        { nodeId: 'agent-1', nodeName: 'Agent', fields: ['result'] },
      ],
      ...config,
    } as ApprovalNodeConfig,
  };
}

// Helper to create mock execution context
function createMockContext(options: {
  executionId?: string;
  nodeOutputs?: Record<string, unknown>;
  abortSignal?: AbortSignal;
} = {}): ExecutorContext {
  const nodeOutputs = new Map<string, unknown>();
  if (options.nodeOutputs) {
    for (const [nodeId, output] of Object.entries(options.nodeOutputs)) {
      nodeOutputs.set(nodeId, output);
    }
  }

  const nodeNameToId = new Map<string, string>([
    ['Agent', 'agent-1'],
    ['Input', 'input-1'],
  ]);
  const nodeIdToName = new Map<string, string>([
    ['agent-1', 'Agent'],
    ['input-1', 'Input'],
  ]);

  const variables = new Map<string, unknown>();
  const nodeStates = new Map();

  const abortController = new AbortController();

  return {
    executionContext: {
      executionId: options.executionId || 'exec-123',
      workflowId: 'wf-1',
      nodeOutputs,
      variables,
      workingDirectory: '/tmp',
    },
    nodes: [],
    edges: [],
    nodeNameToId,
    nodeIdToName,
    nodeStates,
    abortSignal: options.abortSignal || abortController.signal,
    getWorkflowInput: () => 'test input',
    getPredecessorIds: () => ['agent-1'],
    getAllAncestorIds: () => ['agent-1'],
    getSuccessorIds: () => [],
    getPredecessorOutputs: () => {
      const result: Record<string, unknown> = {};
      nodeOutputs.forEach((value, key) => {
        result[key] = value;
      });
      return result;
    },
    getNodeOutput: (nodeId: string) => nodeOutputs.get(nodeId),
    getNodeName: (nodeId: string) => nodeIdToName.get(nodeId) ?? nodeId,
    interpolate: (text: string) => text.replace(/\{\{([^}]+)\}\}/g, (_, ref) => {
      const [nodeName, field] = ref.split('.');
      const nodeId = nodeNameToId.get(nodeName);
      if (nodeId) {
        const output = nodeOutputs.get(nodeId) as Record<string, unknown>;
        if (output && field in output) {
          return String(output[field]);
        }
      }
      return `{{${ref}}}`;
    }),
    resolveReference: (reference: string) => {
      const cleanRef = reference.replace(/^\{\{|\}\}$/g, '');
      const [nodeName, field] = cleanRef.split('.');
      const nodeId = nodeNameToId.get(nodeName);
      if (nodeId) {
        const output = nodeOutputs.get(nodeId);
        if (output && typeof output === 'object' && field in output) {
          return (output as Record<string, unknown>)[field];
        }
        return output;
      }
      return undefined;
    },
    setVariable: (key: string, value: unknown) => variables.set(key, value),
    getVariable: (key: string) => variables.get(key),
    getWorkingDirectory: () => '/tmp',
    getOutputDirectory: () => '/tmp/output',
    successorRequiresJson: () => false,
  };
}

// Helper to create mock emitter
function createMockEmitter(): { emitter: ExecutorEmitter; events: Array<{ type: string; data: unknown }> } {
  const events: Array<{ type: string; data: unknown }> = [];
  const emitter = {
    emit: jest.fn((event: string, data: unknown) => {
      events.push({ type: event, data });
      return true;
    }),
    on: jest.fn(),
    off: jest.fn(),
    once: jest.fn(),
  } as unknown as ExecutorEmitter;

  return { emitter, events };
}

describe('Approval Executor', () => {
  beforeEach(() => {
    // Clear any pending approvals between tests
    jest.clearAllMocks();
  });

  describe('validation', () => {
    it('should validate successfully with valid config', () => {
      const node = createApprovalNode();
      const result = approvalExecutor.validate!(node);
      expect(result).toBeNull();
    });

    it('should fail validation when promptMessage is empty', () => {
      const node = createApprovalNode({ promptMessage: '' });
      const result = approvalExecutor.validate!(node);
      expect(result).toEqual({
        valid: false,
        error: 'Prompt message is required',
      });
    });

    it('should fail validation when promptMessage is only whitespace', () => {
      const node = createApprovalNode({ promptMessage: '   ' });
      const result = approvalExecutor.validate!(node);
      expect(result).toEqual({
        valid: false,
        error: 'Prompt message is required',
      });
    });

    it('should fail validation when inputSelections is empty', () => {
      const node = createApprovalNode({ inputSelections: [] });
      const result = approvalExecutor.validate!(node);
      expect(result).toEqual({
        valid: false,
        error: 'At least one input selection is required',
      });
    });

    it('should fail validation when timeout is negative', () => {
      const node = createApprovalNode({ timeoutMinutes: -5 });
      const result = approvalExecutor.validate!(node);
      expect(result).toEqual({
        valid: false,
        error: 'Timeout must be a positive number',
      });
    });

    it('should pass validation when timeout is zero (no timeout)', () => {
      const node = createApprovalNode({ timeoutMinutes: 0 });
      const result = approvalExecutor.validate!(node);
      expect(result).toBeNull();
    });
  });

  describe('execute - approval flow', () => {
    it('should emit node-waiting event with correct approval request', async () => {
      const node = createApprovalNode({
        promptMessage: 'Please review',
        feedbackPrompt: 'What should change?',
      });
      const context = createMockContext({
        executionId: 'exec-wait-1',
        nodeOutputs: { 'agent-1': { result: 'Generated content' } },
      });
      const { emitter, events } = createMockEmitter();

      // Start execution (don't await - it will block)
      const executePromise = approvalExecutor.execute(node, context, emitter);

      // Wait a tick for the promise to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Check that waiting event was emitted
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('event');
      const eventData = events[0].data as { type: string; approval: { nodeId: string } };
      expect(eventData.type).toBe('node-waiting');
      expect(eventData.approval.nodeId).toBe('approval-1');

      // Submit approval to unblock
      submitApproval('exec-wait-1', 'approval-1', {
        approved: true,
        respondedAt: new Date().toISOString(),
      });

      const result = await executePromise;
      expect(result.output).toMatchObject({ approved: true });
    });

    it('should return approved output when user approves', async () => {
      const node = createApprovalNode();
      const context = createMockContext({
        executionId: 'exec-approve-1',
        nodeOutputs: { 'agent-1': { result: 'Test output' } },
      });
      const { emitter } = createMockEmitter();

      const executePromise = approvalExecutor.execute(node, context, emitter);

      // Wait a tick
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Submit approval
      const approved = submitApproval('exec-approve-1', 'approval-1', {
        approved: true,
        respondedAt: '2024-01-01T00:00:00Z',
      });

      expect(approved).toBe(true);

      const result = await executePromise;
      expect(result.output).toMatchObject({
        approved: true,
        feedback: undefined,
        respondedAt: '2024-01-01T00:00:00Z',
      });
    });

    it('should return rejected output with feedback when user rejects', async () => {
      const node = createApprovalNode();
      const context = createMockContext({
        executionId: 'exec-reject-1',
        nodeOutputs: { 'agent-1': { result: 'Test output' } },
      });
      const { emitter } = createMockEmitter();

      const executePromise = approvalExecutor.execute(node, context, emitter);

      await new Promise((resolve) => setTimeout(resolve, 10));

      submitApproval('exec-reject-1', 'approval-1', {
        approved: false,
        feedback: 'Needs more detail',
        respondedAt: '2024-01-01T00:00:00Z',
      });

      const result = await executePromise;
      expect(result.output).toMatchObject({
        approved: false,
        feedback: 'Needs more detail',
        respondedAt: '2024-01-01T00:00:00Z',
      });
    });

    it('should set variables for downstream reference', async () => {
      const node = createApprovalNode();
      const context = createMockContext({
        executionId: 'exec-vars-1',
        nodeOutputs: { 'agent-1': { result: 'Content' } },
      });
      const { emitter } = createMockEmitter();

      const executePromise = approvalExecutor.execute(node, context, emitter);

      await new Promise((resolve) => setTimeout(resolve, 10));

      submitApproval('exec-vars-1', 'approval-1', {
        approved: false,
        feedback: 'Try again',
        respondedAt: new Date().toISOString(),
      });

      await executePromise;

      expect(context.getVariable('node.approval-1.approved')).toBe(false);
      expect(context.getVariable('node.approval-1.feedback')).toBe('Try again');
    });
  });

  describe('execute - display data gathering', () => {
    it('should gather display data from selected inputs', async () => {
      const node = createApprovalNode({
        inputSelections: [
          { nodeId: 'agent-1', nodeName: 'Agent', fields: ['result'] },
        ],
      });
      const context = createMockContext({
        executionId: 'exec-gather-1',
        nodeOutputs: {
          'agent-1': { result: 'Agent output', transcript: 'Full conversation' },
        },
      });
      const { emitter, events } = createMockEmitter();

      const executePromise = approvalExecutor.execute(node, context, emitter);

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Check the approval request contains selected data
      const eventData = events[0].data as {
        type: string;
        approval: { displayData: Record<string, unknown> };
      };
      expect(eventData.approval.displayData).toEqual({
        Agent: { result: 'Agent output' },
      });

      submitApproval('exec-gather-1', 'approval-1', {
        approved: true,
        respondedAt: new Date().toISOString(),
      });

      await executePromise;
    });

    it('should include entire output when no fields specified', async () => {
      const node = createApprovalNode({
        inputSelections: [
          { nodeId: 'agent-1', nodeName: 'Agent', fields: [] },
        ],
      });
      const context = createMockContext({
        executionId: 'exec-all-1',
        nodeOutputs: {
          'agent-1': { result: 'Output', metadata: { tokens: 100 } },
        },
      });
      const { emitter, events } = createMockEmitter();

      const executePromise = approvalExecutor.execute(node, context, emitter);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const eventData = events[0].data as {
        type: string;
        approval: { displayData: Record<string, unknown> };
      };
      expect(eventData.approval.displayData).toEqual({
        Agent: { result: 'Output', metadata: { tokens: 100 } },
      });

      submitApproval('exec-all-1', 'approval-1', {
        approved: true,
        respondedAt: new Date().toISOString(),
      });

      await executePromise;
    });

    it('should handle nested field paths', async () => {
      const node = createApprovalNode({
        inputSelections: [
          { nodeId: 'agent-1', nodeName: 'Agent', fields: ['result.summary', 'result.score'] },
        ],
      });
      const context = createMockContext({
        executionId: 'exec-nested-1',
        nodeOutputs: {
          'agent-1': {
            result: { summary: 'Brief summary', score: 85, details: 'Long details' },
          },
        },
      });
      const { emitter, events } = createMockEmitter();

      const executePromise = approvalExecutor.execute(node, context, emitter);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const eventData = events[0].data as {
        type: string;
        approval: { displayData: Record<string, unknown> };
      };
      expect(eventData.approval.displayData).toEqual({
        Agent: { 'result.summary': 'Brief summary', 'result.score': 85 },
      });

      submitApproval('exec-nested-1', 'approval-1', {
        approved: true,
        respondedAt: new Date().toISOString(),
      });

      await executePromise;
    });
  });

  describe('getOutputHandle', () => {
    it('should return "approved" handle when approved', () => {
      const node = createApprovalNode();
      const result = { output: { approved: true }, metadata: {} };

      const handle = approvalExecutor.getOutputHandle!(result, node);
      expect(handle).toBe('approved');
    });

    it('should return "rejected" handle when rejected', () => {
      const node = createApprovalNode();
      const result = { output: { approved: false }, metadata: {} };

      const handle = approvalExecutor.getOutputHandle!(result, node);
      expect(handle).toBe('rejected');
    });
  });

  describe('submitApproval', () => {
    it('should return false for non-existent approval', () => {
      const result = submitApproval('non-existent', 'node-1', {
        approved: true,
        respondedAt: new Date().toISOString(),
      });
      expect(result).toBe(false);
    });

    it('should return true and resolve pending approval', async () => {
      const node = createApprovalNode();
      const context = createMockContext({
        executionId: 'exec-submit-1',
        nodeOutputs: { 'agent-1': { result: 'Output' } },
      });
      const { emitter } = createMockEmitter();

      const executePromise = approvalExecutor.execute(node, context, emitter);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = submitApproval('exec-submit-1', 'approval-1', {
        approved: true,
        respondedAt: new Date().toISOString(),
      });

      expect(result).toBe(true);
      await executePromise;
    });
  });

  describe('cancelApproval', () => {
    it('should return false for non-existent approval', () => {
      const result = cancelApproval('non-existent', 'node-1');
      expect(result).toBe(false);
    });

    it('should cancel pending approval and reject promise', async () => {
      const node = createApprovalNode();
      const context = createMockContext({
        executionId: 'exec-cancel-1',
        nodeOutputs: { 'agent-1': { result: 'Output' } },
      });
      const { emitter } = createMockEmitter();

      const executePromise = approvalExecutor.execute(node, context, emitter);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const cancelled = cancelApproval('exec-cancel-1', 'approval-1');
      expect(cancelled).toBe(true);

      await expect(executePromise).rejects.toThrow('Approval cancelled');
    });
  });

  describe('cancelAllApprovals', () => {
    it('should cancel all approvals for an execution', async () => {
      // Create two approval nodes in same execution
      const node1 = createApprovalNode();
      const node2: WorkflowNode = {
        ...createApprovalNode(),
        id: 'approval-2',
      };

      const context = createMockContext({
        executionId: 'exec-cancel-all',
        nodeOutputs: { 'agent-1': { result: 'Output' } },
      });
      const { emitter: emitter1 } = createMockEmitter();
      const { emitter: emitter2 } = createMockEmitter();

      const promise1 = approvalExecutor.execute(node1, context, emitter1);
      const promise2 = approvalExecutor.execute(node2, context, emitter2);

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Cancel all approvals for this execution
      cancelAllApprovals('exec-cancel-all');

      await expect(promise1).rejects.toThrow('Execution interrupted');
      await expect(promise2).rejects.toThrow('Execution interrupted');
    });

    it('should not cancel approvals from different executions', async () => {
      const node = createApprovalNode();
      const context1 = createMockContext({
        executionId: 'exec-a',
        nodeOutputs: { 'agent-1': { result: 'Output' } },
      });
      const context2 = createMockContext({
        executionId: 'exec-b',
        nodeOutputs: { 'agent-1': { result: 'Output' } },
      });
      const { emitter: emitter1 } = createMockEmitter();
      const { emitter: emitter2 } = createMockEmitter();

      const promise1 = approvalExecutor.execute(node, context1, emitter1);
      const promise2 = approvalExecutor.execute(node, context2, emitter2);

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Cancel only exec-a
      cancelAllApprovals('exec-a');

      await expect(promise1).rejects.toThrow('Execution interrupted');

      // exec-b should still be pending, submit approval
      submitApproval('exec-b', 'approval-1', {
        approved: true,
        respondedAt: new Date().toISOString(),
      });

      const result = await promise2;
      expect(result.output).toMatchObject({ approved: true });
    });
  });

  describe('abort signal handling', () => {
    it('should reject when abort signal is triggered', async () => {
      const node = createApprovalNode();
      const abortController = new AbortController();
      const context = createMockContext({
        executionId: 'exec-abort-1',
        nodeOutputs: { 'agent-1': { result: 'Output' } },
        abortSignal: abortController.signal,
      });
      const { emitter } = createMockEmitter();

      const executePromise = approvalExecutor.execute(node, context, emitter);

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Trigger abort
      abortController.abort();

      await expect(executePromise).rejects.toThrow('Execution interrupted');
    });
  });

  describe('timeout handling', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should timeout and reject when timeoutAction is "fail"', async () => {
      const node = createApprovalNode({
        timeoutMinutes: 1,
        timeoutAction: 'fail',
      });
      const context = createMockContext({
        executionId: 'exec-timeout-fail',
        nodeOutputs: { 'agent-1': { result: 'Output' } },
      });
      const { emitter } = createMockEmitter();

      const executePromise = approvalExecutor.execute(node, context, emitter);

      // Set up the rejection expectation before advancing timers
      const expectation = expect(executePromise).rejects.toThrow('Approval timed out');

      // Fast-forward past timeout and flush promises
      await jest.advanceTimersByTimeAsync(60 * 1000 + 100);

      await expectation;
    });

    it('should timeout and auto-approve when timeoutAction is "approve"', async () => {
      const node = createApprovalNode({
        timeoutMinutes: 1,
        timeoutAction: 'approve',
      });
      const context = createMockContext({
        executionId: 'exec-timeout-approve',
        nodeOutputs: { 'agent-1': { result: 'Output' } },
      });
      const { emitter } = createMockEmitter();

      const executePromise = approvalExecutor.execute(node, context, emitter);

      await jest.advanceTimersByTimeAsync(60 * 1000 + 100);

      const result = await executePromise;
      expect(result.output).toMatchObject({ approved: true });
    });

    it('should timeout and auto-reject when timeoutAction is "reject"', async () => {
      const node = createApprovalNode({
        timeoutMinutes: 1,
        timeoutAction: 'reject',
      });
      const context = createMockContext({
        executionId: 'exec-timeout-reject',
        nodeOutputs: { 'agent-1': { result: 'Output' } },
      });
      const { emitter } = createMockEmitter();

      const executePromise = approvalExecutor.execute(node, context, emitter);

      await jest.advanceTimersByTimeAsync(60 * 1000 + 100);

      const result = await executePromise;
      expect(result.output).toMatchObject({
        approved: false,
        feedback: 'Timed out waiting for approval',
      });
    });
  });
});

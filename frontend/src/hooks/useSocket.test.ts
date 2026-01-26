import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSocket } from './useSocket';
import { io } from 'socket.io-client';
import { ApprovalRequest, ApprovalResponse, ExecutionEvent } from '../types/workflow';

// Mock socket.io-client
vi.mock('socket.io-client', () => ({
  io: vi.fn(),
}));

describe('useSocket', () => {
  let mockSocket: {
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    emit: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  };
  let eventHandlers: Map<string, (data: unknown) => void>;

  beforeEach(() => {
    eventHandlers = new Map();
    mockSocket = {
      on: vi.fn((event: string, handler: (data: unknown) => void) => {
        eventHandlers.set(event, handler);
      }),
      off: vi.fn(),
      emit: vi.fn(),
      disconnect: vi.fn(),
    };
    (io as ReturnType<typeof vi.fn>).mockReturnValue(mockSocket);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Helper to trigger socket events
  const triggerEvent = (event: string, data: unknown) => {
    const handler = eventHandlers.get(event);
    if (handler) {
      act(() => {
        handler(data);
      });
    }
  };

  describe('approval handling', () => {
    it('should initialize with null pending approval', () => {
      const { result } = renderHook(() => useSocket());

      expect(result.current.execution.pendingApproval).toBeNull();
    });

    it('should set pending approval when node-waiting event is received', async () => {
      const { result } = renderHook(() => useSocket());

      const approvalRequest: ApprovalRequest = {
        nodeId: 'approval-1',
        nodeName: 'Review Output',
        promptMessage: 'Please review the generated content',
        displayData: {
          Agent: { result: 'Generated text' },
        },
      };

      const event: ExecutionEvent = {
        type: 'node-waiting',
        nodeId: 'approval-1',
        nodeName: 'Review Output',
        approval: approvalRequest,
      };

      triggerEvent('event', event);

      await waitFor(() => {
        expect(result.current.execution.pendingApproval).toEqual(approvalRequest);
        expect(result.current.execution.nodeStates.get('approval-1')).toBe('waiting');
      });
    });

    it('should clear pending approval when node-complete event is received', async () => {
      const { result } = renderHook(() => useSocket());

      // First set pending approval
      const approvalRequest: ApprovalRequest = {
        nodeId: 'approval-1',
        nodeName: 'Review',
        promptMessage: 'Review this',
        displayData: {},
      };

      triggerEvent('event', {
        type: 'node-waiting',
        nodeId: 'approval-1',
        approval: approvalRequest,
      });

      await waitFor(() => {
        expect(result.current.execution.pendingApproval).not.toBeNull();
      });

      // Then receive node-complete for the same node
      triggerEvent('event', {
        type: 'node-complete',
        nodeId: 'approval-1',
        result: { approved: true },
      });

      await waitFor(() => {
        expect(result.current.execution.pendingApproval).toBeNull();
        expect(result.current.execution.nodeStates.get('approval-1')).toBe('complete');
      });
    });

    it('should clear pending approval on execution-complete', async () => {
      const { result } = renderHook(() => useSocket());

      // Set pending approval
      triggerEvent('event', {
        type: 'node-waiting',
        nodeId: 'approval-1',
        approval: {
          nodeId: 'approval-1',
          nodeName: 'Review',
          promptMessage: 'Review',
          displayData: {},
        },
      });

      await waitFor(() => {
        expect(result.current.execution.pendingApproval).not.toBeNull();
      });

      // Complete execution
      triggerEvent('event', {
        type: 'execution-complete',
        result: { success: true },
      });

      await waitFor(() => {
        expect(result.current.execution.pendingApproval).toBeNull();
        expect(result.current.execution.isRunning).toBe(false);
      });
    });

    it('should clear pending approval on execution-error', async () => {
      const { result } = renderHook(() => useSocket());

      // Set pending approval
      triggerEvent('event', {
        type: 'node-waiting',
        nodeId: 'approval-1',
        approval: {
          nodeId: 'approval-1',
          nodeName: 'Review',
          promptMessage: 'Review',
          displayData: {},
        },
      });

      await waitFor(() => {
        expect(result.current.execution.pendingApproval).not.toBeNull();
      });

      // Error in execution
      triggerEvent('event', {
        type: 'execution-error',
        error: 'Something went wrong',
      });

      await waitFor(() => {
        expect(result.current.execution.pendingApproval).toBeNull();
        expect(result.current.execution.isRunning).toBe(false);
      });
    });

    it('should clear pending approval on node-error for approval node', async () => {
      const { result } = renderHook(() => useSocket());

      // Set pending approval
      triggerEvent('event', {
        type: 'node-waiting',
        nodeId: 'approval-1',
        approval: {
          nodeId: 'approval-1',
          nodeName: 'Review',
          promptMessage: 'Review',
          displayData: {},
        },
      });

      await waitFor(() => {
        expect(result.current.execution.pendingApproval).not.toBeNull();
      });

      // Node error
      triggerEvent('event', {
        type: 'node-error',
        nodeId: 'approval-1',
        error: 'Approval timeout',
      });

      await waitFor(() => {
        expect(result.current.execution.pendingApproval).toBeNull();
        expect(result.current.execution.nodeStates.get('approval-1')).toBe('error');
      });
    });

    it('should not clear pending approval for different node error', async () => {
      const { result } = renderHook(() => useSocket());

      // Set pending approval for approval-1
      triggerEvent('event', {
        type: 'node-waiting',
        nodeId: 'approval-1',
        approval: {
          nodeId: 'approval-1',
          nodeName: 'Review',
          promptMessage: 'Review',
          displayData: {},
        },
      });

      await waitFor(() => {
        expect(result.current.execution.pendingApproval).not.toBeNull();
      });

      // Error on different node
      triggerEvent('event', {
        type: 'node-error',
        nodeId: 'other-node',
        error: 'Other error',
      });

      await waitFor(() => {
        // Approval should still be pending
        expect(result.current.execution.pendingApproval).not.toBeNull();
        expect(result.current.execution.pendingApproval?.nodeId).toBe('approval-1');
      });
    });
  });

  describe('submitApproval', () => {
    it('should emit control event with approval response', async () => {
      const { result } = renderHook(() => useSocket());

      // Set up execution state
      triggerEvent('event', {
        type: 'execution-start',
        executionId: 'exec-123',
      });

      await waitFor(() => {
        expect(result.current.execution.executionId).toBe('exec-123');
      });

      // Submit approval
      const response: ApprovalResponse = {
        approved: true,
        respondedAt: new Date().toISOString(),
      };

      act(() => {
        result.current.submitApproval('approval-1', response);
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('control', {
        type: 'submit-approval',
        executionId: 'exec-123',
        nodeId: 'approval-1',
        response,
      });
    });

    it('should emit control event with rejection and feedback', async () => {
      const { result } = renderHook(() => useSocket());

      // Set up execution state
      triggerEvent('event', {
        type: 'execution-start',
        executionId: 'exec-456',
      });

      await waitFor(() => {
        expect(result.current.execution.executionId).toBe('exec-456');
      });

      // Submit rejection with feedback
      const response: ApprovalResponse = {
        approved: false,
        feedback: 'Needs more detail in the summary section',
        respondedAt: new Date().toISOString(),
      };

      act(() => {
        result.current.submitApproval('approval-1', response);
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('control', {
        type: 'submit-approval',
        executionId: 'exec-456',
        nodeId: 'approval-1',
        response,
      });
    });

    it('should not emit if no execution is running', () => {
      const { result } = renderHook(() => useSocket());

      // No execution started, executionId is null
      const response: ApprovalResponse = {
        approved: true,
        respondedAt: new Date().toISOString(),
      };

      act(() => {
        result.current.submitApproval('approval-1', response);
      });

      // Should not emit anything
      expect(mockSocket.emit).not.toHaveBeenCalledWith(
        'control',
        expect.objectContaining({ type: 'submit-approval' })
      );
    });
  });

  describe('resetExecution', () => {
    it('should clear pending approval when resetting', async () => {
      const { result } = renderHook(() => useSocket());

      // Set pending approval
      triggerEvent('event', {
        type: 'execution-start',
        executionId: 'exec-789',
      });

      triggerEvent('event', {
        type: 'node-waiting',
        nodeId: 'approval-1',
        approval: {
          nodeId: 'approval-1',
          nodeName: 'Review',
          promptMessage: 'Review',
          displayData: {},
        },
      });

      await waitFor(() => {
        expect(result.current.execution.pendingApproval).not.toBeNull();
      });

      // Reset
      act(() => {
        result.current.resetExecution();
      });

      expect(result.current.execution.pendingApproval).toBeNull();
      expect(result.current.execution.executionId).toBeNull();
      expect(result.current.execution.isRunning).toBe(false);
    });
  });

  describe('approval with displayData', () => {
    it('should store displayData from upstream nodes', async () => {
      const { result } = renderHook(() => useSocket());

      const displayData = {
        'Writer': { result: 'Generated article content' },
        'Researcher': {
          summary: 'Research findings',
          sources: ['source1', 'source2'],
        },
      };

      triggerEvent('event', {
        type: 'node-waiting',
        nodeId: 'approval-1',
        nodeName: 'Editor Review',
        approval: {
          nodeId: 'approval-1',
          nodeName: 'Editor Review',
          promptMessage: 'Review the article draft',
          displayData,
          feedbackPrompt: 'What changes should the writer make?',
        },
      });

      await waitFor(() => {
        const approval = result.current.execution.pendingApproval;
        expect(approval).not.toBeNull();
        expect(approval?.displayData).toEqual(displayData);
        expect(approval?.displayData?.Writer).toEqual({ result: 'Generated article content' });
        expect(approval?.feedbackPrompt).toBe('What changes should the writer make?');
      });
    });

    it('should handle empty displayData', async () => {
      const { result } = renderHook(() => useSocket());

      triggerEvent('event', {
        type: 'node-waiting',
        nodeId: 'approval-1',
        approval: {
          nodeId: 'approval-1',
          nodeName: 'Simple Review',
          promptMessage: 'Approve to continue',
          displayData: {},
        },
      });

      await waitFor(() => {
        const approval = result.current.execution.pendingApproval;
        expect(approval?.displayData).toEqual({});
      });
    });

    it('should handle timeout information in approval request', async () => {
      const { result } = renderHook(() => useSocket());

      const futureTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      triggerEvent('event', {
        type: 'node-waiting',
        nodeId: 'approval-1',
        approval: {
          nodeId: 'approval-1',
          nodeName: 'Timed Review',
          promptMessage: 'Review within 5 minutes',
          displayData: {},
          timeoutAt: futureTime,
        },
      });

      await waitFor(() => {
        const approval = result.current.execution.pendingApproval;
        expect(approval?.timeoutAt).toBe(futureTime);
      });
    });
  });

  describe('execution state transitions with approval', () => {
    it('should handle full approval workflow flow', async () => {
      const { result } = renderHook(() => useSocket());

      // 1. Execution starts
      triggerEvent('event', {
        type: 'execution-start',
        executionId: 'exec-full',
      });

      await waitFor(() => {
        expect(result.current.execution.isRunning).toBe(true);
      });

      // 2. Agent node runs
      triggerEvent('event', {
        type: 'node-start',
        nodeId: 'agent-1',
        nodeName: 'Writer',
      });

      await waitFor(() => {
        expect(result.current.execution.nodeStates.get('agent-1')).toBe('running');
      });

      // 3. Agent completes
      triggerEvent('event', {
        type: 'node-complete',
        nodeId: 'agent-1',
        result: { content: 'Generated content' },
      });

      await waitFor(() => {
        expect(result.current.execution.nodeStates.get('agent-1')).toBe('complete');
      });

      // 4. Approval node starts waiting
      triggerEvent('event', {
        type: 'node-start',
        nodeId: 'approval-1',
        nodeName: 'Review',
      });

      triggerEvent('event', {
        type: 'node-waiting',
        nodeId: 'approval-1',
        approval: {
          nodeId: 'approval-1',
          nodeName: 'Review',
          promptMessage: 'Review output',
          displayData: { Writer: { content: 'Generated content' } },
        },
      });

      await waitFor(() => {
        expect(result.current.execution.nodeStates.get('approval-1')).toBe('waiting');
        expect(result.current.execution.pendingApproval).not.toBeNull();
      });

      // 5. User approves (simulate backend response)
      triggerEvent('event', {
        type: 'node-complete',
        nodeId: 'approval-1',
        result: { approved: true, respondedAt: new Date().toISOString() },
      });

      await waitFor(() => {
        expect(result.current.execution.nodeStates.get('approval-1')).toBe('complete');
        expect(result.current.execution.pendingApproval).toBeNull();
      });

      // 6. Execution completes
      triggerEvent('event', {
        type: 'execution-complete',
        result: { success: true },
      });

      await waitFor(() => {
        expect(result.current.execution.isRunning).toBe(false);
        expect(result.current.execution.finalResult).toEqual({ success: true });
      });
    });
  });
});

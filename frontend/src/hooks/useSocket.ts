import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  Workflow,
  ExecutionEvent,
  ControlEvent,
  NodeStatus,
  AgentEvent,
  ExecutionSummary,
  ExecutionEventRecord,
  ApprovalRequest,
  ApprovalResponse,
  WorkflowValidationError,
} from '../types/workflow';

interface NodeOutput {
  nodeId: string;
  nodeName?: string;
  events: AgentEvent[];
  result?: unknown;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

interface ExecutionState {
  isRunning: boolean;
  executionId: string | null;
  submittedInput: string | null;
  nodeStates: Map<string, NodeStatus>;
  nodeOutputs: Map<string, NodeOutput>;
  finalResult: unknown | null;
  pendingApproval: ApprovalRequest | null;
  validationErrors: WorkflowValidationError[] | null;
}

interface ExecutionHistoryState {
  workflowId: string;
  executions: ExecutionSummary[];
}

interface SaveResult {
  success: boolean;
  error?: string;
}

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [executionHistory, setExecutionHistory] = useState<ExecutionHistoryState | null>(null);
  const [execution, setExecution] = useState<ExecutionState>({
    isRunning: false,
    executionId: null,
    submittedInput: null,
    nodeStates: new Map(),
    nodeOutputs: new Map(),
    finalResult: null,
    pendingApproval: null,
    validationErrors: null,
  });

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Connect to same origin (unified server)
    const socket = io({
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
      setIsConnected(false);
    });

    socket.on('workflows', (data: Workflow[]) => {
      setWorkflows(data);
    });

    socket.on('workflow-updated', (workflow: Workflow) => {
      setWorkflows((prev) =>
        prev.map((w) => (w.id === workflow.id ? workflow : w))
      );
    });

    socket.on('workflow-saved', (result: SaveResult) => {
      if (result.success) {
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('error');
        console.error('Failed to save workflow:', result.error);
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
    });

    socket.on('event', (event: ExecutionEvent) => {
      handleExecutionEvent(event);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const buildExecutionStateFromHistory = useCallback(
    (summary: ExecutionSummary, events: ExecutionEventRecord[]): ExecutionState => {
      const nodeStates = new Map<string, NodeStatus>();
      const nodeOutputs = new Map<string, NodeOutput>();
      let finalResult: unknown | null = summary.finalResult ?? null;

      for (const record of events) {
        const event = record.event;

        switch (event.type) {
          case 'node-start':
            nodeStates.set(event.nodeId, 'running');
            // Preserve existing events if this node is re-running (e.g., in a loop)
            const existingHistoryOutput = nodeOutputs.get(event.nodeId);
            nodeOutputs.set(event.nodeId, {
              nodeId: event.nodeId,
              nodeName: event.nodeName,
              events: existingHistoryOutput?.events || [],
              startedAt: Date.parse(record.timestamp),
            });
            break;
          case 'node-output': {
            const existing = nodeOutputs.get(event.nodeId) || {
              nodeId: event.nodeId,
              events: [],
            };
            nodeOutputs.set(event.nodeId, {
              ...existing,
              events: [...existing.events, event.event],
            });
            break;
          }
          case 'node-complete': {
            nodeStates.set(event.nodeId, 'complete');
            const output = nodeOutputs.get(event.nodeId);
            if (output) {
              nodeOutputs.set(event.nodeId, {
                ...output,
                result: event.result,
                completedAt: Date.parse(record.timestamp),
              });
            }
            break;
          }
          case 'node-error': {
            nodeStates.set(event.nodeId, 'error');
            const output = nodeOutputs.get(event.nodeId);
            if (output) {
              nodeOutputs.set(event.nodeId, {
                ...output,
                error: event.error,
                completedAt: Date.parse(record.timestamp),
              });
            }
            break;
          }
          case 'execution-complete':
            finalResult = event.result;
            break;
          case 'execution-error':
            finalResult = { error: event.error };
            break;
          default:
            break;
        }
      }

      return {
        isRunning: false,
        executionId: summary.executionId,
        submittedInput: summary.input ?? null,
        nodeStates,
        nodeOutputs,
        finalResult,
        pendingApproval: null,
        validationErrors: null,
      };
    },
    []
  );

  const handleExecutionEvent = useCallback((event: ExecutionEvent) => {
    setExecution((prev) => {
      const newNodeStates = new Map(prev.nodeStates);
      const newNodeOutputs = new Map(prev.nodeOutputs);

      switch (event.type) {
        case 'execution-start':
          return {
            isRunning: true,
            executionId: event.executionId,
            submittedInput: prev.submittedInput, // Preserve the submitted input
            nodeStates: new Map(),
            nodeOutputs: new Map(),
            finalResult: null,
            pendingApproval: null,
            validationErrors: null, // Clear any previous validation errors
          };

        case 'node-start':
          newNodeStates.set(event.nodeId, 'running');
          // Preserve existing events if this node is re-running (e.g., in a loop)
          // This ensures we don't lose logs from previous runs
          const existingNodeOutput = newNodeOutputs.get(event.nodeId);
          newNodeOutputs.set(event.nodeId, {
            nodeId: event.nodeId,
            nodeName: event.nodeName,
            events: existingNodeOutput?.events || [],
            startedAt: Date.now(),
          });
          return { ...prev, nodeStates: newNodeStates, nodeOutputs: newNodeOutputs };

        case 'node-output':
          const existing = newNodeOutputs.get(event.nodeId) || {
            nodeId: event.nodeId,
            events: [],
          };
          newNodeOutputs.set(event.nodeId, {
            ...existing,
            events: [...existing.events, event.event],
          });
          return { ...prev, nodeOutputs: newNodeOutputs };

        case 'node-waiting':
          // Node is waiting for user approval
          newNodeStates.set(event.nodeId, 'waiting');
          return {
            ...prev,
            nodeStates: newNodeStates,
            pendingApproval: event.approval,
          };

        case 'node-complete':
          newNodeStates.set(event.nodeId, 'complete');
          const nodeOutput = newNodeOutputs.get(event.nodeId);
          if (nodeOutput) {
            newNodeOutputs.set(event.nodeId, {
              ...nodeOutput,
              result: event.result,
              completedAt: Date.now(),
            });
          }
          // Clear pending approval if this was the approval node
          const clearApproval = prev.pendingApproval?.nodeId === event.nodeId;
          return {
            ...prev,
            nodeStates: newNodeStates,
            nodeOutputs: newNodeOutputs,
            pendingApproval: clearApproval ? null : prev.pendingApproval,
          };

        case 'node-error':
          newNodeStates.set(event.nodeId, 'error');
          const errOutput = newNodeOutputs.get(event.nodeId);
          if (errOutput) {
            newNodeOutputs.set(event.nodeId, {
              ...errOutput,
              error: event.error,
              completedAt: Date.now(),
            });
          }
          // Clear pending approval if this was the approval node
          const clearApprovalErr = prev.pendingApproval?.nodeId === event.nodeId;
          return {
            ...prev,
            nodeStates: newNodeStates,
            nodeOutputs: newNodeOutputs,
            pendingApproval: clearApprovalErr ? null : prev.pendingApproval,
          };

        case 'execution-complete':
          return {
            ...prev,
            isRunning: false,
            finalResult: event.result,
            pendingApproval: null,
          };

        case 'execution-error':
          return {
            ...prev,
            isRunning: false,
            finalResult: { error: event.error },
            pendingApproval: null,
          };

        case 'validation-error':
          return {
            ...prev,
            isRunning: false,
            validationErrors: event.errors,
          };

        default:
          return prev;
      }
    });
  }, []);

  const fetchExecutionHistory = useCallback(async (workflowId: string) => {
    try {
      const response = await fetch(
        `/api/workflows/${workflowId}/executions`
      );
      if (!response.ok) {
        console.error('Failed to load execution history');
        setExecutionHistory({ workflowId, executions: [] });
        return;
      }
      const executions = (await response.json()) as ExecutionSummary[];
      setExecutionHistory({ workflowId, executions });
    } catch (error) {
      console.error('Failed to load execution history:', error);
      setExecutionHistory({ workflowId, executions: [] });
    }
  }, []);

  const loadExecutionHistory = useCallback(
    async (workflowId: string, executionId: string) => {
      try {
        const [summaryRes, eventsRes] = await Promise.all([
          fetch(`/api/workflows/${workflowId}/executions/${executionId}`),
          fetch(`/api/workflows/${workflowId}/executions/${executionId}/events`),
        ]);

        if (!summaryRes.ok || !eventsRes.ok) {
          console.error('Failed to load execution details');
          return;
        }

        const summary = (await summaryRes.json()) as ExecutionSummary;
        const events = (await eventsRes.json()) as ExecutionEventRecord[];
        const state = buildExecutionStateFromHistory(summary, events);
        setExecution(state);
      } catch (error) {
        console.error('Failed to load execution details:', error);
      }
    },
    [buildExecutionStateFromHistory]
  );

  const saveWorkflow = useCallback((workflow: Workflow) => {
    setSaveStatus('saving');
    socketRef.current?.emit('save-workflow', workflow);
  }, []);

  const startExecution = useCallback((workflowId: string, input: string) => {
    console.log('[useSocket] Starting execution:', { workflowId, input: input.slice(0, 100) });
    // Track the submitted input immediately
    setExecution(prev => ({ ...prev, submittedInput: input }));
    const event: ControlEvent = {
      type: 'start-execution',
      workflowId,
      input,
    };
    console.log('[useSocket] Emitting control event:', event.type);
    socketRef.current?.emit('control', event);
  }, []);

  const interruptExecution = useCallback((executionId: string) => {
    const event: ControlEvent = {
      type: 'interrupt',
      executionId,
    };
    socketRef.current?.emit('control', event);
  }, []);

  const resetExecution = useCallback(() => {
    setExecution({
      isRunning: false,
      executionId: null,
      submittedInput: null,
      nodeStates: new Map(),
      nodeOutputs: new Map(),
      finalResult: null,
      pendingApproval: null,
      validationErrors: null,
    });
  }, []);

  const submitApproval = useCallback((nodeId: string, response: ApprovalResponse) => {
    if (!execution.executionId) return;
    const event: ControlEvent = {
      type: 'submit-approval',
      executionId: execution.executionId,
      nodeId,
      response,
    };
    socketRef.current?.emit('control', event);
  }, [execution.executionId]);

  const clearValidationErrors = useCallback(() => {
    setExecution(prev => ({ ...prev, validationErrors: null }));
  }, []);

  return {
    isConnected,
    workflows,
    execution,
    executionHistory,
    saveStatus,
    saveWorkflow,
    startExecution,
    interruptExecution,
    resetExecution,
    submitApproval,
    clearValidationErrors,
    fetchExecutionHistory,
    loadExecutionHistory,
  };
}

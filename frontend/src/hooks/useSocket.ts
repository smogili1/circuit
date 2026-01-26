import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  Workflow,
  ExecutionEvent,
  ControlEvent,
  NodeStatus,
  NodeType,
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
  nodeType?: NodeType;
  events: AgentEvent[];
  result?: unknown;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

// Branch path tracking for condition/approval nodes
export interface BranchPath {
  nodeId: string;
  nodeName: string;
  condition: boolean;
  takenAt: string;
}

interface ExecutionState {
  isRunning: boolean;
  executionId: string | null;
  workflowId: string | null;
  submittedInput: string | null;
  executionStartedAt: number | null;
  nodeStates: Map<string, NodeStatus>;
  nodeOutputs: Map<string, NodeOutput>;
  nodeTypes: Map<string, NodeType>;
  branchPaths: BranchPath[];
  branchResults: Map<string, boolean>;
  finalResult: unknown | null;
  pendingApproval: ApprovalRequest | null;
  validationErrors: WorkflowValidationError[] | null;
  lastEventTimestamp: string | null;
}

interface ExecutionHistoryState {
  workflowId: string;
  executions: ExecutionSummary[];
}

interface SaveResult {
  success: boolean;
  error?: string;
}

const ACTIVE_EXECUTION_STORAGE_KEY = 'activeExecution';

const buildEmptyExecutionState = (): ExecutionState => ({
  isRunning: false,
  executionId: null,
  workflowId: null,
  submittedInput: null,
  executionStartedAt: null,
  nodeStates: new Map(),
  nodeOutputs: new Map(),
  nodeTypes: new Map(),
  branchPaths: [],
  branchResults: new Map(),
  finalResult: null,
  pendingApproval: null,
  validationErrors: null,
  lastEventTimestamp: null,
});

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [executionHistory, setExecutionHistory] = useState<ExecutionHistoryState | null>(null);
  const [execution, setExecution] = useState<ExecutionState>(() => {
    const base = buildEmptyExecutionState();
    if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
      return base;
    }
    try {
      const savedRaw = sessionStorage.getItem(ACTIVE_EXECUTION_STORAGE_KEY);
      if (!savedRaw) {
        return base;
      }
      const saved = JSON.parse(savedRaw) as {
        executionId?: string;
        workflowId?: string;
        submittedInput?: string | null;
      };
      if (!saved?.executionId) {
        return base;
      }
      return {
        ...base,
        isRunning: true,
        executionId: saved.executionId,
        workflowId: saved.workflowId ?? null,
        submittedInput: saved.submittedInput ?? null,
      };
    } catch {
      return base;
    }
  });

  const socketRef = useRef<Socket | null>(null);
  const subscribedExecutionIdRef = useRef<string | null>(null);

  // Track whether we've completed initial recovery for this execution
  const recoveryCompleteRef = useRef<boolean>(false);

  useEffect(() => {
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
      subscribedExecutionIdRef.current = null;
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
      const nodeTypes = new Map<string, NodeType>();
      const branchPaths: BranchPath[] = [];
      const branchResults = new Map<string, boolean>();
      let finalResult: unknown | null = summary.finalResult ?? null;
      let executionStartedAt: number | null = null;
      let lastEventTimestamp: string | null = null;

      for (const record of events) {
        const event = record.event;
        lastEventTimestamp = record.timestamp;

        switch (event.type) {
          case 'execution-start':
            executionStartedAt = Date.parse(record.timestamp);
            break;
          case 'node-start': {
            nodeStates.set(event.nodeId, 'running');
            const existingHistoryOutput = nodeOutputs.get(event.nodeId);
            nodeOutputs.set(event.nodeId, {
              nodeId: event.nodeId,
              nodeName: event.nodeName,
              events: existingHistoryOutput?.events || [],
              startedAt: Date.parse(record.timestamp),
            });
            break;
          }
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
            if (typeof event.result === 'boolean') {
              branchResults.set(event.nodeId, event.result);
              branchPaths.push({
                nodeId: event.nodeId,
                nodeName: output?.nodeName || event.nodeId,
                condition: event.result,
                takenAt: record.timestamp,
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
        isRunning: summary.status === 'running',
        executionId: summary.executionId,
        workflowId: summary.workflowId,
        submittedInput: summary.input ?? null,
        executionStartedAt,
        nodeStates,
        nodeOutputs,
        nodeTypes,
        branchPaths,
        branchResults,
        finalResult,
        pendingApproval: null,
        validationErrors: null,
        lastEventTimestamp,
      };
    },
    []
  );

  const handleExecutionEvent = useCallback((event: ExecutionEvent) => {
    setExecution((prev) => {
      const newNodeStates = new Map(prev.nodeStates);
      const newNodeOutputs = new Map(prev.nodeOutputs);
      const newBranchResults = new Map(prev.branchResults);
      const newBranchPaths = [...prev.branchPaths];
      const timestamp = new Date().toISOString();

      switch (event.type) {
        case 'execution-start':
          subscribedExecutionIdRef.current = event.executionId;
          recoveryCompleteRef.current = true;
          return {
            isRunning: true,
            executionId: event.executionId,
            workflowId: event.workflowId ?? prev.workflowId,
            submittedInput: prev.submittedInput,
            executionStartedAt: Date.now(),
            nodeStates: new Map(),
            nodeOutputs: new Map(),
            nodeTypes: new Map(),
            branchPaths: [],
            branchResults: new Map(),
            finalResult: null,
            pendingApproval: null,
            validationErrors: null,
            lastEventTimestamp: timestamp,
          };

        case 'node-start':
          newNodeStates.set(event.nodeId, 'running');
          const existingNodeOutput = newNodeOutputs.get(event.nodeId);
          newNodeOutputs.set(event.nodeId, {
            nodeId: event.nodeId,
            nodeName: event.nodeName,
            events: existingNodeOutput?.events || [],
            startedAt: Date.now(),
          });
          return { ...prev, nodeStates: newNodeStates, nodeOutputs: newNodeOutputs, lastEventTimestamp: timestamp };

        case 'node-output': {
          const existing = newNodeOutputs.get(event.nodeId) || {
            nodeId: event.nodeId,
            events: [],
          };
          newNodeOutputs.set(event.nodeId, {
            ...existing,
            events: [...existing.events, event.event],
          });
          return { ...prev, nodeOutputs: newNodeOutputs, lastEventTimestamp: timestamp };
        }

        case 'node-waiting':
          newNodeStates.set(event.nodeId, 'waiting');
          return {
            ...prev,
            nodeStates: newNodeStates,
            pendingApproval: event.approval,
            lastEventTimestamp: timestamp,
          };

        case 'node-complete': {
          newNodeStates.set(event.nodeId, 'complete');
          const nodeOutput = newNodeOutputs.get(event.nodeId);
          if (nodeOutput) {
            newNodeOutputs.set(event.nodeId, {
              ...nodeOutput,
              result: event.result,
              completedAt: Date.now(),
            });
          }
          if (typeof event.result === 'boolean') {
            newBranchResults.set(event.nodeId, event.result);
            newBranchPaths.push({
              nodeId: event.nodeId,
              nodeName: nodeOutput?.nodeName || event.nodeId,
              condition: event.result,
              takenAt: timestamp,
            });
          }
          const clearApproval = prev.pendingApproval?.nodeId === event.nodeId;
          return {
            ...prev,
            nodeStates: newNodeStates,
            nodeOutputs: newNodeOutputs,
            branchResults: newBranchResults,
            branchPaths: newBranchPaths,
            pendingApproval: clearApproval ? null : prev.pendingApproval,
            lastEventTimestamp: timestamp,
          };
        }

        case 'node-error': {
          newNodeStates.set(event.nodeId, 'error');
          const errOutput = newNodeOutputs.get(event.nodeId);
          if (errOutput) {
            newNodeOutputs.set(event.nodeId, {
              ...errOutput,
              error: event.error,
              completedAt: Date.now(),
            });
          }
          const clearApprovalErr = prev.pendingApproval?.nodeId === event.nodeId;
          return {
            ...prev,
            nodeStates: newNodeStates,
            nodeOutputs: newNodeOutputs,
            pendingApproval: clearApprovalErr ? null : prev.pendingApproval,
            lastEventTimestamp: timestamp,
          };
        }

        case 'execution-complete':
          return {
            ...prev,
            isRunning: false,
            finalResult: event.result,
            pendingApproval: null,
            lastEventTimestamp: timestamp,
          };

        case 'execution-error':
          return {
            ...prev,
            isRunning: false,
            finalResult: { error: event.error },
            pendingApproval: null,
            lastEventTimestamp: timestamp,
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

  // Persist active execution to sessionStorage
  useEffect(() => {
    if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
      return;
    }
    if (execution.isRunning && execution.executionId) {
      sessionStorage.setItem(
        ACTIVE_EXECUTION_STORAGE_KEY,
        JSON.stringify({
          executionId: execution.executionId,
          workflowId: execution.workflowId,
          submittedInput: execution.submittedInput,
        })
      );
      return;
    }
    sessionStorage.removeItem(ACTIVE_EXECUTION_STORAGE_KEY);
  }, [execution.isRunning, execution.executionId, execution.workflowId, execution.submittedInput]);

  const fetchExecutionHistory = useCallback(async (workflowId: string) => {
    try {
      const response = await fetch(`/api/workflows/${workflowId}/executions`);
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
        return state;
      } catch (error) {
        console.error('Failed to load execution details:', error);
        return null;
      }
    },
    [buildExecutionStateFromHistory]
  );

  const saveWorkflow = useCallback((workflow: Workflow) => {
    setSaveStatus('saving');
    socketRef.current?.emit('save-workflow', workflow);
  }, []);

  const subscribeToExecution = useCallback((executionId: string, afterTimestamp?: string) => {
    const event: ControlEvent = {
      type: 'subscribe-execution',
      executionId,
      afterTimestamp,
    };
    socketRef.current?.emit('control', event);
  }, []);

  // Recovery effect: when reconnecting with an active execution from sessionStorage
  useEffect(() => {
    if (!isConnected) return;
    if (!execution.isRunning || !execution.executionId || !execution.workflowId) return;

    // Already recovered or subscribed
    if (recoveryCompleteRef.current) return;
    if (subscribedExecutionIdRef.current === execution.executionId) return;

    // If we have data, we're already recovered - just subscribe for new events
    if (execution.nodeOutputs.size > 0) {
      console.log('[useSocket] Already have execution data, subscribing for updates');
      subscribeToExecution(execution.executionId, execution.lastEventTimestamp ?? undefined);
      subscribedExecutionIdRef.current = execution.executionId;
      recoveryCompleteRef.current = true;
      return;
    }

    // Need to recover: load history then subscribe
    console.log('[useSocket] Recovering execution state:', execution.executionId);

    loadExecutionHistory(execution.workflowId, execution.executionId).then((state) => {
      if (state?.isRunning && state.executionId) {
        console.log('[useSocket] Loaded history, subscribing with timestamp:', state.lastEventTimestamp);
        subscribeToExecution(state.executionId, state.lastEventTimestamp ?? undefined);
        subscribedExecutionIdRef.current = state.executionId;
      }
      recoveryCompleteRef.current = true;
    });
  }, [isConnected, execution.isRunning, execution.executionId, execution.workflowId, execution.nodeOutputs.size, execution.lastEventTimestamp, loadExecutionHistory, subscribeToExecution]);

  const startExecution = useCallback((workflowId: string, input: string) => {
    console.log('[useSocket] Starting execution:', { workflowId, input: input.slice(0, 100) });
    recoveryCompleteRef.current = false;
    setExecution(prev => ({ ...prev, submittedInput: input, workflowId }));
    const event: ControlEvent = {
      type: 'start-execution',
      workflowId,
      input,
    };
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
    subscribedExecutionIdRef.current = null;
    recoveryCompleteRef.current = false;
    setExecution(buildEmptyExecutionState());
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
    subscribeToExecution,
    startExecution,
    interruptExecution,
    resetExecution,
    submitApproval,
    clearValidationErrors,
    fetchExecutionHistory,
    loadExecutionHistory,
  };
}

import { useCallback } from 'react';
import { useWorkflowStore } from '../stores/workflowStore';
import { FullScreenExecution } from '../components/Execution/FullScreenExecution';
import { useRouteSync } from '../hooks/useRouteSync';
import { Workflow, NodeStatus, ExecutionSummary, NodeType, AgentEvent } from '../types/workflow';
import { BranchPath } from '../hooks/useSocket';

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

interface WorkflowExecutionPageProps {
  workflows: Workflow[];
  isRunning: boolean;
  executionId: string | null;
  submittedInput: string | null;
  executionStartedAt?: number | null;
  nodeStates: Map<string, NodeStatus>;
  nodeOutputs: Map<string, NodeOutput>;
  nodeTypes?: Map<string, NodeType>;
  branchPaths?: BranchPath[];
  branchResults?: Map<string, boolean>;
  executionHistory: ExecutionSummary[];
  onStart: (workflowId: string, input: string) => void;
  onInterrupt: (executionId: string) => void;
  onReset: () => void;
  onRefreshHistory: (workflowId: string) => void;
  onLoadHistory: (workflowId: string, executionId: string) => void;
}

export function WorkflowExecutionPage({
  workflows,
  isRunning,
  executionId,
  submittedInput,
  executionStartedAt,
  nodeStates,
  nodeOutputs,
  nodeTypes,
  branchPaths,
  branchResults,
  executionHistory,
  onStart,
  onInterrupt,
  onReset,
  onRefreshHistory,
  onLoadHistory,
}: WorkflowExecutionPageProps) {
  const { workflow } = useWorkflowStore();

  // Sync URL params with stores - this will load execution if executionId is present
  useRouteSync({
    workflows,
    loadExecutionHistory: useCallback((workflowId: string, executionId: string) => {
      onLoadHistory(workflowId, executionId);
    }, [onLoadHistory])
  });

  return (
    <FullScreenExecution
      workflow={workflow}
      isRunning={isRunning}
      executionId={executionId}
      submittedInput={submittedInput}
      executionStartedAt={executionStartedAt}
      nodeStates={nodeStates}
      nodeOutputs={nodeOutputs}
      nodeTypes={nodeTypes}
      branchPaths={branchPaths}
      branchResults={branchResults}
      executionHistory={executionHistory}
      onStart={onStart}
      onInterrupt={onInterrupt}
      onReset={onReset}
      onRefreshHistory={onRefreshHistory}
      onLoadHistory={onLoadHistory}
    />
  );
}

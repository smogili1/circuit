import { useState, useMemo, memo } from 'react';
import { Workflow, NodeStatus, NodeType, AgentEvent, ExecutionSummary } from '../../types/workflow';
import { ExecutionWorkflowView } from './ExecutionWorkflowView';
import { LogViewer } from './LogViewer';
import { ExecutionControls } from './ExecutionControls';
import { ExecutionHistory } from './ExecutionHistory';
import { ReplayModal } from './ReplayModal';
import { BranchPath } from './BranchIndicator';

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

interface FullScreenExecutionProps {
  workflow: Workflow | null;
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
  onReplayExecution?: (
    workflowId: string,
    sourceExecutionId: string,
    fromNodeId: string,
    useOriginalInput: boolean,
    input?: string
  ) => void;
}

function FullScreenExecutionComponent({
  workflow,
  isRunning,
  executionId,
  submittedInput,
  executionStartedAt,
  nodeStates,
  nodeOutputs,
  nodeTypes = new Map(),
  branchPaths = [],
  branchResults = new Map(),
  executionHistory,
  onStart,
  onInterrupt,
  onReset,
  onRefreshHistory,
  onLoadHistory,
  onReplayExecution,
}: FullScreenExecutionProps) {
  const [input, setInput] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [replayModalState, setReplayModalState] = useState<{
    isOpen: boolean;
    executionId: string | null;
    input: string;
  }>({
    isOpen: false,
    executionId: null,
    input: '',
  });

  // Build node types map from workflow if not provided
  const resolvedNodeTypes = useMemo(() => {
    if (nodeTypes.size > 0) return nodeTypes;
    if (!workflow) return new Map<string, NodeType>();

    const types = new Map<string, NodeType>();
    for (const node of workflow.nodes) {
      types.set(node.id, node.type);
    }
    return types;
  }, [workflow, nodeTypes]);

  const handleStart = () => {
    if (workflow && input.trim()) {
      onStart(workflow.id, input.trim());
    }
  };

  const handleStop = () => {
    if (executionId) {
      onInterrupt(executionId);
    }
  };

  const handleOpenReplayModal = (workflowId: string, executionId: string, input: string) => {
    setReplayModalState({
      isOpen: true,
      executionId,
      input,
    });
  };

  const handleCloseReplayModal = () => {
    setReplayModalState({
      isOpen: false,
      executionId: null,
      input: '',
    });
  };

  const handleReplay = (fromNodeId: string, useOriginalInput: boolean, input?: string) => {
    if (!workflow?.id || !replayModalState.executionId || !onReplayExecution) return;

    onReplayExecution(
      workflow.id,
      replayModalState.executionId,
      fromNodeId,
      useOriginalInput,
      input
    );
    handleCloseReplayModal();
  };

  if (!workflow) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-100 dark:bg-gray-950 text-gray-500 dark:text-gray-400">
        <div className="text-center">
          <p className="text-lg mb-2">No workflow selected</p>
          <p className="text-sm">
            Switch to Design mode to select or create a workflow
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex bg-gray-100 dark:bg-gray-950 min-w-0 overflow-hidden">
      {/* Left Sidebar */}
      <div className="w-80 flex flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        {/* Execution History - takes up available space */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <ExecutionHistory
            workflowId={workflow?.id || null}
            executions={executionHistory}
            activeExecutionId={executionId}
            isRunning={isRunning}
            onRefresh={onRefreshHistory}
            onLoad={onLoadHistory}
            onRetry={onReplayExecution ? handleOpenReplayModal : undefined}
          />
        </div>

        {/* Execution Controls */}
        <ExecutionControls
          input={input}
          onInputChange={setInput}
          isRunning={isRunning}
          disabled={!workflow}
          onStart={handleStart}
          onStop={handleStop}
          onReset={onReset}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Compact workflow diagram with status */}
        <ExecutionWorkflowView
          workflow={workflow}
          nodeStates={nodeStates}
          selectedNodeId={selectedNodeId}
          onNodeSelect={setSelectedNodeId}
          branchPaths={branchPaths}
          executionStartedAt={executionStartedAt ?? undefined}
          isRunning={isRunning}
        />

        {/* Log Viewer - takes most of the space */}
        <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
          <LogViewer
            submittedInput={submittedInput}
            nodeOutputs={nodeOutputs}
            nodeStates={nodeStates}
            nodeTypes={resolvedNodeTypes}
            selectedNodeId={selectedNodeId}
            onNodeSelect={setSelectedNodeId}
            branchResults={branchResults}
          />
        </div>
      </div>

      {/* Replay Modal */}
      {replayModalState.isOpen && workflow?.id && replayModalState.executionId && (
        <ReplayModal
          workflowId={workflow.id}
          executionId={replayModalState.executionId}
          originalInput={replayModalState.input}
          onClose={handleCloseReplayModal}
          onReplay={handleReplay}
        />
      )}
    </div>
  );
}

export const FullScreenExecution = memo(FullScreenExecutionComponent);

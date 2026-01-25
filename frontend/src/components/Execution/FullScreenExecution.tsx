import { useState, useMemo, memo, useCallback } from 'react';
import { Workflow, NodeStatus, NodeType, AgentEvent, ExecutionSummary, ReplayValidationResult } from '../../types/workflow';
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
  onFetchReplayPreview?: (workflowId: string, executionId: string, fromNodeId: string) => Promise<ReplayValidationResult | null>;
  onReplayFromNode?: (workflowId: string, sourceExecutionId: string, fromNodeId: string, input?: string) => void;
}

interface ReplayState {
  nodeId: string;
  nodeName: string;
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
  onFetchReplayPreview,
  onReplayFromNode,
}: FullScreenExecutionProps) {
  const [input, setInput] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [replayState, setReplayState] = useState<ReplayState | null>(null);

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

  // Check if we're viewing a historical execution (not running and has an executionId)
  const isHistoricalView = !isRunning && executionId !== null && nodeOutputs.size > 0;

  // Handle replay from node
  const handleReplayFromNode = useCallback((nodeId: string, nodeName: string) => {
    setReplayState({ nodeId, nodeName });
  }, []);

  // Confirm replay
  const handleConfirmReplay = useCallback((customInput?: string) => {
    if (workflow && executionId && replayState && onReplayFromNode) {
      onReplayFromNode(workflow.id, executionId, replayState.nodeId, customInput);
      setReplayState(null);
    }
  }, [workflow, executionId, replayState, onReplayFromNode]);

  // Cancel replay
  const handleCancelReplay = useCallback(() => {
    setReplayState(null);
  }, []);

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

  if (!workflow) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-950 text-gray-400">
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
    <div className="flex-1 flex bg-gray-950">
      {/* Left Sidebar */}
      <div className="w-80 flex flex-col border-r border-gray-800">
        {/* Execution History - takes up available space */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <ExecutionHistory
            workflowId={workflow?.id || null}
            executions={executionHistory}
            activeExecutionId={executionId}
            isRunning={isRunning}
            onRefresh={onRefreshHistory}
            onLoad={onLoadHistory}
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
      <div className="flex-1 flex flex-col min-w-0">
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
        <div className="flex-1 min-h-0">
          <LogViewer
            submittedInput={submittedInput}
            nodeOutputs={nodeOutputs}
            nodeStates={nodeStates}
            nodeTypes={resolvedNodeTypes}
            selectedNodeId={selectedNodeId}
            onNodeSelect={setSelectedNodeId}
            branchResults={branchResults}
            isHistoricalView={isHistoricalView}
            onReplayFromNode={onReplayFromNode ? handleReplayFromNode : undefined}
          />
        </div>
      </div>

      {/* Replay Modal */}
      {replayState && workflow && executionId && onFetchReplayPreview && (
        <ReplayModal
          nodeName={replayState.nodeName}
          nodeId={replayState.nodeId}
          workflowId={workflow.id}
          executionId={executionId}
          originalInput={submittedInput || ''}
          onFetchPreview={onFetchReplayPreview}
          onConfirm={handleConfirmReplay}
          onCancel={handleCancelReplay}
        />
      )}
    </div>
  );
}

export const FullScreenExecution = memo(FullScreenExecutionComponent);

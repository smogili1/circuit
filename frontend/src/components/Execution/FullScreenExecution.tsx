import { useState } from 'react';
import { Workflow, NodeStatus, AgentEvent, ExecutionSummary } from '../../types/workflow';
import { ExecutionTimeline } from './ExecutionTimeline';
import { LogViewer } from './LogViewer';
import { ExecutionControls } from './ExecutionControls';
import { ExecutionHistory } from './ExecutionHistory';

interface NodeOutput {
  nodeId: string;
  nodeName?: string;
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
  nodeStates: Map<string, NodeStatus>;
  nodeOutputs: Map<string, NodeOutput>;
  executionHistory: ExecutionSummary[];
  onStart: (workflowId: string, input: string) => void;
  onInterrupt: (executionId: string) => void;
  onReset: () => void;
  onRefreshHistory: (workflowId: string) => void;
  onLoadHistory: (workflowId: string, executionId: string) => void;
}

export function FullScreenExecution({
  workflow,
  isRunning,
  executionId,
  submittedInput,
  nodeStates,
  nodeOutputs,
  executionHistory,
  onStart,
  onInterrupt,
  onReset,
  onRefreshHistory,
  onLoadHistory,
}: FullScreenExecutionProps) {
  const [input, setInput] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

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
        {/* Timeline */}
        <ExecutionTimeline
          nodes={workflow.nodes}
          nodeStates={nodeStates}
          selectedNodeId={selectedNodeId}
          onNodeSelect={setSelectedNodeId}
        />

        {/* Log Viewer */}
        <div className="flex-1 min-h-0">
          <LogViewer
            submittedInput={submittedInput}
            nodeOutputs={nodeOutputs}
            nodeStates={nodeStates}
            selectedNodeId={selectedNodeId}
            onNodeSelect={setSelectedNodeId}
          />
        </div>
      </div>
    </div>
  );
}

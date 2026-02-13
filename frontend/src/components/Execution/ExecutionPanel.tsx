import { useState, useRef, useEffect } from 'react';
import { Play, Square, RefreshCw, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { AgentEvent, NodeStatus, ExecutionSummary } from '../../types/workflow';
import { ExecutionHistory } from './ExecutionHistory';
import { ReplayModal } from './ReplayModal';

interface GroupedEvent {
  event: AgentEvent;
  result?: AgentEvent;
}

/**
 * Groups tool-use events with their corresponding tool-result events,
 * even when tool-result arrives before tool-use.
 */
function groupEvents(events: AgentEvent[]): GroupedEvent[] {
  const grouped: GroupedEvent[] = [];
  const toolUseIds = new Set<string>();
  const toolResultsById = new Map<string, AgentEvent>();

  for (const event of events) {
    if (event.type === 'tool-use' && event.id) {
      toolUseIds.add(event.id);
    } else if (event.type === 'tool-result') {
      toolResultsById.set(event.name, event);
    }
  }

  for (const event of events) {
    if (event.type === 'tool-use') {
      const result = event.id ? toolResultsById.get(event.id) : undefined;
      grouped.push({ event, result });
      continue;
    }

    if (event.type === 'tool-result') {
      if (toolUseIds.has(event.name)) {
        continue;
      }
    }

    grouped.push({ event });
  }

  return grouped;
}

interface NodeOutput {
  nodeId: string;
  events: AgentEvent[];
  result?: unknown;
  error?: string;
}

interface ExecutionPanelProps {
  workflowId: string | null;
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
  onReplayExecution?: (
    workflowId: string,
    sourceExecutionId: string,
    fromNodeId: string
  ) => void;
}

export function ExecutionPanel({
  workflowId,
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
  onReplayExecution,
}: ExecutionPanelProps) {
  const [input, setInput] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [replayModalState, setReplayModalState] = useState<{
    isOpen: boolean;
    executionId: string | null;
    input: string;
  }>({
    isOpen: false,
    executionId: null,
    input: '',
  });

  const toggleNode = (nodeId: string) => {
    const next = new Set(expandedNodes);
    if (next.has(nodeId)) {
      next.delete(nodeId);
    } else {
      next.add(nodeId);
    }
    setExpandedNodes(next);
  };

  const handleStart = () => {
    if (workflowId && input.trim()) {
      onStart(workflowId, input.trim());
    }
  };

  const handleInterrupt = () => {
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

  const handleReplay = (fromNodeId: string) => {
    if (!workflowId || !replayModalState.executionId || !onReplayExecution) return;

    onReplayExecution(
      workflowId,
      replayModalState.executionId,
      fromNodeId
    );
    handleCloseReplayModal();
  };

  // Refresh history when workflow changes, execution completes, or a new execution starts
  useEffect(() => {
    if (workflowId) {
      onRefreshHistory(workflowId);
    }
  }, [workflowId, isRunning, executionId, onRefreshHistory]);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Execution
        </h2>
      </div>

      {/* Input Section */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Input Prompt
        </label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={4}
          placeholder="Enter your task description..."
          disabled={isRunning}
          className="w-full px-3 py-2 text-sm border rounded-md resize-none
            dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100
            disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <div className="flex gap-2 mt-3">
          {!isRunning ? (
            <button
              onClick={handleStart}
              disabled={!workflowId || !input.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white
                bg-blue-600 hover:bg-blue-700 rounded-md
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play size={16} />
              Run Workflow
            </button>
          ) : (
            <button
              onClick={handleInterrupt}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white
                bg-red-600 hover:bg-red-700 rounded-md"
            >
              <Square size={16} />
              Stop
            </button>
          )}
          <button
            onClick={onReset}
            disabled={isRunning}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium
              text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800
              hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw size={16} />
            Reset
          </button>
        </div>
      </div>

      <ExecutionHistory
        workflowId={workflowId}
        executions={executionHistory}
        activeExecutionId={executionId}
        isRunning={isRunning}
        onRefresh={onRefreshHistory}
        onLoad={onLoadHistory}
        onRetry={onReplayExecution ? handleOpenReplayModal : undefined}
      />

      {/* Replay Modal */}
      {replayModalState.isOpen && workflowId && replayModalState.executionId && (
        <ReplayModal
          workflowId={workflowId}
          executionId={replayModalState.executionId}
          originalInput={replayModalState.input}
          onClose={handleCloseReplayModal}
          onReplay={handleReplay}
        />
      )}

      {/* Node Outputs */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Submitted Input Display */}
        {submittedInput && (
          <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3">
            <div className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">
              User Input
            </div>
            <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
              {submittedInput}
            </div>
          </div>
        )}

        {Array.from(nodeOutputs.entries()).map(([nodeId, output]) => (
          <NodeOutputCard
            key={nodeId}
            nodeId={nodeId}
            output={output}
            status={nodeStates.get(nodeId) || 'pending'}
            isExpanded={expandedNodes.has(nodeId)}
            onToggle={() => toggleNode(nodeId)}
          />
        ))}

      </div>
    </div>
  );
}

interface NodeOutputCardProps {
  nodeId: string;
  output: NodeOutput;
  status: NodeStatus;
  isExpanded: boolean;
  onToggle: () => void;
}

function NodeOutputCard({
  nodeId,
  output,
  status,
  isExpanded,
  onToggle,
}: NodeOutputCardProps) {
  const outputRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (isExpanded && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output.events, isExpanded]);

  const statusColors: Record<NodeStatus, string> = {
    pending: 'bg-gray-100 text-gray-600',
    running: 'bg-blue-100 text-blue-600 animate-pulse',
    complete: 'bg-green-100 text-green-600',
    error: 'bg-red-100 text-red-600',
    skipped: 'bg-gray-100 text-gray-400',
    waiting: 'bg-purple-100 text-purple-600 animate-pulse',
  };

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800
          hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
            {nodeId.slice(0, 8)}...
          </span>
        </div>
        <span
          className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[status]}`}
        >
          {status}
        </span>
      </button>

      {/* Content */}
      {isExpanded && (
        <div
          ref={outputRef}
          className="max-h-64 overflow-y-auto p-3 bg-white dark:bg-gray-900 text-sm"
        >
          {output.events.length === 0 ? (
            status === 'complete' && output.result !== undefined ? (
              <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap overflow-x-auto">
                {typeof output.result === 'string'
                  ? output.result
                  : JSON.stringify(output.result, null, 2)}
              </pre>
            ) : (
              <p className="text-gray-500 text-sm">Waiting for output...</p>
            )
          ) : (
            groupEvents(output.events).map((grouped, idx) => (
              <EventDisplay key={idx} event={grouped.event} result={grouped.result} />
            ))
          )}

          {output.error && (
            <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-red-600 dark:text-red-400 text-xs">
              Error: {output.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EventDisplay({ event, result }: { event: AgentEvent; result?: AgentEvent }) {
  const formatEventValue = (value: unknown): string => {
    if (typeof value === 'string') {
      return value;
    }
    if (value === null || value === undefined) {
      return '';
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  };

  switch (event.type) {
    case 'text-delta':
      const textContent = formatEventValue(event.content);
      return (
        <span className="text-gray-800 dark:text-gray-200">{textContent}</span>
      );

    case 'tool-use':
      const hasResult = result && result.type === 'tool-result';
      const toolResult = hasResult ? result as { type: 'tool-result'; name: string; result: string } : null;
      const toolResultText = toolResult ? formatEventValue(toolResult.result) : '';
      return (
        <div className="my-2 rounded text-xs overflow-hidden border border-blue-200 dark:border-blue-800">
          <div className="p-2 bg-blue-50 dark:bg-blue-900/20 flex items-center gap-2">
            <span className="font-medium text-blue-700 dark:text-blue-300">
              Tool: {event.name}
            </span>
            {hasResult ? (
              <span className="ml-auto text-green-600 dark:text-green-400">✓</span>
            ) : (
              <Loader2 size={12} className="ml-auto text-blue-500 animate-spin" />
            )}
          </div>
          <pre className="p-2 text-blue-600 dark:text-blue-400 overflow-x-auto bg-blue-50/50 dark:bg-blue-950/30">
            {JSON.stringify(event.input, null, 2)}
          </pre>
          {toolResult && (
            <div className="border-t border-green-200 dark:border-green-800">
              <div className="p-2 bg-green-50 dark:bg-green-900/20">
                <div className="font-medium text-green-700 dark:text-green-300 mb-1">Result</div>
                <pre className="text-green-600 dark:text-green-400 overflow-x-auto whitespace-pre-wrap">
                  {toolResultText.slice(0, 500)}
                  {toolResultText.length > 500 ? '...' : ''}
                </pre>
              </div>
            </div>
          )}
        </div>
      );

    case 'tool-result':
      const standaloneResultText = formatEventValue(event.result);
      // Standalone result (when not paired with tool-use)
      return (
        <div className="my-2 p-2 bg-green-50 dark:bg-green-900/20 rounded text-xs">
          <div className="font-medium text-green-700 dark:text-green-300">
            Result
          </div>
          <pre className="mt-1 text-green-600 dark:text-green-400 overflow-x-auto whitespace-pre-wrap">
            {standaloneResultText.slice(0, 500)}
            {standaloneResultText.length > 500 ? '...' : ''}
          </pre>
        </div>
      );

    case 'thinking':
      const thinkingText = formatEventValue(event.content);
      return (
        <div className="my-2 p-2 bg-purple-50 dark:bg-purple-900/20 rounded text-xs text-purple-700 dark:text-purple-300 italic">
          {thinkingText}
        </div>
      );

    case 'complete':
      const completeText = formatEventValue(event.result);
      return (
        <div className="my-2 p-2 bg-green-50 dark:bg-green-900/20 rounded text-xs text-green-700 dark:text-green-300">
          Completed: {completeText.slice(0, 200)}
          {completeText.length > 200 ? '...' : ''}
        </div>
      );

    case 'error':
      return (
        <div className="my-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs text-red-700 dark:text-red-300">
          Error: {event.message}
        </div>
      );

    default:
      return null;
  }
}

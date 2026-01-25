import { useRef, useEffect, useState, memo } from 'react';
import {
  ChevronDown,
  ArrowDown,
  ArrowUp,
  Timer,
  Clock,
  Sparkles,
  Code2,
  GitBranch,
  Merge,
  ArrowRightCircle,
  CheckCircle2,
  Code,
  UserCheck,
  HelpCircle,
  MessageSquare,
} from 'lucide-react';
import { AgentEvent, NodeStatus, NodeType } from '../../types/workflow';
import { EventItem, GroupedEvent } from './EventItem';
import { StatusIndicator, StatusBadge, getStatusColors } from './StatusIndicator';
import { MiniBranchIndicator } from './BranchIndicator';

interface NodeOutput {
  nodeId: string;
  nodeName?: string;
  events: AgentEvent[];
  result?: unknown;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

interface LogViewerProps {
  submittedInput: string | null;
  nodeOutputs: Map<string, NodeOutput>;
  nodeStates: Map<string, NodeStatus>;
  nodeTypes?: Map<string, NodeType>;
  selectedNodeId: string | null;
  onNodeSelect: (nodeId: string | null) => void;
  branchResults?: Map<string, boolean>;
}

// Node type icon mapping
const nodeTypeIcons: Record<string, typeof Sparkles> = {
  'claude-agent': Sparkles,
  'codex-agent': Code2,
  condition: GitBranch,
  merge: Merge,
  input: ArrowRightCircle,
  output: CheckCircle2,
  javascript: Code,
  approval: UserCheck,
};

/**
 * Groups tool-use events with their corresponding tool-result events.
 * Tool results are matched by their name (tool_use_id) to tool-use id, regardless of order.
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

function formatDuration(startedAt: number, completedAt?: number): string {
  const end = completedAt || Date.now();
  const durationMs = end - startedAt;

  if (durationMs < 1000) return `${durationMs}ms`;
  if (durationMs < 60000) return `${(durationMs / 1000).toFixed(1)}s`;
  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.floor((durationMs % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function LogViewerComponent({
  submittedInput,
  nodeOutputs,
  nodeStates,
  nodeTypes = new Map(),
  selectedNodeId,
  onNodeSelect,
  branchResults = new Map(),
}: LogViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Auto-expand running and waiting nodes
  useEffect(() => {
    const activeNodes = Array.from(nodeStates.entries())
      .filter(([_, status]) => status === 'running' || status === 'waiting')
      .map(([nodeId]) => nodeId);

    if (activeNodes.length > 0) {
      setExpandedNodes((prev) => {
        const next = new Set(prev);
        activeNodes.forEach((id) => next.add(id));
        return next;
      });
    }
  }, [nodeStates]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [nodeOutputs, autoScroll]);

  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setAutoScroll(isAtBottom);
    }
  };

  // Expand all nodes
  const expandAll = () => {
    setExpandedNodes(new Set(Array.from(nodeOutputs.keys())));
  };

  // Collapse all nodes
  const collapseAll = () => {
    setExpandedNodes(new Set());
  };

  // Filter nodes if one is selected
  const displayNodes = selectedNodeId
    ? Array.from(nodeOutputs.entries()).filter(([id]) => id === selectedNodeId)
    : Array.from(nodeOutputs.entries());

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-gray-300">Execution Logs</h3>
          {selectedNodeId && (
            <button
              onClick={() => onNodeSelect(null)}
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              <span>(Show All)</span>
            </button>
          )}
          {displayNodes.length > 0 && (
            <span className="text-xs text-gray-500">
              ({displayNodes.length} node{displayNodes.length !== 1 ? 's' : ''})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Expand/Collapse all */}
          <div className="flex items-center border border-gray-700 rounded overflow-hidden">
            <button
              onClick={expandAll}
              className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
              title="Expand all"
            >
              <ArrowDown size={14} />
            </button>
            <button
              onClick={collapseAll}
              className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors border-l border-gray-700"
              title="Collapse all"
            >
              <ArrowUp size={14} />
            </button>
          </div>

          {/* Auto-scroll toggle */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`text-xs px-2 py-1.5 rounded transition-colors ${
              autoScroll
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Auto-scroll {autoScroll ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* Log content */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {/* Submitted Input Display */}
        {submittedInput && !selectedNodeId && (
          <div className="rounded-lg border border-cyan-500/30 bg-gradient-to-r from-cyan-950/40 to-blue-950/40 p-4 shadow-lg shadow-cyan-500/5">
            <div className="flex items-center gap-2 text-xs font-medium text-cyan-400 mb-2">
              <MessageSquare size={14} />
              User Input
            </div>
            <div className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
              {submittedInput}
            </div>
          </div>
        )}

        {displayNodes.length === 0 ? (
          !submittedInput ? (
            <div className="text-center text-gray-500 py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-800/50 flex items-center justify-center">
                <Sparkles size={24} className="text-gray-600" />
              </div>
              <p className="font-medium">No execution logs yet</p>
              <p className="text-sm mt-1 text-gray-600">
                Run the workflow to see logs here
              </p>
            </div>
          ) : null
        ) : (
          displayNodes.map(([nodeId, output]) => {
            const status = nodeStates.get(nodeId) || 'pending';
            const nodeType = nodeTypes.get(nodeId);
            const colors = getStatusColors(status);
            const isExpanded = expandedNodes.has(nodeId);
            const nodeName = output.nodeName || nodeId.slice(0, 8);
            const Icon = nodeType ? nodeTypeIcons[nodeType] || HelpCircle : HelpCircle;
            const branchResult = branchResults.get(nodeId);
            const isCondition = nodeType === 'condition';
            const isRunning = status === 'running';
            const isWaiting = status === 'waiting';
            const isComplete = status === 'complete';
            const isError = status === 'error';

            // Duration calculation
            const duration = output.startedAt
              ? formatDuration(output.startedAt, output.completedAt)
              : null;

            return (
              <div
                key={nodeId}
                className={`rounded-lg border overflow-hidden transition-all duration-200 ${colors.borderColor} ${
                  isRunning
                    ? 'shadow-lg shadow-blue-500/10 ring-1 ring-blue-500/20'
                    : isWaiting
                    ? 'shadow-lg shadow-purple-500/10 ring-1 ring-purple-500/20'
                    : isError
                    ? 'shadow-lg shadow-red-500/10'
                    : ''
                }`}
              >
                {/* Node Header */}
                <button
                  onClick={() => toggleNode(nodeId)}
                  className={`w-full flex items-center justify-between px-4 py-3 ${colors.bgColor} hover:brightness-110 transition-all`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Expand/Collapse chevron */}
                    <span
                      className={`${colors.color} transition-transform duration-200 ${
                        isExpanded ? 'rotate-0' : '-rotate-90'
                      }`}
                    >
                      <ChevronDown size={16} />
                    </span>

                    {/* Node type icon with status background */}
                    <div
                      className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all ${
                        isRunning
                          ? 'bg-blue-500/30 animate-pulse'
                          : isWaiting
                          ? 'bg-purple-500/30 animate-pulse'
                          : isComplete
                          ? 'bg-green-500/20'
                          : isError
                          ? 'bg-red-500/20'
                          : 'bg-gray-500/20'
                      }`}
                    >
                      <Icon
                        size={16}
                        className={`${colors.color} ${isRunning ? 'animate-pulse' : ''}`}
                      />
                    </div>

                    {/* Node name and time */}
                    <div className="flex flex-col items-start min-w-0">
                      <span className={`font-medium truncate ${colors.color}`}>
                        {nodeName}
                      </span>
                      {output.startedAt && (
                        <span className="text-[10px] text-gray-500 flex items-center gap-1">
                          <Clock size={10} />
                          {formatTime(output.startedAt)}
                        </span>
                      )}
                    </div>

                    {/* Running indicator */}
                    {isRunning && (
                      <div className="flex items-center gap-2 ml-2">
                        <span className="flex h-2 w-2 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                        </span>
                        <span className="text-xs text-blue-400 font-medium">Running</span>
                      </div>
                    )}

                    {/* Waiting indicator */}
                    {isWaiting && (
                      <div className="flex items-center gap-2 ml-2">
                        <span className="flex h-2 w-2 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500" />
                        </span>
                        <span className="text-xs text-purple-400 font-medium">
                          Awaiting approval
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Right side: metadata */}
                  <div className="flex items-center gap-3">
                    {/* Branch result */}
                    {isCondition && branchResult !== undefined && (
                      <MiniBranchIndicator condition={branchResult} />
                    )}

                    {/* Event count */}
                    {output.events.length > 0 && (
                      <span className="text-xs text-gray-500 bg-gray-800/50 px-2 py-0.5 rounded">
                        {output.events.length} events
                      </span>
                    )}

                    {/* Duration */}
                    {duration && (
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <Timer size={12} />
                        <span>{duration}</span>
                      </div>
                    )}

                    {/* Status badge */}
                    <StatusBadge status={status} />
                  </div>
                </button>

                {/* Node Events */}
                {isExpanded && (
                  <div className="px-4 py-3 bg-gray-900/50 border-t border-gray-800">
                    {output.events.length === 0 ? (
                      status === 'complete' && output.result !== undefined ? (
                        <div className="rounded-lg bg-green-950/30 border border-green-500/20 p-3">
                          <div className="text-xs font-medium text-green-400 mb-2 flex items-center gap-1">
                            <CheckCircle2 size={12} />
                            Result
                          </div>
                          <pre className="text-xs text-gray-300 whitespace-pre-wrap overflow-x-auto font-mono">
                            {typeof output.result === 'string'
                              ? output.result
                              : JSON.stringify(output.result, null, 2)}
                          </pre>
                        </div>
                      ) : status === 'running' || status === 'waiting' ? (
                        <div className="flex items-center gap-2 text-gray-400 py-2">
                          <StatusIndicator status={status} size="sm" />
                          <span className="text-sm">
                            {status === 'waiting'
                              ? 'Waiting for user approval...'
                              : 'Processing...'}
                          </span>
                        </div>
                      ) : (
                        <p className="text-gray-500 text-sm">Waiting for output...</p>
                      )
                    ) : (
                      <div className="space-y-1">
                        {groupEvents(output.events).map((grouped, idx) => (
                          <EventItem
                            key={idx}
                            event={grouped.event}
                            result={grouped.result}
                            index={idx}
                          />
                        ))}
                      </div>
                    )}

                    {/* Error display */}
                    {output.error && (
                      <div className="mt-3 p-3 rounded-lg bg-red-900/30 border border-red-500/30">
                        <p className="text-sm font-medium text-red-400 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-red-500" />
                          Error
                        </p>
                        <p className="text-xs text-red-300 mt-1 font-mono">
                          {output.error}
                        </p>
                      </div>
                    )}

                    {/* Final result for completed nodes */}
                    {status === 'complete' &&
                      output.result !== undefined &&
                      output.events.length > 0 && (
                        <div className="mt-3 p-3 rounded-lg bg-green-950/30 border border-green-500/20">
                          <div className="text-xs font-medium text-green-400 mb-2 flex items-center gap-1">
                            <CheckCircle2 size={12} />
                            Final Result
                          </div>
                          <pre className="text-xs text-gray-300 whitespace-pre-wrap overflow-x-auto font-mono max-h-48 overflow-y-auto">
                            {typeof output.result === 'string'
                              ? output.result
                              : JSON.stringify(output.result, null, 2)}
                          </pre>
                        </div>
                      )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export const LogViewer = memo(LogViewerComponent);

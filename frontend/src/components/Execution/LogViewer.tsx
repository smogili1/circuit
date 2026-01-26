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
  AlertCircle,
  X,
} from 'lucide-react';
import { AgentEvent, NodeStatus, NodeType } from '../../types/workflow';
import { EventItem, GroupedEvent } from './EventItem';
import { StatusBadge, getStatusColors } from './StatusIndicator';

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
    if (event.type === 'tool-result' && toolUseIds.has(event.name)) {
      continue;
    }
    grouped.push({ event });
  }

  return grouped;
}

function formatDuration(startedAt: number, completedAt?: number): string {
  const end = completedAt || Date.now();
  const ms = end - startedAt;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
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

  // Auto-expand running/waiting nodes
  useEffect(() => {
    const activeNodes = Array.from(nodeStates.entries())
      .filter(([_, status]) => status === 'running' || status === 'waiting')
      .map(([nodeId]) => nodeId);

    if (activeNodes.length > 0) {
      setExpandedNodes((prev) => new Set([...prev, ...activeNodes]));
    }
  }, [nodeStates]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [nodeOutputs, autoScroll]);

  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      next.has(nodeId) ? next.delete(nodeId) : next.add(nodeId);
      return next;
    });
  };

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
    }
  };

  const displayNodes = selectedNodeId
    ? Array.from(nodeOutputs.entries()).filter(([id]) => id === selectedNodeId)
    : Array.from(nodeOutputs.entries());

  // Count errors for banner
  const errorCount = Array.from(nodeStates.values()).filter((s) => s === 'error').length;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-950 min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Logs</h3>
          {selectedNodeId && (
            <button
              onClick={() => onNodeSelect(null)}
              className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 bg-blue-100 dark:bg-blue-500/10 px-2 py-0.5 rounded"
            >
              <X size={12} />
              Clear filter
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-gray-300 dark:border-gray-700 rounded overflow-hidden">
            <button
              onClick={() => setExpandedNodes(new Set(Array.from(nodeOutputs.keys())))}
              className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
              title="Expand all"
            >
              <ArrowDown size={14} />
            </button>
            <button
              onClick={() => setExpandedNodes(new Set())}
              className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 border-l border-gray-300 dark:border-gray-700"
              title="Collapse all"
            >
              <ArrowUp size={14} />
            </button>
          </div>
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`text-xs px-2 py-1 rounded transition-colors ${
              autoScroll ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            Auto-scroll
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {errorCount > 0 && !selectedNodeId && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-100 dark:bg-red-950/50 border-b border-red-300 dark:border-red-500/30 text-red-600 dark:text-red-400">
          <AlertCircle size={16} />
          <span className="text-sm font-medium">
            {errorCount} node{errorCount !== 1 ? 's' : ''} failed
          </span>
        </div>
      )}

      {/* Content */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-3 min-w-0">
        {/* User Input */}
        {submittedInput && !selectedNodeId && (
          <div className="rounded-lg border border-cyan-300 dark:border-cyan-500/30 bg-cyan-50 dark:bg-cyan-950/20 p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-cyan-600 dark:text-cyan-400 mb-2">
              <MessageSquare size={14} />
              Input
            </div>
            <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{submittedInput}</div>
          </div>
        )}

        {/* Empty State */}
        {displayNodes.length === 0 && !submittedInput && (
          <div className="text-center text-gray-500 py-16">
            <Sparkles size={32} className="mx-auto mb-3 text-gray-400 dark:text-gray-600" />
            <p className="font-medium">No logs yet</p>
            <p className="text-sm mt-1 text-gray-400 dark:text-gray-600">Run the workflow to see execution logs</p>
          </div>
        )}

        {/* Node Cards */}
        {displayNodes.map(([nodeId, output]) => {
          const status = nodeStates.get(nodeId) || 'pending';
          const nodeType = nodeTypes.get(nodeId);
          const colors = getStatusColors(status);
          const isExpanded = expandedNodes.has(nodeId);
          const nodeName = output.nodeName || nodeId.slice(0, 8);
          const Icon = nodeType ? nodeTypeIcons[nodeType] || HelpCircle : HelpCircle;
          const branchResult = branchResults.get(nodeId);
          const isRunning = status === 'running';
          const isWaiting = status === 'waiting';
          const isError = status === 'error';
          const duration = output.startedAt ? formatDuration(output.startedAt, output.completedAt) : null;

          // Status-based card styling
          const cardBorder = isError
            ? 'border-red-400 dark:border-red-500/50'
            : isRunning
            ? 'border-blue-400 dark:border-blue-500/50'
            : isWaiting
            ? 'border-purple-400 dark:border-purple-500/50'
            : colors.borderColor;

          const cardShadow = isError
            ? 'shadow-lg shadow-red-200 dark:shadow-red-500/10'
            : isRunning
            ? 'shadow-lg shadow-blue-200 dark:shadow-blue-500/10'
            : isWaiting
            ? 'shadow-lg shadow-purple-200 dark:shadow-purple-500/10'
            : '';

          return (
            <div
              key={nodeId}
              className={`rounded-lg border overflow-hidden transition-all ${cardBorder} ${cardShadow}`}
            >
              {/* Node Header */}
              <button
                onClick={() => toggleNode(nodeId)}
                className={`w-full flex items-center justify-between px-4 py-3 ${colors.bgColor} hover:brightness-110 transition-all`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <ChevronDown
                    size={16}
                    className={`${colors.color} transition-transform ${isExpanded ? '' : '-rotate-90'}`}
                  />

                  {/* Icon */}
                  <div
                    className={`flex items-center justify-center w-7 h-7 rounded-md ${
                      isRunning
                        ? 'bg-blue-100 dark:bg-blue-500/30'
                        : isWaiting
                        ? 'bg-purple-100 dark:bg-purple-500/30'
                        : isError
                        ? 'bg-red-100 dark:bg-red-500/30'
                        : 'bg-gray-200 dark:bg-gray-700/50'
                    }`}
                  >
                    <Icon size={14} className={colors.color} />
                  </div>

                  {/* Name + Time */}
                  <div className="flex flex-col items-start min-w-0">
                    <span className={`font-medium truncate ${colors.color}`}>{nodeName}</span>
                    {output.startedAt && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
                        <Clock size={9} />
                        {formatTime(output.startedAt)}
                      </span>
                    )}
                  </div>

                  {/* Running/Waiting indicator */}
                  {(isRunning || isWaiting) && (
                    <span className="flex items-center gap-1.5 ml-2">
                      <span className="relative flex h-2 w-2">
                        <span
                          className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${
                            isRunning ? 'bg-blue-400' : 'bg-purple-400'
                          }`}
                        />
                        <span
                          className={`relative inline-flex h-2 w-2 rounded-full ${
                            isRunning ? 'bg-blue-500' : 'bg-purple-500'
                          }`}
                        />
                      </span>
                      <span className={`text-xs font-medium ${isRunning ? 'text-blue-600 dark:text-blue-400' : 'text-purple-600 dark:text-purple-400'}`}>
                        {isRunning ? 'Running' : 'Waiting'}
                      </span>
                    </span>
                  )}
                </div>

                {/* Right side */}
                <div className="flex items-center gap-2">
                  {/* Branch result */}
                  {nodeType === 'condition' && branchResult !== undefined && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        branchResult
                          ? 'bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400 border border-green-300 dark:border-green-500/30'
                          : 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-500/30'
                      }`}
                    >
                      {branchResult ? 'TRUE' : 'FALSE'}
                    </span>
                  )}

                  {/* Event count */}
                  {output.events.length > 0 && (
                    <span className="text-[10px] text-gray-500 bg-gray-200 dark:bg-gray-800/80 px-1.5 py-0.5 rounded">
                      {output.events.length}
                    </span>
                  )}

                  {/* Duration */}
                  {duration && (
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <Timer size={11} />
                      {duration}
                    </span>
                  )}

                  <StatusBadge status={status} />
                </div>
              </button>

              {/* Content */}
              {isExpanded && (
                <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/70 border-t border-gray-200 dark:border-gray-800/50">
                  {output.events.length === 0 ? (
                    status === 'complete' && output.result !== undefined ? (
                      <div className="rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-500/20 p-3">
                        <div className="text-xs font-medium text-green-600 dark:text-green-400 mb-2 flex items-center gap-1">
                          <CheckCircle2 size={12} />
                          Result
                        </div>
                        <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-all font-mono overflow-x-auto max-h-40">
                          {typeof output.result === 'string'
                            ? output.result
                            : JSON.stringify(output.result, null, 2)}
                        </pre>
                      </div>
                    ) : isRunning || isWaiting ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {isWaiting ? 'Waiting for approval...' : 'Processing...'}
                      </p>
                    ) : (
                      <p className="text-sm text-gray-500">Waiting for output...</p>
                    )
                  ) : (
                    <div className="space-y-1">
                      {groupEvents(output.events).map((grouped, idx) => (
                        <EventItem key={idx} event={grouped.event} result={grouped.result} index={idx} />
                      ))}
                    </div>
                  )}

                  {/* Error */}
                  {output.error && (
                    <div className="mt-3 p-3 rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-500/30">
                      <p className="text-sm font-medium text-red-600 dark:text-red-400 flex items-center gap-1">
                        <AlertCircle size={14} />
                        Error
                      </p>
                      <p className="text-xs text-red-500 dark:text-red-300 mt-1 font-mono">{output.error}</p>
                    </div>
                  )}

                  {/* Final result */}
                  {status === 'complete' && output.result !== undefined && output.events.length > 0 && (
                    <div className="mt-3 p-3 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-500/20">
                      <div className="text-xs font-medium text-green-600 dark:text-green-400 mb-2 flex items-center gap-1">
                        <CheckCircle2 size={12} />
                        Result
                      </div>
                      <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-all font-mono max-h-40 overflow-auto">
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
        })}
      </div>
    </div>
  );
}

export const LogViewer = memo(LogViewerComponent);

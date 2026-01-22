import { useRef, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { AgentEvent, NodeStatus } from '../../types/workflow';
import { EventItem, GroupedEvent } from './EventItem';

interface NodeOutput {
  nodeId: string;
  nodeName?: string;
  events: AgentEvent[];
  result?: unknown;
  error?: string;
}

interface LogViewerProps {
  submittedInput: string | null;
  nodeOutputs: Map<string, NodeOutput>;
  nodeStates: Map<string, NodeStatus>;
  selectedNodeId: string | null;
  onNodeSelect: (nodeId: string | null) => void;
}

const statusColors: Record<NodeStatus, { bg: string; text: string; border: string }> = {
  pending: { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30' },
  running: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
  complete: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' },
  error: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
  skipped: { bg: 'bg-gray-500/10', text: 'text-gray-500', border: 'border-gray-500/20' },
  waiting: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
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

export function LogViewer({
  submittedInput,
  nodeOutputs,
  nodeStates,
  selectedNodeId,
  onNodeSelect,
}: LogViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Auto-expand running nodes
  useEffect(() => {
    const runningNodes = Array.from(nodeStates.entries())
      .filter(([_, status]) => status === 'running')
      .map(([nodeId]) => nodeId);

    if (runningNodes.length > 0) {
      setExpandedNodes(prev => {
        const next = new Set(prev);
        runningNodes.forEach(id => next.add(id));
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
    setExpandedNodes(prev => {
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

  // Filter nodes if one is selected
  const displayNodes = selectedNodeId
    ? Array.from(nodeOutputs.entries()).filter(([id]) => id === selectedNodeId)
    : Array.from(nodeOutputs.entries());

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
        <h3 className="text-sm font-medium text-gray-300">
          Execution Logs
          {selectedNodeId && (
            <button
              onClick={() => onNodeSelect(null)}
              className="ml-2 text-xs text-blue-400 hover:text-blue-300"
            >
              (Show All)
            </button>
          )}
        </h3>
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className={`text-xs px-2 py-1 rounded ${
            autoScroll
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          Auto-scroll {autoScroll ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Log content */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {/* Submitted Input Display */}
        {submittedInput && !selectedNodeId && (
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
            <div className="text-xs font-medium text-blue-400 mb-2">
              User Input
            </div>
            <div className="text-sm text-gray-200 whitespace-pre-wrap">
              {submittedInput}
            </div>
          </div>
        )}

        {displayNodes.length === 0 ? (
          !submittedInput ? (
            <div className="text-center text-gray-500 py-8">
              <p>No execution logs yet.</p>
              <p className="text-sm mt-1">Run the workflow to see logs here.</p>
            </div>
          ) : null
        ) : (
          displayNodes.map(([nodeId, output]) => {
            const status = nodeStates.get(nodeId) || 'pending';
            const colors = statusColors[status];
            const isExpanded = expandedNodes.has(nodeId);
            const nodeName = output.nodeName || nodeId.slice(0, 8);

            return (
              <div
                key={nodeId}
                className={`rounded-lg border ${colors.border} overflow-hidden`}
              >
                {/* Node Header */}
                <button
                  onClick={() => toggleNode(nodeId)}
                  className={`w-full flex items-center justify-between px-4 py-3 ${colors.bg} hover:opacity-90 transition-opacity`}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown size={16} className={colors.text} />
                    ) : (
                      <ChevronRight size={16} className={colors.text} />
                    )}
                    <span className={`font-medium ${colors.text}`}>
                      {nodeName}
                    </span>
                    {status === 'running' && (
                      <span className="flex items-center gap-1 text-xs text-blue-400">
                        <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                        Running
                      </span>
                    )}
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${colors.bg} ${colors.text}`}>
                    {status}
                  </span>
                </button>

                {/* Node Events */}
                {isExpanded && (
                  <div className="px-4 py-3 bg-gray-900/50 border-t border-gray-800">
                    {output.events.length === 0 ? (
                      status === 'complete' && output.result !== undefined ? (
                        <pre className="text-xs text-gray-300 whitespace-pre-wrap overflow-x-auto font-mono">
                          {typeof output.result === 'string'
                            ? output.result
                            : JSON.stringify(output.result, null, 2)}
                        </pre>
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

                    {output.error && (
                      <div className="mt-3 p-3 rounded-lg bg-red-900/30 border border-red-500/30">
                        <p className="text-sm font-medium text-red-400">Error</p>
                        <p className="text-xs text-red-300 mt-1">{output.error}</p>
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

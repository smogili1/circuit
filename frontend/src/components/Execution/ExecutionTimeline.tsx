import { NodeStatus, WorkflowNode } from '../../types/workflow';

interface ExecutionTimelineProps {
  nodes: WorkflowNode[];
  nodeStates: Map<string, NodeStatus>;
  selectedNodeId: string | null;
  onNodeSelect: (nodeId: string | null) => void;
}

const statusColors: Record<NodeStatus, string> = {
  pending: 'bg-gray-500',
  running: 'bg-blue-500 animate-pulse',
  complete: 'bg-green-500',
  error: 'bg-red-500',
  skipped: 'bg-gray-400',
  waiting: 'bg-purple-500 animate-pulse',
};

export function ExecutionTimeline({
  nodes,
  nodeStates,
  selectedNodeId,
  onNodeSelect,
}: ExecutionTimelineProps) {
  // Filter out input nodes as they complete immediately
  const executionNodes = nodes.filter(n => n.type !== 'input');

  const completed = executionNodes.filter(n => {
    const status = nodeStates.get(n.id);
    return status === 'complete' || status === 'error' || status === 'skipped';
  }).length;

  const running = executionNodes.filter(n => nodeStates.get(n.id) === 'running').length;
  const total = executionNodes.length;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  return (
    <div className="bg-gray-900 border-b border-gray-800 px-4 py-3">
      {/* Progress bar */}
      <div className="flex items-center gap-4 mb-3">
        <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-sm text-gray-400 whitespace-nowrap">
          {completed}/{total} nodes
          {running > 0 && (
            <span className="ml-2 text-blue-400">
              ({running} running)
            </span>
          )}
        </span>
      </div>

      {/* Node indicators */}
      <div className="flex items-center gap-2 flex-wrap">
        {executionNodes.map((node) => {
          const status = nodeStates.get(node.id) || 'pending';
          const isSelected = selectedNodeId === node.id;

          return (
            <button
              key={node.id}
              onClick={() => onNodeSelect(isSelected ? null : node.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all
                ${isSelected
                  ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              title={`${node.data.name}: ${status}`}
            >
              <span className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
              <span className="max-w-24 truncate">
                {node.data.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

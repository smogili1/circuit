import { CheckCircle2, XCircle, AlertCircle, PlayCircle } from 'lucide-react';
import { ReplayCheckpoint } from '../../types/workflow';

interface ReplayNodeSelectorProps {
  checkpoints: ReplayCheckpoint[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

const statusIcons: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  complete: CheckCircle2,
  error: XCircle,
  waiting: AlertCircle,
};

const statusColors: Record<string, string> = {
  complete: 'text-green-600 dark:text-green-400',
  error: 'text-red-600 dark:text-red-400',
  waiting: 'text-yellow-600 dark:text-yellow-400',
  running: 'text-blue-600 dark:text-blue-400',
};

export function ReplayNodeSelector({ checkpoints, selectedNodeId, onSelectNode }: ReplayNodeSelectorProps) {
  if (checkpoints.length === 0) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
        No replay points available for this execution.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
        Select a node to replay from:
      </h3>
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {checkpoints.map((checkpoint) => {
          const Icon = statusIcons[checkpoint.status] || PlayCircle;
          const statusColor = statusColors[checkpoint.status] || 'text-gray-600 dark:text-gray-400';
          const isSelected = selectedNodeId === checkpoint.nodeId;
          const isReplayable = checkpoint.replayable;

          return (
            <button
              key={checkpoint.nodeId}
              onClick={() => isReplayable && onSelectNode(checkpoint.nodeId)}
              disabled={!isReplayable}
              className={`w-full text-left rounded-lg border p-3 transition-all ${
                isSelected
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-500/20'
                  : isReplayable
                    ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-300 hover:bg-gray-50 dark:hover:bg-gray-750'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 opacity-60 cursor-not-allowed'
              }`}
            >
              <div className="flex items-start gap-3">
                <Icon className={`flex-shrink-0 mt-0.5 ${statusColor}`} size={18} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {checkpoint.nodeName}
                    </h4>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      checkpoint.status === 'complete'
                        ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400'
                        : checkpoint.status === 'error'
                          ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400'
                    }`}>
                      {checkpoint.status}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {checkpoint.nodeId}
                  </div>
                  {!isReplayable && checkpoint.reason && (
                    <div className="text-xs text-red-600 dark:text-red-400 mt-2 flex items-start gap-1">
                      <XCircle size={12} className="flex-shrink-0 mt-0.5" />
                      <span>{checkpoint.reason}</span>
                    </div>
                  )}
                  {isReplayable && (
                    <div className="text-xs text-green-600 dark:text-green-400 mt-2 flex items-center gap-1">
                      <CheckCircle2 size={12} />
                      <span>Can replay from this point</span>
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

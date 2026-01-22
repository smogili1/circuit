import { ExecutionSummary } from '../../types/workflow';
import { RefreshCw, History } from 'lucide-react';

interface ExecutionHistoryProps {
  workflowId: string | null;
  executions: ExecutionSummary[];
  activeExecutionId: string | null;
  isRunning: boolean;
  onRefresh: (workflowId: string) => void;
  onLoad: (workflowId: string, executionId: string) => void;
}

function formatTimestamp(value?: string): string {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
}

function formatDuration(startedAt?: string, completedAt?: string): string {
  if (!startedAt || !completedAt) return '—';
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return '—';
  const totalSeconds = Math.max(0, Math.floor((end - start) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...`;
}

const statusStyles: Record<string, string> = {
  running: 'bg-blue-100 text-blue-700',
  complete: 'bg-green-100 text-green-700',
  error: 'bg-red-100 text-red-700',
  interrupted: 'bg-yellow-100 text-yellow-700',
};

export function ExecutionHistory({
  workflowId,
  executions,
  activeExecutionId,
  isRunning,
  onRefresh,
  onLoad,
}: ExecutionHistoryProps) {
  const handleRefresh = () => {
    if (workflowId) {
      onRefresh(workflowId);
    }
  };

  return (
    <div className="h-full flex flex-col p-4 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
          <History size={16} />
          Execution History
        </div>
        <button
          onClick={handleRefresh}
          disabled={!workflowId}
          className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white disabled:opacity-50"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {executions.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          No saved executions yet.
        </p>
      ) : (
        <div className="flex-1 space-y-2 overflow-y-auto">
          {executions.map((execution) => {
            const isActive = execution.executionId === activeExecutionId;
            const statusClass =
              statusStyles[execution.status] || 'bg-gray-100 text-gray-600';
            const isClickable = !isRunning && workflowId;

            return (
              <button
                key={execution.executionId}
                onClick={() => workflowId && onLoad(workflowId, execution.executionId)}
                disabled={!isClickable}
                className={`w-full text-left rounded-md border px-3 py-2 text-xs transition-colors ${
                  isActive
                    ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'
                } ${isClickable ? 'cursor-pointer hover:border-blue-300 hover:bg-gray-50 dark:hover:bg-gray-800' : 'cursor-default opacity-70'}`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium text-gray-800 dark:text-gray-100">
                    {formatTimestamp(execution.startedAt)}
                  </div>
                  <span className={`px-2 py-0.5 rounded ${statusClass}`}>
                    {execution.status}
                  </span>
                </div>
                <div className="mt-1 text-gray-600 dark:text-gray-400">
                  Duration: {formatDuration(execution.startedAt, execution.completedAt)}
                </div>
                {execution.input && (
                  <div className="mt-1 text-gray-500 dark:text-gray-400">
                    {truncate(execution.input, 120)}
                  </div>
                )}
                {execution.error && (
                  <div className="mt-1 text-red-600 dark:text-red-400">
                    {execution.error}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

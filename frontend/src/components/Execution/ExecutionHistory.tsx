import { useNavigate } from 'react-router-dom';
import { ExecutionSummary } from '../../types/workflow';
import { RefreshCw, History, RotateCcw } from 'lucide-react';

interface ExecutionHistoryProps {
  workflowId: string | null;
  executions: ExecutionSummary[];
  activeExecutionId: string | null;
  isRunning: boolean;
  onRefresh: (workflowId: string) => void;
  onLoad: (workflowId: string, executionId: string) => void;
  onRetry?: (workflowId: string, executionId: string, input: string) => void;
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
  running: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400',
  complete: 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400',
  error: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400',
  interrupted: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400',
};

export function ExecutionHistory({
  workflowId,
  executions,
  activeExecutionId,
  isRunning: _isRunning,
  onRefresh,
  onLoad,
  onRetry,
}: ExecutionHistoryProps) {
  const navigate = useNavigate();

  const handleRefresh = () => {
    if (workflowId) {
      onRefresh(workflowId);
    }
  };

  return (
    <div className="h-full flex flex-col p-4 border-b border-gray-200 dark:border-gray-800">
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
              statusStyles[execution.status] || 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400';
            // Allow clicking to view any execution, even while another is running
            const isClickable = !!workflowId;

            const canRetry = onRetry && (execution.status === 'complete' || execution.status === 'error');

            return (
              <div
                key={execution.executionId}
                className={`rounded-md border px-3 py-2 text-xs transition-colors ${
                  isActive
                    ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'
                }`}
              >
                <button
                  onClick={() => {
                    if (workflowId) {
                      navigate(`/workflows/${workflowId}/executions/${execution.executionId}`);
                      onLoad(workflowId, execution.executionId);
                    }
                  }}
                  disabled={!isClickable}
                  className={`w-full text-left ${isClickable ? 'cursor-pointer' : 'cursor-default opacity-70'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-gray-800 dark:text-gray-100">
                      {formatTimestamp(execution.startedAt)}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded ${statusClass}`}>
                        {execution.status}
                      </span>
                      {canRetry && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (workflowId) {
                              onRetry(workflowId, execution.executionId, execution.input);
                            }
                          }}
                          title="Retry from step"
                          className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400
                            hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                        >
                          <RotateCcw size={14} />
                        </button>
                      )}
                    </div>
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

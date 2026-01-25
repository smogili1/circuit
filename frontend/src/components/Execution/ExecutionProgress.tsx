import { memo, useMemo } from 'react';
import {
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  Timer,
  SkipForward,
} from 'lucide-react';
import { NodeStatus, WorkflowNode } from '../../types/workflow';
import { StatusDot } from './StatusIndicator';
import { BranchPath, ExecutionPath } from './BranchIndicator';

interface ExecutionProgressProps {
  nodes: WorkflowNode[];
  nodeStates: Map<string, NodeStatus>;
  branchPaths?: BranchPath[];
  executionStartedAt?: number;
  isRunning: boolean;
  className?: string;
}

interface ProgressStats {
  total: number;
  completed: number;
  running: number;
  errors: number;
  skipped: number;
  waiting: number;
  pending: number;
  progress: number;
}

function calculateStats(
  nodes: WorkflowNode[],
  nodeStates: Map<string, NodeStatus>
): ProgressStats {
  // Filter out input nodes as they complete immediately
  const executionNodes = nodes.filter((n) => n.type !== 'input');
  const total = executionNodes.length;

  let completed = 0;
  let running = 0;
  let errors = 0;
  let skipped = 0;
  let waiting = 0;
  let pending = 0;

  for (const node of executionNodes) {
    const status = nodeStates.get(node.id);
    switch (status) {
      case 'complete':
        completed++;
        break;
      case 'running':
        running++;
        break;
      case 'error':
        errors++;
        break;
      case 'skipped':
        skipped++;
        break;
      case 'waiting':
        waiting++;
        break;
      default:
        pending++;
    }
  }

  const finishedCount = completed + errors + skipped;
  const progress = total > 0 ? (finishedCount / total) * 100 : 0;

  return {
    total,
    completed,
    running,
    errors,
    skipped,
    waiting,
    pending,
    progress,
  };
}

function formatElapsedTime(startedAt: number): string {
  const elapsed = Date.now() - startedAt;
  if (elapsed < 1000) return '< 1s';
  if (elapsed < 60000) return `${Math.floor(elapsed / 1000)}s`;
  const minutes = Math.floor(elapsed / 60000);
  const seconds = Math.floor((elapsed % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function ExecutionProgressComponent({
  nodes,
  nodeStates,
  branchPaths = [],
  executionStartedAt,
  isRunning,
  className = '',
}: ExecutionProgressProps) {
  const stats = useMemo(
    () => calculateStats(nodes, nodeStates),
    [nodes, nodeStates]
  );

  const elapsedTime = useMemo(() => {
    if (!executionStartedAt) return null;
    return formatElapsedTime(executionStartedAt);
  }, [executionStartedAt, isRunning]);

  const hasActivity = stats.running > 0 || stats.waiting > 0;
  const isComplete = stats.progress === 100;
  const hasErrors = stats.errors > 0;

  return (
    <div className={`bg-gray-900 border-b border-gray-800 ${className}`}>
      {/* Main progress section */}
      <div className="px-4 py-3">
        {/* Header with stats */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            {/* Activity indicator */}
            {hasActivity && (
              <div className="flex items-center gap-2">
                <Activity
                  size={16}
                  className="text-blue-400 animate-pulse"
                />
                <span className="text-sm font-medium text-blue-400">
                  {stats.running > 0 ? `${stats.running} running` : ''}
                  {stats.running > 0 && stats.waiting > 0 ? ', ' : ''}
                  {stats.waiting > 0 ? `${stats.waiting} waiting` : ''}
                </span>
              </div>
            )}

            {/* Completion status */}
            {isComplete && !hasErrors && (
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle size={16} />
                <span className="text-sm font-medium">Complete</span>
              </div>
            )}

            {/* Error status */}
            {hasErrors && (
              <div className="flex items-center gap-2 text-red-400">
                <XCircle size={16} />
                <span className="text-sm font-medium">
                  {stats.errors} error{stats.errors !== 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>

          {/* Elapsed time */}
          {elapsedTime && (
            <div className="flex items-center gap-1.5 text-sm text-gray-400">
              <Timer size={14} />
              <span>{elapsedTime}</span>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="relative h-2.5 bg-gray-800 rounded-full overflow-hidden mb-3">
          {/* Completed progress */}
          <div
            className={`absolute inset-y-0 left-0 transition-all duration-500 ease-out ${
              hasErrors
                ? 'bg-gradient-to-r from-green-500 via-green-500 to-red-500'
                : 'bg-gradient-to-r from-blue-500 to-green-500'
            }`}
            style={{ width: `${stats.progress}%` }}
          />

          {/* Running animation overlay */}
          {hasActivity && (
            <div
              className="absolute inset-y-0 bg-white/20 animate-pulse"
              style={{
                left: `${stats.progress}%`,
                width: `${Math.min(10, 100 - stats.progress)}%`,
              }}
            />
          )}

          {/* Stripe animation for running state */}
          {isRunning && !isComplete && (
            <div
              className="absolute inset-0 opacity-30"
              style={{
                background: `repeating-linear-gradient(
                  -45deg,
                  transparent,
                  transparent 8px,
                  rgba(255,255,255,0.1) 8px,
                  rgba(255,255,255,0.1) 16px
                )`,
                animation: 'progress-stripe 1s linear infinite',
              }}
            />
          )}
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Completed */}
            <div className="flex items-center gap-1.5">
              <StatusDot status="complete" animated={false} />
              <span className="text-xs text-gray-400">
                {stats.completed} completed
              </span>
            </div>

            {/* Errors */}
            {stats.errors > 0 && (
              <div className="flex items-center gap-1.5">
                <StatusDot status="error" animated={false} />
                <span className="text-xs text-red-400">
                  {stats.errors} failed
                </span>
              </div>
            )}

            {/* Skipped */}
            {stats.skipped > 0 && (
              <div className="flex items-center gap-1.5">
                <SkipForward size={12} className="text-gray-500" />
                <span className="text-xs text-gray-500">
                  {stats.skipped} skipped
                </span>
              </div>
            )}

            {/* Pending */}
            {stats.pending > 0 && (
              <div className="flex items-center gap-1.5">
                <Clock size={12} className="text-gray-500" />
                <span className="text-xs text-gray-500">
                  {stats.pending} pending
                </span>
              </div>
            )}
          </div>

          {/* Overall progress */}
          <span className="text-sm text-gray-400 font-medium">
            {stats.completed + stats.errors + stats.skipped}/{stats.total} nodes
          </span>
        </div>
      </div>

      {/* Branch paths section */}
      {branchPaths.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-800/50 bg-gray-900/50">
          <ExecutionPath branchPaths={branchPaths} />
        </div>
      )}

      {/* CSS for stripe animation */}
      <style>{`
        @keyframes progress-stripe {
          0% { background-position: 0 0; }
          100% { background-position: 32px 0; }
        }
      `}</style>
    </div>
  );
}

export const ExecutionProgress = memo(ExecutionProgressComponent);

// Compact version for sidebar/toolbar
interface CompactProgressProps {
  nodes: WorkflowNode[];
  nodeStates: Map<string, NodeStatus>;
  className?: string;
}

function CompactProgressComponent({
  nodes,
  nodeStates,
  className = '',
}: CompactProgressProps) {
  const stats = useMemo(
    () => calculateStats(nodes, nodeStates),
    [nodes, nodeStates]
  );

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Mini progress bar */}
      <div className="w-20 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            stats.errors > 0
              ? 'bg-red-500'
              : stats.progress === 100
              ? 'bg-green-500'
              : 'bg-blue-500'
          }`}
          style={{ width: `${stats.progress}%` }}
        />
      </div>

      {/* Count */}
      <span className="text-xs text-gray-400">
        {stats.completed}/{stats.total}
      </span>

      {/* Status indicator */}
      {stats.running > 0 && (
        <StatusDot status="running" size="sm" />
      )}
      {stats.errors > 0 && (
        <StatusDot status="error" size="sm" animated={false} />
      )}
    </div>
  );
}

export const CompactProgress = memo(CompactProgressComponent);

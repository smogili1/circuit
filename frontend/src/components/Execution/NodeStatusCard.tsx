import { memo, useMemo } from 'react';
import {
  ChevronDown,
  Clock,
  Timer,
  Sparkles,
  Code2,
  GitBranch,
  Merge,
  ArrowRightCircle,
  CheckCircle2,
  Code,
  UserCheck,
  HelpCircle,
} from 'lucide-react';
import { NodeStatus, NodeType } from '../../types/workflow';
import { StatusIndicator, StatusBadge, getStatusColors } from './StatusIndicator';
import { MiniBranchIndicator } from './BranchIndicator';

interface NodeStatusCardProps {
  nodeId: string;
  nodeName: string;
  nodeType?: NodeType;
  status: NodeStatus;
  isExpanded: boolean;
  onToggle: () => void;
  startedAt?: number;
  completedAt?: number;
  branchResult?: boolean;
  eventCount?: number;
  hasError?: boolean;
  children?: React.ReactNode;
  className?: string;
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

function formatDuration(startedAt: number, completedAt?: number): string {
  const end = completedAt || Date.now();
  const durationMs = end - startedAt;

  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  if (durationMs < 60000) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  }
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

function NodeStatusCardComponent({
  nodeName,
  nodeType,
  status,
  isExpanded,
  onToggle,
  startedAt,
  completedAt,
  branchResult,
  eventCount,
  children,
  className = '',
}: NodeStatusCardProps) {
  const colors = getStatusColors(status);
  const Icon = nodeType ? nodeTypeIcons[nodeType] || HelpCircle : HelpCircle;
  const isRunning = status === 'running';
  const isComplete = status === 'complete';
  const isError = status === 'error';
  const isWaiting = status === 'waiting';
  const isCondition = nodeType === 'condition';

  const duration = useMemo(() => {
    if (!startedAt) return null;
    return formatDuration(startedAt, completedAt);
  }, [startedAt, completedAt]);

  return (
    <div
      className={`rounded-lg border overflow-hidden transition-all duration-200 ${
        colors.borderColor
      } ${isRunning || isWaiting ? 'shadow-lg shadow-blue-500/10' : ''} ${className}`}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-4 py-3 ${colors.bgColor} hover:brightness-110 transition-all`}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Expand/Collapse chevron */}
          <span className={`${colors.color} transition-transform ${isExpanded ? 'rotate-0' : '-rotate-90'}`}>
            <ChevronDown size={16} />
          </span>

          {/* Node type icon */}
          <div
            className={`flex items-center justify-center w-8 h-8 rounded-lg ${
              isRunning
                ? 'bg-blue-500/30 animate-pulse'
                : isComplete
                ? 'bg-green-500/20'
                : isError
                ? 'bg-red-500/20'
                : isWaiting
                ? 'bg-purple-500/30 animate-pulse'
                : 'bg-gray-500/20'
            }`}
          >
            <Icon
              size={16}
              className={`${colors.color} ${isRunning ? 'animate-spin' : ''}`}
              style={isRunning ? { animationDuration: '3s' } : undefined}
            />
          </div>

          {/* Node name */}
          <div className="flex flex-col items-start min-w-0">
            <span className={`font-medium truncate ${colors.color}`}>
              {nodeName}
            </span>
            {startedAt && (
              <span className="text-[10px] text-gray-500 flex items-center gap-1">
                <Clock size={10} />
                {formatTime(startedAt)}
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
              <span className="text-xs text-purple-400 font-medium">Awaiting approval</span>
            </div>
          )}
        </div>

        {/* Right side: status, duration, branch result */}
        <div className="flex items-center gap-3">
          {/* Branch result indicator */}
          {isCondition && branchResult !== undefined && (
            <MiniBranchIndicator condition={branchResult} />
          )}

          {/* Event count */}
          {eventCount !== undefined && eventCount > 0 && (
            <span className="text-xs text-gray-500 bg-gray-800/50 px-2 py-0.5 rounded">
              {eventCount} events
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

      {/* Content */}
      {isExpanded && (
        <div className="px-4 py-3 bg-gray-900/50 border-t border-gray-800">
          {children || (
            <p className="text-gray-500 text-sm">
              {status === 'pending'
                ? 'Waiting to start...'
                : status === 'running'
                ? 'Processing...'
                : 'No details available'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export const NodeStatusCard = memo(NodeStatusCardComponent);

// Compact version for timeline
interface CompactNodeStatusProps {
  nodeId: string;
  nodeName: string;
  nodeType?: NodeType;
  status: NodeStatus;
  isSelected: boolean;
  onClick: () => void;
  branchResult?: boolean;
  className?: string;
}

function CompactNodeStatusComponent({
  nodeName,
  nodeType,
  status,
  isSelected,
  onClick,
  branchResult,
  className = '',
}: CompactNodeStatusProps) {
  const colors = getStatusColors(status);
  const Icon = nodeType ? nodeTypeIcons[nodeType] || HelpCircle : HelpCircle;
  const isCondition = nodeType === 'condition';

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
        isSelected
          ? 'bg-blue-600 text-white ring-2 ring-blue-400 ring-offset-2 ring-offset-gray-900'
          : `${colors.bgColor} ${colors.color} hover:brightness-125 border ${colors.borderColor}`
      } ${className}`}
      title={`${nodeName}: ${status}`}
    >
      {/* Status dot/indicator */}
      <StatusIndicator status={status} size="sm" />

      {/* Node type icon */}
      <Icon size={12} className={isSelected ? 'text-white' : colors.color} />

      {/* Node name */}
      <span className="max-w-24 truncate">{nodeName}</span>

      {/* Branch result */}
      {isCondition && branchResult !== undefined && (
        <MiniBranchIndicator condition={branchResult} />
      )}
    </button>
  );
}

export const CompactNodeStatus = memo(CompactNodeStatusComponent);

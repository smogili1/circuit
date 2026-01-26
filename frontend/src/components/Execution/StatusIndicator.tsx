import { memo } from 'react';
import {
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  SkipForward,
  Pause
} from 'lucide-react';
import { NodeStatus } from '../../types/workflow';

interface StatusIndicatorProps {
  status: NodeStatus;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  animated?: boolean;
  className?: string;
}

const iconSizes = {
  sm: 12,
  md: 16,
  lg: 20,
};

const statusConfig: Record<NodeStatus, {
  icon: typeof CheckCircle;
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
  pulseColor?: string;
}> = {
  pending: {
    icon: Clock,
    color: 'text-gray-500 dark:text-gray-400',
    bgColor: 'bg-gray-200 dark:bg-gray-500/20',
    borderColor: 'border-gray-300 dark:border-gray-500/30',
    label: 'Pending',
  },
  running: {
    icon: Loader2,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-500/20',
    borderColor: 'border-blue-300 dark:border-blue-500/40',
    label: 'Running',
    pulseColor: 'bg-blue-500',
  },
  complete: {
    icon: CheckCircle,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-500/20',
    borderColor: 'border-green-300 dark:border-green-500/40',
    label: 'Complete',
  },
  error: {
    icon: XCircle,
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-500/20',
    borderColor: 'border-red-300 dark:border-red-500/40',
    label: 'Error',
  },
  skipped: {
    icon: SkipForward,
    color: 'text-gray-500',
    bgColor: 'bg-gray-100 dark:bg-gray-500/10',
    borderColor: 'border-gray-300 dark:border-gray-500/20',
    label: 'Skipped',
  },
  waiting: {
    icon: Pause,
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-500/20',
    borderColor: 'border-purple-300 dark:border-purple-500/40',
    label: 'Waiting',
    pulseColor: 'bg-purple-500',
  },
};

function StatusIndicatorComponent({
  status,
  size = 'md',
  showLabel = false,
  animated = true,
  className = '',
}: StatusIndicatorProps) {
  const config = statusConfig[status];
  const Icon = config.icon;
  const iconSize = iconSizes[size];
  const isAnimated = animated && (status === 'running' || status === 'waiting');

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <div className="relative">
        {/* Pulse animation ring */}
        {isAnimated && config.pulseColor && (
          <span
            className={`absolute inset-0 rounded-full ${config.pulseColor} animate-ping opacity-30`}
            style={{ animationDuration: '1.5s' }}
          />
        )}

        {/* Icon */}
        <Icon
          size={iconSize}
          className={`${config.color} ${isAnimated && status === 'running' ? 'animate-spin' : ''} relative z-10`}
          style={isAnimated && status === 'running' ? { animationDuration: '1s' } : undefined}
        />
      </div>

      {showLabel && (
        <span className={`text-xs font-medium ${config.color}`}>
          {config.label}
        </span>
      )}
    </div>
  );
}

export const StatusIndicator = memo(StatusIndicatorComponent);

// Export a dot-style indicator for compact usage
interface StatusDotProps {
  status: NodeStatus;
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
  className?: string;
}

const dotSizes = {
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
  lg: 'w-3 h-3',
};

const dotColors: Record<NodeStatus, string> = {
  pending: 'bg-gray-500',
  running: 'bg-blue-500',
  complete: 'bg-green-500',
  error: 'bg-red-500',
  skipped: 'bg-gray-400',
  waiting: 'bg-purple-500',
};

function StatusDotComponent({
  status,
  size = 'md',
  animated = true,
  className = '',
}: StatusDotProps) {
  const isAnimated = animated && (status === 'running' || status === 'waiting');

  return (
    <span className={`relative flex ${className}`}>
      {isAnimated && (
        <span
          className={`absolute inline-flex h-full w-full rounded-full ${dotColors[status]} opacity-75 animate-ping`}
          style={{ animationDuration: '1.5s' }}
        />
      )}
      <span
        className={`relative inline-flex rounded-full ${dotSizes[size]} ${dotColors[status]} ${
          isAnimated ? 'animate-pulse' : ''
        }`}
      />
    </span>
  );
}

export const StatusDot = memo(StatusDotComponent);

// Export status badge for inline usage
interface StatusBadgeProps {
  status: NodeStatus;
  className?: string;
}

function StatusBadgeComponent({ status, className = '' }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium
        ${config.bgColor} ${config.color} border ${config.borderColor} ${className}`}
    >
      <StatusDot status={status} size="sm" />
      {config.label}
    </span>
  );
}

export const StatusBadge = memo(StatusBadgeComponent);

// Export utility for getting status colors
export const getStatusColors = (status: NodeStatus) => statusConfig[status];

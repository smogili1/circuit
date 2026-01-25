import { memo, ReactNode } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { CheckCircle, XCircle, Loader2, Pause, SkipForward } from 'lucide-react';
import { FlowNode, useWorkflowStore } from '../../stores/workflowStore';
import { NodeStatus } from '../../types/workflow';

interface BaseNodeProps extends NodeProps<FlowNode> {
  icon: ReactNode;
  color: string;
  borderColor: string;
  children?: ReactNode;
  status?: NodeStatus;
  showSourceHandle?: boolean;
  showTargetHandle?: boolean;
  sourceHandles?: { id: string; label: string }[];
}

// Status configuration with enhanced styling
const statusConfig: Record<
  NodeStatus,
  {
    ringClass: string;
    glowClass: string;
    icon: typeof CheckCircle | null;
    iconColor: string;
    animate: boolean;
  }
> = {
  pending: {
    ringClass: '',
    glowClass: '',
    icon: null,
    iconColor: '',
    animate: false,
  },
  running: {
    ringClass: 'ring-2 ring-blue-500 ring-offset-2 ring-offset-white dark:ring-offset-gray-800',
    glowClass: 'shadow-lg shadow-blue-500/30',
    icon: Loader2,
    iconColor: 'text-blue-500',
    animate: true,
  },
  complete: {
    ringClass: 'ring-2 ring-green-500 ring-offset-2 ring-offset-white dark:ring-offset-gray-800',
    glowClass: 'shadow-md shadow-green-500/20',
    icon: CheckCircle,
    iconColor: 'text-green-500',
    animate: false,
  },
  error: {
    ringClass: 'ring-2 ring-red-500 ring-offset-2 ring-offset-white dark:ring-offset-gray-800',
    glowClass: 'shadow-lg shadow-red-500/30',
    icon: XCircle,
    iconColor: 'text-red-500',
    animate: false,
  },
  skipped: {
    ringClass: 'ring-1 ring-gray-400 ring-offset-1 ring-offset-white dark:ring-offset-gray-800',
    glowClass: '',
    icon: SkipForward,
    iconColor: 'text-gray-400',
    animate: false,
  },
  waiting: {
    ringClass: 'ring-2 ring-purple-500 ring-offset-2 ring-offset-white dark:ring-offset-gray-800',
    glowClass: 'shadow-lg shadow-purple-500/30',
    icon: Pause,
    iconColor: 'text-purple-500',
    animate: true,
  },
};

function BaseNodeComponent({
  id,
  data,
  selected,
  icon,
  color,
  borderColor,
  children,
  status,
  showSourceHandle = true,
  showTargetHandle = true,
  sourceHandles,
}: BaseNodeProps) {
  const selectNode = useWorkflowStore((s) => s.selectNode);
  const config = status ? statusConfig[status] : statusConfig.pending;
  const StatusIcon = config.icon;
  const isAnimated = config.animate;

  return (
    <div
      className={`
        relative min-w-[180px] rounded-lg shadow-lg border-2 overflow-visible transition-all duration-300
        ${selected ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-white dark:ring-offset-gray-800' : ''}
        ${!selected && status ? config.ringClass : ''}
        ${status ? config.glowClass : ''}
        ${status === 'skipped' ? 'opacity-60' : ''}
        ${isAnimated ? 'animate-pulse' : ''}
      `}
      style={{
        borderColor,
        animationDuration: isAnimated ? '2s' : undefined,
      }}
      onClick={() => selectNode(id)}
    >
      {/* Animated glow effect for running/waiting nodes */}
      {(status === 'running' || status === 'waiting') && (
        <div
          className={`absolute -inset-1 rounded-lg opacity-30 blur-sm ${
            status === 'running' ? 'bg-blue-500' : 'bg-purple-500'
          } animate-pulse`}
          style={{ animationDuration: '1.5s' }}
        />
      )}

      {/* Status icon overlay */}
      {StatusIcon && (
        <div
          className={`absolute -top-2 -right-2 z-10 w-6 h-6 rounded-full bg-white dark:bg-gray-800 border-2 flex items-center justify-center shadow-md ${
            status === 'running'
              ? 'border-blue-500'
              : status === 'complete'
              ? 'border-green-500'
              : status === 'error'
              ? 'border-red-500'
              : status === 'waiting'
              ? 'border-purple-500'
              : 'border-gray-400'
          }`}
        >
          <StatusIcon
            size={14}
            className={`${config.iconColor} ${
              status === 'running' ? 'animate-spin' : ''
            }`}
            style={
              status === 'running'
                ? { animationDuration: '1s' }
                : undefined
            }
          />
        </div>
      )}

      {/* Header */}
      <div
        className="relative px-3 py-2 flex items-center gap-2"
        style={{ backgroundColor: color }}
      >
        <span className="text-white">{icon}</span>
        <span className="text-white font-medium text-sm truncate flex-1">
          {data.config.name}
        </span>

        {/* Running indicator in header */}
        {status === 'running' && (
          <span className="flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-white opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
          </span>
        )}

        {/* Waiting indicator in header */}
        {status === 'waiting' && (
          <span className="flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-white opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
          </span>
        )}
      </div>

      {/* Body */}
      <div className="relative bg-white dark:bg-gray-800 p-3">
        {children}

        {/* Status text for running/waiting */}
        {(status === 'running' || status === 'waiting') && (
          <div
            className={`mt-2 pt-2 border-t border-dashed ${
              status === 'running'
                ? 'border-blue-500/30 text-blue-500'
                : 'border-purple-500/30 text-purple-500'
            } text-[10px] font-medium flex items-center gap-1`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
            {status === 'running' ? 'Running...' : 'Awaiting approval...'}
          </div>
        )}
      </div>

      {/* Handles with status-aware colors */}
      {showTargetHandle && (
        <Handle
          type="target"
          position={Position.Left}
          className={`w-3 h-3 border-2 border-white transition-colors ${
            status === 'running'
              ? '!bg-blue-500'
              : status === 'complete'
              ? '!bg-green-500'
              : status === 'error'
              ? '!bg-red-500'
              : status === 'waiting'
              ? '!bg-purple-500'
              : '!bg-gray-400'
          }`}
        />
      )}

      {sourceHandles ? (
        sourceHandles.map((handle, index) => (
          <Handle
            key={handle.id}
            id={handle.id}
            type="source"
            position={Position.Right}
            className={`w-3 h-3 border-2 border-white transition-colors ${
              status === 'running'
                ? '!bg-blue-500'
                : status === 'complete'
                ? '!bg-green-500'
                : status === 'error'
                ? '!bg-red-500'
                : status === 'waiting'
                ? '!bg-purple-500'
                : '!bg-gray-400'
            }`}
            style={{ top: `${30 + index * 30}%` }}
          />
        ))
      ) : showSourceHandle ? (
        <Handle
          type="source"
          position={Position.Right}
          className={`w-3 h-3 border-2 border-white transition-colors ${
            status === 'running'
              ? '!bg-blue-500'
              : status === 'complete'
              ? '!bg-green-500'
              : status === 'error'
              ? '!bg-red-500'
              : status === 'waiting'
              ? '!bg-purple-500'
              : '!bg-gray-400'
          }`}
        />
      ) : null}
    </div>
  );
}

export const BaseNode = memo(BaseNodeComponent);

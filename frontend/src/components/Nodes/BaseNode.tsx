import { memo, ReactNode } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
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

  const statusStyles: Record<NodeStatus, string> = {
    pending: '',
    running: 'ring-2 ring-blue-500 ring-offset-2 animate-pulse',
    complete: 'ring-2 ring-green-500 ring-offset-2',
    error: 'ring-2 ring-red-500 ring-offset-2',
    skipped: 'opacity-50',
    waiting: 'ring-2 ring-purple-500 ring-offset-2 animate-pulse',
  };

  return (
    <div
      className={`
        min-w-[180px] rounded-lg shadow-lg border-2 overflow-hidden
        ${selected ? 'ring-2 ring-blue-400 ring-offset-2' : ''}
        ${status ? statusStyles[status] : ''}
      `}
      style={{ borderColor }}
      onClick={() => selectNode(id)}
    >
      {/* Header */}
      <div
        className="px-3 py-2 flex items-center gap-2"
        style={{ backgroundColor: color }}
      >
        <span className="text-white">{icon}</span>
        <span className="text-white font-medium text-sm truncate">
          {data.config.name}
        </span>
      </div>

      {/* Body */}
      <div className="bg-white dark:bg-gray-800 p-3">
        {children}
      </div>

      {/* Handles */}
      {showTargetHandle && (
        <Handle
          type="target"
          position={Position.Left}
          className="w-3 h-3 !bg-gray-400 border-2 border-white"
        />
      )}

      {sourceHandles ? (
        sourceHandles.map((handle, index) => (
          <Handle
            key={handle.id}
            id={handle.id}
            type="source"
            position={Position.Right}
            className="w-3 h-3 !bg-gray-400 border-2 border-white"
            style={{ top: `${30 + index * 30}%` }}
          />
        ))
      ) : showSourceHandle ? (
        <Handle
          type="source"
          position={Position.Right}
          className="w-3 h-3 !bg-gray-400 border-2 border-white"
        />
      ) : null}
    </div>
  );
}

export const BaseNode = memo(BaseNodeComponent);

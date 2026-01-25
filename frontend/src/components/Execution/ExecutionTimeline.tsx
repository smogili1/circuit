import { memo, useMemo } from 'react';
import {
  Sparkles,
  Code2,
  GitBranch,
  Merge,
  ArrowRightCircle,
  CheckCircle2,
  Code,
  UserCheck,
  HelpCircle,
  ChevronRight,
  Timer,
} from 'lucide-react';
import { NodeStatus, WorkflowNode } from '../../types/workflow';
import { StatusDot, getStatusColors } from './StatusIndicator';
import { MiniBranchIndicator, BranchPath } from './BranchIndicator';
import { ExecutionProgress } from './ExecutionProgress';

interface NodeOutput {
  nodeId: string;
  nodeName?: string;
  startedAt?: number;
  completedAt?: number;
}

interface ExecutionTimelineProps {
  nodes: WorkflowNode[];
  nodeStates: Map<string, NodeStatus>;
  nodeOutputs?: Map<string, NodeOutput>;
  selectedNodeId: string | null;
  onNodeSelect: (nodeId: string | null) => void;
  branchPaths?: BranchPath[];
  executionStartedAt?: number;
  isRunning?: boolean;
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

  if (durationMs < 1000) return `${durationMs}ms`;
  if (durationMs < 60000) return `${(durationMs / 1000).toFixed(1)}s`;
  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.floor((durationMs % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

// Get execution order based on node outputs (when they started)
function getExecutionOrder(
  nodes: WorkflowNode[],
  nodeOutputs: Map<string, NodeOutput>,
  nodeStates: Map<string, NodeStatus>
): WorkflowNode[] {
  // Filter out input nodes
  const executionNodes = nodes.filter((n) => n.type !== 'input');

  // Sort by start time, then by status (running first, then pending)
  return [...executionNodes].sort((a, b) => {
    const aOutput = nodeOutputs.get(a.id);
    const bOutput = nodeOutputs.get(b.id);
    const aStatus = nodeStates.get(a.id) || 'pending';
    const bStatus = nodeStates.get(b.id) || 'pending';

    // Running nodes first
    if (aStatus === 'running' && bStatus !== 'running') return -1;
    if (bStatus === 'running' && aStatus !== 'running') return 1;

    // Then by start time
    if (aOutput?.startedAt && bOutput?.startedAt) {
      return aOutput.startedAt - bOutput.startedAt;
    }
    if (aOutput?.startedAt) return -1;
    if (bOutput?.startedAt) return 1;

    // Pending at the end
    return 0;
  });
}

function ExecutionTimelineComponent({
  nodes,
  nodeStates,
  nodeOutputs = new Map(),
  selectedNodeId,
  onNodeSelect,
  branchPaths = [],
  executionStartedAt,
  isRunning = false,
}: ExecutionTimelineProps) {
  // Get sorted nodes based on execution order
  const sortedNodes = useMemo(
    () => getExecutionOrder(nodes, nodeOutputs, nodeStates),
    [nodes, nodeOutputs, nodeStates]
  );

  // Create branch map for quick lookup
  const branchMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const path of branchPaths) {
      map.set(path.nodeId, path.condition);
    }
    return map;
  }, [branchPaths]);

  return (
    <div className="bg-gray-900 border-b border-gray-800">
      {/* Enhanced progress section */}
      <ExecutionProgress
        nodes={nodes}
        nodeStates={nodeStates}
        branchPaths={branchPaths}
        executionStartedAt={executionStartedAt}
        isRunning={isRunning}
      />

      {/* Node timeline pills */}
      <div className="px-4 py-3 border-t border-gray-800/50">
        <div className="flex items-center gap-2 flex-wrap">
          {sortedNodes.map((node, index) => {
            const status = nodeStates.get(node.id) || 'pending';
            const isSelected = selectedNodeId === node.id;
            const colors = getStatusColors(status);
            const Icon = nodeTypeIcons[node.type] || HelpCircle;
            const nodeOutput = nodeOutputs.get(node.id);
            const branchResult = branchMap.get(node.id);
            const isCondition = node.type === 'condition';
            const isNodeRunning = status === 'running';
            const isWaiting = status === 'waiting';

            // Calculate duration for completed/running nodes
            const duration =
              nodeOutput?.startedAt
                ? formatDuration(nodeOutput.startedAt, nodeOutput.completedAt)
                : null;

            return (
              <div key={node.id} className="flex items-center">
                {/* Connector line */}
                {index > 0 && (
                  <ChevronRight
                    size={14}
                    className="text-gray-600 mx-1 flex-shrink-0"
                  />
                )}

                {/* Node pill */}
                <button
                  onClick={() => onNodeSelect(isSelected ? null : node.id)}
                  className={`group relative flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-blue-600 text-white ring-2 ring-blue-400 ring-offset-2 ring-offset-gray-900'
                      : `${colors.bgColor} ${colors.color} hover:brightness-125 border ${colors.borderColor}`
                  } ${isNodeRunning || isWaiting ? 'animate-pulse' : ''}`}
                  style={{
                    animationDuration: isNodeRunning || isWaiting ? '2s' : undefined,
                  }}
                  title={`${node.data.name}: ${status}${duration ? ` (${duration})` : ''}`}
                >
                  {/* Status indicator */}
                  <StatusDot status={status} size="sm" />

                  {/* Node icon */}
                  <Icon
                    size={12}
                    className={isSelected ? 'text-white' : colors.color}
                  />

                  {/* Node name */}
                  <span className="max-w-32 truncate">{node.data.name}</span>

                  {/* Duration badge */}
                  {duration && (
                    <span
                      className={`flex items-center gap-0.5 text-[10px] ${
                        isSelected ? 'text-blue-200' : 'text-gray-500'
                      }`}
                    >
                      <Timer size={10} />
                      {duration}
                    </span>
                  )}

                  {/* Branch result indicator */}
                  {isCondition && branchResult !== undefined && (
                    <MiniBranchIndicator condition={branchResult} />
                  )}

                  {/* Running glow effect */}
                  {isNodeRunning && (
                    <span className="absolute inset-0 rounded-full bg-blue-500/20 animate-ping" />
                  )}

                  {/* Waiting glow effect */}
                  {isWaiting && (
                    <span className="absolute inset-0 rounded-full bg-purple-500/20 animate-ping" />
                  )}
                </button>
              </div>
            );
          })}

          {/* Empty state */}
          {sortedNodes.length === 0 && (
            <span className="text-sm text-gray-500">
              No execution nodes in workflow
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export const ExecutionTimeline = memo(ExecutionTimelineComponent);

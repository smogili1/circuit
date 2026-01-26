import { memo, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  ReactFlowProvider,
  MarkerType,
  Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ChevronUp,
  ChevronDown,
  Activity,
  CheckCircle,
  XCircle,
  Timer,
  AlertTriangle,
} from 'lucide-react';
import { GenericNode } from '../Nodes';
import { useSchemaStore } from '../../stores/schemaStore';
import { NodeStatus, Workflow } from '../../types/workflow';
import { BranchPath } from './BranchIndicator';

interface ExecutionWorkflowViewProps {
  workflow: Workflow;
  nodeStates: Map<string, NodeStatus>;
  selectedNodeId: string | null;
  onNodeSelect: (nodeId: string | null) => void;
  branchPaths?: BranchPath[];
  executionStartedAt?: number;
  isRunning: boolean;
}

// Edge styling based on execution state
function getEdgeStyle(
  sourceStatus: NodeStatus | undefined,
  isBranchEdge: boolean,
  branchTaken: boolean | undefined
): {
  stroke: string;
  strokeWidth: number;
  animated: boolean;
  opacity: number;
} {
  if (sourceStatus === 'running') {
    return { stroke: '#3b82f6', strokeWidth: 2, animated: true, opacity: 1 };
  }
  if (isBranchEdge && branchTaken === false) {
    return { stroke: '#64748b', strokeWidth: 1, animated: false, opacity: 0.25 };
  }
  if (sourceStatus === 'complete') {
    return { stroke: '#22c55e', strokeWidth: 2, animated: false, opacity: 1 };
  }
  if (sourceStatus === 'error') {
    return { stroke: '#ef4444', strokeWidth: 2, animated: false, opacity: 1 };
  }
  if (sourceStatus === 'waiting') {
    return { stroke: '#a855f7', strokeWidth: 2, animated: true, opacity: 1 };
  }
  return { stroke: '#475569', strokeWidth: 1, animated: false, opacity: 0.5 };
}

// Calculate execution stats
function calculateStats(nodes: { id: string; type: string }[], nodeStates: Map<string, NodeStatus>) {
  const execNodes = nodes.filter((n) => n.type !== 'input');
  let complete = 0, running = 0, errors = 0, waiting = 0;

  for (const node of execNodes) {
    const status = nodeStates.get(node.id);
    if (status === 'complete') complete++;
    else if (status === 'running') running++;
    else if (status === 'error') errors++;
    else if (status === 'waiting') waiting++;
  }

  const finished = complete + errors;
  const progress = execNodes.length > 0 ? Math.round((finished / execNodes.length) * 100) : 0;

  return { total: execNodes.length, complete, running, errors, waiting, progress };
}

function formatElapsed(startedAt: number): string {
  const ms = Date.now() - startedAt;
  if (ms < 1000) return '<1s';
  if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function ExecutionWorkflowViewInner({
  workflow,
  nodeStates,
  selectedNodeId,
  onNodeSelect,
  branchPaths = [],
  executionStartedAt,
  isRunning,
}: ExecutionWorkflowViewProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { getNodeTypes } = useSchemaStore();

  const nodeTypes = useMemo(() => {
    const types: Record<string, typeof GenericNode> = {};
    for (const nodeType of getNodeTypes()) {
      types[nodeType] = GenericNode;
    }
    return types;
  }, [getNodeTypes]);

  const branchDecisions = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const path of branchPaths) {
      map.set(path.nodeId, path.condition);
    }
    return map;
  }, [branchPaths]);

  const stats = useMemo(
    () => calculateStats(workflow.nodes, nodeStates),
    [workflow.nodes, nodeStates]
  );

  const nodes = useMemo(() => {
    return workflow.nodes.map((node) => {
      const status = nodeStates.get(node.id);
      const isSelected = selectedNodeId === node.id;

      return {
        id: node.id,
        type: node.type,
        position: node.position,
        data: { config: node.data, status },
        selected: isSelected,
        style: isSelected
          ? { outline: '2px solid #3b82f6', outlineOffset: '2px', borderRadius: '6px' }
          : status === 'running'
          ? { boxShadow: '0 0 15px rgba(59, 130, 246, 0.6)' }
          : status === 'waiting'
          ? { boxShadow: '0 0 15px rgba(168, 85, 247, 0.6)' }
          : status === 'error'
          ? { boxShadow: '0 0 12px rgba(239, 68, 68, 0.5)' }
          : undefined,
        className: status && status !== 'pending' ? 'executed-node' : 'pending-node',
      };
    });
  }, [workflow.nodes, nodeStates, selectedNodeId]);

  const edges = useMemo(() => {
    return workflow.edges.map((edge): Edge => {
      const sourceNode = workflow.nodes.find((n) => n.id === edge.source);
      // Input nodes are always complete once execution starts
      const sourceStatus = sourceNode?.type === 'input' && nodeStates.size > 0
        ? 'complete'
        : nodeStates.get(edge.source);
      const isBranchEdge = sourceNode?.type === 'condition' || sourceNode?.type === 'approval';
      const branchDecision = branchDecisions.get(edge.source);

      let branchTaken: boolean | undefined;
      if (isBranchEdge && branchDecision !== undefined) {
        const trueHandles = ['true', 'approved'];
        branchTaken = trueHandles.includes(edge.sourceHandle || '') === branchDecision;
      }

      const style = getEdgeStyle(sourceStatus, isBranchEdge, branchTaken);

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        animated: style.animated,
        style: {
          stroke: style.stroke,
          strokeWidth: style.strokeWidth,
          opacity: style.opacity,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: style.stroke,
          width: 16,
          height: 16,
        },
      };
    });
  }, [workflow.edges, workflow.nodes, nodeStates, branchDecisions]);

  const handleNodeClick = (_event: React.MouseEvent, node: { id: string }) => {
    onNodeSelect(selectedNodeId === node.id ? null : node.id);
  };

  return (
    <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
      {/* Status Bar - Always visible */}
      <div className="flex items-center justify-between px-4 py-2 bg-white/80 dark:bg-gray-900/80 border-b border-gray-200/50 dark:border-gray-800/50">
        <div className="flex items-center gap-4">
          {/* Toggle button */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            <span className="font-medium">Workflow</span>
          </button>

          {/* Progress bar */}
          <div className="flex items-center gap-2">
            <div className="w-24 h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  stats.errors > 0 ? 'bg-red-500' : stats.progress === 100 ? 'bg-green-500' : 'bg-blue-500'
                }`}
                style={{ width: `${stats.progress}%` }}
              />
            </div>
            <span className="text-xs text-gray-500">{stats.progress}%</span>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 text-xs">
            {stats.running > 0 && (
              <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                <Activity size={12} className="animate-pulse" />
                {stats.running} running
              </span>
            )}
            {stats.waiting > 0 && (
              <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400">
                <AlertTriangle size={12} />
                {stats.waiting} waiting
              </span>
            )}
            {stats.complete > 0 && (
              <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                <CheckCircle size={12} />
                {stats.complete}
              </span>
            )}
            {stats.errors > 0 && (
              <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                <XCircle size={12} />
                {stats.errors} failed
              </span>
            )}
          </div>
        </div>

        {/* Elapsed time */}
        {executionStartedAt && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Timer size={12} />
            <span>{formatElapsed(executionStartedAt)}</span>
          </div>
        )}
      </div>

      {/* Workflow Diagram - Collapsible */}
      {!isCollapsed && (
        <div className="h-44 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={handleNodeClick}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={true}
            zoomOnScroll={false}
            panOnScroll={false}
            panOnDrag={true}
            preventScrolling={true}
            className="bg-gray-100 dark:bg-gray-950"
            minZoom={0.2}
            maxZoom={0.8}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} size={1} className="[&>pattern>rect]:fill-gray-300 dark:[&>pattern>rect]:fill-gray-800" />
          </ReactFlow>

          {/* Mini legend */}
          <div className="absolute bottom-1.5 right-2 flex items-center gap-2 text-[9px] text-gray-500">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> running
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> done
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> error
            </span>
          </div>

          {/* Click hint when no selection */}
          {!selectedNodeId && isRunning && (
            <div className="absolute top-2 right-2 text-[10px] text-gray-500 bg-white/90 dark:bg-gray-900/90 px-2 py-1 rounded">
              Click node to filter logs
            </div>
          )}

          <style>{`
            .react-flow__node.pending-node { opacity: 0.5; }
            .react-flow__node.executed-node { opacity: 1; }
          `}</style>
        </div>
      )}
    </div>
  );
}

function ExecutionWorkflowViewComponent(props: ExecutionWorkflowViewProps) {
  return (
    <ReactFlowProvider>
      <ExecutionWorkflowViewInner {...props} />
    </ReactFlowProvider>
  );
}

export const ExecutionWorkflowView = memo(ExecutionWorkflowViewComponent);

import { useMemo, memo } from 'react';
import {
  ReactFlow,
  Background,
  ReactFlowProvider,
  MarkerType,
  Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { GenericNode } from '../Nodes';
import { useSchemaStore } from '../../stores/schemaStore';
import { NodeStatus, Workflow } from '../../types/workflow';
import { BranchPath } from './BranchIndicator';

interface MiniWorkflowViewProps {
  workflow: Workflow | null;
  nodeStates: Map<string, NodeStatus>;
  selectedNodeId: string | null;
  onNodeSelect: (nodeId: string | null) => void;
  branchPaths?: BranchPath[];
  executedNodeIds?: Set<string>;
}

// Get edge style based on source and target node status
function getEdgeStyle(
  sourceStatus: NodeStatus | undefined,
  _targetStatus: NodeStatus | undefined,
  isOnExecutedPath: boolean,
  isBranchEdge: boolean,
  branchTaken: boolean | undefined
): {
  stroke: string;
  strokeWidth: number;
  animated: boolean;
  opacity: number;
} {
  // Running edge - animated blue
  if (sourceStatus === 'running') {
    return {
      stroke: '#3b82f6',
      strokeWidth: 2.5,
      animated: true,
      opacity: 1,
    };
  }

  // If this is a branch edge, style based on whether it was taken
  if (isBranchEdge && branchTaken !== undefined) {
    if (!branchTaken) {
      // Branch not taken - dim it
      return {
        stroke: '#64748b',
        strokeWidth: 1,
        animated: false,
        opacity: 0.3,
      };
    }
  }

  // Completed source - green edge
  if (sourceStatus === 'complete') {
    return {
      stroke: '#22c55e',
      strokeWidth: 2,
      animated: false,
      opacity: 1,
    };
  }

  // Error source - red edge
  if (sourceStatus === 'error') {
    return {
      stroke: '#ef4444',
      strokeWidth: 2,
      animated: false,
      opacity: 0.8,
    };
  }

  // Waiting source - purple pulsing
  if (sourceStatus === 'waiting') {
    return {
      stroke: '#a855f7',
      strokeWidth: 2,
      animated: true,
      opacity: 1,
    };
  }

  // On executed path but pending
  if (isOnExecutedPath) {
    return {
      stroke: '#64748b',
      strokeWidth: 1.5,
      animated: false,
      opacity: 0.7,
    };
  }

  // Default pending edge
  return {
    stroke: '#64748b',
    strokeWidth: 1,
    animated: false,
    opacity: 0.5,
  };
}

// Get node selection styling
function getNodeSelectionStyle(
  isSelected: boolean,
  status: NodeStatus | undefined
): React.CSSProperties | undefined {
  if (isSelected) {
    return {
      outline: '3px solid #3b82f6',
      outlineOffset: '3px',
      borderRadius: '8px',
    };
  }

  // Add glow effect for running/waiting nodes
  if (status === 'running') {
    return {
      boxShadow: '0 0 20px rgba(59, 130, 246, 0.5)',
    };
  }

  if (status === 'waiting') {
    return {
      boxShadow: '0 0 20px rgba(168, 85, 247, 0.5)',
    };
  }

  return undefined;
}

function MiniWorkflowViewInner({
  workflow,
  nodeStates,
  selectedNodeId,
  onNodeSelect,
  branchPaths = [],
  executedNodeIds = new Set(),
}: MiniWorkflowViewProps) {
  const { getNodeTypes } = useSchemaStore();

  // Generate nodeTypes dynamically from backend schemas
  const nodeTypes = useMemo(() => {
    const types: Record<string, typeof GenericNode> = {};
    for (const nodeType of getNodeTypes()) {
      types[nodeType] = GenericNode;
    }
    return types;
  }, [getNodeTypes]);

  // Build a map of branch decisions for quick lookup
  const branchDecisions = useMemo(() => {
    const decisions = new Map<string, boolean>();
    for (const path of branchPaths) {
      decisions.set(path.nodeId, path.condition);
    }
    return decisions;
  }, [branchPaths]);

  // Build executed node set including nodes that have any status
  const nodesWithActivity = useMemo(() => {
    const active = new Set(executedNodeIds);
    for (const [nodeId, status] of nodeStates.entries()) {
      if (status !== 'pending') {
        active.add(nodeId);
      }
    }
    return active;
  }, [executedNodeIds, nodeStates]);

  // Convert workflow nodes to React Flow format with status
  const nodes = useMemo(() => {
    if (!workflow) return [];

    return workflow.nodes.map((node) => {
      const status = nodeStates.get(node.id);
      const isSelected = selectedNodeId === node.id;
      const isExecuted = nodesWithActivity.has(node.id);

      return {
        id: node.id,
        type: node.type,
        position: node.position,
        data: {
          config: node.data, // React Flow nodes expect { config: NodeConfig }
          status,
        },
        selected: isSelected,
        style: getNodeSelectionStyle(isSelected, status),
        // Add className for executed vs pending visual distinction
        className: isExecuted ? 'executed-node' : 'pending-node',
      };
    });
  }, [workflow, nodeStates, selectedNodeId, nodesWithActivity]);

  // Convert workflow edges to React Flow format with enhanced styling
  const edges = useMemo(() => {
    if (!workflow) return [];

    return workflow.edges.map((edge): Edge => {
      const sourceStatus = nodeStates.get(edge.source);
      const targetStatus = nodeStates.get(edge.target);
      const sourceNode = workflow.nodes.find((n) => n.id === edge.source);
      const isBranchEdge = sourceNode?.type === 'condition' || sourceNode?.type === 'approval';
      const branchDecision = branchDecisions.get(edge.source);

      // Determine if this specific edge was taken based on handle
      let branchTaken: boolean | undefined;
      if (isBranchEdge && branchDecision !== undefined) {
        // For condition nodes: 'true' handle = true branch, 'false' handle = false branch
        // For approval nodes: 'approved' handle = true, 'rejected' handle = false
        const trueHandles = ['true', 'approved'];
        const isTrieHandle = trueHandles.includes(edge.sourceHandle || '');
        branchTaken = isTrieHandle === branchDecision;
      }

      const isOnExecutedPath =
        nodesWithActivity.has(edge.source) || nodesWithActivity.has(edge.target);

      const style = getEdgeStyle(
        sourceStatus,
        targetStatus,
        isOnExecutedPath,
        isBranchEdge,
        branchTaken
      );

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
          transition: 'all 0.3s ease',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: style.stroke,
          width: 20,
          height: 20,
        },
        // Add label for branch edges to show which path was taken
        ...(isBranchEdge && branchTaken !== undefined
          ? {
              labelStyle: {
                fill: branchTaken ? '#22c55e' : '#ef4444',
                fontWeight: 600,
                fontSize: 10,
              },
              labelBgStyle: {
                fill: branchTaken ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                stroke: branchTaken ? '#22c55e' : '#ef4444',
                strokeWidth: 1,
              },
              labelBgPadding: [4, 4] as [number, number],
              labelBgBorderRadius: 4,
            }
          : {}),
      };
    });
  }, [workflow, nodeStates, branchDecisions, nodesWithActivity]);

  const handleNodeClick = (_event: React.MouseEvent, node: { id: string }) => {
    onNodeSelect(selectedNodeId === node.id ? null : node.id);
  };

  if (!workflow) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 bg-gray-900">
        <p className="text-sm">No workflow selected</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        zoomOnScroll={false}
        panOnScroll={false}
        panOnDrag={false}
        preventScrolling={false}
        className="bg-gray-900"
        minZoom={0.3}
        maxZoom={1}
      >
        <Background gap={15} size={1} color="#374151" />
      </ReactFlow>

      {/* Legend */}
      <div className="absolute bottom-2 left-2 flex items-center gap-3 px-2 py-1 bg-gray-900/80 rounded text-[10px] text-gray-400 backdrop-blur-sm border border-gray-800">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span>Running</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span>Complete</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span>Error</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-purple-500" />
          <span>Waiting</span>
        </div>
      </div>

      {/* CSS for node animations */}
      <style>{`
        .react-flow__node.executed-node {
          transition: all 0.3s ease;
        }
        .react-flow__node.pending-node {
          opacity: 0.6;
          transition: all 0.3s ease;
        }
        .react-flow__edge-path {
          transition: all 0.3s ease;
        }
      `}</style>
    </div>
  );
}

function MiniWorkflowViewComponent(props: MiniWorkflowViewProps) {
  return (
    <ReactFlowProvider>
      <MiniWorkflowViewInner {...props} />
    </ReactFlowProvider>
  );
}

export const MiniWorkflowView = memo(MiniWorkflowViewComponent);

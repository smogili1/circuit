import { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { GenericNode } from '../Nodes';
import { useSchemaStore } from '../../stores/schemaStore';
import { NodeStatus, Workflow } from '../../types/workflow';

interface MiniWorkflowViewProps {
  workflow: Workflow | null;
  nodeStates: Map<string, NodeStatus>;
  selectedNodeId: string | null;
  onNodeSelect: (nodeId: string | null) => void;
}

function MiniWorkflowViewInner({
  workflow,
  nodeStates,
  selectedNodeId,
  onNodeSelect,
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

  // Convert workflow nodes to React Flow format with status
  const nodes = useMemo(() => {
    if (!workflow) return [];

    return workflow.nodes.map((node) => {
      const status = nodeStates.get(node.id);
      const isSelected = selectedNodeId === node.id;

      return {
        id: node.id,
        type: node.type,
        position: node.position,
        data: {
          config: node.data,  // React Flow nodes expect { config: NodeConfig }
          status,
        },
        selected: isSelected,
        style: isSelected
          ? { outline: '2px solid #3b82f6', outlineOffset: '2px' }
          : undefined,
      };
    });
  }, [workflow, nodeStates, selectedNodeId]);

  // Convert workflow edges to React Flow format
  const edges = useMemo(() => {
    if (!workflow) return [];

    return workflow.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      animated: nodeStates.get(edge.source) === 'running',
      style: {
        stroke: nodeStates.get(edge.source) === 'running' ? '#3b82f6' : '#64748b',
        strokeWidth: nodeStates.get(edge.source) === 'running' ? 2 : 1,
      },
    }));
  }, [workflow, nodeStates]);

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
    <div className="w-full h-full">
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
    </div>
  );
}

export function MiniWorkflowView(props: MiniWorkflowViewProps) {
  return (
    <ReactFlowProvider>
      <MiniWorkflowViewInner {...props} />
    </ReactFlowProvider>
  );
}

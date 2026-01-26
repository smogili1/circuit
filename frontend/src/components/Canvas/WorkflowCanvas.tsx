import { useCallback, useRef, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  ReactFlowProvider,
  ReactFlowInstance,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { GenericNode } from '../Nodes';
import { useWorkflowStore, FlowNode, FlowEdge } from '../../stores/workflowStore';
import { useSchemaStore } from '../../stores/schemaStore';
import { NodeConfig } from '../../types/workflow';

interface WorkflowCanvasProps {
  nodeStates?: Map<string, string>;
}

function WorkflowCanvasInner({ nodeStates }: WorkflowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const reactFlowInstance = useRef<ReactFlowInstance<FlowNode, FlowEdge> | null>(null);

  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, workflow } =
    useWorkflowStore();
  const { fitView } = useReactFlow();

  // Fit view when workflow changes
  useEffect(() => {
    if (workflow?.id) {
      // Small delay to ensure nodes are rendered before fitting
      const timer = setTimeout(() => {
        fitView({ padding: 0.2 });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [workflow?.id, fitView]);
  const { getNodeTypes } = useSchemaStore();

  // Generate nodeTypes dynamically from backend schemas
  const nodeTypes = useMemo(() => {
    const types: Record<string, typeof GenericNode> = {};
    for (const nodeType of getNodeTypes()) {
      types[nodeType] = GenericNode;
    }
    return types;
  }, [getNodeTypes]);

  const onInit = useCallback((instance: ReactFlowInstance<FlowNode, FlowEdge>) => {
    reactFlowInstance.current = instance;
  }, []);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow') as NodeConfig['type'];

      if (!type || !reactFlowWrapper.current || !reactFlowInstance.current) {
        return;
      }

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = reactFlowInstance.current.screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      addNode(type, position);
    },
    [addNode]
  );

  // Apply node states for execution visualization
  const nodesWithState = nodes.map((node) => {
    const status = nodeStates?.get(node.id);
    if (status) {
      return {
        ...node,
        data: {
          ...node.data,
          status,
        },
      };
    }
    return node;
  });

  return (
    <div ref={reactFlowWrapper} className="w-full h-full">
      <ReactFlow
        nodes={nodesWithState}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={onInit}
        onDrop={onDrop}
        onDragOver={onDragOver}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
        deleteKeyCode={['Backspace', 'Delete']}
        className="bg-gray-50 dark:bg-gray-900"
      >
        <Background gap={15} size={1} />
        <Controls />
      </ReactFlow>
    </div>
  );
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

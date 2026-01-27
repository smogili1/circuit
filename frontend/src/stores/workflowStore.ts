import { create } from 'zustand';
import {
  Node,
  Edge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Connection,
} from '@xyflow/react';
import { Workflow, NodeConfig, WorkflowNode, WorkflowEdge } from '../types/workflow';
import { v4 as uuidv4 } from 'uuid';
import { useSchemaStore } from './schemaStore';

// Custom node data type for React Flow
export interface FlowNodeData extends Record<string, unknown> {
  config: NodeConfig;
}

export type FlowNode = Node<FlowNodeData>;
export type FlowEdge = Edge;

interface WorkflowState {
  // Current workflow
  workflow: Workflow | null;

  // React Flow state
  nodes: FlowNode[];
  edges: FlowEdge[];

  // Selected node for properties panel
  selectedNodeId: string | null;

  // Actions
  setWorkflow: (workflow: Workflow) => void;
  selectWorkflowById: (workflowId: string, workflows: Workflow[]) => boolean;
  updateWorkflowSettings: (settings: Partial<Pick<Workflow, 'name' | 'description' | 'workingDirectory'>>) => void;
  onNodesChange: OnNodesChange<FlowNode>;
  onEdgesChange: OnEdgesChange<FlowEdge>;
  onConnect: OnConnect;
  addNode: (type: NodeConfig['type'], position: { x: number; y: number }) => void;
  updateNodeConfig: (nodeId: string, config: Partial<NodeConfig>) => void;
  deleteNode: (nodeId: string) => void;
  selectNode: (nodeId: string | null) => void;
  getWorkflowData: () => Pick<Workflow, 'nodes' | 'edges' | 'workingDirectory'>;
  isNameAvailable: (name: string, excludeNodeId?: string) => boolean;
  getDuplicateNames: () => string[];
}

// Convert workflow nodes to React Flow nodes
function toFlowNodes(nodes: WorkflowNode[]): FlowNode[] {
  return nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: node.position,
    data: { config: node.data },
  }));
}

// Convert workflow edges to React Flow edges
function toFlowEdges(edges: WorkflowEdge[]): FlowEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    animated: true,
  }));
}

// Convert React Flow nodes back to workflow nodes
function toWorkflowNodes(nodes: FlowNode[]): WorkflowNode[] {
  return nodes.map((node) => ({
    id: node.id,
    type: node.data.config.type,
    position: node.position,
    data: node.data.config,
  }));
}

// Convert React Flow edges back to workflow edges
function toWorkflowEdges(edges: FlowEdge[]): WorkflowEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? undefined,
    targetHandle: edge.targetHandle ?? undefined,
  }));
}

// Get default config for a node type from the schema store
function getDefaultConfig(type: NodeConfig['type']): NodeConfig {
  const schemaStore = useSchemaStore.getState();
  const config = schemaStore.getDefaultConfig(type);
  // Type assertion is safe here because schemas define the correct structure
  return config as unknown as NodeConfig;
}

// Get all node names in the current workflow
function getExistingNodeNames(nodes: FlowNode[]): Set<string> {
  return new Set(nodes.map((n) => n.data.config.name));
}

// Generate a unique node name by adding a numeric suffix if needed
function generateUniqueName(baseName: string, existingNames: Set<string>): string {
  if (!existingNames.has(baseName)) {
    return baseName;
  }

  let counter = 2;
  while (existingNames.has(`${baseName} ${counter}`)) {
    counter++;
  }
  return `${baseName} ${counter}`;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflow: null,
  nodes: [],
  edges: [],
  selectedNodeId: null,

  setWorkflow: (workflow) => {
    set({
      workflow,
      nodes: toFlowNodes(workflow.nodes),
      edges: toFlowEdges(workflow.edges),
      selectedNodeId: null,
    });
  },

  selectWorkflowById: (workflowId, workflows) => {
    const workflow = workflows.find(w => w.id === workflowId);
    if (workflow) {
      get().setWorkflow(workflow);
      return true;
    }
    return false;
  },

  updateWorkflowSettings: (settings) => {
    const { workflow } = get();
    if (workflow) {
      set({
        workflow: { ...workflow, ...settings },
      });
    }
  },

  onNodesChange: (changes) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes),
    });
  },

  onEdgesChange: (changes) => {
    set({
      edges: applyEdgeChanges(changes, get().edges),
    });
  },

  onConnect: (connection: Connection) => {
    set({
      edges: addEdge(
        {
          ...connection,
          id: uuidv4(),
          animated: true,
        },
        get().edges
      ),
    });
  },

  addNode: (type, position) => {
    const id = uuidv4();
    const config = getDefaultConfig(type);
    const existingNames = getExistingNodeNames(get().nodes);
    const uniqueName = generateUniqueName(config.name, existingNames);

    const newNode: FlowNode = {
      id,
      type,
      position,
      data: { config: { ...config, name: uniqueName } },
    };

    set({
      nodes: [...get().nodes, newNode],
      selectedNodeId: id,
    });
  },

  updateNodeConfig: (nodeId, configUpdates) => {
    set({
      nodes: get().nodes.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              config: { ...node.data.config, ...configUpdates } as NodeConfig,
            },
          };
        }
        return node;
      }),
    });
  },

  deleteNode: (nodeId) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node) return;

    // Check if node is deletable (input/output nodes have deletable: false)
    const schemaStore = useSchemaStore.getState();
    const schema = schemaStore.getSchema(node.data.config.type);
    if (schema?.meta.deletable === false) {
      // Cannot delete this node - it's required
      return;
    }

    set({
      nodes: get().nodes.filter((n) => n.id !== nodeId),
      edges: get().edges.filter(
        (e) => e.source !== nodeId && e.target !== nodeId
      ),
      selectedNodeId:
        get().selectedNodeId === nodeId ? null : get().selectedNodeId,
    });
  },

  selectNode: (nodeId) => {
    set({ selectedNodeId: nodeId });
  },

  getWorkflowData: () => ({
    nodes: toWorkflowNodes(get().nodes),
    edges: toWorkflowEdges(get().edges),
    workingDirectory: get().workflow?.workingDirectory,
  }),

  isNameAvailable: (name, excludeNodeId) => {
    const nodes = get().nodes;
    return !nodes.some(
      (n) => n.data.config.name === name && n.id !== excludeNodeId
    );
  },

  getDuplicateNames: () => {
    const nodes = get().nodes;
    const nameCounts = new Map<string, number>();
    for (const node of nodes) {
      const name = node.data.config.name;
      nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
    }
    const duplicates: string[] = [];
    for (const [name, count] of nameCounts) {
      if (count > 1) {
        duplicates.push(name);
      }
    }
    return duplicates;
  },
}));

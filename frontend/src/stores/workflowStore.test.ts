import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useWorkflowStore } from './workflowStore';
import { Workflow, ApprovalNodeConfig } from '../types/workflow';
import { useSchemaStore } from './schemaStore';

describe('workflowStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useWorkflowStore.setState({
      workflow: null,
      nodes: [],
      edges: [],
      selectedNodeId: null,
    });

    // Set up schema store with mock schemas
    useSchemaStore.setState({
      schemas: {
        'input': {
          meta: { type: 'input', displayName: 'Input', category: 'io' },
          properties: { name: { type: 'string', default: 'Input' } },
        },
        'output': {
          meta: { type: 'output', displayName: 'Output', category: 'io' },
          properties: { name: { type: 'string', default: 'Output' } },
        },
        'claude-agent': {
          meta: { type: 'claude-agent', displayName: 'Claude Agent', category: 'agents' },
          properties: {
            name: { type: 'string', default: 'Claude Agent' },
            model: { type: 'select', default: 'sonnet' },
          },
        },
        'codex-agent': {
          meta: { type: 'codex-agent', displayName: 'Codex Agent', category: 'agents' },
          properties: {
            name: { type: 'string', default: 'Codex Agent' },
            model: { type: 'select', default: 'gpt-5.2-codex' },
            approvalPolicy: { type: 'select', default: 'never' },
            sandbox: { type: 'select', default: 'workspace-write' },
          },
        },
        'condition': {
          meta: { type: 'condition', displayName: 'Condition', category: 'flow' },
          properties: {
            name: { type: 'string', default: 'Condition' },
            conditions: {
              type: 'string',
              default: [
                {
                  inputReference: '',
                  operator: 'equals',
                  compareValue: '',
                },
              ],
            },
          },
        },
        'approval': {
          meta: { type: 'approval', displayName: 'User Approval', category: 'flow' },
          properties: {
            name: { type: 'string', default: 'Review' },
            promptMessage: { type: 'textarea', default: '' },
            inputSelections: { type: 'inputSelector', default: [] },
            feedbackPrompt: { type: 'string', default: 'What should be changed?' },
            timeoutMinutes: { type: 'number' },
            timeoutAction: { type: 'select', default: 'reject' },
          },
        },
      },
      loading: false,
      error: null,
      initialized: true,
    });
  });

  describe('setWorkflow', () => {
    it('should set workflow and convert nodes/edges', () => {
      const workflow: Workflow = {
        id: 'wf-1',
        name: 'Test Workflow',
        nodes: [
          {
            id: 'node-1',
            type: 'input',
            position: { x: 100, y: 100 },
            data: { type: 'input', name: 'Input Node' },
          },
        ],
        edges: [{ id: 'edge-1', source: 'node-1', target: 'node-2' }],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      useWorkflowStore.getState().setWorkflow(workflow);

      const state = useWorkflowStore.getState();
      expect(state.workflow).toEqual(workflow);
      expect(state.nodes.length).toBe(1);
      expect(state.nodes[0].id).toBe('node-1');
      expect(state.nodes[0].data.config.type).toBe('input');
      expect(state.edges.length).toBe(1);
      expect(state.selectedNodeId).toBeNull();
    });
  });

  describe('addNode', () => {
    it('should add a new claude-agent node', () => {
      useWorkflowStore.getState().addNode('claude-agent', { x: 200, y: 200 });

      const state = useWorkflowStore.getState();
      expect(state.nodes.length).toBe(1);
      expect(state.nodes[0].type).toBe('claude-agent');
      expect(state.nodes[0].position).toEqual({ x: 200, y: 200 });
      expect(state.nodes[0].data.config.type).toBe('claude-agent');
      expect(state.nodes[0].data.config.name).toBe('Claude Agent');
      expect(state.selectedNodeId).toBe(state.nodes[0].id);
    });

    it('should add a new codex-agent node with default config', () => {
      useWorkflowStore.getState().addNode('codex-agent', { x: 300, y: 300 });

      const state = useWorkflowStore.getState();
      const config = state.nodes[0].data.config;
      expect(config.type).toBe('codex-agent');
      if (config.type === 'codex-agent') {
        expect(config.model).toBe('gpt-5.2-codex');
        expect(config.approvalPolicy).toBe('never');
        expect(config.sandbox).toBe('workspace-write');
      }
    });

    it('should add a new input node', () => {
      useWorkflowStore.getState().addNode('input', { x: 0, y: 0 });

      const state = useWorkflowStore.getState();
      expect(state.nodes[0].data.config.type).toBe('input');
      expect(state.nodes[0].data.config.name).toBe('Input');
    });

    it('should add a new output node', () => {
      useWorkflowStore.getState().addNode('output', { x: 500, y: 500 });

      const state = useWorkflowStore.getState();
      const config = state.nodes[0].data.config;
      expect(config.type).toBe('output');
    });

    it('should add a new condition node', () => {
      useWorkflowStore.getState().addNode('condition', { x: 250, y: 250 });

      const state = useWorkflowStore.getState();
      const config = state.nodes[0].data.config;
      expect(config.type).toBe('condition');
      if (config.type === 'condition') {
        expect(config.conditions?.length).toBe(1);
        expect(config.conditions?.[0]?.operator).toBe('equals');
        expect(config.conditions?.[0]?.inputReference).toBe('');
      }
    });

    it('should add a new approval node with default config', () => {
      useWorkflowStore.getState().addNode('approval', { x: 300, y: 300 });

      const state = useWorkflowStore.getState();
      expect(state.nodes.length).toBe(1);
      expect(state.nodes[0].type).toBe('approval');
      expect(state.nodes[0].position).toEqual({ x: 300, y: 300 });

      const config = state.nodes[0].data.config as ApprovalNodeConfig;
      expect(config.type).toBe('approval');
      expect(config.name).toBe('Review');
      expect(config.feedbackPrompt).toBe('What should be changed?');
      expect(config.timeoutAction).toBe('reject');
      expect(config.inputSelections).toEqual([]);
    });

    it('should select the newly added approval node', () => {
      useWorkflowStore.getState().addNode('approval', { x: 0, y: 0 });

      const state = useWorkflowStore.getState();
      expect(state.selectedNodeId).toBe(state.nodes[0].id);
    });
  });

  describe('updateNodeConfig', () => {
    it('should update node configuration', () => {
      useWorkflowStore.getState().addNode('claude-agent', { x: 0, y: 0 });
      const nodeId = useWorkflowStore.getState().nodes[0].id;

      useWorkflowStore.getState().updateNodeConfig(nodeId, {
        name: 'Updated Name',
        model: 'opus',
      });

      const state = useWorkflowStore.getState();
      const config = state.nodes[0].data.config;
      expect(config.name).toBe('Updated Name');
      if (config.type === 'claude-agent') {
        expect(config.model).toBe('opus');
      }
    });

    it('should update approval node configuration', () => {
      useWorkflowStore.getState().addNode('approval', { x: 0, y: 0 });
      const nodeId = useWorkflowStore.getState().nodes[0].id;

      useWorkflowStore.getState().updateNodeConfig(nodeId, {
        name: 'Human Review',
        promptMessage: 'Please review the generated content',
        feedbackPrompt: 'What changes are needed?',
        timeoutMinutes: 30,
        timeoutAction: 'approve',
      });

      const state = useWorkflowStore.getState();
      const config = state.nodes[0].data.config as ApprovalNodeConfig;
      expect(config.name).toBe('Human Review');
      expect(config.promptMessage).toBe('Please review the generated content');
      expect(config.feedbackPrompt).toBe('What changes are needed?');
      expect(config.timeoutMinutes).toBe(30);
      expect(config.timeoutAction).toBe('approve');
    });

    it('should update approval node input selections', () => {
      useWorkflowStore.getState().addNode('approval', { x: 0, y: 0 });
      const nodeId = useWorkflowStore.getState().nodes[0].id;

      const inputSelections = [
        { nodeId: 'agent-1', nodeName: 'Writer', fields: ['result', 'transcript'] },
        { nodeId: 'agent-2', nodeName: 'Reviewer', fields: ['result'] },
      ];

      useWorkflowStore.getState().updateNodeConfig(nodeId, {
        inputSelections,
      });

      const state = useWorkflowStore.getState();
      const config = state.nodes[0].data.config as ApprovalNodeConfig;
      expect(config.inputSelections).toEqual(inputSelections);
      expect(config.inputSelections).toHaveLength(2);
      expect(config.inputSelections![0].nodeName).toBe('Writer');
      expect(config.inputSelections![0].fields).toContain('result');
    });
  });

  describe('deleteNode', () => {
    it('should delete a node and its connected edges', () => {
      // Add two nodes
      useWorkflowStore.getState().addNode('input', { x: 0, y: 0 });
      useWorkflowStore.getState().addNode('output', { x: 200, y: 0 });

      const state1 = useWorkflowStore.getState();
      const inputId = state1.nodes[0].id;

      // Delete the input node
      useWorkflowStore.getState().deleteNode(inputId);

      const state2 = useWorkflowStore.getState();
      expect(state2.nodes.length).toBe(1);
      expect(state2.nodes[0].data.config.type).toBe('output');
    });

    it('should clear selectedNodeId if deleted node was selected', () => {
      useWorkflowStore.getState().addNode('input', { x: 0, y: 0 });
      const nodeId = useWorkflowStore.getState().nodes[0].id;

      // Node is auto-selected on add
      expect(useWorkflowStore.getState().selectedNodeId).toBe(nodeId);

      useWorkflowStore.getState().deleteNode(nodeId);

      expect(useWorkflowStore.getState().selectedNodeId).toBeNull();
    });
  });

  describe('selectNode', () => {
    it('should select a node', () => {
      useWorkflowStore.getState().addNode('input', { x: 0, y: 0 });
      useWorkflowStore.getState().selectNode(null); // Deselect first

      const nodeId = useWorkflowStore.getState().nodes[0].id;
      useWorkflowStore.getState().selectNode(nodeId);

      expect(useWorkflowStore.getState().selectedNodeId).toBe(nodeId);
    });

    it('should deselect when null is passed', () => {
      useWorkflowStore.getState().addNode('input', { x: 0, y: 0 });
      useWorkflowStore.getState().selectNode(null);

      expect(useWorkflowStore.getState().selectedNodeId).toBeNull();
    });
  });

  describe('getWorkflowData', () => {
    it('should return nodes and edges in workflow format', () => {
      useWorkflowStore.getState().addNode('input', { x: 100, y: 100 });
      useWorkflowStore.getState().addNode('output', { x: 300, y: 100 });

      const { nodes, edges } = useWorkflowStore.getState().getWorkflowData();

      expect(nodes.length).toBe(2);
      expect(nodes[0].type).toBe('input');
      expect(nodes[0].data.type).toBe('input');
      expect(nodes[1].type).toBe('output');
      expect(edges).toEqual([]);
    });

    it('should return approval node data in workflow format', () => {
      useWorkflowStore.getState().addNode('approval', { x: 200, y: 200 });
      const nodeId = useWorkflowStore.getState().nodes[0].id;

      // Update with full approval config
      useWorkflowStore.getState().updateNodeConfig(nodeId, {
        name: 'Quality Check',
        promptMessage: 'Review the output',
        inputSelections: [
          { nodeId: 'agent-1', nodeName: 'Agent', fields: ['result'] },
        ],
      });

      const { nodes } = useWorkflowStore.getState().getWorkflowData();

      expect(nodes.length).toBe(1);
      expect(nodes[0].type).toBe('approval');
      expect(nodes[0].data.type).toBe('approval');
      expect(nodes[0].data.name).toBe('Quality Check');
      expect(nodes[0].data.promptMessage).toBe('Review the output');
      expect((nodes[0].data as ApprovalNodeConfig).inputSelections).toHaveLength(1);
    });
  });
});

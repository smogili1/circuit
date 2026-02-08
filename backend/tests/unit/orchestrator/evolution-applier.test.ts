import {
  applyEvolution,
  createEvolutionSnapshot,
  describeWorkflowDiff,
  appendEvolutionHistory,
  readEvolutionHistory,
} from '../../../src/orchestrator/evolution-applier';
import type { Workflow } from '../../../src/workflows/types';
import type { WorkflowEvolution } from '../../../src/orchestrator/evolution-types';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs operations
jest.mock('fs/promises');

// Mock workflow storage
const mockUpdateWorkflow = jest.fn();
jest.mock('../../../src/workflows/storage', () => ({
  updateWorkflow: (...args: any[]) => mockUpdateWorkflow(...args),
}));

describe('Evolution Applier', () => {
  let mockWorkflow: Workflow;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default fs mocks
    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fs.appendFile as jest.Mock).mockResolvedValue(undefined);
    (fs.readFile as jest.Mock).mockResolvedValue('');

    mockWorkflow = {
      id: 'workflow-1',
      name: 'Test Workflow',
      description: 'Test description',
      nodes: [
        {
          id: 'input-1',
          type: 'input',
          position: { x: 0, y: 0 },
          data: { name: 'Input' },
        },
        {
          id: 'agent-1',
          type: 'claude-agent',
          position: { x: 200, y: 0 },
          data: {
            name: 'Agent 1',
            userQuery: 'Test query',
            model: 'sonnet',
          },
        },
        {
          id: 'output-1',
          type: 'output',
          position: { x: 400, y: 0 },
          data: { name: 'Output' },
        },
      ],
      edges: [
        {
          id: 'edge-1',
          source: 'input-1',
          target: 'agent-1',
        },
        {
          id: 'edge-2',
          source: 'agent-1',
          target: 'output-1',
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockUpdateWorkflow.mockResolvedValue(mockWorkflow);
  });

  describe('applyEvolution - update-node-config', () => {
    it('should apply single update-node-config mutation', async () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Update model',
        mutations: [
          {
            op: 'update-node-config',
            nodeId: 'agent-1',
            path: 'model',
            value: 'opus',
          },
        ],
        expectedImpact: 'Better quality',
      riskAssessment: 'Low risk',
      };

      mockUpdateWorkflow.mockResolvedValue({
        ...mockWorkflow,
        nodes: mockWorkflow.nodes.map((n) =>
          n.id === 'agent-1' ? { ...n, data: { ...n.data, model: 'opus' } } : n
        ),
      });

      const result = await applyEvolution(mockWorkflow, evolution, {
        executionId: 'exec-1',
        nodeId: 'self-1',
        mode: 'auto-apply',
      });

      expect(result.nodes.find((n) => n.id === 'agent-1')?.data.model).toBe('opus');
      expect(mockUpdateWorkflow).toHaveBeenCalledWith(
        'workflow-1',
        expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({
              id: 'agent-1',
              data: expect.objectContaining({ model: 'opus' }),
            }),
          ]),
        })
      );
    });

    it('should apply nested path update', async () => {
      mockWorkflow.nodes[1].data.config = { options: { nested: { value: 10 } } };

      const evolution: WorkflowEvolution = {
        reasoning: 'Update nested value',
        mutations: [
          {
            op: 'update-node-config',
            nodeId: 'agent-1',
            path: 'config.options.nested.value',
            value: 42,
          },
        ],
        expectedImpact: 'Updated nested config',
      riskAssessment: 'Low risk',
      };

      const updatedWorkflow = {
        ...mockWorkflow,
        nodes: mockWorkflow.nodes.map((n) =>
          n.id === 'agent-1'
            ? { ...n, data: { ...n.data, config: { options: { nested: { value: 42 } } } } }
            : n
        ),
      };
      mockUpdateWorkflow.mockResolvedValue(updatedWorkflow);

      const result = await applyEvolution(mockWorkflow, evolution, {
        executionId: 'exec-1',
        nodeId: 'self-1',
        mode: 'auto-apply',
      });

      const agentNode = result.nodes.find((n) => n.id === 'agent-1');
      expect((agentNode?.data as any).config.options.nested.value).toBe(42);
    });

    it('should apply array index path update', async () => {
      mockWorkflow.nodes[1].data.tools = [{ name: 'tool1', enabled: false }];

      const evolution: WorkflowEvolution = {
        reasoning: 'Enable tool',
        mutations: [
          {
            op: 'update-node-config',
            nodeId: 'agent-1',
            path: 'tools.0.enabled',
            value: true,
          },
        ],
        expectedImpact: 'Tool enabled',
      riskAssessment: 'Low risk',
      };

      const updatedWorkflow = {
        ...mockWorkflow,
        nodes: mockWorkflow.nodes.map((n) =>
          n.id === 'agent-1'
            ? { ...n, data: { ...n.data, tools: [{ name: 'tool1', enabled: true }] } }
            : n
        ),
      };
      mockUpdateWorkflow.mockResolvedValue(updatedWorkflow);

      const result = await applyEvolution(mockWorkflow, evolution, {
        executionId: 'exec-1',
        nodeId: 'self-1',
        mode: 'auto-apply',
      });

      const agentNode = result.nodes.find((n) => n.id === 'agent-1');
      expect((agentNode?.data as any).tools[0].enabled).toBe(true);
    });
  });

  describe('applyEvolution - update-prompt', () => {
    it('should apply update-prompt mutation', async () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Update prompt',
        mutations: [
          {
            op: 'update-prompt',
            nodeId: 'agent-1',
            field: 'userQuery',
            newValue: 'New improved query',
          },
        ],
        expectedImpact: 'Better prompts',
      riskAssessment: 'Low risk',
      };

      const updatedWorkflow = {
        ...mockWorkflow,
        nodes: mockWorkflow.nodes.map((n) =>
          n.id === 'agent-1' ? { ...n, data: { ...n.data, userQuery: 'New improved query' } } : n
        ),
      };
      mockUpdateWorkflow.mockResolvedValue(updatedWorkflow);

      const result = await applyEvolution(mockWorkflow, evolution, {
        executionId: 'exec-1',
        nodeId: 'self-1',
        mode: 'auto-apply',
      });

      expect(result.nodes.find((n) => n.id === 'agent-1')?.data.userQuery).toBe('New improved query');
    });
  });

  describe('applyEvolution - update-model', () => {
    it('should apply update-model mutation', async () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Better model',
        mutations: [
          {
            op: 'update-model',
            nodeId: 'agent-1',
            newModel: 'haiku',
          },
        ],
        expectedImpact: 'Faster responses',
      riskAssessment: 'Low risk',
      };

      const updatedWorkflow = {
        ...mockWorkflow,
        nodes: mockWorkflow.nodes.map((n) =>
          n.id === 'agent-1' ? { ...n, data: { ...n.data, model: 'haiku' } } : n
        ),
      };
      mockUpdateWorkflow.mockResolvedValue(updatedWorkflow);

      const result = await applyEvolution(mockWorkflow, evolution, {
        executionId: 'exec-1',
        nodeId: 'self-1',
        mode: 'auto-apply',
      });

      expect(result.nodes.find((n) => n.id === 'agent-1')?.data.model).toBe('haiku');
    });
  });

  describe('applyEvolution - add-node', () => {
    it('should apply add-node mutation', async () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Add new node',
        mutations: [
          {
            op: 'add-node',
            node: {
              id: 'js-1',
              type: 'javascript',
              position: { x: 300, y: 100 },
              data: {
                name: 'JS Node',
                code: 'return input;',
              },
            },
          },
        ],
        expectedImpact: 'New functionality',
      riskAssessment: 'Low risk',
      };

      const updatedWorkflow = {
        ...mockWorkflow,
        nodes: [
          ...mockWorkflow.nodes,
          {
            id: 'js-1',
            type: 'javascript',
            position: { x: 300, y: 100 },
            data: {
              name: 'JS Node',
              code: 'return input;',
            },
          },
        ],
      };
      mockUpdateWorkflow.mockResolvedValue(updatedWorkflow);

      const result = await applyEvolution(mockWorkflow, evolution, {
        executionId: 'exec-1',
        nodeId: 'self-1',
        mode: 'auto-apply',
      });

      expect(result.nodes).toHaveLength(4);
      expect(result.nodes.find((n) => n.id === 'js-1')).toBeDefined();
    });

    it('should apply add-node with connectFrom', async () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Add connected node',
        mutations: [
          {
            op: 'add-node',
            node: {
              id: 'js-1',
              type: 'javascript',
              position: { x: 300, y: 100 },
              data: {
                name: 'JS Node',
                code: 'return input;',
              },
            },
            connectFrom: 'agent-1',
          },
        ],
        expectedImpact: 'Connected node',
      riskAssessment: 'Low risk',
      };

      const updatedWorkflow = {
        ...mockWorkflow,
        nodes: [...mockWorkflow.nodes, evolution.mutations[0].node],
        edges: [
          ...mockWorkflow.edges,
          {
            id: expect.any(String),
            source: 'agent-1',
            target: 'js-1',
          },
        ],
      };
      mockUpdateWorkflow.mockResolvedValue(updatedWorkflow);

      const result = await applyEvolution(mockWorkflow, evolution, {
        executionId: 'exec-1',
        nodeId: 'self-1',
        mode: 'auto-apply',
      });

      const newEdge = result.edges.find((e) => e.source === 'agent-1' && e.target === 'js-1');
      expect(newEdge).toBeDefined();
      expect(newEdge?.id).toBeTruthy();
    });

    it('should apply add-node with connectTo', async () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Add connected node',
        mutations: [
          {
            op: 'add-node',
            node: {
              id: 'js-1',
              type: 'javascript',
              position: { x: 300, y: 100 },
              data: {
                name: 'JS Node',
                code: 'return input;',
              },
            },
            connectTo: 'output-1',
          },
        ],
        expectedImpact: 'Connected node',
      riskAssessment: 'Low risk',
      };

      const updatedWorkflow = {
        ...mockWorkflow,
        nodes: [...mockWorkflow.nodes, evolution.mutations[0].node],
        edges: [
          ...mockWorkflow.edges,
          {
            id: expect.any(String),
            source: 'js-1',
            target: 'output-1',
          },
        ],
      };
      mockUpdateWorkflow.mockResolvedValue(updatedWorkflow);

      const result = await applyEvolution(mockWorkflow, evolution, {
        executionId: 'exec-1',
        nodeId: 'self-1',
        mode: 'auto-apply',
      });

      const newEdge = result.edges.find((e) => e.source === 'js-1' && e.target === 'output-1');
      expect(newEdge).toBeDefined();
    });

    it('should apply add-node with both connectFrom and connectTo', async () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Insert node',
        mutations: [
          {
            op: 'add-node',
            node: {
              id: 'js-1',
              type: 'javascript',
              position: { x: 300, y: 0 },
              data: {
                name: 'JS Node',
                code: 'return input;',
              },
            },
            connectFrom: 'agent-1',
            connectTo: 'output-1',
          },
        ],
        expectedImpact: 'Node inserted in flow',
      riskAssessment: 'Low risk',
      };

      const updatedWorkflow = {
        ...mockWorkflow,
        nodes: [...mockWorkflow.nodes, evolution.mutations[0].node],
        edges: [
          ...mockWorkflow.edges,
          {
            id: expect.any(String),
            source: 'agent-1',
            target: 'js-1',
          },
          {
            id: expect.any(String),
            source: 'js-1',
            target: 'output-1',
          },
        ],
      };
      mockUpdateWorkflow.mockResolvedValue(updatedWorkflow);

      const result = await applyEvolution(mockWorkflow, evolution, {
        executionId: 'exec-1',
        nodeId: 'self-1',
        mode: 'auto-apply',
      });

      expect(result.edges.filter((e) => e.source === 'agent-1' && e.target === 'js-1')).toHaveLength(1);
      expect(result.edges.filter((e) => e.source === 'js-1' && e.target === 'output-1')).toHaveLength(1);
    });
  });

  describe('applyEvolution - remove-node', () => {
    it('should apply remove-node mutation', async () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Remove node',
        mutations: [
          {
            op: 'remove-node',
            nodeId: 'agent-1',
          },
        ],
        expectedImpact: 'Simplified workflow',
      riskAssessment: 'Low risk',
      };

      const updatedWorkflow = {
        ...mockWorkflow,
        nodes: mockWorkflow.nodes.filter((n) => n.id !== 'agent-1'),
        edges: mockWorkflow.edges.filter((e) => e.source !== 'agent-1' && e.target !== 'agent-1'),
      };
      mockUpdateWorkflow.mockResolvedValue(updatedWorkflow);

      const result = await applyEvolution(mockWorkflow, evolution, {
        executionId: 'exec-1',
        nodeId: 'self-1',
        mode: 'auto-apply',
      });

      expect(result.nodes.find((n) => n.id === 'agent-1')).toBeUndefined();
      expect(result.edges.find((e) => e.source === 'agent-1' || e.target === 'agent-1')).toBeUndefined();
    });

    it('should cascade edge removal when removing node', async () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Remove node with edges',
        mutations: [
          {
            op: 'remove-node',
            nodeId: 'agent-1',
          },
        ],
        expectedImpact: 'Removed node and connected edges',
      riskAssessment: 'Low risk',
      };

      const originalEdgeCount = mockWorkflow.edges.length;
      const updatedWorkflow = {
        ...mockWorkflow,
        nodes: mockWorkflow.nodes.filter((n) => n.id !== 'agent-1'),
        edges: [],
      };
      mockUpdateWorkflow.mockResolvedValue(updatedWorkflow);

      const result = await applyEvolution(mockWorkflow, evolution, {
        executionId: 'exec-1',
        nodeId: 'self-1',
        mode: 'auto-apply',
      });

      expect(result.edges.length).toBe(0);
      expect(originalEdgeCount).toBe(2);
    });
  });

  describe('applyEvolution - add-edge', () => {
    it('should apply add-edge mutation', async () => {
      // Remove edge-2 first
      mockWorkflow.edges = mockWorkflow.edges.filter((e) => e.id !== 'edge-2');

      const evolution: WorkflowEvolution = {
        reasoning: 'Add edge',
        mutations: [
          {
            op: 'add-edge',
            edge: {
              id: 'edge-3',
              source: 'agent-1',
              target: 'output-1',
            },
          },
        ],
        expectedImpact: 'New connection',
      riskAssessment: 'Low risk',
      };

      const updatedWorkflow = {
        ...mockWorkflow,
        edges: [...mockWorkflow.edges, evolution.mutations[0].edge],
      };
      mockUpdateWorkflow.mockResolvedValue(updatedWorkflow);

      const result = await applyEvolution(mockWorkflow, evolution, {
        executionId: 'exec-1',
        nodeId: 'self-1',
        mode: 'auto-apply',
      });

      expect(result.edges.find((e) => e.id === 'edge-3')).toBeDefined();
    });
  });

  describe('applyEvolution - remove-edge', () => {
    it('should apply remove-edge mutation', async () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Remove edge',
        mutations: [
          {
            op: 'remove-edge',
            edgeId: 'edge-2',
          },
        ],
        expectedImpact: 'Disconnected nodes',
      riskAssessment: 'Low risk',
      };

      const updatedWorkflow = {
        ...mockWorkflow,
        edges: mockWorkflow.edges.filter((e) => e.id !== 'edge-2'),
      };
      mockUpdateWorkflow.mockResolvedValue(updatedWorkflow);

      const result = await applyEvolution(mockWorkflow, evolution, {
        executionId: 'exec-1',
        nodeId: 'self-1',
        mode: 'auto-apply',
      });

      expect(result.edges.find((e) => e.id === 'edge-2')).toBeUndefined();
    });
  });

  describe('applyEvolution - update-workflow-setting', () => {
    it('should apply update-workflow-setting for name', async () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Rename workflow',
        mutations: [
          {
            op: 'update-workflow-setting',
            field: 'name',
            value: 'New Workflow Name',
          },
        ],
        expectedImpact: 'Better naming',
      riskAssessment: 'Low risk',
      };

      const updatedWorkflow = {
        ...mockWorkflow,
        name: 'New Workflow Name',
      };
      mockUpdateWorkflow.mockResolvedValue(updatedWorkflow);

      const result = await applyEvolution(mockWorkflow, evolution, {
        executionId: 'exec-1',
        nodeId: 'self-1',
        mode: 'auto-apply',
      });

      expect(result.name).toBe('New Workflow Name');
    });

    it('should apply update-workflow-setting for description', async () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Update description',
        mutations: [
          {
            op: 'update-workflow-setting',
            field: 'description',
            value: 'New description',
          },
        ],
        expectedImpact: 'Better docs',
      riskAssessment: 'Low risk',
      };

      const updatedWorkflow = {
        ...mockWorkflow,
        description: 'New description',
      };
      mockUpdateWorkflow.mockResolvedValue(updatedWorkflow);

      const result = await applyEvolution(mockWorkflow, evolution, {
        executionId: 'exec-1',
        nodeId: 'self-1',
        mode: 'auto-apply',
      });

      expect(result.description).toBe('New description');
    });

    it('should apply update-workflow-setting for workingDirectory', async () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Change working directory',
        mutations: [
          {
            op: 'update-workflow-setting',
            field: 'workingDirectory',
            value: '/new/path',
          },
        ],
        expectedImpact: 'Different context',
      riskAssessment: 'Low risk',
      };

      const updatedWorkflow = {
        ...mockWorkflow,
        workingDirectory: '/new/path',
      };
      mockUpdateWorkflow.mockResolvedValue(updatedWorkflow);

      const result = await applyEvolution(mockWorkflow, evolution, {
        executionId: 'exec-1',
        nodeId: 'self-1',
        mode: 'auto-apply',
      });

      expect(result.workingDirectory).toBe('/new/path');
    });
  });

  describe('applyEvolution - compound mutations', () => {
    it('should apply multiple mutations in order', async () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Multiple changes',
        mutations: [
          {
            op: 'update-node-config',
            nodeId: 'agent-1',
            path: 'model',
            value: 'opus',
          },
          {
            op: 'add-node',
            node: {
              id: 'js-1',
              type: 'javascript',
              position: { x: 300, y: 100 },
              data: {
                name: 'JS Node',
                code: 'return input;',
              },
            },
          },
          {
            op: 'add-edge',
            edge: {
              id: 'edge-3',
              source: 'agent-1',
              target: 'js-1',
            },
          },
        ],
        expectedImpact: 'Complex update',
      riskAssessment: 'Low risk',
      };

      const updatedWorkflow = {
        ...mockWorkflow,
        nodes: [
          ...mockWorkflow.nodes.map((n) =>
            n.id === 'agent-1' ? { ...n, data: { ...n.data, model: 'opus' } } : n
          ),
          {
            id: 'js-1',
            type: 'javascript',
            position: { x: 300, y: 100 },
            data: {
              name: 'JS Node',
              code: 'return input;',
            },
          },
        ],
        edges: [
          ...mockWorkflow.edges,
          {
            id: 'edge-3',
            source: 'agent-1',
            target: 'js-1',
          },
        ],
      };
      mockUpdateWorkflow.mockResolvedValue(updatedWorkflow);

      const result = await applyEvolution(mockWorkflow, evolution, {
        executionId: 'exec-1',
        nodeId: 'self-1',
        mode: 'auto-apply',
      });

      expect(result.nodes.find((n) => n.id === 'agent-1')?.data.model).toBe('opus');
      expect(result.nodes.find((n) => n.id === 'js-1')).toBeDefined();
      expect(result.edges.find((e) => e.id === 'edge-3')).toBeDefined();
    });
  });

  describe('applyEvolution - error handling', () => {
    it('should throw error when workflow not found', async () => {
      mockUpdateWorkflow.mockResolvedValue(null);

      const evolution: WorkflowEvolution = {
        reasoning: 'Test',
        mutations: [
          {
            op: 'update-node-config',
            nodeId: 'agent-1',
            path: 'model',
            value: 'opus',
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      await expect(
        applyEvolution(mockWorkflow, evolution, {
          executionId: 'exec-1',
          nodeId: 'self-1',
          mode: 'auto-apply',
        })
      ).rejects.toThrow('Workflow not found: workflow-1');
    });
  });

  describe('createEvolutionSnapshot', () => {
    it('should capture complete workflow state', () => {
      const snapshot = createEvolutionSnapshot(mockWorkflow);

      expect(snapshot).toMatchObject({
        id: mockWorkflow.id,
        name: mockWorkflow.name,
        nodes: mockWorkflow.nodes,
        edges: mockWorkflow.edges,
      });
      expect(snapshot.capturedAt).toBeInstanceOf(Date);
    });

    it('should have timestamp', () => {
      const before = Date.now();
      const snapshot = createEvolutionSnapshot(mockWorkflow);
      const after = Date.now();

      expect(snapshot.capturedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(snapshot.capturedAt.getTime()).toBeLessThanOrEqual(after);
    });
  });

  describe('describeWorkflowDiff', () => {
    it('should identify added nodes', () => {
      const beforeSnapshot = createEvolutionSnapshot(mockWorkflow);
      const afterWorkflow = {
        ...mockWorkflow,
        nodes: [
          ...mockWorkflow.nodes,
          {
            id: 'js-1',
            type: 'javascript',
            position: { x: 300, y: 100 },
            data: { name: 'JS Node', code: 'return input;' },
          },
        ],
      };
      const afterSnapshot = createEvolutionSnapshot(afterWorkflow);

      const diff = describeWorkflowDiff(beforeSnapshot, afterSnapshot);

      expect(diff.addedNodes).toContain('js-1');
      expect(diff.addedNodes).toHaveLength(1);
      expect(diff.removedNodes).toHaveLength(0);
      expect(diff.changedNodes).toHaveLength(0);
    });

    it('should identify removed nodes', () => {
      const beforeSnapshot = createEvolutionSnapshot(mockWorkflow);
      const afterWorkflow = {
        ...mockWorkflow,
        nodes: mockWorkflow.nodes.filter((n) => n.id !== 'agent-1'),
      };
      const afterSnapshot = createEvolutionSnapshot(afterWorkflow);

      const diff = describeWorkflowDiff(beforeSnapshot, afterSnapshot);

      expect(diff.removedNodes).toContain('agent-1');
      expect(diff.removedNodes).toHaveLength(1);
      expect(diff.addedNodes).toHaveLength(0);
    });

    it('should identify changed nodes', () => {
      const beforeSnapshot = createEvolutionSnapshot(mockWorkflow);
      const afterWorkflow = {
        ...mockWorkflow,
        nodes: mockWorkflow.nodes.map((n) =>
          n.id === 'agent-1' ? { ...n, data: { ...n.data, model: 'opus' } } : n
        ),
      };
      const afterSnapshot = createEvolutionSnapshot(afterWorkflow);

      const diff = describeWorkflowDiff(beforeSnapshot, afterSnapshot);

      expect(diff.changedNodes).toContain('agent-1');
      expect(diff.changedNodes).toHaveLength(1);
      expect(diff.addedNodes).toHaveLength(0);
      expect(diff.removedNodes).toHaveLength(0);
    });

    it('should identify added edges', () => {
      const beforeSnapshot = createEvolutionSnapshot(mockWorkflow);
      const afterWorkflow = {
        ...mockWorkflow,
        edges: [
          ...mockWorkflow.edges,
          {
            id: 'edge-3',
            source: 'input-1',
            target: 'output-1',
          },
        ],
      };
      const afterSnapshot = createEvolutionSnapshot(afterWorkflow);

      const diff = describeWorkflowDiff(beforeSnapshot, afterSnapshot);

      expect(diff.addedEdges).toContain('edge-3');
      expect(diff.addedEdges).toHaveLength(1);
      expect(diff.removedEdges).toHaveLength(0);
    });

    it('should identify removed edges', () => {
      const beforeSnapshot = createEvolutionSnapshot(mockWorkflow);
      const afterWorkflow = {
        ...mockWorkflow,
        edges: mockWorkflow.edges.filter((e) => e.id !== 'edge-2'),
      };
      const afterSnapshot = createEvolutionSnapshot(afterWorkflow);

      const diff = describeWorkflowDiff(beforeSnapshot, afterSnapshot);

      expect(diff.removedEdges).toContain('edge-2');
      expect(diff.removedEdges).toHaveLength(1);
      expect(diff.addedEdges).toHaveLength(0);
    });
  });

  describe('appendEvolutionHistory', () => {
    it('should write evolution record to JSONL file', async () => {
      const record = {
        timestamp: new Date(),
        workflowId: 'workflow-1',
        executionId: 'exec-1',
        nodeId: 'self-1',
        mode: 'auto-apply' as const,
        evolution: {
          reasoning: 'Test',
          mutations: [],
          expectedImpact: 'None',
        },
        applied: true,
        beforeSnapshot: createEvolutionSnapshot(mockWorkflow),
        afterSnapshot: createEvolutionSnapshot(mockWorkflow),
      };

      await appendEvolutionHistory(record);

      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('workflow-1/history.jsonl'),
        expect.stringContaining('"workflowId":"workflow-1"'),
        'utf-8'
      );
    });

    it('should create directory if not exists', async () => {
      const record = {
        timestamp: new Date(),
        workflowId: 'workflow-1',
        executionId: 'exec-1',
        nodeId: 'self-1',
        mode: 'auto-apply' as const,
        evolution: {
          reasoning: 'Test',
          mutations: [],
          expectedImpact: 'None',
        },
        applied: true,
        beforeSnapshot: createEvolutionSnapshot(mockWorkflow),
        afterSnapshot: createEvolutionSnapshot(mockWorkflow),
      };

      await appendEvolutionHistory(record);

      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('workflow-1'),
        expect.objectContaining({ recursive: true })
      );
    });
  });

  describe('readEvolutionHistory', () => {
    it('should read and parse evolution history from JSONL', async () => {
      const record1 = {
        timestamp: new Date().toISOString(),
        workflowId: 'workflow-1',
        executionId: 'exec-1',
        nodeId: 'self-1',
        mode: 'auto-apply',
        evolution: { reasoning: 'Test 1', mutations: [], expectedImpact: 'None' },
        applied: true,
      };
      const record2 = {
        timestamp: new Date().toISOString(),
        workflowId: 'workflow-1',
        executionId: 'exec-2',
        nodeId: 'self-1',
        mode: 'suggest',
        evolution: { reasoning: 'Test 2', mutations: [], expectedImpact: 'None' },
        applied: false,
      };

      (fs.readFile as jest.Mock).mockResolvedValue(
        `${JSON.stringify(record1)}\n${JSON.stringify(record2)}\n`
      );

      const history = await readEvolutionHistory('workflow-1');

      expect(history).toHaveLength(2);
      expect(history[0].executionId).toBe('exec-1');
      expect(history[1].executionId).toBe('exec-2');
    });

    it('should return empty array when file does not exist', async () => {
      (fs.readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      const history = await readEvolutionHistory('workflow-1');

      expect(history).toEqual([]);
    });

    it('should filter out empty lines', async () => {
      const record = {
        timestamp: new Date().toISOString(),
        workflowId: 'workflow-1',
        executionId: 'exec-1',
        nodeId: 'self-1',
        mode: 'auto-apply',
        evolution: { reasoning: 'Test', mutations: [], expectedImpact: 'None' },
        applied: true,
      };

      (fs.readFile as jest.Mock).mockResolvedValue(
        `${JSON.stringify(record)}\n\n\n${JSON.stringify(record)}\n`
      );

      const history = await readEvolutionHistory('workflow-1');

      expect(history).toHaveLength(2);
    });
  });
});

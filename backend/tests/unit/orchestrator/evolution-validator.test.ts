import { validateEvolution } from '../../../src/orchestrator/evolution-validator';
import type { Workflow, WorkflowNode, WorkflowEdge } from '../../../src/workflows/types';
import type { WorkflowEvolution } from '../../../src/orchestrator/evolution-types';
import { loadAllSchemas } from '../../../src/schemas';

describe('Evolution Validator', () => {
  let mockWorkflow: Workflow;
  let mockSchemas: ReturnType<typeof loadAllSchemas>;

  beforeEach(() => {
    // Load real schemas
    mockSchemas = loadAllSchemas();

    // Create a basic workflow for testing
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
  });

  describe('update-node-config mutations', () => {
    it('should validate update-node-config mutation with valid path', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Update model to opus',
        mutations: [
          {
            op: 'update-node-config',
            nodeId: 'agent-1',
            path: 'model',
            value: 'opus',
          },
        ],
        expectedImpact: 'Better quality responses',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.sanitizedEvolution).toEqual(evolution);
    });

    it('should reject update-node-config with non-existent path', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Test invalid path',
        mutations: [
          {
            op: 'update-node-config',
            nodeId: 'agent-1',
            path: 'invalidField',
            value: 'test',
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Config path does not exist in schema: invalidField');
    });

    it('should reject update-node-config with type mismatch', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Test type mismatch',
        mutations: [
          {
            op: 'update-node-config',
            nodeId: 'agent-1',
            path: 'model',
            value: 42, // Should be string
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Expected a string value'))).toBe(true);
    });

    it('should reject update-node-config with prototype pollution path', () => {
      const dangerousPaths = ['__proto__.isAdmin', 'prototype.admin', 'constructor.prototype.admin'];

      dangerousPaths.forEach((path) => {
        const evolution: WorkflowEvolution = {
          reasoning: 'Test dangerous path',
          mutations: [
            {
              op: 'update-node-config',
              nodeId: 'agent-1',
              path,
              value: true,
            },
          ],
          expectedImpact: 'None',
        riskAssessment: 'Low risk',
        };

        const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Invalid config path'))).toBe(true);
      });
    });

    it('should validate update-node-config with nested array path', () => {
      // Add a node with array config
      mockWorkflow.nodes.push({
        id: 'agent-2',
        type: 'claude-agent',
        position: { x: 200, y: 200 },
        data: {
          name: 'Agent 2',
          userQuery: 'Test',
          model: 'sonnet',
          tools: [{ enabled: false, name: 'tool1' }],
        },
      });

      const evolution: WorkflowEvolution = {
        reasoning: 'Enable tool',
        mutations: [
          {
            op: 'update-node-config',
            nodeId: 'agent-2',
            path: 'tools.0.enabled',
            value: true,
          },
        ],
        expectedImpact: 'Tool enabled',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('update-prompt mutations', () => {
    it('should validate update-prompt on agent node', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Improve prompt',
        mutations: [
          {
            op: 'update-prompt',
            nodeId: 'agent-1',
            field: 'userQuery',
            newValue: 'New improved query',
          },
        ],
        expectedImpact: 'Better results',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject update-prompt on non-agent node', () => {
      // Add a JavaScript node
      mockWorkflow.nodes.push({
        id: 'js-1',
        type: 'javascript',
        position: { x: 200, y: 200 },
        data: {
          name: 'JS Node',
          code: 'return input;',
        },
      });

      const evolution: WorkflowEvolution = {
        reasoning: 'Test invalid update-prompt',
        mutations: [
          {
            op: 'update-prompt',
            nodeId: 'js-1',
            field: 'userQuery',
            newValue: 'Test',
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Prompt field does not exist in schema'))).toBe(true);
    });
  });

  describe('update-model mutations', () => {
    it('should validate update-model on compatible node', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Use better model',
        mutations: [
          {
            op: 'update-model',
            nodeId: 'agent-1',
            newModel: 'opus',
          },
        ],
        expectedImpact: 'Higher quality',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject update-model on incompatible node', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Test invalid model update',
        mutations: [
          {
            op: 'update-model',
            nodeId: 'input-1',
            newModel: 'opus',
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Node does not support model updates'))).toBe(true);
    });
  });

  describe('add-node mutations', () => {
    it('should validate add-node with valid schema', () => {
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

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject add-node with invalid schema', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Add incomplete node',
        mutations: [
          {
            op: 'add-node',
            node: {
              id: 'agent-2',
              type: 'claude-agent',
              position: { x: 300, y: 100 },
              data: {
                name: 'Incomplete Agent',
                // Missing required userQuery
              },
            },
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Missing required property: userQuery'))).toBe(true);
    });

    it('should reject add-node with duplicate ID', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Add node with duplicate ID',
        mutations: [
          {
            op: 'add-node',
            node: {
              id: 'agent-1', // Already exists
              type: 'javascript',
              position: { x: 300, y: 100 },
              data: {
                name: 'Duplicate',
                code: 'return input;',
              },
            },
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Node ID agent-1 already exists'))).toBe(true);
    });

    it('should reject add-node with duplicate name', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Add node with duplicate name',
        mutations: [
          {
            op: 'add-node',
            node: {
              id: 'agent-2',
              type: 'claude-agent',
              position: { x: 300, y: 100 },
              data: {
                name: 'Agent 1', // Duplicate name
                userQuery: 'Test',
              },
            },
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Node name must be unique'))).toBe(true);
    });

    it('should reject add-node with unknown type', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Add unknown node type',
        mutations: [
          {
            op: 'add-node',
            node: {
              id: 'unknown-1',
              type: 'unknown-type',
              position: { x: 300, y: 100 },
              data: { name: 'Unknown' },
            },
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Unknown node type: unknown-type'))).toBe(true);
    });

    it('should reject add-node with invalid position', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Add node with invalid position',
        mutations: [
          {
            op: 'add-node',
            node: {
              id: 'js-1',
              type: 'javascript',
              position: { x: 'invalid' as any, y: 100 },
              data: {
                name: 'JS Node',
                code: 'return input;',
              },
            },
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Node position must include numeric x/y values'))).toBe(true);
    });

    it('should validate add-node with connectFrom and connectTo', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Add node with connections',
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
        expectedImpact: 'Insert node in flow',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject add-node creating cycle', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Add node creating cycle',
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
            connectFrom: 'output-1',
            connectTo: 'input-1',
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Added edges introduce a cycle'))).toBe(true);
    });

    it('should reject add-node with non-existent connectFrom', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Add node with invalid connectFrom',
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
            connectFrom: 'non-existent-node',
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('connectFrom node does not exist'))).toBe(true);
    });
  });

  describe('remove-node mutations', () => {
    it('should validate remove-node with valid target', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Remove unnecessary node',
        mutations: [
          {
            op: 'remove-node',
            nodeId: 'agent-1',
          },
        ],
        expectedImpact: 'Simplified workflow',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject remove-node targeting input node', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Remove input',
        mutations: [
          {
            op: 'remove-node',
            nodeId: 'input-1',
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Cannot remove input/output nodes'))).toBe(true);
    });

    it('should reject remove-node targeting output node', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Remove output',
        mutations: [
          {
            op: 'remove-node',
            nodeId: 'output-1',
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Cannot remove input/output nodes'))).toBe(true);
    });

    it('should reject remove-node with non-existent ID', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Remove non-existent node',
        mutations: [
          {
            op: 'remove-node',
            nodeId: 'non-existent-id',
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Node non-existent-id does not exist'))).toBe(true);
    });

    it('should reject remove-node targeting self-reflect node', () => {
      mockWorkflow.nodes.push({
        id: 'self-1',
        type: 'self-reflect',
        position: { x: 600, y: 0 },
        data: {
          name: 'Self Reflect',
          reflectionGoal: 'Test',
        },
      });

      const evolution: WorkflowEvolution = {
        reasoning: 'Remove self',
        mutations: [
          {
            op: 'remove-node',
            nodeId: 'self-1',
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas, { selfNodeId: 'self-1' });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Cannot remove the self-reflect node'))).toBe(true);
    });

    it('should reject remove-node connected to self-reflect', () => {
      mockWorkflow.nodes.push({
        id: 'self-1',
        type: 'self-reflect',
        position: { x: 600, y: 0 },
        data: {
          name: 'Self Reflect',
          reflectionGoal: 'Test',
        },
      });
      mockWorkflow.edges.push({
        id: 'edge-3',
        source: 'agent-1',
        target: 'self-1',
      });

      const evolution: WorkflowEvolution = {
        reasoning: 'Remove predecessor of self-reflect',
        mutations: [
          {
            op: 'remove-node',
            nodeId: 'agent-1',
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas, { selfNodeId: 'self-1' });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Cannot remove a node connected to the self-reflect node'))).toBe(true);
    });
  });

  describe('add-edge mutations', () => {
    it('should validate add-edge with valid endpoints', () => {
      // Remove existing edge first
      mockWorkflow.edges = mockWorkflow.edges.filter((e) => e.id !== 'edge-2');

      const evolution: WorkflowEvolution = {
        reasoning: 'Add connection',
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
        expectedImpact: 'Connect nodes',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject add-edge with duplicate ID', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Add edge with duplicate ID',
        mutations: [
          {
            op: 'add-edge',
            edge: {
              id: 'edge-1', // Already exists
              source: 'agent-1',
              target: 'output-1',
            },
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Edge ID edge-1 already exists'))).toBe(true);
    });

    it('should reject add-edge with duplicate connection', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Add duplicate edge',
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
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Duplicate edge connection'))).toBe(true);
    });

    it('should reject add-edge with non-existent source', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Add edge with invalid source',
        mutations: [
          {
            op: 'add-edge',
            edge: {
              id: 'edge-3',
              source: 'non-existent',
              target: 'output-1',
            },
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Edge source/target must exist'))).toBe(true);
    });

    it('should reject add-edge creating cycle', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Add edge creating cycle',
        mutations: [
          {
            op: 'add-edge',
            edge: {
              id: 'edge-3',
              source: 'output-1',
              target: 'input-1',
            },
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Added edge introduces a cycle'))).toBe(true);
    });

    it('should reject add-edge to self-reflect node', () => {
      mockWorkflow.nodes.push({
        id: 'self-1',
        type: 'self-reflect',
        position: { x: 600, y: 0 },
        data: {
          name: 'Self Reflect',
          reflectionGoal: 'Test',
        },
      });

      const evolution: WorkflowEvolution = {
        reasoning: 'Add edge to self-reflect',
        mutations: [
          {
            op: 'add-edge',
            edge: {
              id: 'edge-3',
              source: 'agent-1',
              target: 'self-1',
            },
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas, { selfNodeId: 'self-1' });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Cannot modify edges attached to the self-reflect node'))).toBe(true);
    });
  });

  describe('remove-edge mutations', () => {
    it('should validate remove-edge with valid ID', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Remove connection',
        mutations: [
          {
            op: 'remove-edge',
            edgeId: 'edge-2',
          },
        ],
        expectedImpact: 'Disconnect nodes',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject remove-edge with non-existent ID', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Remove non-existent edge',
        mutations: [
          {
            op: 'remove-edge',
            edgeId: 'non-existent-edge',
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Edge non-existent-edge does not exist'))).toBe(true);
    });

    it('should reject remove-edge from self-reflect node', () => {
      mockWorkflow.nodes.push({
        id: 'self-1',
        type: 'self-reflect',
        position: { x: 600, y: 0 },
        data: {
          name: 'Self Reflect',
          reflectionGoal: 'Test',
        },
      });
      mockWorkflow.edges.push({
        id: 'edge-3',
        source: 'agent-1',
        target: 'self-1',
      });

      const evolution: WorkflowEvolution = {
        reasoning: 'Remove edge from self-reflect',
        mutations: [
          {
            op: 'remove-edge',
            edgeId: 'edge-3',
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas, { selfNodeId: 'self-1' });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Cannot modify edges attached to the self-reflect node'))).toBe(true);
    });
  });

  describe('update-workflow-setting mutations', () => {
    it('should validate update-workflow-setting for name', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Update workflow name',
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

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject update-workflow-setting with invalid field', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Update invalid field',
        mutations: [
          {
            op: 'update-workflow-setting',
            field: 'invalidField',
            value: 'test',
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid workflow setting field'))).toBe(true);
    });

    it('should reject update-workflow-setting with non-string value', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Update with non-string',
        mutations: [
          {
            op: 'update-workflow-setting',
            field: 'name',
            value: 42,
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Workflow setting must be a string'))).toBe(true);
    });
  });

  describe('scope enforcement', () => {
    it('should reject add-node when nodes scope not allowed', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Add node without permission',
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
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas, {
        scope: ['prompts', 'models'],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Mutation scope 'nodes' is not allowed"))).toBe(true);
    });

    it('should reject add-edge when edges scope not allowed', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Add edge without permission',
        mutations: [
          {
            op: 'add-edge',
            edge: {
              id: 'edge-3',
              source: 'input-1',
              target: 'output-1',
            },
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas, {
        scope: ['prompts'],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Mutation scope 'edges' is not allowed"))).toBe(true);
    });

    it('should reject update-prompt when prompts scope not allowed', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Update prompt without permission',
        mutations: [
          {
            op: 'update-prompt',
            nodeId: 'agent-1',
            field: 'userQuery',
            newValue: 'New query',
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas, {
        scope: ['models', 'tools'],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Mutation scope 'prompts' is not allowed"))).toBe(true);
    });

    it('should reject update-model when models scope not allowed', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Update model without permission',
        mutations: [
          {
            op: 'update-model',
            nodeId: 'agent-1',
            newModel: 'opus',
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas, {
        scope: ['prompts'],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Mutation scope 'models' is not allowed"))).toBe(true);
    });

    it('should reject update-workflow-setting when parameters scope not allowed', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Update parameter without permission',
        mutations: [
          {
            op: 'update-workflow-setting',
            field: 'name',
            value: 'New Name',
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas, {
        scope: ['nodes'],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Mutation scope 'parameters' is not allowed"))).toBe(true);
    });

    it('should detect prompts scope for update-node-config userQuery', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Update userQuery',
        mutations: [
          {
            op: 'update-node-config',
            nodeId: 'agent-1',
            path: 'userQuery',
            value: 'New query',
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas, {
        scope: ['models'],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Mutation scope 'prompts' is not allowed"))).toBe(true);
    });

    it('should detect tools scope for update-node-config tools', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Update tools',
        mutations: [
          {
            op: 'update-node-config',
            nodeId: 'agent-1',
            path: 'tools.0.enabled',
            value: true,
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas, {
        scope: ['prompts', 'models'],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Mutation scope 'tools' is not allowed"))).toBe(true);
    });
  });

  describe('maxMutations limit', () => {
    it('should reject evolution exceeding maxMutations', () => {
      const mutations = Array.from({ length: 15 }, (_, i) => ({
        op: 'update-node-config' as const,
        nodeId: 'agent-1',
        path: 'model',
        value: i % 2 === 0 ? 'opus' : 'sonnet',
      }));

      const evolution: WorkflowEvolution = {
        reasoning: 'Too many mutations',
        mutations,
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas, {
        maxMutations: 10,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Mutation count exceeds maxMutations (10)'))).toBe(true);
    });

    it('should accept evolution within maxMutations limit', () => {
      const mutations = Array.from({ length: 5 }, (_, i) => ({
        op: 'update-node-config' as const,
        nodeId: 'agent-1',
        path: 'model',
        value: i % 2 === 0 ? 'opus' : 'sonnet',
      }));

      const evolution: WorkflowEvolution = {
        reasoning: 'Within limits',
        mutations,
        expectedImpact: 'Multiple updates',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas, {
        maxMutations: 10,
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('compound mutations', () => {
    it('should validate multiple valid mutations in sequence', () => {
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
            op: 'update-prompt',
            nodeId: 'agent-1',
            field: 'userQuery',
            newValue: 'New query',
          },
        ],
        expectedImpact: 'Better performance',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should collect all errors from partial failures', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Some valid, some invalid',
        mutations: [
          {
            op: 'update-node-config',
            nodeId: 'agent-1',
            path: 'model',
            value: 'opus',
          },
          {
            op: 'remove-node',
            nodeId: 'non-existent',
          },
          {
            op: 'add-edge',
            edge: {
              id: 'edge-1', // Duplicate
              source: 'agent-1',
              target: 'output-1',
            },
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
      expect(result.errors.some((e) => e.includes('does not exist'))).toBe(true);
      expect(result.errors.some((e) => e.includes('already exists'))).toBe(true);
    });
  });

  describe('sanitization', () => {
    it('should sanitize evolution with missing fields', () => {
      const evolution: any = {
        mutations: [
          {
            op: 'update-node-config',
            nodeId: 'agent-1',
            path: 'model',
            value: 'opus',
          },
        ],
        // Missing reasoning and expectedImpact
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.sanitizedEvolution.reasoning).toBe('');
      expect(result.sanitizedEvolution.expectedImpact).toBe('');
      expect(result.sanitizedEvolution.mutations).toHaveLength(1);
    });

    it('should filter out invalid mutation objects', () => {
      const evolution: any = {
        reasoning: 'Test',
        mutations: [
          null,
          'invalid',
          {
            op: 'update-node-config',
            nodeId: 'agent-1',
            path: 'model',
            value: 'opus',
          },
          undefined,
        ],
        expectedImpact: 'Test',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.sanitizedEvolution.mutations).toHaveLength(1);
      expect(result.sanitizedEvolution.mutations[0]).toHaveProperty('op', 'update-node-config');
    });
  });

  describe('unknown mutation op', () => {
    it('should reject unknown mutation operation', () => {
      const evolution: any = {
        reasoning: 'Unknown op',
        mutations: [
          {
            op: 'unknown-operation',
            data: 'test',
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Unknown mutation op: unknown-operation'))).toBe(true);
    });
  });

  describe('self-modification prevention', () => {
    beforeEach(() => {
      mockWorkflow.nodes.push({
        id: 'self-1',
        type: 'self-reflect',
        position: { x: 600, y: 0 },
        data: {
          name: 'Self Reflect',
          reflectionGoal: 'Improve workflow',
        },
      });
    });

    it('should prevent update-node-config on self-reflect node', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Modify self',
        mutations: [
          {
            op: 'update-node-config',
            nodeId: 'self-1',
            path: 'reflectionGoal',
            value: 'New goal',
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas, { selfNodeId: 'self-1' });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Cannot modify the self-reflect node'))).toBe(true);
    });

    it('should prevent update-prompt on self-reflect node', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Modify self prompt',
        mutations: [
          {
            op: 'update-prompt',
            nodeId: 'self-1',
            field: 'reflectionGoal',
            newValue: 'New goal',
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas, { selfNodeId: 'self-1' });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Cannot modify the self-reflect node'))).toBe(true);
    });

    it('should prevent update-model on self-reflect node', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Modify self model',
        mutations: [
          {
            op: 'update-model',
            nodeId: 'self-1',
            newModel: 'opus',
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas, { selfNodeId: 'self-1' });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Cannot modify the self-reflect node'))).toBe(true);
    });

    it('should prevent add-node with self-reflect ID', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Add node with self ID',
        mutations: [
          {
            op: 'add-node',
            node: {
              id: 'self-1',
              type: 'javascript',
              position: { x: 300, y: 100 },
              data: {
                name: 'Duplicate',
                code: 'return input;',
              },
            },
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas, { selfNodeId: 'self-1' });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Cannot add a node with the self-reflect node ID'))).toBe(true);
    });

    it('should prevent add-node with connectFrom self-reflect', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Connect from self',
        mutations: [
          {
            op: 'add-node',
            node: {
              id: 'js-1',
              type: 'javascript',
              position: { x: 700, y: 0 },
              data: {
                name: 'JS Node',
                code: 'return input;',
              },
            },
            connectFrom: 'self-1',
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas, { selfNodeId: 'self-1' });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Cannot connect from the self-reflect node'))).toBe(true);
    });

    it('should prevent add-node with connectTo self-reflect', () => {
      const evolution: WorkflowEvolution = {
        reasoning: 'Connect to self',
        mutations: [
          {
            op: 'add-node',
            node: {
              id: 'js-1',
              type: 'javascript',
              position: { x: 500, y: 0 },
              data: {
                name: 'JS Node',
                code: 'return input;',
              },
            },
            connectTo: 'self-1',
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      const result = validateEvolution(mockWorkflow, evolution, mockSchemas, { selfNodeId: 'self-1' });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Cannot connect to the self-reflect node'))).toBe(true);
    });
  });
});

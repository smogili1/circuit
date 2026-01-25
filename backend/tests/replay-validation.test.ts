import { validateReplayConfiguration, ReplayValidationResult } from '../src/orchestrator/validation';
import { ExecutionSummary, ExecutionNodeSummary } from '../src/executions/storage';
import { Workflow, WorkflowNode, WorkflowEdge } from '../src/workflows/types';

describe('validateReplayConfiguration', () => {
  // Helper to create a basic workflow
  const createWorkflow = (
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    id: string = 'workflow-1'
  ): Workflow => ({
    id,
    name: 'Test Workflow',
    nodes,
    edges,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Helper to create a node
  const createNode = (id: string, type: string, name: string): WorkflowNode => ({
    id,
    type: type as WorkflowNode['type'],
    position: { x: 0, y: 0 },
    data: { type: type as WorkflowNode['type'], name } as WorkflowNode['data'],
  });

  // Helper to create an edge
  const createEdge = (source: string, target: string, sourceHandle?: string): WorkflowEdge => ({
    id: `edge-${source}-${target}`,
    source,
    target,
    sourceHandle,
  });

  // Helper to create an execution summary
  const createExecutionSummary = (
    workflowId: string,
    nodes: Record<string, ExecutionNodeSummary>,
    overrides: Partial<ExecutionSummary> = {}
  ): ExecutionSummary => ({
    executionId: 'exec-123',
    workflowId,
    input: 'test input',
    status: 'complete',
    startedAt: '2024-01-01T00:00:00Z',
    nodes,
    ...overrides,
  });

  // Helper to create a node summary
  const createNodeSummary = (
    nodeId: string,
    status: 'complete' | 'error' | 'running' | 'pending' = 'complete'
  ): ExecutionNodeSummary => ({
    nodeId,
    status,
    startedAt: '2024-01-01T00:00:00Z',
    completedAt: status === 'complete' ? '2024-01-01T00:00:01Z' : undefined,
  });

  describe('returns valid=true when node exists and all upstream outputs available', () => {
    it('valid is true when replaying from node C with A and B complete in source', () => {
      // Workflow: Input -> A -> B -> C -> Output
      const workflow = createWorkflow(
        [
          createNode('input-1', 'input', 'Input'),
          createNode('node-a', 'claude-agent', 'Node A'),
          createNode('node-b', 'claude-agent', 'Node B'),
          createNode('node-c', 'claude-agent', 'Node C'),
          createNode('output-1', 'output', 'Output'),
        ],
        [
          createEdge('input-1', 'node-a'),
          createEdge('node-a', 'node-b'),
          createEdge('node-b', 'node-c'),
          createEdge('node-c', 'output-1'),
        ]
      );

      const sourceExecution = createExecutionSummary('workflow-1', {
        'input-1': createNodeSummary('input-1', 'complete'),
        'node-a': createNodeSummary('node-a', 'complete'),
        'node-b': createNodeSummary('node-b', 'complete'),
        'node-c': createNodeSummary('node-c', 'complete'),
        'output-1': createNodeSummary('output-1', 'complete'),
      });

      const result = validateReplayConfiguration(workflow, sourceExecution, 'node-c');

      expect(result.valid).toBe(true);
    });

    it('errors array is empty when validation passes', () => {
      const workflow = createWorkflow(
        [
          createNode('input-1', 'input', 'Input'),
          createNode('node-a', 'claude-agent', 'Node A'),
          createNode('output-1', 'output', 'Output'),
        ],
        [
          createEdge('input-1', 'node-a'),
          createEdge('node-a', 'output-1'),
        ]
      );

      const sourceExecution = createExecutionSummary('workflow-1', {
        'input-1': createNodeSummary('input-1', 'complete'),
        'node-a': createNodeSummary('node-a', 'complete'),
        'output-1': createNodeSummary('output-1', 'complete'),
      });

      const result = validateReplayConfiguration(workflow, sourceExecution, 'output-1');

      expect(result.errors).toEqual([]);
    });

    it('affectedNodes.reused contains upstream nodes (A and B)', () => {
      const workflow = createWorkflow(
        [
          createNode('input-1', 'input', 'Input'),
          createNode('node-a', 'claude-agent', 'Node A'),
          createNode('node-b', 'claude-agent', 'Node B'),
          createNode('node-c', 'claude-agent', 'Node C'),
          createNode('output-1', 'output', 'Output'),
        ],
        [
          createEdge('input-1', 'node-a'),
          createEdge('node-a', 'node-b'),
          createEdge('node-b', 'node-c'),
          createEdge('node-c', 'output-1'),
        ]
      );

      const sourceExecution = createExecutionSummary('workflow-1', {
        'input-1': createNodeSummary('input-1', 'complete'),
        'node-a': createNodeSummary('node-a', 'complete'),
        'node-b': createNodeSummary('node-b', 'complete'),
        'node-c': createNodeSummary('node-c', 'complete'),
        'output-1': createNodeSummary('output-1', 'complete'),
      });

      const result = validateReplayConfiguration(workflow, sourceExecution, 'node-c');

      expect(result.affectedNodes.reused).toContain('node-a');
      expect(result.affectedNodes.reused).toContain('node-b');
      expect(result.affectedNodes.reused).toContain('input-1');
    });

    it('affectedNodes.reExecuted contains C and downstream nodes', () => {
      const workflow = createWorkflow(
        [
          createNode('input-1', 'input', 'Input'),
          createNode('node-a', 'claude-agent', 'Node A'),
          createNode('node-b', 'claude-agent', 'Node B'),
          createNode('node-c', 'claude-agent', 'Node C'),
          createNode('output-1', 'output', 'Output'),
        ],
        [
          createEdge('input-1', 'node-a'),
          createEdge('node-a', 'node-b'),
          createEdge('node-b', 'node-c'),
          createEdge('node-c', 'output-1'),
        ]
      );

      const sourceExecution = createExecutionSummary('workflow-1', {
        'input-1': createNodeSummary('input-1', 'complete'),
        'node-a': createNodeSummary('node-a', 'complete'),
        'node-b': createNodeSummary('node-b', 'complete'),
        'node-c': createNodeSummary('node-c', 'complete'),
        'output-1': createNodeSummary('output-1', 'complete'),
      });

      const result = validateReplayConfiguration(workflow, sourceExecution, 'node-c');

      expect(result.affectedNodes.reExecuted).toContain('node-c');
      expect(result.affectedNodes.reExecuted).toContain('output-1');
    });
  });

  describe('returns errors when fromNodeId does not exist', () => {
    it('valid is false when replay start node does not exist', () => {
      const workflow = createWorkflow(
        [
          createNode('input-1', 'input', 'Input'),
          createNode('node-a', 'claude-agent', 'Node A'),
          createNode('output-1', 'output', 'Output'),
        ],
        [
          createEdge('input-1', 'node-a'),
          createEdge('node-a', 'output-1'),
        ]
      );

      const sourceExecution = createExecutionSummary('workflow-1', {
        'input-1': createNodeSummary('input-1', 'complete'),
        'node-a': createNodeSummary('node-a', 'complete'),
        'output-1': createNodeSummary('output-1', 'complete'),
      });

      const result = validateReplayConfiguration(workflow, sourceExecution, 'non-existent-node');

      expect(result.valid).toBe(false);
    });

    it('errors array contains message about node not existing', () => {
      const workflow = createWorkflow(
        [
          createNode('input-1', 'input', 'Input'),
          createNode('output-1', 'output', 'Output'),
        ],
        [createEdge('input-1', 'output-1')]
      );

      const sourceExecution = createExecutionSummary('workflow-1', {});

      const result = validateReplayConfiguration(workflow, sourceExecution, 'missing-node');

      expect(result.errors.some((e) => e.toLowerCase().includes('not exist'))).toBe(true);
    });

    it('affectedNodes.reExecuted is empty when node does not exist', () => {
      const workflow = createWorkflow(
        [
          createNode('input-1', 'input', 'Input'),
          createNode('output-1', 'output', 'Output'),
        ],
        [createEdge('input-1', 'output-1')]
      );

      const sourceExecution = createExecutionSummary('workflow-1', {});

      const result = validateReplayConfiguration(workflow, sourceExecution, 'missing-node');

      expect(result.affectedNodes.reExecuted).toEqual([]);
    });
  });

  describe('returns errors when upstream node did not complete', () => {
    it('valid is false when replaying from C and B has error status', () => {
      const workflow = createWorkflow(
        [
          createNode('input-1', 'input', 'Input'),
          createNode('node-a', 'claude-agent', 'Node A'),
          createNode('node-b', 'claude-agent', 'Node B'),
          createNode('node-c', 'claude-agent', 'Node C'),
          createNode('output-1', 'output', 'Output'),
        ],
        [
          createEdge('input-1', 'node-a'),
          createEdge('node-a', 'node-b'),
          createEdge('node-b', 'node-c'),
          createEdge('node-c', 'output-1'),
        ]
      );

      const sourceExecution = createExecutionSummary('workflow-1', {
        'input-1': createNodeSummary('input-1', 'complete'),
        'node-a': createNodeSummary('node-a', 'complete'),
        'node-b': createNodeSummary('node-b', 'error'),
        // node-c never ran because B errored
      });

      const result = validateReplayConfiguration(workflow, sourceExecution, 'node-c');

      expect(result.valid).toBe(false);
    });

    it('errors array contains message about upstream node not completing', () => {
      const workflow = createWorkflow(
        [
          createNode('input-1', 'input', 'Input'),
          createNode('node-a', 'claude-agent', 'Node A'),
          createNode('node-b', 'claude-agent', 'Node B'),
          createNode('output-1', 'output', 'Output'),
        ],
        [
          createEdge('input-1', 'node-a'),
          createEdge('node-a', 'node-b'),
          createEdge('node-b', 'output-1'),
        ]
      );

      const sourceExecution = createExecutionSummary('workflow-1', {
        'input-1': createNodeSummary('input-1', 'complete'),
        'node-a': createNodeSummary('node-a', 'error'),
      });

      const result = validateReplayConfiguration(workflow, sourceExecution, 'node-b');

      expect(result.errors.some((e) => e.toLowerCase().includes('did not complete'))).toBe(true);
    });

    it('error message identifies the specific incomplete node', () => {
      const workflow = createWorkflow(
        [
          createNode('input-1', 'input', 'Input'),
          createNode('failing-node', 'claude-agent', 'Failing Node'),
          createNode('target-node', 'claude-agent', 'Target'),
          createNode('output-1', 'output', 'Output'),
        ],
        [
          createEdge('input-1', 'failing-node'),
          createEdge('failing-node', 'target-node'),
          createEdge('target-node', 'output-1'),
        ]
      );

      const sourceExecution = createExecutionSummary('workflow-1', {
        'input-1': createNodeSummary('input-1', 'complete'),
        'failing-node': createNodeSummary('failing-node', 'error'),
      });

      const result = validateReplayConfiguration(workflow, sourceExecution, 'target-node');

      expect(result.errors.some((e) => e.includes('failing-node'))).toBe(true);
    });
  });

  describe('returns errors when upstream node is missing from source execution', () => {
    it('valid is false when upstream node has no history', () => {
      const workflow = createWorkflow(
        [
          createNode('input-1', 'input', 'Input'),
          createNode('node-a', 'claude-agent', 'Node A'),
          createNode('node-b', 'claude-agent', 'Node B'),
          createNode('node-c', 'claude-agent', 'Node C'),
          createNode('output-1', 'output', 'Output'),
        ],
        [
          createEdge('input-1', 'node-a'),
          createEdge('node-a', 'node-b'),
          createEdge('node-b', 'node-c'),
          createEdge('node-c', 'output-1'),
        ]
      );

      // node-b is missing from execution history
      const sourceExecution = createExecutionSummary('workflow-1', {
        'input-1': createNodeSummary('input-1', 'complete'),
        'node-a': createNodeSummary('node-a', 'complete'),
        // node-b missing
        'node-c': createNodeSummary('node-c', 'complete'),
      });

      const result = validateReplayConfiguration(workflow, sourceExecution, 'node-c');

      expect(result.valid).toBe(false);
    });

    it('errors array contains message about missing upstream node', () => {
      const workflow = createWorkflow(
        [
          createNode('input-1', 'input', 'Input'),
          createNode('node-a', 'claude-agent', 'Node A'),
          createNode('node-b', 'claude-agent', 'Node B'),
          createNode('output-1', 'output', 'Output'),
        ],
        [
          createEdge('input-1', 'node-a'),
          createEdge('node-a', 'node-b'),
          createEdge('node-b', 'output-1'),
        ]
      );

      const sourceExecution = createExecutionSummary('workflow-1', {
        'input-1': createNodeSummary('input-1', 'complete'),
        // node-a missing
      });

      const result = validateReplayConfiguration(workflow, sourceExecution, 'node-b');

      expect(result.errors.some((e) => e.toLowerCase().includes('missing'))).toBe(true);
    });

    it('error identifies which node is missing', () => {
      const workflow = createWorkflow(
        [
          createNode('input-1', 'input', 'Input'),
          createNode('mystery-node', 'claude-agent', 'Mystery'),
          createNode('target-node', 'claude-agent', 'Target'),
          createNode('output-1', 'output', 'Output'),
        ],
        [
          createEdge('input-1', 'mystery-node'),
          createEdge('mystery-node', 'target-node'),
          createEdge('target-node', 'output-1'),
        ]
      );

      const sourceExecution = createExecutionSummary('workflow-1', {
        'input-1': createNodeSummary('input-1', 'complete'),
        // mystery-node missing
      });

      const result = validateReplayConfiguration(workflow, sourceExecution, 'target-node');

      expect(result.errors.some((e) => e.includes('mystery-node'))).toBe(true);
    });
  });

  describe('returns warnings when workflow has new nodes not in source execution', () => {
    it('valid can still be true if upstream requirements met', () => {
      const workflow = createWorkflow(
        [
          createNode('input-1', 'input', 'Input'),
          createNode('node-a', 'claude-agent', 'Node A'),
          createNode('node-new', 'claude-agent', 'New Node'), // Added after execution
          createNode('output-1', 'output', 'Output'),
        ],
        [
          createEdge('input-1', 'node-a'),
          createEdge('node-a', 'node-new'),
          createEdge('node-new', 'output-1'),
        ]
      );

      const sourceExecution = createExecutionSummary('workflow-1', {
        'input-1': createNodeSummary('input-1', 'complete'),
        'node-a': createNodeSummary('node-a', 'complete'),
        // node-new was not in original execution
      });

      // Replay from new node - it's downstream so we can use A's output
      const result = validateReplayConfiguration(workflow, sourceExecution, 'node-new');

      expect(result.valid).toBe(true);
    });

    it('warnings array contains message about workflow structure changes', () => {
      const workflow = createWorkflow(
        [
          createNode('input-1', 'input', 'Input'),
          createNode('node-a', 'claude-agent', 'Node A'),
          createNode('node-new', 'claude-agent', 'New Node'),
          createNode('output-1', 'output', 'Output'),
        ],
        [
          createEdge('input-1', 'node-a'),
          createEdge('node-a', 'node-new'),
          createEdge('node-new', 'output-1'),
        ]
      );

      const sourceExecution = createExecutionSummary('workflow-1', {
        'input-1': createNodeSummary('input-1', 'complete'),
        'node-a': createNodeSummary('node-a', 'complete'),
      });

      const result = validateReplayConfiguration(workflow, sourceExecution, 'node-new');

      expect(result.warnings.some((w) => w.toLowerCase().includes('structure'))).toBe(true);
    });

    it('affectedNodes.new contains IDs of new nodes', () => {
      const workflow = createWorkflow(
        [
          createNode('input-1', 'input', 'Input'),
          createNode('node-a', 'claude-agent', 'Node A'),
          createNode('brand-new-node', 'claude-agent', 'Brand New'),
          createNode('output-1', 'output', 'Output'),
        ],
        [
          createEdge('input-1', 'node-a'),
          createEdge('node-a', 'brand-new-node'),
          createEdge('brand-new-node', 'output-1'),
        ]
      );

      const sourceExecution = createExecutionSummary('workflow-1', {
        'input-1': createNodeSummary('input-1', 'complete'),
        'node-a': createNodeSummary('node-a', 'complete'),
        'output-1': createNodeSummary('output-1', 'complete'),
      });

      const result = validateReplayConfiguration(workflow, sourceExecution, 'brand-new-node');

      expect(result.affectedNodes.new).toContain('brand-new-node');
    });
  });

  describe('returns warnings when nodes were removed from workflow', () => {
    it('warnings array contains message about workflow structure changes', () => {
      const workflow = createWorkflow(
        [
          createNode('input-1', 'input', 'Input'),
          createNode('node-a', 'claude-agent', 'Node A'),
          // node-x was removed
          createNode('output-1', 'output', 'Output'),
        ],
        [
          createEdge('input-1', 'node-a'),
          createEdge('node-a', 'output-1'),
        ]
      );

      const sourceExecution = createExecutionSummary('workflow-1', {
        'input-1': createNodeSummary('input-1', 'complete'),
        'node-a': createNodeSummary('node-a', 'complete'),
        'node-x': createNodeSummary('node-x', 'complete'), // This node no longer exists
        'output-1': createNodeSummary('output-1', 'complete'),
      });

      const result = validateReplayConfiguration(workflow, sourceExecution, 'output-1');

      expect(result.warnings.some((w) => w.toLowerCase().includes('structure'))).toBe(true);
    });

    it('validation can still pass if removed node is not an upstream dependency', () => {
      const workflow = createWorkflow(
        [
          createNode('input-1', 'input', 'Input'),
          createNode('node-a', 'claude-agent', 'Node A'),
          createNode('output-1', 'output', 'Output'),
        ],
        [
          createEdge('input-1', 'node-a'),
          createEdge('node-a', 'output-1'),
        ]
      );

      // Source execution had an extra node that's no longer in the workflow
      // but it wasn't on our path
      const sourceExecution = createExecutionSummary('workflow-1', {
        'input-1': createNodeSummary('input-1', 'complete'),
        'node-a': createNodeSummary('node-a', 'complete'),
        'orphan-node': createNodeSummary('orphan-node', 'complete'),
        'output-1': createNodeSummary('output-1', 'complete'),
      });

      const result = validateReplayConfiguration(workflow, sourceExecution, 'output-1');

      // Should pass because orphan-node isn't needed for output-1
      expect(result.valid).toBe(true);
    });
  });

  describe('handles edge case: replaying from input node', () => {
    it('replaying from input node means re-running entire workflow', () => {
      const workflow = createWorkflow(
        [
          createNode('input-1', 'input', 'Input'),
          createNode('node-a', 'claude-agent', 'Node A'),
          createNode('output-1', 'output', 'Output'),
        ],
        [
          createEdge('input-1', 'node-a'),
          createEdge('node-a', 'output-1'),
        ]
      );

      const sourceExecution = createExecutionSummary('workflow-1', {
        'input-1': createNodeSummary('input-1', 'complete'),
        'node-a': createNodeSummary('node-a', 'complete'),
        'output-1': createNodeSummary('output-1', 'complete'),
      });

      const result = validateReplayConfiguration(workflow, sourceExecution, 'input-1');

      expect(result.affectedNodes.reExecuted).toContain('input-1');
      expect(result.affectedNodes.reExecuted).toContain('node-a');
      expect(result.affectedNodes.reExecuted).toContain('output-1');
    });

    it('affectedNodes.reused is empty when replaying from input', () => {
      const workflow = createWorkflow(
        [
          createNode('input-1', 'input', 'Input'),
          createNode('node-a', 'claude-agent', 'Node A'),
          createNode('output-1', 'output', 'Output'),
        ],
        [
          createEdge('input-1', 'node-a'),
          createEdge('node-a', 'output-1'),
        ]
      );

      const sourceExecution = createExecutionSummary('workflow-1', {
        'input-1': createNodeSummary('input-1', 'complete'),
        'node-a': createNodeSummary('node-a', 'complete'),
        'output-1': createNodeSummary('output-1', 'complete'),
      });

      const result = validateReplayConfiguration(workflow, sourceExecution, 'input-1');

      expect(result.affectedNodes.reused).toEqual([]);
    });

    it('affectedNodes.reExecuted contains all nodes', () => {
      const workflow = createWorkflow(
        [
          createNode('input-1', 'input', 'Input'),
          createNode('node-a', 'claude-agent', 'Node A'),
          createNode('node-b', 'claude-agent', 'Node B'),
          createNode('output-1', 'output', 'Output'),
        ],
        [
          createEdge('input-1', 'node-a'),
          createEdge('node-a', 'node-b'),
          createEdge('node-b', 'output-1'),
        ]
      );

      const sourceExecution = createExecutionSummary('workflow-1', {
        'input-1': createNodeSummary('input-1', 'complete'),
        'node-a': createNodeSummary('node-a', 'complete'),
        'node-b': createNodeSummary('node-b', 'complete'),
        'output-1': createNodeSummary('output-1', 'complete'),
      });

      const result = validateReplayConfiguration(workflow, sourceExecution, 'input-1');

      expect(result.affectedNodes.reExecuted.length).toBe(4);
    });

    it('no errors if input node exists (valid but degenerate case)', () => {
      const workflow = createWorkflow(
        [
          createNode('input-1', 'input', 'Input'),
          createNode('output-1', 'output', 'Output'),
        ],
        [createEdge('input-1', 'output-1')]
      );

      const sourceExecution = createExecutionSummary('workflow-1', {
        'input-1': createNodeSummary('input-1', 'complete'),
        'output-1': createNodeSummary('output-1', 'complete'),
      });

      const result = validateReplayConfiguration(workflow, sourceExecution, 'input-1');

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('handles workflowId mismatch', () => {
    it('valid is false when source execution belongs to different workflow', () => {
      const workflow = createWorkflow(
        [
          createNode('input-1', 'input', 'Input'),
          createNode('output-1', 'output', 'Output'),
        ],
        [createEdge('input-1', 'output-1')],
        'workflow-1'
      );

      const sourceExecution = createExecutionSummary('workflow-2', { // Different workflow
        'input-1': createNodeSummary('input-1', 'complete'),
        'output-1': createNodeSummary('output-1', 'complete'),
      });

      const result = validateReplayConfiguration(workflow, sourceExecution, 'output-1');

      expect(result.valid).toBe(false);
    });

    it('errors array contains message about workflow mismatch', () => {
      const workflow = createWorkflow(
        [
          createNode('input-1', 'input', 'Input'),
          createNode('output-1', 'output', 'Output'),
        ],
        [createEdge('input-1', 'output-1')],
        'my-workflow'
      );

      const sourceExecution = createExecutionSummary('different-workflow', {});

      const result = validateReplayConfiguration(workflow, sourceExecution, 'output-1');

      expect(result.errors.some((e) => e.toLowerCase().includes('workflow'))).toBe(true);
    });
  });

  describe('returns warning when source execution lacks node history', () => {
    it('warnings array contains message about limited validation when nodes is empty', () => {
      const workflow = createWorkflow(
        [
          createNode('input-1', 'input', 'Input'),
          createNode('node-a', 'claude-agent', 'Node A'),
          createNode('output-1', 'output', 'Output'),
        ],
        [
          createEdge('input-1', 'node-a'),
          createEdge('node-a', 'output-1'),
        ]
      );

      const sourceExecution = createExecutionSummary('workflow-1', {}); // Empty nodes

      const result = validateReplayConfiguration(workflow, sourceExecution, 'node-a');

      expect(result.warnings.some((w) => w.toLowerCase().includes('limited'))).toBe(true);
    });

    it('validation can still proceed with available information', () => {
      const workflow = createWorkflow(
        [
          createNode('input-1', 'input', 'Input'),
          createNode('output-1', 'output', 'Output'),
        ],
        [createEdge('input-1', 'output-1')]
      );

      const sourceExecution = createExecutionSummary('workflow-1', {});

      // Even with no history, we should get a result (though it may fail validation)
      const result = validateReplayConfiguration(workflow, sourceExecution, 'output-1');

      expect(result).toBeDefined();
      expect(result.valid).toBeDefined();
      expect(result.errors).toBeDefined();
      expect(result.warnings).toBeDefined();
    });
  });

  describe('handles complex DAG structures', () => {
    it('replaying from C in diamond-shaped workflow requires both A and B to be complete', () => {
      // Diamond: Input -> A -> C, Input -> B -> C, C -> Output
      const workflow = createWorkflow(
        [
          createNode('input-1', 'input', 'Input'),
          createNode('node-a', 'claude-agent', 'Node A'),
          createNode('node-b', 'claude-agent', 'Node B'),
          createNode('node-c', 'merge', 'Node C'),
          createNode('output-1', 'output', 'Output'),
        ],
        [
          createEdge('input-1', 'node-a'),
          createEdge('input-1', 'node-b'),
          createEdge('node-a', 'node-c'),
          createEdge('node-b', 'node-c'),
          createEdge('node-c', 'output-1'),
        ]
      );

      const sourceExecution = createExecutionSummary('workflow-1', {
        'input-1': createNodeSummary('input-1', 'complete'),
        'node-a': createNodeSummary('node-a', 'complete'),
        'node-b': createNodeSummary('node-b', 'complete'),
        'node-c': createNodeSummary('node-c', 'complete'),
        'output-1': createNodeSummary('output-1', 'complete'),
      });

      const result = validateReplayConfiguration(workflow, sourceExecution, 'node-c');

      expect(result.valid).toBe(true);
      expect(result.affectedNodes.reused).toContain('node-a');
      expect(result.affectedNodes.reused).toContain('node-b');
      expect(result.affectedNodes.reused).toContain('input-1');
    });

    it('missing either A or B in diamond results in validation error', () => {
      const workflow = createWorkflow(
        [
          createNode('input-1', 'input', 'Input'),
          createNode('node-a', 'claude-agent', 'Node A'),
          createNode('node-b', 'claude-agent', 'Node B'),
          createNode('node-c', 'merge', 'Node C'),
          createNode('output-1', 'output', 'Output'),
        ],
        [
          createEdge('input-1', 'node-a'),
          createEdge('input-1', 'node-b'),
          createEdge('node-a', 'node-c'),
          createEdge('node-b', 'node-c'),
          createEdge('node-c', 'output-1'),
        ]
      );

      // node-b is missing
      const sourceExecution = createExecutionSummary('workflow-1', {
        'input-1': createNodeSummary('input-1', 'complete'),
        'node-a': createNodeSummary('node-a', 'complete'),
        // node-b missing
        'node-c': createNodeSummary('node-c', 'complete'),
        'output-1': createNodeSummary('output-1', 'complete'),
      });

      const result = validateReplayConfiguration(workflow, sourceExecution, 'node-c');

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('node-b'))).toBe(true);
    });
  });
});

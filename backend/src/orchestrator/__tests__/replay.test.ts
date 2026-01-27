/**
 * Unit tests for replay functionality
 * Tests core replay functions: buildReplayInfo, buildReplayPlan, compareWorkflowSnapshot, etc.
 */

import {
  buildReplayInfo,
  buildReplayPlan,
  buildCheckpointState,
  filterReplayVariables,
  computeInactiveBranchNodes,
  validateReplayEligibility,
} from '../replay';
import {
  CheckpointState,
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  WorkflowSnapshot,
  NodeState,
} from '../../workflows/types';

// Helper to create a simple linear workflow
function createLinearWorkflow(nodeIds: string[]): Workflow {
  const nodes: WorkflowNode[] = nodeIds.map((id, index) => {
    if (index === 0) {
      return {
        id,
        type: 'input' as const,
        position: { x: index * 100, y: 0 },
        data: { type: 'input' as const, name: `Node ${id}` },
      };
    } else if (index === nodeIds.length - 1) {
      return {
        id,
        type: 'output' as const,
        position: { x: index * 100, y: 0 },
        data: { type: 'output' as const, name: `Node ${id}` },
      };
    } else {
      return {
        id,
        type: 'claude-agent' as const,
        position: { x: index * 100, y: 0 },
        data: { type: 'claude-agent' as const, name: `Node ${id}`, userQuery: 'test', model: 'sonnet' as const, tools: [] },
      };
    }
  });

  const edges: WorkflowEdge[] = [];
  for (let i = 0; i < nodeIds.length - 1; i++) {
    edges.push({
      id: `edge-${i}`,
      source: nodeIds[i],
      target: nodeIds[i + 1],
    });
  }

  return {
    id: 'test-workflow',
    name: 'Test Workflow',
    nodes,
    edges,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// Helper to create a workflow with conditional branching
function createConditionalWorkflow(): Workflow {
  return {
    id: 'conditional-workflow',
    name: 'Conditional Workflow',
    nodes: [
      {
        id: 'input-1',
        type: 'input',
        position: { x: 0, y: 0 },
        data: { type: 'input', name: 'Input' },
      },
      {
        id: 'condition-1',
        type: 'condition',
        position: { x: 100, y: 0 },
        data: {
          type: 'condition',
          name: 'Condition',
          conditions: [{ inputReference: '{{Input.value}}', operator: 'equals', compareValue: 'true', joiner: 'and' }],
        },
      },
      {
        id: 'branch-true',
        type: 'output',
        position: { x: 200, y: -50 },
        data: { type: 'output', name: 'True Branch' },
      },
      {
        id: 'branch-false',
        type: 'output',
        position: { x: 200, y: 50 },
        data: { type: 'output', name: 'False Branch' },
      },
    ],
    edges: [
      { id: 'edge-1', source: 'input-1', target: 'condition-1' },
      { id: 'edge-2', source: 'condition-1', target: 'branch-true', sourceHandle: 'true' },
      { id: 'edge-3', source: 'condition-1', target: 'branch-false', sourceHandle: 'false' },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// Helper to create a checkpoint state
function createCheckpoint(
  states: Record<string, { status: 'pending' | 'running' | 'complete' | 'error' | 'skipped'; error?: string }>,
  outputs: Record<string, unknown> = {},
  variables: Record<string, unknown> = {}
): CheckpointState {
  return {
    capturedAt: new Date().toISOString(),
    nodeStates: states,
    nodeOutputs: outputs,
    variables,
  };
}

describe('buildReplayInfo', () => {
  it('returns empty checkpoints when checkpoint is null', () => {
    const workflow = createLinearWorkflow(['A', 'B', 'C']);
    const result = buildReplayInfo(workflow, 'exec-1', null);

    expect(result.checkpoints).toEqual([]);
    expect(result.errors).toContainEqual({
      type: 'missing-checkpoint',
      message: 'Checkpoint data is not available for this execution.',
    });
    expect(result.isReplayBlocked).toBe(true);
    expect(result.sourceExecutionId).toBe('exec-1');
    expect(result.workflowId).toBe('test-workflow');
  });

  it('correctly identifies replayable nodes with complete ancestors', () => {
    const workflow = createLinearWorkflow(['A', 'B', 'C']);
    const checkpoint = createCheckpoint(
      {
        A: { status: 'complete' },
        B: { status: 'complete' },
        C: { status: 'pending' },
      },
      { A: 'output-a', B: 'output-b' }
    );

    const result = buildReplayInfo(workflow, 'exec-1', checkpoint);

    expect(result.checkpoints[0]).toMatchObject({
      nodeId: 'A',
      status: 'complete',
      replayable: true,
    });
    expect(result.checkpoints[1]).toMatchObject({
      nodeId: 'B',
      status: 'complete',
      replayable: true,
    });
    expect(result.checkpoints[2]).toMatchObject({
      nodeId: 'C',
      status: 'pending',
      replayable: true,
    });
    expect(result.errors).toEqual([]);
  });

  it('marks nodes as non-replayable when ancestor is incomplete', () => {
    const workflow = createLinearWorkflow(['A', 'B', 'C']);
    const checkpoint = createCheckpoint({
      A: { status: 'complete' },
      B: { status: 'error', error: 'Failed' },
      C: { status: 'pending' },
    });

    const result = buildReplayInfo(workflow, 'exec-1', checkpoint);

    expect(result.checkpoints[0]).toMatchObject({
      nodeId: 'A',
      replayable: true,
    });
    expect(result.checkpoints[1]).toMatchObject({
      nodeId: 'B',
      replayable: false,
      reason: 'Missing completed upstream dependency',
    });
    expect(result.checkpoints[2]).toMatchObject({
      nodeId: 'C',
      replayable: false,
      reason: 'Missing completed upstream dependency',
    });
  });

  it('marks inactive branch nodes as non-replayable', () => {
    const workflow = createConditionalWorkflow();
    const checkpoint = createCheckpoint(
      {
        'input-1': { status: 'complete' },
        'condition-1': { status: 'complete' },
        'branch-true': { status: 'complete' },
        'branch-false': { status: 'skipped' },
      },
      {
        'input-1': { value: 'true' },
        'condition-1': true,
        'branch-true': 'result',
      }
    );

    // Mock the condition executor's getOutputHandle
    const mockExecutor = {
      getOutputHandle: jest.fn().mockReturnValue('true'),
    };
    const executorRegistry = require('../executors/index').executorRegistry;
    executorRegistry.get = jest.fn((type: string) => {
      if (type === 'condition') return mockExecutor;
      return null;
    });

    const result = buildReplayInfo(workflow, 'exec-1', checkpoint);

    const trueNode = result.checkpoints.find((c) => c.nodeId === 'branch-true');
    const falseNode = result.checkpoints.find((c) => c.nodeId === 'branch-false');

    expect(trueNode?.replayable).toBe(true);
    expect(falseNode?.replayable).toBe(false);
    expect(falseNode?.reason).toBe('Node is on an inactive branch');
    expect(falseNode?.status).toBe('skipped');
  });
});

describe('compareWorkflowSnapshot', () => {
  const compareWorkflowSnapshot = (snapshot: WorkflowSnapshot | undefined, workflow: Workflow) => {
    // This is a private function, but we can test it through buildReplayInfo
    const result = buildReplayInfo(workflow, 'exec-1', createCheckpoint({ A: { status: 'complete' } }), snapshot);
    return result.warnings;
  };

  it('detects node removal as blocking warning', () => {
    const workflow = createLinearWorkflow(['A', 'B']);
    const snapshot: WorkflowSnapshot = {
      id: 'test-workflow',
      name: 'Test Workflow',
      nodes: createLinearWorkflow(['A', 'B', 'C']).nodes,
      edges: createLinearWorkflow(['A', 'B', 'C']).edges,
      capturedAt: new Date().toISOString(),
    };

    const warnings = compareWorkflowSnapshot(snapshot, workflow);

    expect(warnings).toContainEqual(
      expect.objectContaining({
        type: 'node-removed',
        nodeId: 'C',
      })
    );
    expect(warnings.find((w) => w.type === 'node-removed')?.message).toContain('Node C');
  });

  it('detects node addition as blocking warning', () => {
    const workflow = createLinearWorkflow(['A', 'B', 'C']);
    const snapshot: WorkflowSnapshot = {
      id: 'test-workflow',
      nodes: createLinearWorkflow(['A', 'B']).nodes,
      edges: createLinearWorkflow(['A', 'B']).edges,
      capturedAt: new Date().toISOString(),
    };

    const warnings = compareWorkflowSnapshot(snapshot, workflow);

    expect(warnings).toContainEqual(
      expect.objectContaining({
        type: 'node-added',
        nodeId: 'C',
      })
    );
  });

  it('detects node config changes as non-blocking warning', () => {
    const workflow = createLinearWorkflow(['A', 'B']);
    const snapshotWorkflow = createLinearWorkflow(['A', 'B']);
    // Change config - assuming node[1] is a claude-agent node
    const nodeData = snapshotWorkflow.nodes[1].data as any;
    snapshotWorkflow.nodes[1].data = { ...nodeData, userQuery: 'old prompt' };

    const snapshot: WorkflowSnapshot = {
      id: 'test-workflow',
      nodes: snapshotWorkflow.nodes,
      edges: snapshotWorkflow.edges,
      capturedAt: new Date().toISOString(),
    };

    const warnings = compareWorkflowSnapshot(snapshot, workflow);

    expect(warnings).toContainEqual(
      expect.objectContaining({
        type: 'node-changed',
        nodeId: 'B',
      })
    );
  });

  it('detects node type changes as non-blocking warning', () => {
    const workflow = createLinearWorkflow(['A', 'B']);
    const snapshotWorkflow = createLinearWorkflow(['A', 'B']);
    snapshotWorkflow.nodes[1].type = 'javascript';

    const snapshot: WorkflowSnapshot = {
      id: 'test-workflow',
      nodes: snapshotWorkflow.nodes,
      edges: snapshotWorkflow.edges,
      capturedAt: new Date().toISOString(),
    };

    const warnings = compareWorkflowSnapshot(snapshot, workflow);

    expect(warnings).toContainEqual(
      expect.objectContaining({
        type: 'node-changed',
        nodeId: 'B',
      })
    );
  });

  it('detects edge changes as non-blocking warning', () => {
    const workflow = createLinearWorkflow(['A', 'B', 'C']);
    const snapshotWorkflow = createLinearWorkflow(['A', 'B', 'D']);

    const snapshot: WorkflowSnapshot = {
      id: 'test-workflow',
      nodes: snapshotWorkflow.nodes,
      edges: snapshotWorkflow.edges,
      capturedAt: new Date().toISOString(),
    };

    const warnings = compareWorkflowSnapshot(snapshot, workflow);

    expect(warnings).toContainEqual(
      expect.objectContaining({
        type: 'edge-changed',
      })
    );
  });

  it('handles missing snapshot gracefully', () => {
    const workflow = createLinearWorkflow(['A', 'B']);
    const warnings = compareWorkflowSnapshot(undefined, workflow);

    expect(warnings).toContainEqual({
      type: 'workflow-snapshot-missing',
      message: 'Workflow snapshot missing for source execution.',
    });
    expect(warnings.length).toBe(1);
  });

  it('ignores unchanged nodes and edges', () => {
    const workflow = createLinearWorkflow(['A', 'B', 'C']);
    const snapshot: WorkflowSnapshot = {
      id: 'test-workflow',
      nodes: JSON.parse(JSON.stringify(workflow.nodes)),
      edges: JSON.parse(JSON.stringify(workflow.edges)),
      capturedAt: new Date().toISOString(),
    };

    const warnings = compareWorkflowSnapshot(snapshot, workflow);

    expect(warnings).toEqual([]);
  });
});

describe('buildReplayPlan', () => {
  it('correctly computes replay node set for middle node', () => {
    const workflow = createLinearWorkflow(['A', 'B', 'C', 'D']);
    const checkpoint = createCheckpoint(
      {
        A: { status: 'complete' },
        B: { status: 'complete' },
        C: { status: 'complete' },
        D: { status: 'complete' },
      },
      { A: 'a', B: 'b', C: 'c', D: 'd' }
    );

    const result = buildReplayPlan(workflow, checkpoint, 'B');

    expect(result.replayNodeIds.has('B')).toBe(true);
    expect(result.replayNodeIds.has('C')).toBe(true);
    expect(result.replayNodeIds.has('D')).toBe(true);
    expect(result.replayNodeIds.has('A')).toBe(false);
    expect(result.errors).toEqual([]);
  });

  it('includes target node in replay set', () => {
    const workflow = createLinearWorkflow(['A', 'B', 'C']);
    const checkpoint = createCheckpoint(
      { A: { status: 'complete' }, B: { status: 'complete' }, C: { status: 'complete' } },
      { A: 'a', B: 'b', C: 'c' }
    );

    const result = buildReplayPlan(workflow, checkpoint, 'B');

    expect(result.replayNodeIds.has('B')).toBe(true);
    expect(result.replayNodeIds.size).toBe(2); // B and C
  });

  it('validates target node exists in workflow', () => {
    const workflow = createLinearWorkflow(['A', 'B', 'C']);
    const checkpoint = createCheckpoint({ A: { status: 'complete' } });

    const result = buildReplayPlan(workflow, checkpoint, 'NonExistent');

    expect(result.errors).toContainEqual({
      type: 'invalid-node',
      message: 'Selected node does not exist in the current workflow.',
      nodeId: 'NonExistent',
    });
    expect(result.replayNodeIds.size).toBe(0);
  });

  it('detects missing ancestor with incomplete status', () => {
    const workflow = createLinearWorkflow(['A', 'B', 'C']);
    const checkpoint = createCheckpoint({
      A: { status: 'error', error: 'Failed' },
      B: { status: 'pending' },
      C: { status: 'pending' },
    });

    const result = buildReplayPlan(workflow, checkpoint, 'C');

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        type: 'dependency-missing',
        nodeId: 'A',
      })
    );
    expect(result.errors.find((e) => e.nodeId === 'A')?.message).toContain('upstream dependency');
  });

  it('detects missing ancestor output data', () => {
    const workflow = createLinearWorkflow(['A', 'B', 'C']);
    const checkpoint = createCheckpoint(
      {
        A: { status: 'complete' },
        B: { status: 'complete' },
        C: { status: 'pending' },
      },
      { B: 'b' } // A is complete but no output
    );

    const result = buildReplayPlan(workflow, checkpoint, 'C');

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        type: 'dependency-missing',
        message: 'Completed ancestor output is missing from the checkpoint.',
        nodeId: 'A',
      })
    );
  });

  it('allows skipped ancestors', () => {
    const workflow = createLinearWorkflow(['A', 'B', 'C', 'D']);
    const checkpoint = createCheckpoint(
      {
        A: { status: 'complete' },
        B: { status: 'complete' },
        C: { status: 'skipped' },
        D: { status: 'pending' },
      },
      { A: 'a', B: 'b' }
    );

    const result = buildReplayPlan(workflow, checkpoint, 'D');

    const dependencyErrors = result.errors.filter((e) => e.type === 'dependency-missing' && e.nodeId === 'C');
    expect(dependencyErrors).toEqual([]);
    expect(result.replayNodeIds.has('D')).toBe(true);
  });

  it('detects replay from inactive branch', () => {
    const workflow = createConditionalWorkflow();
    const checkpoint = createCheckpoint(
      {
        'input-1': { status: 'complete' },
        'condition-1': { status: 'complete' },
        'branch-true': { status: 'complete' },
        'branch-false': { status: 'skipped' },
      },
      {
        'input-1': { value: 'true' },
        'condition-1': true,
      }
    );

    const mockExecutor = {
      getOutputHandle: jest.fn().mockReturnValue('true'),
    };
    const executorRegistry = require('../executors/index').executorRegistry;
    executorRegistry.get = jest.fn((type: string) => {
      if (type === 'condition') return mockExecutor;
      return null;
    });

    const result = buildReplayPlan(workflow, checkpoint, 'branch-false');

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        type: 'inactive-branch',
        nodeId: 'branch-false',
      })
    );
    expect(result.errors.find((e) => e.type === 'inactive-branch')?.message).toContain('branch condition');
  });

  it('handles diamond DAG pattern', () => {
    // A → B, A → C, B → D, C → D
    const workflow: Workflow = {
      id: 'diamond',
      name: 'Diamond',
      nodes: [
        { id: 'A', type: 'input', position: { x: 0, y: 0 }, data: { type: 'input', name: 'A' } },
        { id: 'B', type: 'output', position: { x: 100, y: -50 }, data: { type: 'output', name: 'B' } },
        { id: 'C', type: 'output', position: { x: 100, y: 50 }, data: { type: 'output', name: 'C' } },
        { id: 'D', type: 'output', position: { x: 200, y: 0 }, data: { type: 'output', name: 'D' } },
      ],
      edges: [
        { id: 'e1', source: 'A', target: 'B' },
        { id: 'e2', source: 'A', target: 'C' },
        { id: 'e3', source: 'B', target: 'D' },
        { id: 'e4', source: 'C', target: 'D' },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const checkpoint = createCheckpoint(
      {
        A: { status: 'complete' },
        B: { status: 'complete' },
        C: { status: 'complete' },
        D: { status: 'complete' },
      },
      { A: 'a', B: 'b', C: 'c', D: 'd' }
    );

    const result = buildReplayPlan(workflow, checkpoint, 'D');

    expect(result.replayNodeIds.has('D')).toBe(true);
    expect(result.replayNodeIds.size).toBe(1); // Only D
    expect(result.errors).toEqual([]);
  });
});

describe('computeInactiveBranchNodes', () => {
  it('identifies nodes unreachable due to condition output', () => {
    const workflow = createConditionalWorkflow();
    const checkpoint = createCheckpoint(
      {
        'input-1': { status: 'complete' },
        'condition-1': { status: 'complete' },
      },
      {
        'input-1': { value: 'true' },
        'condition-1': true,
      }
    );

    const mockExecutor = {
      getOutputHandle: jest.fn().mockReturnValue('true'),
    };
    const executorRegistry = require('../executors/index').executorRegistry;
    executorRegistry.get = jest.fn((type: string) => {
      if (type === 'condition') return mockExecutor;
      return null;
    });

    const result = computeInactiveBranchNodes(workflow, checkpoint, new Set());

    expect(result.has('branch-false')).toBe(true);
    expect(result.has('branch-true')).toBe(false);
  });

  it('handles missing executor gracefully', () => {
    const workflow = createConditionalWorkflow();
    const checkpoint = createCheckpoint(
      { 'input-1': { status: 'complete' }, 'condition-1': { status: 'complete' } },
      { 'input-1': { value: 'true' }, 'condition-1': true }
    );

    const executorRegistry = require('../executors/index').executorRegistry;
    executorRegistry.get = jest.fn().mockReturnValue(null);

    const result = computeInactiveBranchNodes(workflow, checkpoint, new Set());

    expect(result.size).toBe(0); // No inactive nodes detected without executor
  });

  it('handles node without output data', () => {
    const workflow = createConditionalWorkflow();
    const checkpoint = createCheckpoint(
      { 'condition-1': { status: 'complete' } },
      {} // No output for condition
    );

    const mockExecutor = {
      getOutputHandle: jest.fn().mockReturnValue('true'),
    };
    const executorRegistry = require('../executors/index').executorRegistry;
    executorRegistry.get = jest.fn((type: string) => {
      if (type === 'condition') return mockExecutor;
      return null;
    });

    expect(() => {
      computeInactiveBranchNodes(workflow, checkpoint, new Set());
    }).not.toThrow();
  });

  it('excludes replay nodes from processing', () => {
    const workflow = createConditionalWorkflow();
    const checkpoint = createCheckpoint(
      { 'condition-1': { status: 'complete' } },
      { 'condition-1': true }
    );

    const mockExecutor = {
      getOutputHandle: jest.fn().mockReturnValue('true'),
    };
    const executorRegistry = require('../executors/index').executorRegistry;
    executorRegistry.get = jest.fn((type: string) => {
      if (type === 'condition') return mockExecutor;
      return null;
    });

    const replayNodeIds = new Set(['condition-1', 'branch-true', 'branch-false']);
    const result = computeInactiveBranchNodes(workflow, checkpoint, replayNodeIds);

    expect(result.size).toBe(0); // All nodes in replay set, so none checked
  });

  it('handles nodes without sourceHandle', () => {
    const workflow = createConditionalWorkflow();
    // Remove sourceHandle from edges
    workflow.edges.forEach((e) => delete e.sourceHandle);

    const checkpoint = createCheckpoint(
      { 'condition-1': { status: 'complete' } },
      { 'condition-1': true }
    );

    const mockExecutor = {
      getOutputHandle: jest.fn().mockReturnValue('true'),
    };
    const executorRegistry = require('../executors/index').executorRegistry;
    executorRegistry.get = jest.fn((type: string) => {
      if (type === 'condition') return mockExecutor;
      return null;
    });

    expect(() => {
      computeInactiveBranchNodes(workflow, checkpoint, new Set());
    }).not.toThrow();
  });
});

describe('filterReplayVariables', () => {
  it('removes variables for replay nodes', () => {
    const variables = {
      'node.A.output': 'a',
      'node.B.output': 'b',
      'node.C.output': 'c',
      'workflow.input': 'input',
    };
    const replayNodeIds = new Set(['B', 'C']);

    const result = filterReplayVariables(variables, replayNodeIds);

    expect(result).toEqual({
      'node.A.output': 'a',
      'workflow.input': 'input',
    });
  });

  it('preserves non-node variables', () => {
    const variables = {
      'workflow.input': 'input',
      'custom.value': 'custom',
      'global.setting': 'setting',
    };
    const replayNodeIds = new Set(['A']);

    const result = filterReplayVariables(variables, replayNodeIds);

    expect(result).toEqual(variables);
  });

  it('handles agent session variables', () => {
    const variables = {
      'agent.session.nodeA.conversationHistory': [],
      'agent.session.nodeB.conversationHistory': [],
      'node.nodeA.output': 'a',
    };
    const replayNodeIds = new Set(['nodeA']);

    const result = filterReplayVariables(variables, replayNodeIds);

    expect(result['agent.session.nodeB.conversationHistory']).toBeDefined();
    expect(result['agent.session.nodeA.conversationHistory']).toBeUndefined();
    expect(result['node.nodeA.output']).toBeUndefined();
  });

  it('handles edge cases in variable key parsing', () => {
    const variables = {
      'node.': 'weird1',
      'node': 'weird2',
      'agent.session.': 'weird3',
      '': 'empty',
      'normalKey': 'normal',
    };
    const replayNodeIds = new Set(['A']);

    const result = filterReplayVariables(variables, replayNodeIds);

    // Malformed keys should be preserved
    expect(result['node.']).toBe('weird1');
    expect(result['node']).toBe('weird2');
    expect(result['agent.session.']).toBe('weird3');
    expect(result['']).toBe('empty');
    expect(result['normalKey']).toBe('normal');
  });
});

describe('buildCheckpointState', () => {
  it('creates checkpoint from execution state', () => {
    const nodeStates = new Map<string, NodeState>([
      ['A', { status: 'complete', output: 'a' }],
      ['B', { status: 'error', error: 'Failed' }],
    ]);
    const nodeOutputs = new Map<string, unknown>([
      ['A', 'output-a'],
      ['B', null],
    ]);
    const variables = new Map<string, unknown>([
      ['workflow.input', 'input'],
      ['node.A.output', 'a'],
    ]);

    const result = buildCheckpointState(nodeStates, nodeOutputs, variables);

    expect(result.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO format
    expect(result.nodeStates).toEqual({
      A: { status: 'complete' },
      B: { status: 'error', error: 'Failed' },
    });
    expect(result.nodeOutputs).toEqual({
      A: 'output-a',
      B: null,
    });
    expect(result.variables).toEqual({
      'workflow.input': 'input',
      'node.A.output': 'a',
    });
  });

  it('handles empty maps', () => {
    const result = buildCheckpointState(new Map(), new Map(), new Map());

    expect(result.capturedAt).toBeDefined();
    expect(result.nodeStates).toEqual({});
    expect(result.nodeOutputs).toEqual({});
    expect(result.variables).toEqual({});
  });

  it('omits undefined errors', () => {
    const nodeStates = new Map<string, NodeState>([
      ['A', { status: 'complete' }],
      ['B', { status: 'error', error: 'Failed' }],
    ]);

    const result = buildCheckpointState(nodeStates, new Map(), new Map());

    expect(result.nodeStates.A).toEqual({ status: 'complete' });
    expect(result.nodeStates.A.error).toBeUndefined();
    expect(result.nodeStates.B).toEqual({ status: 'error', error: 'Failed' });
  });
});

describe('validateReplayEligibility', () => {
  it('returns validation result with all warnings and errors', () => {
    const workflow = createLinearWorkflow(['A', 'B', 'C']);
    const originalWorkflow = createLinearWorkflow(['A', 'B']);
    const snapshot: WorkflowSnapshot = {
      id: 'test-workflow',
      nodes: originalWorkflow.nodes,
      edges: originalWorkflow.edges,
      capturedAt: new Date().toISOString(),
    };

    const checkpoint = createCheckpoint(
      { A: { status: 'complete' }, B: { status: 'complete' } },
      { A: 'a', B: 'b' }
    );

    const result = validateReplayEligibility(workflow, 'exec-1', checkpoint, snapshot, 'B');

    expect(result.isBlocked).toBe(true);
    expect(result.blockingReasons.some(r => r.includes('added'))).toBe(true);
  });

  it('validates without specific fromNodeId', () => {
    const workflow = createLinearWorkflow(['A', 'B', 'C']);
    const checkpoint = createCheckpoint(
      { A: { status: 'complete' }, B: { status: 'complete' }, C: { status: 'pending' } },
      { A: 'a', B: 'b' }
    );

    const result = validateReplayEligibility(workflow, 'exec-1', checkpoint, undefined);

    expect(result.replayableNodeIds).toContain('A');
    expect(result.replayableNodeIds).toContain('B');
    expect(result.replayableNodeIds).toContain('C');
  });

  it('handles null checkpoint', () => {
    const workflow = createLinearWorkflow(['A', 'B']);

    const result = validateReplayEligibility(workflow, 'exec-1', null, undefined);

    expect(result.isBlocked).toBe(true);
    expect(result.blockingReasons.some(r => r.includes('Checkpoint data is not available'))).toBe(true);
    expect(result.replayableNodeIds).toEqual([]);
  });

  it('deduplicates blocking reasons', () => {
    const workflow = createLinearWorkflow(['A', 'B']);
    const snapshot: WorkflowSnapshot = {
      id: 'test-workflow',
      nodes: createLinearWorkflow(['A', 'B', 'C']).nodes,
      edges: createLinearWorkflow(['A', 'B', 'C']).edges,
      capturedAt: new Date().toISOString(),
    };

    const checkpoint = createCheckpoint({ A: { status: 'complete' } }, { A: 'a' });

    const result = validateReplayEligibility(workflow, 'exec-1', checkpoint, snapshot);

    // Should only have unique messages
    const uniqueReasons = new Set(result.blockingReasons);
    expect(uniqueReasons.size).toBe(result.blockingReasons.length);
  });
});

describe('Edge cases', () => {
  it('handles empty workflow snapshot', () => {
    const workflow = createLinearWorkflow(['A', 'B']);
    const snapshot: WorkflowSnapshot = {
      id: 'test-workflow',
      nodes: [],
      edges: [],
      capturedAt: new Date().toISOString(),
    };

    const checkpoint = createCheckpoint({ A: { status: 'complete' } });
    const result = buildReplayInfo(workflow, 'exec-1', checkpoint, snapshot);

    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'node-added',
        nodeId: 'A',
      })
    );
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'node-added',
        nodeId: 'B',
      })
    );
  });

  it('handles workflow with no edges (disconnected nodes)', () => {
    const workflow: Workflow = {
      id: 'disconnected',
      name: 'Disconnected',
      nodes: [
        { id: 'A', type: 'input', position: { x: 0, y: 0 }, data: { type: 'input', name: 'A' } },
        { id: 'B', type: 'output', position: { x: 100, y: 0 }, data: { type: 'output', name: 'B' } },
        { id: 'C', type: 'output', position: { x: 200, y: 0 }, data: { type: 'output', name: 'C' } },
      ],
      edges: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const checkpoint = createCheckpoint(
      { A: { status: 'complete' }, B: { status: 'complete' }, C: { status: 'complete' } },
      { A: 'a', B: 'b', C: 'c' }
    );

    const result = buildReplayPlan(workflow, checkpoint, 'B');

    expect(result.replayNodeIds.has('B')).toBe(true);
    expect(result.replayNodeIds.size).toBe(1); // Only B, no descendants
    expect(result.errors).toEqual([]);
  });
});

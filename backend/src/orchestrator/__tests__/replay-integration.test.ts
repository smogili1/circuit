/**
 * Full integration tests for replay functionality
 * Tests complete end-to-end replay scenarios
 */

// Mock agents before imports
jest.mock('../../agents/claude', () => ({
  ClaudeAgent: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockImplementation(async function* () {
      yield { type: 'text-delta', content: 'Claude response' };
      yield { type: 'complete', result: 'Complete' };
    }),
    interrupt: jest.fn(),
    getStructuredOutput: jest.fn().mockReturnValue(undefined),
    getSessionId: jest.fn().mockReturnValue(undefined),
  })),
}));

jest.mock('../../agents/codex', () => ({
  CodexAgent: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockImplementation(async function* () {
      yield { type: 'text-delta', content: 'Codex response' };
      yield { type: 'complete', result: 'Complete' };
    }),
    interrupt: jest.fn(),
    getStructuredOutput: jest.fn().mockReturnValue(undefined),
    getSessionId: jest.fn().mockReturnValue(undefined),
  })),
}));

import { DAGExecutionEngine } from '../engine';
import {
  buildCheckpointState,
  buildReplayInfo,
  buildReplayPlan,
  validateReplayEligibility,
  computeInactiveBranchNodes,
} from '../replay';
import { Workflow, ExecutionEvent, CheckpointState } from '../../workflows/types';
import '../../orchestrator/executors';

function createLinearWorkflow(nodeIds: string[]): Workflow {
  return {
    id: 'test-workflow',
    name: 'Test Workflow',
    nodes: nodeIds.map((id, index) => ({
      id,
      type: index === 0 ? 'input' : index === nodeIds.length - 1 ? 'output' : 'claude-agent',
      position: { x: index * 100, y: 0 },
      data: {
        type: index === 0 ? 'input' : index === nodeIds.length - 1 ? 'output' : 'claude-agent',
        name: `Node ${id}`,
        ...(index > 0 && index < nodeIds.length - 1 ? { userQuery: 'test', model: 'sonnet', tools: [] } : {}),
      } as any,
    })),
    edges: nodeIds.slice(0, -1).map((id, index) => ({
      id: `edge-${index}`,
      source: id,
      target: nodeIds[index + 1],
    })),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createConditionalWorkflow(): Workflow {
  return {
    id: 'conditional-workflow',
    name: 'Conditional Workflow',
    nodes: [
      {
        id: 'input-1',
        type: 'input',
        position: { x: 0, y: 0 },
        data: { type: 'input', name: 'Input' } as any,
      },
      {
        id: 'condition-1',
        type: 'condition',
        position: { x: 100, y: 0 },
        data: {
          type: 'condition',
          name: 'Condition',
          conditions: [
            {
              inputReference: '{{Input.prompt}}',
              operator: 'equals',
              compareValue: 'true',
              joiner: 'and',
            },
          ],
        } as any,
      },
      {
        id: 'branch-true',
        type: 'output',
        position: { x: 200, y: -50 },
        data: { type: 'output', name: 'True Branch' } as any,
      },
      {
        id: 'branch-false',
        type: 'output',
        position: { x: 200, y: 50 },
        data: { type: 'output', name: 'False Branch' } as any,
      },
      {
        id: 'merge-1',
        type: 'merge',
        position: { x: 300, y: 0 },
        data: { type: 'merge', name: 'Merge' } as any,
      },
    ],
    edges: [
      { id: 'edge-1', source: 'input-1', target: 'condition-1' },
      { id: 'edge-2', source: 'condition-1', target: 'branch-true', sourceHandle: 'true' },
      { id: 'edge-3', source: 'condition-1', target: 'branch-false', sourceHandle: 'false' },
      { id: 'edge-4', source: 'branch-true', target: 'merge-1' },
      { id: 'edge-5', source: 'branch-false', target: 'merge-1' },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('Complete Replay Flow', () => {
  it('execute workflow, capture checkpoint, and replay successfully', async () => {
    const workflow = createLinearWorkflow(['Input', 'A', 'B', 'Output']);

    // Execute original workflow
    const engine1 = new DAGExecutionEngine(workflow);
    const events1: ExecutionEvent[] = [];
    engine1.on('event', (event) => events1.push(event));

    const input = 'test input';
    await engine1.execute(input);

    // Verify original execution completed
    const exec1Complete = events1.find((e) => e.type === 'execution-complete');
    expect(exec1Complete).toBeDefined();

    // Capture checkpoint from first execution
    const nodeStates = new Map();
    const nodeOutputs = new Map();
    const variables = new Map();

    for (const node of workflow.nodes) {
      const state = engine1.getNodeState(node.id);
      if (state) {
        nodeStates.set(node.id, state);
        if (state.output !== undefined) {
          nodeOutputs.set(node.id, state.output);
        }
      }
    }

    const checkpoint = buildCheckpointState(nodeStates, nodeOutputs, variables);

    // Verify checkpoint structure
    expect(checkpoint.capturedAt).toBeDefined();
    expect(checkpoint.nodeStates.Input?.status).toBe('complete');
    expect(checkpoint.nodeStates.A?.status).toBe('complete');
    expect(checkpoint.nodeStates.B?.status).toBe('complete');
    expect(checkpoint.nodeStates.Output?.status).toBe('complete');

    // Create workflow snapshot
    const workflowSnapshot = {
      id: workflow.id,
      nodes: workflow.nodes,
      edges: workflow.edges,
      capturedAt: new Date().toISOString(),
    };

    // Validate replay eligibility
    const validation = validateReplayEligibility(
      workflow,
      'exec-1',
      checkpoint,
      workflowSnapshot,
      'B'
    );

    expect(validation.isBlocked).toBe(false);
    expect(validation.blockingReasons).toEqual([]);
    expect(validation.replayableNodeIds).toContain('Input');
    expect(validation.replayableNodeIds).toContain('A');
    expect(validation.replayableNodeIds).toContain('B');
    expect(validation.replayableNodeIds).toContain('Output');

    // Build replay plan
    const replayPlan = buildReplayPlan(workflow, checkpoint, 'B');
    expect(replayPlan.errors).toEqual([]);
    expect(replayPlan.replayNodeIds.has('B')).toBe(true);
    expect(replayPlan.replayNodeIds.has('Output')).toBe(true);
    expect(replayPlan.replayNodeIds.has('Input')).toBe(false);
    expect(replayPlan.replayNodeIds.has('A')).toBe(false);

    // Execute replay
    const engine2 = new DAGExecutionEngine(workflow);
    const events2: ExecutionEvent[] = [];
    engine2.on('event', (event) => events2.push(event));

    await engine2.executeFromCheckpoint(
      input,
      checkpoint,
      replayPlan.replayNodeIds,
      replayPlan.inactiveNodeIds
    );

    // Verify replay completed
    const exec2Complete = events2.find((e) => e.type === 'execution-complete');
    expect(exec2Complete).toBeDefined();

    // Verify node execution pattern
    const inputStarts = events2.filter((e) => e.type === 'node-start' && (e as any).nodeId === 'Input');
    const aStarts = events2.filter((e) => e.type === 'node-start' && (e as any).nodeId === 'A');
    const bStarts = events2.filter((e) => e.type === 'node-start' && (e as any).nodeId === 'B');
    const outputStarts = events2.filter((e) => e.type === 'node-start' && (e as any).nodeId === 'Output');

    // Input and A shouldn't re-execute
    expect(inputStarts.length).toBe(0);
    expect(aStarts.length).toBe(0);

    // B and Output should execute
    expect(bStarts.length).toBeGreaterThan(0);
    expect(outputStarts.length).toBeGreaterThan(0);

    // Verify cached outputs are available
    expect(engine2.getNodeOutput('Input')).toBe(input);
    expect(engine2.getNodeOutput('A')).toBeDefined();

    // Verify new outputs were generated
    expect(engine2.getNodeOutput('B')).toBeDefined();
    expect(engine2.getNodeOutput('Output')).toBeDefined();
  });

  it('replay with conditional branching - inactive branches stay skipped', async () => {
    const workflow = createConditionalWorkflow();

    // Execute original workflow with input that selects 'true' branch
    const engine1 = new DAGExecutionEngine(workflow);
    const events1: ExecutionEvent[] = [];
    engine1.on('event', (event) => events1.push(event));

    const input = 'true';
    await engine1.execute(input);

    // Verify original execution
    const exec1Complete = events1.find((e) => e.type === 'execution-complete');
    expect(exec1Complete).toBeDefined();

    // True branch should complete, false branch should be skipped
    expect(engine1.getNodeState('branch-true')?.status).toBe('complete');
    expect(engine1.getNodeState('branch-false')?.status).toBe('skipped');

    // Capture checkpoint
    const nodeStates = new Map();
    const nodeOutputs = new Map();

    for (const node of workflow.nodes) {
      const state = engine1.getNodeState(node.id);
      if (state) {
        nodeStates.set(node.id, state);
        if (state.output !== undefined) {
          nodeOutputs.set(node.id, state.output);
        }
      }
    }

    const checkpoint = buildCheckpointState(nodeStates, nodeOutputs, new Map());

    // Build replay plan for merge node
    const replayPlan = buildReplayPlan(workflow, checkpoint, 'merge-1');
    expect(replayPlan.errors).toEqual([]);

    // Compute inactive branches
    const inactiveNodes = computeInactiveBranchNodes(workflow, checkpoint, replayPlan.replayNodeIds);
    expect(inactiveNodes.has('branch-false')).toBe(true);
    expect(inactiveNodes.has('branch-true')).toBe(false);

    // Execute replay
    const engine2 = new DAGExecutionEngine(workflow);
    const events2: ExecutionEvent[] = [];
    engine2.on('event', (event) => events2.push(event));

    await engine2.executeFromCheckpoint(input, checkpoint, replayPlan.replayNodeIds, inactiveNodes);

    // Verify condition not re-executed
    const conditionStarts = events2.filter((e) => e.type === 'node-start' && (e as any).nodeId === 'condition-1');
    expect(conditionStarts.length).toBe(0);

    // Verify branch states
    expect(engine2.getNodeState('branch-true')?.status).toBe('complete');
    expect(engine2.getNodeState('branch-false')?.status).toBe('skipped');

    // Verify merge executed
    const mergeStarts = events2.filter((e) => e.type === 'node-start' && (e as any).nodeId === 'merge-1');
    expect(mergeStarts.length).toBeGreaterThan(0);
  });

  it('validates replay with workflow warnings but allows execution', async () => {
    const workflow = createLinearWorkflow(['A', 'B', 'C']);

    // Execute original
    const engine1 = new DAGExecutionEngine(workflow);
    await engine1.execute('test');

    // Capture checkpoint
    const nodeStates = new Map();
    const nodeOutputs = new Map();
    for (const node of workflow.nodes) {
      const state = engine1.getNodeState(node.id);
      if (state) {
        nodeStates.set(node.id, state);
        if (state.output !== undefined) {
          nodeOutputs.set(node.id, state.output);
        }
      }
    }
    const checkpoint = buildCheckpointState(nodeStates, nodeOutputs, new Map());

    // Modify workflow (non-blocking change)
    const modifiedWorkflow = JSON.parse(JSON.stringify(workflow));
    modifiedWorkflow.nodes[1].data.name = 'Modified B';

    const originalSnapshot = {
      id: workflow.id,
      nodes: workflow.nodes,
      edges: workflow.edges,
      capturedAt: new Date().toISOString(),
    };

    // Validate with modified workflow
    const validation = validateReplayEligibility(
      modifiedWorkflow,
      'exec-1',
      checkpoint,
      originalSnapshot,
      'B'
    );

    // Should have warnings but not be blocked
    expect(validation.isBlocked).toBe(false);
    expect(validation.warnings.length).toBeGreaterThan(0);
    expect(validation.warnings.some((w) => w.includes('changed'))).toBe(true);

    // Replay should still work
    const replayPlan = buildReplayPlan(modifiedWorkflow, checkpoint, 'B');
    expect(replayPlan.errors).toEqual([]);

    const engine2 = new DAGExecutionEngine(modifiedWorkflow);
    await expect(
      engine2.executeFromCheckpoint('test', checkpoint, replayPlan.replayNodeIds, replayPlan.inactiveNodeIds)
    ).resolves.toBeUndefined();
  });

  it('blocks replay when structural changes detected', async () => {
    const workflow = createLinearWorkflow(['A', 'B', 'C']);

    // Execute original
    const engine1 = new DAGExecutionEngine(workflow);
    await engine1.execute('test');

    // Capture checkpoint
    const nodeStates = new Map();
    const nodeOutputs = new Map();
    for (const node of workflow.nodes) {
      const state = engine1.getNodeState(node.id);
      if (state) {
        nodeStates.set(node.id, state);
        if (state.output !== undefined) {
          nodeOutputs.set(node.id, state.output);
        }
      }
    }
    const checkpoint = buildCheckpointState(nodeStates, nodeOutputs, new Map());

    // Remove a node (blocking change)
    const modifiedWorkflow = createLinearWorkflow(['A', 'C']); // B removed

    const originalSnapshot = {
      id: workflow.id,
      nodes: workflow.nodes,
      edges: workflow.edges,
      capturedAt: new Date().toISOString(),
    };

    // Validate with modified workflow
    const validation = validateReplayEligibility(
      modifiedWorkflow,
      'exec-1',
      checkpoint,
      originalSnapshot,
      'A'
    );

    // Should be blocked
    expect(validation.isBlocked).toBe(true);
    expect(validation.blockingReasons.length).toBeGreaterThan(0);
    expect(validation.blockingReasons.some((r) => r.includes('removed'))).toBe(true);
  });

  it('preserves upstream node outputs correctly during replay', async () => {
    const workflow = createLinearWorkflow(['Input', 'A', 'B']);

    // Execute original
    const engine1 = new DAGExecutionEngine(workflow);
    await engine1.execute('original input');

    const originalAOutput = engine1.getNodeOutput('A');

    // Capture checkpoint
    const nodeStates = new Map();
    const nodeOutputs = new Map();
    for (const node of workflow.nodes) {
      const state = engine1.getNodeState(node.id);
      if (state) {
        nodeStates.set(node.id, state);
        if (state.output !== undefined) {
          nodeOutputs.set(node.id, state.output);
        }
      }
    }
    const checkpoint = buildCheckpointState(nodeStates, nodeOutputs, new Map());

    // Replay from B
    const replayPlan = buildReplayPlan(workflow, checkpoint, 'B');

    const engine2 = new DAGExecutionEngine(workflow);
    await engine2.executeFromCheckpoint('original input', checkpoint, replayPlan.replayNodeIds, replayPlan.inactiveNodeIds);

    // A's output should be preserved from checkpoint
    const replayedAOutput = engine2.getNodeOutput('A');
    expect(replayedAOutput).toEqual(originalAOutput);

    // B should have access to A's output
    expect(engine2.getNodeOutput('B')).toBeDefined();
  });

  it('handles very large workflow (performance test)', async () => {
    // Create a linear chain of 20 nodes
    const nodeIds = Array.from({ length: 20 }, (_, i) => `Node${i}`);
    const workflow = createLinearWorkflow(nodeIds);

    // Execute original
    const engine1 = new DAGExecutionEngine(workflow);
    await engine1.execute('test');

    // Capture checkpoint
    const nodeStates = new Map();
    const nodeOutputs = new Map();
    for (const node of workflow.nodes) {
      const state = engine1.getNodeState(node.id);
      if (state) {
        nodeStates.set(node.id, state);
        if (state.output !== undefined) {
          nodeOutputs.set(node.id, state.output);
        }
      }
    }
    const checkpoint = buildCheckpointState(nodeStates, nodeOutputs, new Map());

    // Build replay plan from middle node
    const startTime = Date.now();
    const replayPlan = buildReplayPlan(workflow, checkpoint, 'Node10');
    const planTime = Date.now() - startTime;

    // Should complete quickly (< 100ms for 20 nodes)
    expect(planTime).toBeLessThan(100);

    // Should correctly identify replay nodes
    expect(replayPlan.replayNodeIds.size).toBe(10); // Node10 through Node19
    expect(replayPlan.errors).toEqual([]);
  });
});

describe('Error Handling', () => {
  it('handles missing ancestor with incomplete status', async () => {
    const workflow = createLinearWorkflow(['A', 'B', 'C']);

    const checkpoint: CheckpointState = {
      capturedAt: new Date().toISOString(),
      nodeStates: {
        A: { status: 'error', error: 'Failed' },
        B: { status: 'pending' },
        C: { status: 'pending' },
      },
      nodeOutputs: {},
      variables: {},
    };

    const replayPlan = buildReplayPlan(workflow, checkpoint, 'C');

    expect(replayPlan.errors.length).toBeGreaterThan(0);
    expect(replayPlan.errors.some((e) => e.type === 'dependency-missing')).toBe(true);
  });

  it('handles missing ancestor output data', async () => {
    const workflow = createLinearWorkflow(['A', 'B', 'C']);

    const checkpoint: CheckpointState = {
      capturedAt: new Date().toISOString(),
      nodeStates: {
        A: { status: 'complete' }, // Complete but no output
        B: { status: 'complete' },
        C: { status: 'pending' },
      },
      nodeOutputs: {
        B: 'output-b',
        // A's output is missing
      },
      variables: {},
    };

    const replayPlan = buildReplayPlan(workflow, checkpoint, 'C');

    expect(replayPlan.errors.some((e) => e.type === 'dependency-missing' && e.nodeId === 'A')).toBe(true);
  });
});

describe('Edge Cases', () => {
  it('handles workflow with no edges (disconnected nodes)', async () => {
    const workflow: Workflow = {
      id: 'disconnected',
      name: 'Disconnected',
      nodes: [
        { id: 'A', type: 'input', position: { x: 0, y: 0 }, data: { type: 'input', name: 'A' } as any },
        { id: 'B', type: 'output', position: { x: 100, y: 0 }, data: { type: 'output', name: 'B' } as any },
      ],
      edges: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const checkpoint: CheckpointState = {
      capturedAt: new Date().toISOString(),
      nodeStates: {
        A: { status: 'complete' },
        B: { status: 'complete' },
      },
      nodeOutputs: { A: 'a', B: 'b' },
      variables: {},
    };

    const replayPlan = buildReplayPlan(workflow, checkpoint, 'B');

    expect(replayPlan.replayNodeIds.has('B')).toBe(true);
    expect(replayPlan.replayNodeIds.size).toBe(1); // Only B, no descendants
    expect(replayPlan.errors).toEqual([]);
  });

  it('handles checkpoint with extra node data gracefully', async () => {
    const workflow = createLinearWorkflow(['A', 'B']);

    const checkpoint: CheckpointState = {
      capturedAt: new Date().toISOString(),
      nodeStates: {
        A: { status: 'complete' },
        B: { status: 'complete' },
        DeletedNode: { status: 'complete' }, // Extra node
      },
      nodeOutputs: {
        A: 'a',
        B: 'b',
        DeletedNode: 'deleted',
      },
      variables: {},
    };

    const engine = new DAGExecutionEngine(workflow);
    const replayPlan = buildReplayPlan(workflow, checkpoint, 'B');

    // Should not throw
    await expect(
      engine.executeFromCheckpoint('test', checkpoint, replayPlan.replayNodeIds, replayPlan.inactiveNodeIds)
    ).resolves.toBeUndefined();
  });
});

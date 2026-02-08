// Mock agents before imports
const mockClaudeAgent = {
  execute: jest.fn(),
  interrupt: jest.fn(),
  getStructuredOutput: jest.fn(),
  getSessionId: jest.fn().mockReturnValue('session-123'),
};

jest.mock('../../../src/agents/claude', () => ({
  ClaudeAgent: jest.fn(() => mockClaudeAgent),
}));

// Mock workflow storage
const mockGetWorkflow = jest.fn();
jest.mock('../../../src/workflows/storage', () => ({
  getWorkflow: (...args: any[]) => mockGetWorkflow(...args),
}));

import { DAGExecutionEngine } from '../../../src/orchestrator/engine';
import type { Workflow } from '../../../src/workflows/types';
import type { ExecutionEvent } from '../../../src/workflows/types';
import type { WorkflowEvolution } from '../../../src/orchestrator/evolution-types';

describe('Self-Reflect Integration - Validation Scenarios', () => {
  let mockWorkflow: Workflow;

  beforeEach(() => {
    jest.clearAllMocks();

    mockWorkflow = {
      id: 'workflow-1',
      name: 'Test Workflow',
      description: 'Validation testing',
      nodes: [
        {
          id: 'input-1',
          type: 'input',
          position: { x: 0, y: 0 },
          data: { type: 'input', name: 'Input' },
        },
        {
          id: 'agent-1',
          type: 'claude-agent',
          position: { x: 200, y: 0 },
          data: {
            type: 'claude-agent',
            name: 'Agent 1',
            userQuery: 'Process input',
            model: 'sonnet',
          },
        },
        {
          id: 'agent-2',
          type: 'claude-agent',
          position: { x: 200, y: 100 },
          data: {
            type: 'claude-agent',
            name: 'Agent 2',
            userQuery: 'Another task',
            model: 'sonnet',
          },
        },
        {
          id: 'self-1',
          type: 'self-reflect',
          position: { x: 400, y: 0 },
          data: {
            type: 'self-reflect',
            name: 'Self Reflect',
            reflectionGoal: 'Validate workflow changes',
            agentType: 'claude-agent',
            model: 'sonnet',
            evolutionMode: 'dry-run',
            scope: ['prompts', 'models', 'nodes', 'edges'],
            maxMutations: 10,
            includeTranscripts: false,
          },
        },
        {
          id: 'output-1',
          type: 'output',
          position: { x: 600, y: 0 },
          data: { type: 'output', name: 'Output' },
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
          source: 'input-1',
          target: 'agent-2',
        },
        {
          id: 'edge-3',
          source: 'agent-1',
          target: 'self-1',
        },
        {
          id: 'edge-4',
          source: 'agent-2',
          target: 'self-1',
        },
        {
          id: 'edge-5',
          source: 'self-1',
          target: 'output-1',
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockGetWorkflow.mockResolvedValue(mockWorkflow);
  });

  it('should reject evolution that removes input node', async () => {
    const engine = new DAGExecutionEngine(mockWorkflow);
    const events: ExecutionEvent[] = [];
    engine.on('event', (event) => events.push(event));

    // Mock agents
    mockClaudeAgent.execute.mockImplementation(async function* () {
      yield { type: 'complete', result: 'Agent output' };
    });

    // Mock self-reflect to suggest removing input
    const invalidEvolution: WorkflowEvolution = {
      reasoning: 'Try to simplify by removing input',
      mutations: [
        {
          op: 'remove-node',
          nodeId: 'input-1',
        },
      ],
      expectedImpact: 'Should be rejected',
      riskAssessment: 'High risk - removes critical node',
    };

    mockClaudeAgent.execute.mockImplementationOnce(async function* () {
      yield { type: 'complete', result: 'Agent 1 output' };
    });

    mockClaudeAgent.execute.mockImplementationOnce(async function* () {
      yield { type: 'complete', result: 'Agent 2 output' };
    });

    mockClaudeAgent.execute.mockImplementationOnce(async function* () {
      yield { type: 'complete', result: invalidEvolution };
    });

    mockClaudeAgent.getStructuredOutput.mockReturnValue({
      parsedJson: invalidEvolution,
    });

    await engine.execute('test input');

    // Verify validation failed
    const selfReflectState = engine.getNodeState('self-1');
    expect(selfReflectState?.status).toBe('complete');
    expect(selfReflectState?.output?.applied).toBe(false);
    expect(selfReflectState?.output?.validationErrors).toBeDefined();
    expect(selfReflectState?.output?.validationErrors.some((e: string) =>
      e.includes('Cannot remove input/output nodes')
    )).toBe(true);

    // Verify node-evolution event includes validation errors
    const evolutionEvents = events.filter((e) => e.type === 'node-evolution');
    expect(evolutionEvents[0].data?.validationErrors).toBeDefined();
  });

  it('should reject evolution that removes output node', async () => {
    const engine = new DAGExecutionEngine(mockWorkflow);

    mockClaudeAgent.execute.mockImplementation(async function* () {
      yield { type: 'complete', result: 'output' };
    });

    const invalidEvolution: WorkflowEvolution = {
      reasoning: 'Remove output',
      mutations: [
        {
          op: 'remove-node',
          nodeId: 'output-1',
        },
      ],
      expectedImpact: 'Should be rejected',
      riskAssessment: 'High risk - removes critical node',
    };

    mockClaudeAgent.getStructuredOutput.mockReturnValue({
      parsedJson: invalidEvolution,
    });

    await engine.execute('test input');

    const selfReflectState = engine.getNodeState('self-1');
    expect(selfReflectState?.output?.validationErrors.some((e: string) =>
      e.includes('Cannot remove input/output nodes')
    )).toBe(true);
  });

  it('should reject evolution that creates cycle', async () => {
    const engine = new DAGExecutionEngine(mockWorkflow);

    mockClaudeAgent.execute.mockImplementation(async function* () {
      yield { type: 'complete', result: 'output' };
    });

    const cyclicEvolution: WorkflowEvolution = {
      reasoning: 'Create feedback loop',
      mutations: [
        {
          op: 'add-edge',
          edge: {
            id: 'edge-6',
            source: 'output-1',
            target: 'input-1',
          },
        },
      ],
      expectedImpact: 'Should be rejected',
      riskAssessment: 'High risk - creates cycle',
    };

    mockClaudeAgent.getStructuredOutput.mockReturnValue({
      parsedJson: cyclicEvolution,
    });

    await engine.execute('test input');

    const selfReflectState = engine.getNodeState('self-1');
    expect(selfReflectState?.output?.validationErrors.some((e: string) =>
      e.includes('introduces a cycle')
    )).toBe(true);
  });

  it('should reject evolution that modifies self-reflect node', async () => {
    const engine = new DAGExecutionEngine(mockWorkflow);

    mockClaudeAgent.execute.mockImplementation(async function* () {
      yield { type: 'complete', result: 'output' };
    });

    const selfModifyEvolution: WorkflowEvolution = {
      reasoning: 'Try to modify own config',
      mutations: [
        {
          op: 'update-node-config',
          nodeId: 'self-1',
          path: 'reflectionGoal',
          value: 'New goal',
        },
      ],
      expectedImpact: 'Should be rejected',
      riskAssessment: 'High risk - self-modification',
    };

    mockClaudeAgent.getStructuredOutput.mockReturnValue({
      parsedJson: selfModifyEvolution,
    });

    await engine.execute('test input');

    const selfReflectState = engine.getNodeState('self-1');
    expect(selfReflectState?.output?.validationErrors.some((e: string) =>
      e.includes('Cannot modify the self-reflect node')
    )).toBe(true);
  });

  it('should reject evolution that removes self-reflect node', async () => {
    const engine = new DAGExecutionEngine(mockWorkflow);

    mockClaudeAgent.execute.mockImplementation(async function* () {
      yield { type: 'complete', result: 'output' };
    });

    const removeSelfoEvolution: WorkflowEvolution = {
      reasoning: 'Try to remove self',
      mutations: [
        {
          op: 'remove-node',
          nodeId: 'self-1',
        },
      ],
      expectedImpact: 'Should be rejected',
      riskAssessment: 'High risk - self-removal',
    };

    mockClaudeAgent.getStructuredOutput.mockReturnValue({
      parsedJson: removeSelfoEvolution,
    });

    await engine.execute('test input');

    const selfReflectState = engine.getNodeState('self-1');
    expect(selfReflectState?.output?.validationErrors.some((e: string) =>
      e.includes('Cannot remove the self-reflect node')
    )).toBe(true);
  });

  it('should reject evolution that removes node connected to self-reflect', async () => {
    const engine = new DAGExecutionEngine(mockWorkflow);

    mockClaudeAgent.execute.mockImplementation(async function* () {
      yield { type: 'complete', result: 'output' };
    });

    const removeConnectedEvolution: WorkflowEvolution = {
      reasoning: 'Remove predecessor',
      mutations: [
        {
          op: 'remove-node',
          nodeId: 'agent-1',
        },
      ],
      expectedImpact: 'Should be rejected',
      riskAssessment: 'High risk - removes connected node',
    };

    mockClaudeAgent.getStructuredOutput.mockReturnValue({
      parsedJson: removeConnectedEvolution,
    });

    await engine.execute('test input');

    const selfReflectState = engine.getNodeState('self-1');
    expect(selfReflectState?.output?.validationErrors.some((e: string) =>
      e.includes('Cannot remove a node connected to the self-reflect node')
    )).toBe(true);
  });

  it('should reject evolution with mutations exceeding maxMutations', async () => {
    (mockWorkflow.nodes[3].data as any).maxMutations = 2;

    const engine = new DAGExecutionEngine(mockWorkflow);

    mockClaudeAgent.execute.mockImplementation(async function* () {
      yield { type: 'complete', result: 'output' };
    });

    const tooManyMutations: WorkflowEvolution = {
      reasoning: 'Too many changes',
      mutations: [
        {
          op: 'update-model',
          nodeId: 'agent-1',
          newModel: 'opus',
        },
        {
          op: 'update-model',
          nodeId: 'agent-2',
          newModel: 'opus',
        },
        {
          op: 'update-workflow-setting',
          field: 'name',
          value: 'New name',
        },
      ],
      expectedImpact: 'Should be rejected',
    riskAssessment: 'Low risk',
    };

    mockClaudeAgent.getStructuredOutput.mockReturnValue({
      parsedJson: tooManyMutations,
    });

    await engine.execute('test input');

    const selfReflectState = engine.getNodeState('self-1');
    expect(selfReflectState?.output?.validationErrors.some((e: string) =>
      e.includes('Mutation count exceeds maxMutations')
    )).toBe(true);
  });

  it('should reject evolution with out-of-scope mutations', async () => {
    (mockWorkflow.nodes[3].data as any).scope = ['prompts']; // Only prompts allowed

    const engine = new DAGExecutionEngine(mockWorkflow);

    mockClaudeAgent.execute.mockImplementation(async function* () {
      yield { type: 'complete', result: 'output' };
    });

    const outOfScopeEvolution: WorkflowEvolution = {
      reasoning: 'Try to add node',
      mutations: [
        {
          op: 'add-node',
          node: {
            id: 'js-1',
            type: 'javascript',
            position: { x: 300, y: 0 },
            data: {
              type: 'javascript',
              name: 'JS Node',
              code: 'return input;',
            },
          },
        },
      ],
      expectedImpact: 'Should be rejected',
      riskAssessment: 'Low risk',
    };

    mockClaudeAgent.getStructuredOutput.mockReturnValue({
      parsedJson: outOfScopeEvolution,
    });

    await engine.execute('test input');

    const selfReflectState = engine.getNodeState('self-1');
    expect(selfReflectState?.output?.validationErrors.some((e: string) =>
      e.includes("Mutation scope 'nodes' is not allowed")
    )).toBe(true);
  });

  it('should reject evolution with unknown node type', async () => {
    const engine = new DAGExecutionEngine(mockWorkflow);

    mockClaudeAgent.execute.mockImplementation(async function* () {
      yield { type: 'complete', result: 'output' };
    });

    const unknownTypeEvolution: WorkflowEvolution = {
      reasoning: 'Add unknown node',
      mutations: [
        {
          op: 'add-node',
          node: {
            id: 'unknown-1',
            type: 'unknown-type' as any,
            position: { x: 300, y: 0 },
            data: { name: 'Unknown' } as any,
          },
        },
      ],
      expectedImpact: 'Should be rejected',
      riskAssessment: 'Low risk',
    };

    mockClaudeAgent.getStructuredOutput.mockReturnValue({
      parsedJson: unknownTypeEvolution,
    });

    await engine.execute('test input');

    const selfReflectState = engine.getNodeState('self-1');
    expect(selfReflectState?.output?.validationErrors.some((e: string) =>
      e.includes('Unknown node type')
    )).toBe(true);
  });

  it('should reject evolution with duplicate node ID', async () => {
    const engine = new DAGExecutionEngine(mockWorkflow);

    mockClaudeAgent.execute.mockImplementation(async function* () {
      yield { type: 'complete', result: 'output' };
    });

    const duplicateIdEvolution: WorkflowEvolution = {
      reasoning: 'Add node with duplicate ID',
      mutations: [
        {
          op: 'add-node',
          node: {
            id: 'agent-1', // Already exists
            type: 'javascript',
            position: { x: 300, y: 0 },
            data: {
              name: 'Duplicate',
              code: 'return input;',
            },
          },
        },
      ],
      expectedImpact: 'Should be rejected',
    riskAssessment: 'Low risk',
    };

    mockClaudeAgent.getStructuredOutput.mockReturnValue({
      parsedJson: duplicateIdEvolution,
    });

    await engine.execute('test input');

    const selfReflectState = engine.getNodeState('self-1');
    expect(selfReflectState?.output?.validationErrors.some((e: string) =>
      e.includes('Node ID agent-1 already exists')
    )).toBe(true);
  });

  it('should reject evolution with duplicate node name', async () => {
    const engine = new DAGExecutionEngine(mockWorkflow);

    mockClaudeAgent.execute.mockImplementation(async function* () {
      yield { type: 'complete', result: 'output' };
    });

    const duplicateNameEvolution: WorkflowEvolution = {
      reasoning: 'Add node with duplicate name',
      mutations: [
        {
          op: 'add-node',
          node: {
            id: 'js-1',
            type: 'javascript',
            position: { x: 300, y: 0 },
            data: {
              name: 'Agent 1', // Duplicate name
              code: 'return input;',
            },
          },
        },
      ],
      expectedImpact: 'Should be rejected',
    riskAssessment: 'Low risk',
    };

    mockClaudeAgent.getStructuredOutput.mockReturnValue({
      parsedJson: duplicateNameEvolution,
    });

    await engine.execute('test input');

    const selfReflectState = engine.getNodeState('self-1');
    expect(selfReflectState?.output?.validationErrors.some((e: string) =>
      e.includes('Node name must be unique')
    )).toBe(true);
  });

  it('should reject evolution with invalid workflow setting field', async () => {
    const engine = new DAGExecutionEngine(mockWorkflow);

    mockClaudeAgent.execute.mockImplementation(async function* () {
      yield { type: 'complete', result: 'output' };
    });

    const invalidSettingEvolution: WorkflowEvolution = {
      reasoning: 'Update invalid field',
      mutations: [
        {
          op: 'update-workflow-setting',
          field: 'invalidField',
          value: 'test',
        },
      ],
      expectedImpact: 'Should be rejected',
    riskAssessment: 'Low risk',
    };

    mockClaudeAgent.getStructuredOutput.mockReturnValue({
      parsedJson: invalidSettingEvolution,
    });

    await engine.execute('test input');

    const selfReflectState = engine.getNodeState('self-1');
    expect(selfReflectState?.output?.validationErrors.some((e: string) =>
      e.includes('Invalid workflow setting field')
    )).toBe(true);
  });

  it('should accept valid complex evolution', async () => {
    const engine = new DAGExecutionEngine(mockWorkflow);

    mockClaudeAgent.execute.mockImplementation(async function* () {
      yield { type: 'complete', result: 'output' };
    });

    const validEvolution: WorkflowEvolution = {
      reasoning: 'Comprehensive valid improvements',
      mutations: [
        {
          op: 'update-prompt',
          nodeId: 'agent-1',
          field: 'userQuery',
          newValue: 'Enhanced prompt',
        },
        {
          op: 'update-model',
          nodeId: 'agent-1',
          newModel: 'opus',
        },
        {
          op: 'update-model',
          nodeId: 'agent-2',
          newModel: 'opus',
        },
      ],
      expectedImpact: 'Better quality across all agents',
    riskAssessment: 'Low risk',
    };

    mockClaudeAgent.getStructuredOutput.mockReturnValue({
      parsedJson: validEvolution,
    });

    await engine.execute('test input');

    const selfReflectState = engine.getNodeState('self-1');
    expect(selfReflectState?.status).toBe('complete');
    expect(selfReflectState?.output?.applied).toBe(false); // dry-run mode
    expect(selfReflectState?.output?.validationErrors).toEqual([]);
    expect(selfReflectState?.output?.evolution).toEqual(validEvolution);
  });

  it('should collect all validation errors from compound mutations', async () => {
    const engine = new DAGExecutionEngine(mockWorkflow);

    mockClaudeAgent.execute.mockImplementation(async function* () {
      yield { type: 'complete', result: 'output' };
    });

    const multipleErrorsEvolution: WorkflowEvolution = {
      reasoning: 'Multiple invalid mutations',
      mutations: [
        {
          op: 'remove-node',
          nodeId: 'input-1',
        },
        {
          op: 'remove-node',
          nodeId: 'output-1',
        },
        {
          op: 'add-node',
          node: {
            id: 'agent-1', // Duplicate ID
            type: 'javascript',
            position: { x: 300, y: 0 },
            data: { name: 'Dup', code: 'return input;' },
          },
        },
      ],
      expectedImpact: 'Should collect all errors',
    riskAssessment: 'Low risk',
    };

    mockClaudeAgent.getStructuredOutput.mockReturnValue({
      parsedJson: multipleErrorsEvolution,
    });

    await engine.execute('test input');

    const selfReflectState = engine.getNodeState('self-1');
    expect(selfReflectState?.output?.validationErrors).toBeDefined();
    expect(selfReflectState?.output?.validationErrors.length).toBeGreaterThan(1);
  });
});

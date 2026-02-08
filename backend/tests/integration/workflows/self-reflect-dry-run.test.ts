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

import { DAGExecutionEngine } from '../../../src/orchestrator/engine';
import type { Workflow } from '../../../src/workflows/types';
import type { ExecutionEvent } from '../../../src/workflows/types';
import type { WorkflowEvolution } from '../../../src/orchestrator/evolution-types';

describe('Self-Reflect Integration - Dry-Run Mode', () => {
  let mockWorkflow: Workflow;

  beforeEach(() => {
    jest.clearAllMocks();

    mockWorkflow = {
      id: 'workflow-1',
      name: 'Test Workflow with Self-Reflect',
      description: 'Integration test',
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
            name: 'Main Agent',
            userQuery: 'Process the input',
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
            reflectionGoal: 'Analyze the workflow and suggest improvements',
            agentType: 'claude-agent',
            model: 'sonnet',
            evolutionMode: 'dry-run',
            scope: ['prompts', 'models'],
            maxMutations: 5,
            includeTranscripts: true,
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
          source: 'agent-1',
          target: 'self-1',
        },
        {
          id: 'edge-3',
          source: 'self-1',
          target: 'output-1',
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  it('should execute workflow with self-reflect in dry-run mode', async () => {
    const engine = new DAGExecutionEngine(mockWorkflow);
    const events: ExecutionEvent[] = [];
    engine.on('event', (event) => events.push(event));

    // Mock main agent
    mockClaudeAgent.execute.mockImplementationOnce(async function* () {
      yield { type: 'text-delta', content: 'Processing input...' };
      yield { type: 'complete', result: 'Agent processed the input successfully' };
    });

    // Mock self-reflect agent
    const mockEvolution: WorkflowEvolution = {
      reasoning: 'The current prompt could be more specific to improve output quality',
      mutations: [
        {
          op: 'update-prompt',
          nodeId: 'agent-1',
          field: 'userQuery',
          newValue: 'Process the input and provide detailed analysis',
        },
        {
          op: 'update-model',
          nodeId: 'agent-1',
          newModel: 'opus',
        },
      ],
      expectedImpact: 'More detailed and higher quality responses',
      riskAssessment: 'Low risk - only updating prompts and model',
    };

    mockClaudeAgent.execute.mockImplementationOnce(async function* () {
      yield { type: 'text-delta', content: 'Analyzing workflow...' };
      yield { type: 'complete', result: mockEvolution };
    });

    mockClaudeAgent.getStructuredOutput.mockReturnValue({
      parsedJson: mockEvolution,
    });

    // Execute workflow
    const result = await engine.execute('test input data');

    // Verify execution completed
    expect(result).toBeDefined();

    // Verify self-reflect node executed
    const selfReflectState = engine.getNodeState('self-1');
    expect(selfReflectState?.status).toBe('complete');
    expect(selfReflectState?.output).toHaveProperty('evolution');
    expect(selfReflectState?.output).toHaveProperty('applied');

    // Verify evolution was produced but NOT applied
    expect(selfReflectState?.output?.applied).toBe(false);
    expect(selfReflectState?.output?.evolution).toEqual(mockEvolution);

    // Verify workflow was NOT modified
    expect(mockWorkflow.nodes.find((n) => n.id === 'agent-1')?.data.userQuery).toBe('Process the input');
    expect(mockWorkflow.nodes.find((n) => n.id === 'agent-1')?.data.model).toBe('sonnet');

    // Verify node-evolution event was emitted
    const evolutionEvents = events.filter((e) => e.type === 'node-evolution');
    expect(evolutionEvents).toHaveLength(1);
    expect(evolutionEvents[0].data).toMatchObject({
      nodeId: 'self-1',
      evolution: mockEvolution,
      applied: false,
      approvalRequested: false,
    });

    // Verify output node received evolution
    const outputState = engine.getNodeState('output-1');
    expect(outputState?.status).toBe('complete');
  });

  it('should include all upstream execution data in context', async () => {
    const engine = new DAGExecutionEngine(mockWorkflow);

    let capturedPrompt = '';

    // Mock main agent
    mockClaudeAgent.execute.mockImplementationOnce(async function* () {
      yield { type: 'complete', result: 'Agent output' };
    });

    // Mock self-reflect agent to capture prompt
    mockClaudeAgent.execute.mockImplementationOnce(async function* (prompt: string) {
      capturedPrompt = prompt;
      yield {
        type: 'complete',
        result: {
          reasoning: 'Test',
          mutations: [],
          expectedImpact: 'None',
        },
      };
    });

    mockClaudeAgent.getStructuredOutput.mockReturnValue({
      parsedJson: {
        reasoning: 'Test',
        mutations: [],
        expectedImpact: 'None',
      },
    });

    await engine.execute('test input');

    // Verify prompt includes execution context
    expect(capturedPrompt).toContain('execution');
    expect(capturedPrompt).toContain('nodes');
    expect(capturedPrompt).toContain('input-1');
    expect(capturedPrompt).toContain('agent-1');
  });

  it('should include transcripts when includeTranscripts is true', async () => {
    const engine = new DAGExecutionEngine(mockWorkflow);

    let capturedPrompt = '';

    mockClaudeAgent.execute.mockImplementationOnce(async function* () {
      yield { type: 'complete', result: 'Agent output' };
    });

    mockClaudeAgent.execute.mockImplementationOnce(async function* (prompt: string) {
      capturedPrompt = prompt;
      yield {
        type: 'complete',
        result: {
          reasoning: 'Test',
          mutations: [],
          expectedImpact: 'None',
        },
      };
    });

    mockClaudeAgent.getStructuredOutput.mockReturnValue({
      parsedJson: {
        reasoning: 'Test',
        mutations: [],
        expectedImpact: 'None',
      },
    });

    await engine.execute('test input');

    // Verify transcript field is included in context
    expect(capturedPrompt).toContain('transcript');
  });

  it('should exclude transcripts when includeTranscripts is false', async () => {
    mockWorkflow.nodes[2].data.includeTranscripts = false;

    const engine = new DAGExecutionEngine(mockWorkflow);

    let capturedPrompt = '';

    mockClaudeAgent.execute.mockImplementationOnce(async function* () {
      yield { type: 'complete', result: 'Agent output' };
    });

    mockClaudeAgent.execute.mockImplementationOnce(async function* (prompt: string) {
      capturedPrompt = prompt;
      yield {
        type: 'complete',
        result: {
          reasoning: 'Test',
          mutations: [],
          expectedImpact: 'None',
        },
      };
    });

    mockClaudeAgent.getStructuredOutput.mockReturnValue({
      parsedJson: {
        reasoning: 'Test',
        mutations: [],
        expectedImpact: 'None',
      },
    });

    await engine.execute('test input');

    // Verify transcript is not included (check for absence of transcript property in nodes)
    const contextPayload = JSON.parse(capturedPrompt);
    if (contextPayload.execution?.nodes) {
      contextPayload.execution.nodes.forEach((node: any) => {
        expect(node).not.toHaveProperty('transcript');
      });
    }
  });

  it('should handle validation errors gracefully', async () => {
    const engine = new DAGExecutionEngine(mockWorkflow);
    const events: ExecutionEvent[] = [];
    engine.on('event', (event) => events.push(event));

    mockClaudeAgent.execute.mockImplementationOnce(async function* () {
      yield { type: 'complete', result: 'Agent output' };
    });

    // Mock self-reflect to produce invalid evolution
    const invalidEvolution: WorkflowEvolution = {
      reasoning: 'Try to remove output node',
      mutations: [
        {
          op: 'remove-node',
          nodeId: 'output-1',
        },
      ],
      expectedImpact: 'None - should be rejected',
    riskAssessment: 'Low risk',
    };

    mockClaudeAgent.execute.mockImplementationOnce(async function* () {
      yield { type: 'complete', result: invalidEvolution };
    });

    mockClaudeAgent.getStructuredOutput.mockReturnValue({
      parsedJson: invalidEvolution,
    });

    await engine.execute('test input');

    const selfReflectState = engine.getNodeState('self-1');
    expect(selfReflectState?.status).toBe('complete');
    expect(selfReflectState?.output?.applied).toBe(false);
    expect(selfReflectState?.output?.validationErrors).toBeDefined();
    expect(selfReflectState?.output?.validationErrors.length).toBeGreaterThan(0);

    const evolutionEvents = events.filter((e) => e.type === 'node-evolution');
    expect(evolutionEvents[0].data).toHaveProperty('validationErrors');
  });

  it('should provide before and after snapshots', async () => {
    const engine = new DAGExecutionEngine(mockWorkflow);

    mockClaudeAgent.execute.mockImplementationOnce(async function* () {
      yield { type: 'complete', result: 'Agent output' };
    });

    const mockEvolution: WorkflowEvolution = {
      reasoning: 'Test',
      mutations: [],
      expectedImpact: 'None',
    riskAssessment: 'Low risk',
    };

    mockClaudeAgent.execute.mockImplementationOnce(async function* () {
      yield { type: 'complete', result: mockEvolution };
    });

    mockClaudeAgent.getStructuredOutput.mockReturnValue({
      parsedJson: mockEvolution,
    });

    await engine.execute('test input');

    const selfReflectState = engine.getNodeState('self-1');
    expect(selfReflectState?.output?.beforeSnapshot).toBeDefined();
    expect(selfReflectState?.output?.beforeSnapshot).toHaveProperty('id', 'workflow-1');
    expect(selfReflectState?.output?.beforeSnapshot).toHaveProperty('nodes');
    expect(selfReflectState?.output?.beforeSnapshot).toHaveProperty('capturedAt');

    // In dry-run mode, afterSnapshot should be undefined since nothing was applied
    expect(selfReflectState?.output?.afterSnapshot).toBeUndefined();
  });
});

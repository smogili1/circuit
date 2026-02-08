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

describe('Self-Reflect WebSocket Events Integration', () => {
  let mockWorkflow: Workflow;

  beforeEach(() => {
    jest.clearAllMocks();

    mockWorkflow = {
      id: 'workflow-1',
      name: 'Test Workflow',
      description: 'WebSocket events test',
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
            name: 'Agent',
            userQuery: 'Process input',
            model: 'sonnet',
          },
        },
        {
          id: 'self-1',
          type: 'self-reflect',
          position: { x: 400, y: 0 },
          data: {
            name: 'Self Reflect',
            reflectionGoal: 'Improve workflow',
            agentType: 'claude-agent',
            model: 'sonnet',
            evolutionMode: 'dry-run',
            scope: ['prompts', 'models'],
            maxMutations: 10,
            includeTranscripts: true,
          },
        },
        {
          id: 'output-1',
          type: 'output',
          position: { x: 600, y: 0 },
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

    mockGetWorkflow.mockResolvedValue(mockWorkflow);
  });

  it('should emit node-evolution event with complete data', async () => {
    const engine = new DAGExecutionEngine(mockWorkflow);
    const events: ExecutionEvent[] = [];
    engine.on('event', (event) => events.push(event));

    mockClaudeAgent.execute.mockImplementationOnce(async function* () {
      yield { type: 'complete', result: 'Agent output' };
    });

    const mockEvolution: WorkflowEvolution = {
      reasoning: 'Test evolution',
      mutations: [
        {
          op: 'update-model',
          nodeId: 'agent-1',
          newModel: 'opus',
        },
      ],
      expectedImpact: 'Better quality',
      riskAssessment: 'Low risk',
    };

    mockClaudeAgent.execute.mockImplementationOnce(async function* () {
      yield { type: 'complete', result: mockEvolution };
    });

    mockClaudeAgent.getStructuredOutput.mockReturnValue({
      parsedJson: mockEvolution,
    });

    await engine.execute('test input');

    // Find node-evolution event
    const evolutionEvents = events.filter((e) => e.type === 'node-evolution');
    expect(evolutionEvents).toHaveLength(1);

    const evolutionEvent = evolutionEvents[0];
    expect(evolutionEvent.data).toMatchObject({
      nodeId: 'self-1',
      nodeName: 'Self Reflect',
      mode: 'dry-run',
      applied: false,
      approvalRequested: false,
    });

    expect(evolutionEvent.data?.evolution).toEqual(mockEvolution);
    expect(evolutionEvent.data?.beforeSnapshot).toBeDefined();
    expect(evolutionEvent.data?.validationErrors).toEqual([]);
  });

  it('should emit node-evolution event with validation errors', async () => {
    const engine = new DAGExecutionEngine(mockWorkflow);
    const events: ExecutionEvent[] = [];
    engine.on('event', (event) => events.push(event));

    mockClaudeAgent.execute.mockImplementationOnce(async function* () {
      yield { type: 'complete', result: 'Agent output' };
    });

    const invalidEvolution: WorkflowEvolution = {
      reasoning: 'Invalid evolution',
      mutations: [
        {
          op: 'remove-node',
          nodeId: 'output-1',
        },
      ],
      expectedImpact: 'Should be rejected',
    riskAssessment: 'Low risk',
    };

    mockClaudeAgent.execute.mockImplementationOnce(async function* () {
      yield { type: 'complete', result: invalidEvolution };
    });

    mockClaudeAgent.getStructuredOutput.mockReturnValue({
      parsedJson: invalidEvolution,
    });

    await engine.execute('test input');

    const evolutionEvents = events.filter((e) => e.type === 'node-evolution');
    expect(evolutionEvents).toHaveLength(1);

    expect(evolutionEvents[0].data?.applied).toBe(false);
    expect(evolutionEvents[0].data?.validationErrors).toBeDefined();
    expect(evolutionEvents[0].data?.validationErrors.length).toBeGreaterThan(0);
  });

  it('should emit standard execution events alongside node-evolution', async () => {
    const engine = new DAGExecutionEngine(mockWorkflow);
    const events: ExecutionEvent[] = [];
    engine.on('event', (event) => events.push(event));

    mockClaudeAgent.execute.mockImplementation(async function* () {
      yield { type: 'complete', result: 'output' };
    });

    const mockEvolution: WorkflowEvolution = {
      reasoning: 'Test',
      mutations: [],
      expectedImpact: 'None',
    riskAssessment: 'Low risk',
    };

    mockClaudeAgent.getStructuredOutput.mockReturnValue({
      parsedJson: mockEvolution,
    });

    await engine.execute('test input');

    // Verify standard execution events
    expect(events.some((e) => e.type === 'execution-start')).toBe(true);
    expect(events.some((e) => e.type === 'node-start' && e.nodeId === 'self-1')).toBe(true);
    expect(events.some((e) => e.type === 'node-complete' && e.nodeId === 'self-1')).toBe(true);
    expect(events.some((e) => e.type === 'execution-complete')).toBe(true);

    // Verify node-evolution event
    expect(events.some((e) => e.type === 'node-evolution')).toBe(true);
  });

  it('should include nodeId and nodeName in event', async () => {
    const engine = new DAGExecutionEngine(mockWorkflow);
    const events: ExecutionEvent[] = [];
    engine.on('event', (event) => events.push(event));

    mockClaudeAgent.execute.mockImplementation(async function* () {
      yield { type: 'complete', result: 'output' };
    });

    const mockEvolution: WorkflowEvolution = {
      reasoning: 'Test',
      mutations: [],
      expectedImpact: 'None',
    riskAssessment: 'Low risk',
    };

    mockClaudeAgent.getStructuredOutput.mockReturnValue({
      parsedJson: mockEvolution,
    });

    await engine.execute('test input');

    const evolutionEvent = events.find((e) => e.type === 'node-evolution');
    expect(evolutionEvent?.data?.nodeId).toBe('self-1');
    expect(evolutionEvent?.data?.nodeName).toBe('Self Reflect');
  });

  it('should include mode in event data', async () => {
    const engine = new DAGExecutionEngine(mockWorkflow);
    const events: ExecutionEvent[] = [];
    engine.on('event', (event) => events.push(event));

    mockClaudeAgent.execute.mockImplementation(async function* () {
      yield { type: 'complete', result: 'output' };
    });

    const mockEvolution: WorkflowEvolution = {
      reasoning: 'Test',
      mutations: [],
      expectedImpact: 'None',
    riskAssessment: 'Low risk',
    };

    mockClaudeAgent.getStructuredOutput.mockReturnValue({
      parsedJson: mockEvolution,
    });

    await engine.execute('test input');

    const evolutionEvent = events.find((e) => e.type === 'node-evolution');
    expect(evolutionEvent?.data?.mode).toBe('dry-run');
  });

  it('should emit event with snapshots', async () => {
    const engine = new DAGExecutionEngine(mockWorkflow);
    const events: ExecutionEvent[] = [];
    engine.on('event', (event) => events.push(event));

    mockClaudeAgent.execute.mockImplementation(async function* () {
      yield { type: 'complete', result: 'output' };
    });

    const mockEvolution: WorkflowEvolution = {
      reasoning: 'Test',
      mutations: [],
      expectedImpact: 'None',
    riskAssessment: 'Low risk',
    };

    mockClaudeAgent.getStructuredOutput.mockReturnValue({
      parsedJson: mockEvolution,
    });

    await engine.execute('test input');

    const evolutionEvent = events.find((e) => e.type === 'node-evolution');
    expect(evolutionEvent?.data?.beforeSnapshot).toBeDefined();
    expect(evolutionEvent?.data?.beforeSnapshot).toHaveProperty('id', 'workflow-1');
    expect(evolutionEvent?.data?.beforeSnapshot).toHaveProperty('nodes');
    expect(evolutionEvent?.data?.beforeSnapshot).toHaveProperty('capturedAt');
  });

  it('should emit event before node completes', async () => {
    const engine = new DAGExecutionEngine(mockWorkflow);
    const events: ExecutionEvent[] = [];
    engine.on('event', (event) => events.push(event));

    mockClaudeAgent.execute.mockImplementation(async function* () {
      yield { type: 'complete', result: 'output' };
    });

    const mockEvolution: WorkflowEvolution = {
      reasoning: 'Test',
      mutations: [],
      expectedImpact: 'None',
    riskAssessment: 'Low risk',
    };

    mockClaudeAgent.getStructuredOutput.mockReturnValue({
      parsedJson: mockEvolution,
    });

    await engine.execute('test input');

    const evolutionEventIndex = events.findIndex((e) => e.type === 'node-evolution');
    const nodeCompleteIndex = events.findIndex(
      (e) => e.type === 'node-complete' && e.nodeId === 'self-1'
    );

    expect(evolutionEventIndex).toBeGreaterThan(-1);
    expect(nodeCompleteIndex).toBeGreaterThan(-1);
    expect(evolutionEventIndex).toBeLessThan(nodeCompleteIndex);
  });

  it('should be serializable for WebSocket transmission', async () => {
    const engine = new DAGExecutionEngine(mockWorkflow);
    const events: ExecutionEvent[] = [];
    engine.on('event', (event) => events.push(event));

    mockClaudeAgent.execute.mockImplementation(async function* () {
      yield { type: 'complete', result: 'output' };
    });

    const mockEvolution: WorkflowEvolution = {
      reasoning: 'Test',
      mutations: [
        {
          op: 'update-model',
          nodeId: 'agent-1',
          newModel: 'opus',
        },
      ],
      expectedImpact: 'Better quality',
    riskAssessment: 'Low risk',
    };

    mockClaudeAgent.getStructuredOutput.mockReturnValue({
      parsedJson: mockEvolution,
    });

    await engine.execute('test input');

    const evolutionEvent = events.find((e) => e.type === 'node-evolution');
    expect(evolutionEvent).toBeDefined();

    // Verify event can be serialized to JSON
    const serialized = JSON.stringify(evolutionEvent);
    expect(serialized).toBeTruthy();

    // Verify it can be deserialized
    const deserialized = JSON.parse(serialized);
    expect(deserialized.type).toBe('node-evolution');
    expect(deserialized.data.evolution).toEqual(mockEvolution);
  });
});

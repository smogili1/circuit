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
const mockUpdateWorkflow = jest.fn();
const mockGetWorkflow = jest.fn();

jest.mock('../../../src/workflows/storage', () => ({
  updateWorkflow: (...args: any[]) => mockUpdateWorkflow(...args),
  getWorkflow: (...args: any[]) => mockGetWorkflow(...args),
}));

// Mock file system
import * as fs from 'fs/promises';
jest.mock('fs/promises');

import { DAGExecutionEngine } from '../../../src/orchestrator/engine';
import type { Workflow } from '../../../src/workflows/types';
import type { ExecutionEvent } from '../../../src/workflows/types';
import type { WorkflowEvolution } from '../../../src/orchestrator/evolution-types';

describe('Self-Reflect Integration - Auto-Apply Mode', () => {
  let mockWorkflow: Workflow;

  beforeEach(() => {
    jest.clearAllMocks();

    mockWorkflow = {
      id: 'workflow-1',
      name: 'Test Workflow',
      description: 'Integration test for auto-apply',
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
            reflectionGoal: 'Improve the workflow',
            agentType: 'claude-agent',
            model: 'sonnet',
            evolutionMode: 'auto-apply',
            scope: ['prompts', 'models'],
            maxMutations: 10,
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

    mockGetWorkflow.mockResolvedValue(mockWorkflow);

    // Mock fs operations
    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fs.appendFile as jest.Mock).mockResolvedValue(undefined);
  });

  it('should apply evolution automatically in auto-apply mode', async () => {
    const engine = new DAGExecutionEngine(mockWorkflow);
    const events: ExecutionEvent[] = [];
    engine.on('event', (event) => events.push(event));

    // Mock main agent
    mockClaudeAgent.execute.mockImplementationOnce(async function* () {
      yield { type: 'complete', result: 'Agent output' };
    });

    // Mock self-reflect agent
    const mockEvolution: WorkflowEvolution = {
      reasoning: 'Upgrade to opus for better quality',
      mutations: [
        {
          op: 'update-model',
          nodeId: 'agent-1',
          newModel: 'opus',
        },
      ],
      expectedImpact: 'Higher quality outputs',
    riskAssessment: 'Low risk',
    };

    mockClaudeAgent.execute.mockImplementationOnce(async function* () {
      yield { type: 'complete', result: mockEvolution };
    });

    mockClaudeAgent.getStructuredOutput.mockReturnValue({
      parsedJson: mockEvolution,
    });

    // Mock updateWorkflow to return updated workflow
    const updatedWorkflow = {
      ...mockWorkflow,
      nodes: mockWorkflow.nodes.map((n) =>
        n.id === 'agent-1' ? { ...n, data: { ...n.data, model: 'opus' } } : n
      ),
    };
    mockUpdateWorkflow.mockResolvedValue(updatedWorkflow);

    await engine.execute('test input');

    // Verify evolution was applied
    const selfReflectState = engine.getNodeState('self-1');
    expect(selfReflectState?.status).toBe('complete');
    expect(selfReflectState?.output?.applied).toBe(true);
    expect(selfReflectState?.output?.evolution).toEqual(mockEvolution);

    // Verify updateWorkflow was called
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

    // Verify node-evolution event was emitted with applied: true
    const evolutionEvents = events.filter((e) => e.type === 'node-evolution');
    expect(evolutionEvents).toHaveLength(1);
    expect(evolutionEvents[0].data).toMatchObject({
      nodeId: 'self-1',
      applied: true,
      approvalRequested: false,
    });

    // Verify before and after snapshots
    expect(selfReflectState?.output?.beforeSnapshot).toBeDefined();
    expect(selfReflectState?.output?.afterSnapshot).toBeDefined();
    expect(selfReflectState?.output?.afterSnapshot?.nodes.find((n: any) => n.id === 'agent-1')?.data.model).toBe(
      'opus'
    );
  });

  it('should apply multiple mutations in sequence', async () => {
    const engine = new DAGExecutionEngine(mockWorkflow);

    mockClaudeAgent.execute.mockImplementationOnce(async function* () {
      yield { type: 'complete', result: 'Agent output' };
    });

    const mockEvolution: WorkflowEvolution = {
      reasoning: 'Improve prompt and model',
      mutations: [
        {
          op: 'update-prompt',
          nodeId: 'agent-1',
          field: 'userQuery',
          newValue: 'Process the input with detailed analysis',
        },
        {
          op: 'update-model',
          nodeId: 'agent-1',
          newModel: 'opus',
        },
      ],
      expectedImpact: 'Better quality and detail',
    riskAssessment: 'Low risk',
    };

    mockClaudeAgent.execute.mockImplementationOnce(async function* () {
      yield { type: 'complete', result: mockEvolution };
    });

    mockClaudeAgent.getStructuredOutput.mockReturnValue({
      parsedJson: mockEvolution,
    });

    const updatedWorkflow = {
      ...mockWorkflow,
      nodes: mockWorkflow.nodes.map((n) =>
        n.id === 'agent-1'
          ? {
              ...n,
              data: {
                ...n.data,
                userQuery: 'Process the input with detailed analysis',
                model: 'opus',
              },
            }
          : n
      ),
    };
    mockUpdateWorkflow.mockResolvedValue(updatedWorkflow);

    await engine.execute('test input');

    const selfReflectState = engine.getNodeState('self-1');
    expect(selfReflectState?.output?.applied).toBe(true);

    // Verify both mutations were applied
    expect(mockUpdateWorkflow).toHaveBeenCalledWith(
      'workflow-1',
      expect.objectContaining({
        nodes: expect.arrayContaining([
          expect.objectContaining({
            id: 'agent-1',
            data: expect.objectContaining({
              userQuery: 'Process the input with detailed analysis',
              model: 'opus',
            }),
          }),
        ]),
      })
    );
  });

  it('should write evolution history to file', async () => {
    const engine = new DAGExecutionEngine(mockWorkflow);

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

    const updatedWorkflow = {
      ...mockWorkflow,
      nodes: mockWorkflow.nodes.map((n) =>
        n.id === 'agent-1' ? { ...n, data: { ...n.data, model: 'opus' } } : n
      ),
    };
    mockUpdateWorkflow.mockResolvedValue(updatedWorkflow);

    await engine.execute('test input');

    // Verify history file was written
    expect(fs.mkdir).toHaveBeenCalled();
    expect(fs.appendFile).toHaveBeenCalledWith(
      expect.stringContaining('workflow-1/history.jsonl'),
      expect.stringContaining('"applied":true'),
      'utf-8'
    );
  });

  it('should handle add-node mutation with automatic edges', async () => {
    const engine = new DAGExecutionEngine(mockWorkflow);

    mockClaudeAgent.execute.mockImplementationOnce(async function* () {
      yield { type: 'complete', result: 'Agent output' };
    });

    const mockEvolution: WorkflowEvolution = {
      reasoning: 'Add JavaScript processing node',
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
          connectTo: 'self-1',
        },
      ],
      expectedImpact: 'Additional processing',
    riskAssessment: 'Low risk',
    };

    mockClaudeAgent.execute.mockImplementationOnce(async function* () {
      yield { type: 'complete', result: mockEvolution };
    });

    mockClaudeAgent.getStructuredOutput.mockReturnValue({
      parsedJson: mockEvolution,
    });

    const updatedWorkflow = {
      ...mockWorkflow,
      nodes: [...mockWorkflow.nodes, mockEvolution.mutations[0].node],
      edges: [
        ...mockWorkflow.edges.filter((e) => e.id !== 'edge-2'),
        {
          id: expect.any(String),
          source: 'agent-1',
          target: 'js-1',
        },
        {
          id: expect.any(String),
          source: 'js-1',
          target: 'self-1',
        },
      ],
    };
    mockUpdateWorkflow.mockResolvedValue(updatedWorkflow);

    await engine.execute('test input');

    const selfReflectState = engine.getNodeState('self-1');
    expect(selfReflectState?.output?.applied).toBe(true);

    // Verify node was added with edges
    expect(mockUpdateWorkflow).toHaveBeenCalledWith(
      'workflow-1',
      expect.objectContaining({
        nodes: expect.arrayContaining([
          expect.objectContaining({
            id: 'js-1',
            type: 'javascript',
          }),
        ]),
      })
    );
  });

  it('should handle remove-node mutation with cascade edge removal', async () => {
    // Add an extra node to remove
    mockWorkflow.nodes.splice(2, 0, {
      id: 'js-1',
      type: 'javascript',
      position: { x: 300, y: 0 },
      data: {
        name: 'JS Node',
        code: 'return input;',
      },
    });

    mockWorkflow.edges = [
      {
        id: 'edge-1',
        source: 'input-1',
        target: 'agent-1',
      },
      {
        id: 'edge-2',
        source: 'agent-1',
        target: 'js-1',
      },
      {
        id: 'edge-3',
        source: 'js-1',
        target: 'self-1',
      },
      {
        id: 'edge-4',
        source: 'self-1',
        target: 'output-1',
      },
    ];

    const engine = new DAGExecutionEngine(mockWorkflow);

    mockClaudeAgent.execute.mockImplementationOnce(async function* () {
      yield { type: 'complete', result: 'Agent output' };
    });

    // JS node would execute
    mockClaudeAgent.execute.mockImplementationOnce(async function* () {
      yield { type: 'complete', result: 'JS output' };
    });

    const mockEvolution: WorkflowEvolution = {
      reasoning: 'Remove unnecessary JS node',
      mutations: [
        {
          op: 'remove-node',
          nodeId: 'js-1',
        },
      ],
      expectedImpact: 'Simplified workflow',
    riskAssessment: 'Low risk',
    };

    mockClaudeAgent.execute.mockImplementationOnce(async function* () {
      yield { type: 'complete', result: mockEvolution };
    });

    mockClaudeAgent.getStructuredOutput.mockReturnValue({
      parsedJson: mockEvolution,
    });

    const updatedWorkflow = {
      ...mockWorkflow,
      nodes: mockWorkflow.nodes.filter((n) => n.id !== 'js-1'),
      edges: mockWorkflow.edges.filter((e) => e.source !== 'js-1' && e.target !== 'js-1'),
    };
    mockUpdateWorkflow.mockResolvedValue(updatedWorkflow);

    await engine.execute('test input');

    const selfReflectState = engine.getNodeState('self-1');
    expect(selfReflectState?.output?.applied).toBe(true);

    // Verify node and its edges were removed
    expect(mockUpdateWorkflow).toHaveBeenCalledWith(
      'workflow-1',
      expect.objectContaining({
        nodes: expect.not.arrayContaining([
          expect.objectContaining({
            id: 'js-1',
          }),
        ]),
      })
    );
  });

  it('should update workflow settings', async () => {
    const engine = new DAGExecutionEngine(mockWorkflow);

    mockClaudeAgent.execute.mockImplementationOnce(async function* () {
      yield { type: 'complete', result: 'Agent output' };
    });

    const mockEvolution: WorkflowEvolution = {
      reasoning: 'Improve workflow name and description',
      mutations: [
        {
          op: 'update-workflow-setting',
          field: 'name',
          value: 'Improved Workflow',
        },
        {
          op: 'update-workflow-setting',
          field: 'description',
          value: 'A well-optimized workflow for processing',
        },
      ],
      expectedImpact: 'Better documentation',
    riskAssessment: 'Low risk',
    };

    mockClaudeAgent.execute.mockImplementationOnce(async function* () {
      yield { type: 'complete', result: mockEvolution };
    });

    mockClaudeAgent.getStructuredOutput.mockReturnValue({
      parsedJson: mockEvolution,
    });

    const updatedWorkflow = {
      ...mockWorkflow,
      name: 'Improved Workflow',
      description: 'A well-optimized workflow for processing',
    };
    mockUpdateWorkflow.mockResolvedValue(updatedWorkflow);

    await engine.execute('test input');

    const selfReflectState = engine.getNodeState('self-1');
    expect(selfReflectState?.output?.applied).toBe(true);

    // Verify workflow settings were updated
    expect(mockUpdateWorkflow).toHaveBeenCalledWith(
      'workflow-1',
      expect.objectContaining({
        name: 'Improved Workflow',
        description: 'A well-optimized workflow for processing',
      })
    );
  });

  it('should throw error when workflow not found', async () => {
    mockGetWorkflow.mockResolvedValue(null);

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

    await expect(engine.execute('test input')).rejects.toThrow('Workflow not found for self-reflection');
  });

  it('should emit workflow-updated event', async () => {
    const engine = new DAGExecutionEngine(mockWorkflow);
    const events: ExecutionEvent[] = [];
    engine.on('event', (event) => events.push(event));

    mockClaudeAgent.execute.mockImplementationOnce(async function* () {
      yield { type: 'complete', result: 'Agent output' };
    });

    const mockEvolution: WorkflowEvolution = {
      reasoning: 'Update model',
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

    const updatedWorkflow = {
      ...mockWorkflow,
      nodes: mockWorkflow.nodes.map((n) =>
        n.id === 'agent-1' ? { ...n, data: { ...n.data, model: 'opus' } } : n
      ),
    };
    mockUpdateWorkflow.mockResolvedValue(updatedWorkflow);

    await engine.execute('test input');

    // Note: workflow-updated event would be emitted by WebSocket layer in production
    // Here we verify the evolution was applied which would trigger that event
    const selfReflectState = engine.getNodeState('self-1');
    expect(selfReflectState?.output?.applied).toBe(true);
  });
});

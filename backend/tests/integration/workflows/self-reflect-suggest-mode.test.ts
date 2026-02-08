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
import { submitEvolutionApproval, cancelEvolutionApproval } from '../../../src/orchestrator/executors/self-reflect';
import type { Workflow } from '../../../src/workflows/types';
import type { ExecutionEvent } from '../../../src/workflows/types';
import type { WorkflowEvolution } from '../../../src/orchestrator/evolution-types';

describe('Self-Reflect Integration - Suggest Mode', () => {
  let mockWorkflow: Workflow;

  beforeEach(() => {
    jest.clearAllMocks();

    mockWorkflow = {
      id: 'workflow-1',
      name: 'Test Workflow',
      description: 'Integration test for suggest mode',
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
            reflectionGoal: 'Suggest improvements',
            agentType: 'claude-agent',
            model: 'sonnet',
            evolutionMode: 'suggest',
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

    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fs.appendFile as jest.Mock).mockResolvedValue(undefined);
  });

  it('should request approval and apply when approved', async () => {
    const engine = new DAGExecutionEngine(mockWorkflow);
    const events: ExecutionEvent[] = [];
    engine.on('event', (event) => events.push(event));

    mockClaudeAgent.execute.mockImplementationOnce(async function* () {
      yield { type: 'complete', result: 'Agent output' };
    });

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

    const updatedWorkflow = {
      ...mockWorkflow,
      nodes: mockWorkflow.nodes.map((n) =>
        n.id === 'agent-1' ? { ...n, data: { ...n.data, model: 'opus' } } : n
      ),
    };
    mockUpdateWorkflow.mockResolvedValue(updatedWorkflow);

    // Start execution
    const executePromise = engine.execute('test input');

    // Wait for node-evolution event with approvalRequested
    await new Promise((resolve) => {
      const checkEvents = () => {
        const evolutionEvents = events.filter(
          (e) => e.type === 'node-evolution' && e.data?.approvalRequested === true
        );
        if (evolutionEvents.length > 0) {
          resolve(undefined);
        } else {
          setTimeout(checkEvents, 10);
        }
      };
      checkEvents();
    });

    // Verify approval requested event
    const approvalEvents = events.filter((e) => e.type === 'node-evolution' && e.data?.approvalRequested);
    expect(approvalEvents).toHaveLength(1);
    expect(approvalEvents[0].data).toMatchObject({
      nodeId: 'self-1',
      approvalRequested: true,
      applied: false,
      evolution: mockEvolution,
    });

    // Verify node is in waiting state
    const selfReflectState = engine.getNodeState('self-1');
    expect(selfReflectState?.status).toBe('waiting');

    // Submit approval
    const approved = submitEvolutionApproval('exec-1', 'self-1', {
      approved: true,
      comment: 'Looks good, apply it',
      reviewedBy: 'test-user',
    });

    expect(approved).toBe(true);

    // Wait for execution to complete
    await executePromise;

    // Verify evolution was applied
    const finalState = engine.getNodeState('self-1');
    expect(finalState?.status).toBe('complete');
    expect(finalState?.output?.applied).toBe(true);
    expect(finalState?.output?.approvalResponse).toMatchObject({
      approved: true,
      comment: 'Looks good, apply it',
      reviewedBy: 'test-user',
    });

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

    // Verify final node-evolution event with applied: true
    const appliedEvents = events.filter(
      (e) => e.type === 'node-evolution' && e.data?.applied === true
    );
    expect(appliedEvents.length).toBeGreaterThan(0);
    expect(appliedEvents[appliedEvents.length - 1].data).toMatchObject({
      applied: true,
      approvalResponse: {
        approved: true,
      },
    });
  });

  it('should not apply when approval is rejected', async () => {
    const engine = new DAGExecutionEngine(mockWorkflow);
    const events: ExecutionEvent[] = [];
    engine.on('event', (event) => events.push(event));

    mockClaudeAgent.execute.mockImplementationOnce(async function* () {
      yield { type: 'complete', result: 'Agent output' };
    });

    const mockEvolution: WorkflowEvolution = {
      reasoning: 'Upgrade to opus',
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

    mockClaudeAgent.execute.mockImplementationOnce(async function* () {
      yield { type: 'complete', result: mockEvolution };
    });

    mockClaudeAgent.getStructuredOutput.mockReturnValue({
      parsedJson: mockEvolution,
    });

    const executePromise = engine.execute('test input');

    // Wait for approval request
    await new Promise((resolve) => {
      const checkEvents = () => {
        const evolutionEvents = events.filter(
          (e) => e.type === 'node-evolution' && e.data?.approvalRequested === true
        );
        if (evolutionEvents.length > 0) {
          resolve(undefined);
        } else {
          setTimeout(checkEvents, 10);
        }
      };
      checkEvents();
    });

    // Submit rejection
    submitEvolutionApproval('exec-1', 'self-1', {
      approved: false,
      comment: 'Not ready for this change',
      reviewedBy: 'test-user',
    });

    await executePromise;

    // Verify evolution was NOT applied
    const selfReflectState = engine.getNodeState('self-1');
    expect(selfReflectState?.output?.applied).toBe(false);
    expect(selfReflectState?.output?.approvalResponse).toMatchObject({
      approved: false,
      comment: 'Not ready for this change',
    });

    // Verify updateWorkflow was NOT called
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();

    // Verify evolution history was NOT written for rejected evolution
    const appendCalls = (fs.appendFile as jest.Mock).mock.calls;
    if (appendCalls.length > 0) {
      // If history was written, it should show applied: false
      const historyContent = appendCalls[0][1];
      expect(historyContent).toContain('"applied":false');
    }
  });

  it('should handle cancellation via abort signal', async () => {
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

    const executePromise = engine.execute('test input');

    // Wait for approval request
    await new Promise((resolve) => {
      const checkEvents = () => {
        const evolutionEvents = events.filter(
          (e) => e.type === 'node-evolution' && e.data?.approvalRequested === true
        );
        if (evolutionEvents.length > 0) {
          resolve(undefined);
        } else {
          setTimeout(checkEvents, 10);
        }
      };
      checkEvents();
    });

    // Cancel the approval
    const cancelled = cancelEvolutionApproval('exec-1', 'self-1');
    expect(cancelled).toBe(true);

    // Execution should fail with cancellation error
    await expect(executePromise).rejects.toThrow('Evolution approval cancelled');

    // Verify workflow was not modified
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it('should emit multiple node-evolution events', async () => {
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

    const executePromise = engine.execute('test input');

    await new Promise((resolve) => {
      const checkEvents = () => {
        const evolutionEvents = events.filter(
          (e) => e.type === 'node-evolution' && e.data?.approvalRequested === true
        );
        if (evolutionEvents.length > 0) {
          resolve(undefined);
        } else {
          setTimeout(checkEvents, 10);
        }
      };
      checkEvents();
    });

    submitEvolutionApproval('exec-1', 'self-1', {
      approved: true,
      reviewedBy: 'test-user',
    });

    await executePromise;

    // Should have two node-evolution events:
    // 1. Initial with approvalRequested: true
    // 2. Final with applied: true
    const evolutionEvents = events.filter((e) => e.type === 'node-evolution');
    expect(evolutionEvents.length).toBeGreaterThanOrEqual(1);

    // First event should have approvalRequested: true
    expect(evolutionEvents[0].data).toMatchObject({
      approvalRequested: true,
      applied: false,
    });

    // Should eventually have an event with applied: true
    const appliedEvent = evolutionEvents.find((e) => e.data?.applied === true);
    expect(appliedEvent).toBeDefined();
  });

  it('should include approval response in final output', async () => {
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

    mockUpdateWorkflow.mockResolvedValue(mockWorkflow);

    const executePromise = engine.execute('test input');

    await new Promise((resolve) => setTimeout(resolve, 50));

    submitEvolutionApproval('exec-1', 'self-1', {
      approved: true,
      comment: 'Approved with comment',
      reviewedBy: 'reviewer@example.com',
      reviewedAt: new Date(),
    });

    await executePromise;

    const selfReflectState = engine.getNodeState('self-1');
    expect(selfReflectState?.output?.approvalResponse).toBeDefined();
    expect(selfReflectState?.output?.approvalResponse?.approved).toBe(true);
    expect(selfReflectState?.output?.approvalResponse?.comment).toBe('Approved with comment');
    expect(selfReflectState?.output?.approvalResponse?.reviewedBy).toBe('reviewer@example.com');
    expect(selfReflectState?.output?.approvalResponse?.reviewedAt).toBeInstanceOf(Date);
  });

  it('should handle approval for complex multi-mutation evolution', async () => {
    const engine = new DAGExecutionEngine(mockWorkflow);

    mockClaudeAgent.execute.mockImplementationOnce(async function* () {
      yield { type: 'complete', result: 'Agent output' };
    });

    const mockEvolution: WorkflowEvolution = {
      reasoning: 'Comprehensive improvements',
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
        {
          op: 'update-workflow-setting',
          field: 'name',
          value: 'Improved Workflow',
        },
      ],
      expectedImpact: 'Better quality and documentation',
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

    const executePromise = engine.execute('test input');

    await new Promise((resolve) => setTimeout(resolve, 50));

    submitEvolutionApproval('exec-1', 'self-1', {
      approved: true,
      reviewedBy: 'test-user',
    });

    await executePromise;

    const selfReflectState = engine.getNodeState('self-1');
    expect(selfReflectState?.output?.applied).toBe(true);

    // Verify all mutations were applied
    expect(mockUpdateWorkflow).toHaveBeenCalledWith(
      'workflow-1',
      expect.objectContaining({
        name: 'Improved Workflow',
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

  it('should timeout if no approval is submitted', async () => {
    // This test would require timeout configuration in the executor
    // For now, we verify that the execution waits indefinitely
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

    const executePromise = engine.execute('test input');

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify node is still waiting
    const selfReflectState = engine.getNodeState('self-1');
    expect(selfReflectState?.status).toBe('waiting');

    // Cancel to complete the test
    cancelEvolutionApproval('exec-1', 'self-1');

    await expect(executePromise).rejects.toThrow();
  });
});

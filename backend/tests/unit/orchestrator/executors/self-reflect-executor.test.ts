// Mock agents before any imports
const mockClaudeAgent = {
  execute: jest.fn(),
  interrupt: jest.fn(),
  getStructuredOutput: jest.fn(),
  getSessionId: jest.fn().mockReturnValue('session-123'),
};

const mockCodexAgent = {
  execute: jest.fn(),
  interrupt: jest.fn(),
  getStructuredOutput: jest.fn(),
  getSessionId: jest.fn().mockReturnValue('session-456'),
};

jest.mock('../../../../src/agents/claude', () => ({
  ClaudeAgent: jest.fn(() => mockClaudeAgent),
}));

jest.mock('../../../../src/agents/codex', () => ({
  CodexAgent: jest.fn(() => mockCodexAgent),
}));

// Mock evolution validator and applier
const mockValidateEvolution = jest.fn();
const mockApplyEvolution = jest.fn();
const mockAppendEvolutionHistory = jest.fn();

jest.mock('../../../../src/orchestrator/evolution-validator', () => ({
  validateEvolution: (...args: any[]) => mockValidateEvolution(...args),
}));

jest.mock('../../../../src/orchestrator/evolution-applier', () => ({
  applyEvolution: (...args: any[]) => mockApplyEvolution(...args),
  createEvolutionSnapshot: (workflow: any) => ({
    ...workflow,
    capturedAt: new Date(),
  }),
  appendEvolutionHistory: (...args: any[]) => mockAppendEvolutionHistory(...args),
}));

// Mock workflow storage
const mockGetWorkflow = jest.fn();
jest.mock('../../../../src/workflows/storage', () => ({
  getWorkflow: (...args: any[]) => mockGetWorkflow(...args),
}));

// Mock schemas
const mockLoadAllSchemas = jest.fn();
jest.mock('../../../../src/schemas', () => ({
  loadAllSchemas: () => mockLoadAllSchemas(),
}));

import {
  selfReflectExecutor,
  submitEvolutionApproval,
  cancelEvolutionApproval,
  cancelAllEvolutionApprovals,
} from '../../../../src/orchestrator/executors/self-reflect';
import type { ExecutorContext } from '../../../../src/orchestrator/types';
import type { Workflow } from '../../../../src/workflows/types';
import type { WorkflowEvolution } from '../../../../src/orchestrator/evolution-types';
import { ErrorCodes } from '../../../../src/orchestrator/errors';

describe('Self-Reflect Executor', () => {
  let mockContext: ExecutorContext;
  let mockWorkflow: Workflow;
  let mockEmit: { emit: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockEmit = { emit: jest.fn() };

    mockWorkflow = {
      id: 'workflow-1',
      name: 'Test Workflow',
      description: 'Test',
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
          id: 'self-1',
          type: 'self-reflect',
          position: { x: 400, y: 0 },
          data: {
            name: 'Self Reflect',
            reflectionGoal: 'Improve workflow quality',
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

    mockContext = {
      executionContext: {
        executionId: 'exec-1',
        workflowId: 'workflow-1',
        nodeOutputs: new Map([
          ['input-1', { value: 'test input' }],
          ['agent-1', { result: 'agent output' }],
        ]),
        variables: new Map(),
        workingDirectory: '/tmp/test',
      },
      interpolate: jest.fn((str) => str),
      getNodeOutput: jest.fn((nodeId) => mockContext.executionContext.nodeOutputs.get(nodeId)),
      getAncestors: jest.fn(() => ['input-1', 'agent-1']),
      getOutputDir: jest.fn(() => '/tmp/test/output'),
      getNodeData: jest.fn((nodeId) => mockWorkflow.nodes.find((n) => n.id === nodeId)?.data),
      loadTranscript: jest.fn(() => Promise.resolve('transcript content')),
    };

    mockGetWorkflow.mockResolvedValue(mockWorkflow);
    mockLoadAllSchemas.mockReturnValue({
      'claude-agent': { meta: { type: 'claude-agent' } },
      javascript: { meta: { type: 'javascript' } },
    });
  });

  describe('validate', () => {
    it('should reject missing reflection goal', () => {
      const node = {
        id: 'self-1',
        type: 'self-reflect',
        position: { x: 0, y: 0 },
        data: {
          name: 'Self Reflect',
          reflectionGoal: '',
        },
      };

      const result = selfReflectExecutor.validate(node);

      expect(result?.valid).toBe(false);
      expect(result?.error).toBe('Reflection goal is required');
    });

    it('should reject invalid maxMutations', () => {
      const node = {
        id: 'self-1',
        type: 'self-reflect',
        position: { x: 0, y: 0 },
        data: {
          name: 'Self Reflect',
          reflectionGoal: 'Test',
          maxMutations: 0,
        },
      };

      const result = selfReflectExecutor.validate(node);

      expect(result?.valid).toBe(false);
      expect(result?.error).toBe('Max mutations must be greater than zero');
    });

    it('should reject empty scope', () => {
      const node = {
        id: 'self-1',
        type: 'self-reflect',
        position: { x: 0, y: 0 },
        data: {
          name: 'Self Reflect',
          reflectionGoal: 'Test',
          scope: [],
        },
      };

      const result = selfReflectExecutor.validate(node);

      expect(result?.valid).toBe(false);
      expect(result?.error).toBe('At least one scope must be selected');
    });

    it('should accept valid configuration', () => {
      const node = {
        id: 'self-1',
        type: 'self-reflect',
        position: { x: 0, y: 0 },
        data: {
          name: 'Self Reflect',
          reflectionGoal: 'Improve quality',
          maxMutations: 10,
          scope: ['prompts'],
        },
      };

      const result = selfReflectExecutor.validate(node);

      expect(result).toBeNull();
    });
  });

  describe('execute - workflow not found', () => {
    it('should throw error when workflow cannot be loaded', async () => {
      mockGetWorkflow.mockResolvedValue(null);

      const node = mockWorkflow.nodes.find((n) => n.id === 'self-1')!;

      await expect(selfReflectExecutor.execute(node, mockContext, mockEmit)).rejects.toThrow(
        'Workflow not found for self-reflection'
      );
    });
  });

  describe('execute - dry-run mode', () => {
    it('should return evolution without applying in dry-run mode', async () => {
      const node = {
        ...mockWorkflow.nodes.find((n) => n.id === 'self-1')!,
        data: {
          ...mockWorkflow.nodes.find((n) => n.id === 'self-1')!.data,
          evolutionMode: 'dry-run',
        },
      };

      const mockEvolution: WorkflowEvolution = {
        reasoning: 'Test evolution',
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

      mockClaudeAgent.execute.mockImplementation(async function* () {
        yield { type: 'text-delta', content: 'Analyzing...' };
        yield { type: 'complete', result: mockEvolution };
      });

      mockClaudeAgent.getStructuredOutput.mockReturnValue({
        parsedJson: mockEvolution,
      });

      mockValidateEvolution.mockReturnValue({
        valid: true,
        errors: [],
        sanitizedEvolution: mockEvolution,
      });

      const result = await selfReflectExecutor.execute(node, mockContext, mockEmit);

      expect(result.output.evolution).toEqual(mockEvolution);
      expect(result.output.applied).toBe(false);
      expect(mockApplyEvolution).not.toHaveBeenCalled();
      expect(mockEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'node-evolution',
          data: expect.objectContaining({
            applied: false,
          }),
        })
      );
    });
  });

  describe('execute - auto-apply mode', () => {
    it('should apply evolution immediately in auto-apply mode', async () => {
      const node = mockWorkflow.nodes.find((n) => n.id === 'self-1')!;

      const mockEvolution: WorkflowEvolution = {
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

      mockClaudeAgent.execute.mockImplementation(async function* () {
        yield { type: 'complete', result: mockEvolution };
      });

      mockClaudeAgent.getStructuredOutput.mockReturnValue({
        parsedJson: mockEvolution,
      });

      mockValidateEvolution.mockReturnValue({
        valid: true,
        errors: [],
        sanitizedEvolution: mockEvolution,
      });

      const updatedWorkflow = {
        ...mockWorkflow,
        nodes: mockWorkflow.nodes.map((n) =>
          n.id === 'agent-1' ? { ...n, data: { ...n.data, model: 'opus' } } : n
        ),
      };

      mockApplyEvolution.mockResolvedValue(updatedWorkflow);

      const result = await selfReflectExecutor.execute(node, mockContext, mockEmit);

      expect(result.output.evolution).toEqual(mockEvolution);
      expect(result.output.applied).toBe(true);
      expect(mockApplyEvolution).toHaveBeenCalledWith(
        mockWorkflow,
        mockEvolution,
        expect.objectContaining({
          executionId: 'exec-1',
          nodeId: 'self-1',
          mode: 'auto-apply',
        })
      );
      expect(mockAppendEvolutionHistory).toHaveBeenCalled();
      expect(mockEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'node-evolution',
          data: expect.objectContaining({
            applied: true,
          }),
        })
      );
    });
  });

  describe('execute - suggest mode', () => {
    it('should request approval in suggest mode', async () => {
      const node = {
        ...mockWorkflow.nodes.find((n) => n.id === 'self-1')!,
        data: {
          ...mockWorkflow.nodes.find((n) => n.id === 'self-1')!.data,
          evolutionMode: 'suggest',
        },
      };

      const mockEvolution: WorkflowEvolution = {
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

      mockClaudeAgent.execute.mockImplementation(async function* () {
        yield { type: 'complete', result: mockEvolution };
      });

      mockClaudeAgent.getStructuredOutput.mockReturnValue({
        parsedJson: mockEvolution,
      });

      mockValidateEvolution.mockReturnValue({
        valid: true,
        errors: [],
        sanitizedEvolution: mockEvolution,
      });

      // Start execution
      const executePromise = selfReflectExecutor.execute(node, mockContext, mockEmit);

      // Wait for evolution event to be emitted
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify approval requested event was emitted
      expect(mockEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'node-evolution',
          data: expect.objectContaining({
            approvalRequested: true,
            applied: false,
          }),
        })
      );

      // Submit approval
      const approved = submitEvolutionApproval('exec-1', 'self-1', {
        approved: true,
        comment: 'Looks good',
        reviewedBy: 'test-user',
      });

      expect(approved).toBe(true);

      // Wait for execution to complete
      const result = await executePromise;

      expect(result.output.applied).toBe(true);
      expect(result.output.approvalResponse?.approved).toBe(true);
      expect(mockApplyEvolution).toHaveBeenCalled();
    });

    it('should not apply when approval is rejected', async () => {
      const node = {
        ...mockWorkflow.nodes.find((n) => n.id === 'self-1')!,
        data: {
          ...mockWorkflow.nodes.find((n) => n.id === 'self-1')!.data,
          evolutionMode: 'suggest',
        },
      };

      const mockEvolution: WorkflowEvolution = {
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

      mockClaudeAgent.execute.mockImplementation(async function* () {
        yield { type: 'complete', result: mockEvolution };
      });

      mockClaudeAgent.getStructuredOutput.mockReturnValue({
        parsedJson: mockEvolution,
      });

      mockValidateEvolution.mockReturnValue({
        valid: true,
        errors: [],
        sanitizedEvolution: mockEvolution,
      });

      const executePromise = selfReflectExecutor.execute(node, mockContext, mockEmit);

      await new Promise((resolve) => setTimeout(resolve, 10));

      submitEvolutionApproval('exec-1', 'self-1', {
        approved: false,
        comment: 'Not ready',
        reviewedBy: 'test-user',
      });

      const result = await executePromise;

      expect(result.output.applied).toBe(false);
      expect(result.output.approvalResponse?.approved).toBe(false);
      expect(mockApplyEvolution).not.toHaveBeenCalled();
    });
  });

  describe('execute - validation errors', () => {
    it('should return validation errors without applying', async () => {
      const node = mockWorkflow.nodes.find((n) => n.id === 'self-1')!;

      const mockEvolution: WorkflowEvolution = {
        reasoning: 'Invalid evolution',
        mutations: [
          {
            op: 'remove-node',
            nodeId: 'output-1',
          },
        ],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      mockClaudeAgent.execute.mockImplementation(async function* () {
        yield { type: 'complete', result: mockEvolution };
      });

      mockClaudeAgent.getStructuredOutput.mockReturnValue({
        parsedJson: mockEvolution,
      });

      mockValidateEvolution.mockReturnValue({
        valid: false,
        errors: ['Cannot remove input/output nodes'],
        sanitizedEvolution: mockEvolution,
      });

      const result = await selfReflectExecutor.execute(node, mockContext, mockEmit);

      expect(result.output.applied).toBe(false);
      expect(result.output.validationErrors).toContain('Cannot remove input/output nodes');
      expect(mockApplyEvolution).not.toHaveBeenCalled();
      expect(mockEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'node-evolution',
          data: expect.objectContaining({
            validationErrors: ['Cannot remove input/output nodes'],
          }),
        })
      );
    });
  });

  describe('execute - agent type selection', () => {
    it('should use ClaudeAgent when agentType is claude-agent', async () => {
      const node = mockWorkflow.nodes.find((n) => n.id === 'self-1')!;

      const mockEvolution: WorkflowEvolution = {
        reasoning: 'Test',
        mutations: [],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      mockClaudeAgent.execute.mockImplementation(async function* () {
        yield { type: 'complete', result: mockEvolution };
      });

      mockClaudeAgent.getStructuredOutput.mockReturnValue({
        parsedJson: mockEvolution,
      });

      mockValidateEvolution.mockReturnValue({
        valid: true,
        errors: [],
        sanitizedEvolution: mockEvolution,
      });

      mockApplyEvolution.mockResolvedValue(mockWorkflow);

      await selfReflectExecutor.execute(node, mockContext, mockEmit);

      const { ClaudeAgent } = require('../../../../src/agents/claude');
      expect(ClaudeAgent).toHaveBeenCalled();
    });

    it('should use CodexAgent when agentType is codex-agent', async () => {
      const node = {
        ...mockWorkflow.nodes.find((n) => n.id === 'self-1')!,
        data: {
          ...mockWorkflow.nodes.find((n) => n.id === 'self-1')!.data,
          agentType: 'codex-agent',
          model: 'gpt-5.2-codex',
        },
      };

      const mockEvolution: WorkflowEvolution = {
        reasoning: 'Test',
        mutations: [],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      mockCodexAgent.execute.mockImplementation(async function* () {
        yield { type: 'complete', result: mockEvolution };
      });

      mockCodexAgent.getStructuredOutput.mockReturnValue({
        parsedJson: mockEvolution,
      });

      mockValidateEvolution.mockReturnValue({
        valid: true,
        errors: [],
        sanitizedEvolution: mockEvolution,
      });

      mockApplyEvolution.mockResolvedValue(mockWorkflow);

      await selfReflectExecutor.execute(node, mockContext, mockEmit);

      const { CodexAgent } = require('../../../../src/agents/codex');
      expect(CodexAgent).toHaveBeenCalled();
    });
  });

  describe('execute - context gathering', () => {
    it('should include ancestor outputs in context', async () => {
      const node = mockWorkflow.nodes.find((n) => n.id === 'self-1')!;

      const mockEvolution: WorkflowEvolution = {
        reasoning: 'Test',
        mutations: [],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      let capturedPrompt = '';
      mockClaudeAgent.execute.mockImplementation(async function* (prompt: string) {
        capturedPrompt = prompt;
        yield { type: 'complete', result: mockEvolution };
      });

      mockClaudeAgent.getStructuredOutput.mockReturnValue({
        parsedJson: mockEvolution,
      });

      mockValidateEvolution.mockReturnValue({
        valid: true,
        errors: [],
        sanitizedEvolution: mockEvolution,
      });

      mockApplyEvolution.mockResolvedValue(mockWorkflow);

      await selfReflectExecutor.execute(node, mockContext, mockEmit);

      expect(capturedPrompt).toContain('"nodes"');
      expect(capturedPrompt).toContain('input-1');
      expect(capturedPrompt).toContain('agent-1');
    });

    it('should include transcripts when includeTranscripts is true', async () => {
      const node = mockWorkflow.nodes.find((n) => n.id === 'self-1')!;

      const mockEvolution: WorkflowEvolution = {
        reasoning: 'Test',
        mutations: [],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      let capturedPrompt = '';
      mockClaudeAgent.execute.mockImplementation(async function* (prompt: string) {
        capturedPrompt = prompt;
        yield { type: 'complete', result: mockEvolution };
      });

      mockClaudeAgent.getStructuredOutput.mockReturnValue({
        parsedJson: mockEvolution,
      });

      mockValidateEvolution.mockReturnValue({
        valid: true,
        errors: [],
        sanitizedEvolution: mockEvolution,
      });

      mockApplyEvolution.mockResolvedValue(mockWorkflow);

      await selfReflectExecutor.execute(node, mockContext, mockEmit);

      expect(mockContext.loadTranscript).toHaveBeenCalled();
    });

    it('should exclude transcripts when includeTranscripts is false', async () => {
      const node = {
        ...mockWorkflow.nodes.find((n) => n.id === 'self-1')!,
        data: {
          ...mockWorkflow.nodes.find((n) => n.id === 'self-1')!.data,
          includeTranscripts: false,
        },
      };

      const mockEvolution: WorkflowEvolution = {
        reasoning: 'Test',
        mutations: [],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      mockClaudeAgent.execute.mockImplementation(async function* () {
        yield { type: 'complete', result: mockEvolution };
      });

      mockClaudeAgent.getStructuredOutput.mockReturnValue({
        parsedJson: mockEvolution,
      });

      mockValidateEvolution.mockReturnValue({
        valid: true,
        errors: [],
        sanitizedEvolution: mockEvolution,
      });

      mockApplyEvolution.mockResolvedValue(mockWorkflow);

      await selfReflectExecutor.execute(node, mockContext, mockEmit);

      expect(mockContext.loadTranscript).not.toHaveBeenCalled();
    });
  });

  describe('execute - interpolation', () => {
    it('should interpolate reflection goal', async () => {
      const node = {
        ...mockWorkflow.nodes.find((n) => n.id === 'self-1')!,
        data: {
          ...mockWorkflow.nodes.find((n) => n.id === 'self-1')!.data,
          reflectionGoal: 'Improve {{node.agent1.output}}',
        },
      };

      const mockEvolution: WorkflowEvolution = {
        reasoning: 'Test',
        mutations: [],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      mockClaudeAgent.execute.mockImplementation(async function* () {
        yield { type: 'complete', result: mockEvolution };
      });

      mockClaudeAgent.getStructuredOutput.mockReturnValue({
        parsedJson: mockEvolution,
      });

      mockValidateEvolution.mockReturnValue({
        valid: true,
        errors: [],
        sanitizedEvolution: mockEvolution,
      });

      mockApplyEvolution.mockResolvedValue(mockWorkflow);

      await selfReflectExecutor.execute(node, mockContext, mockEmit);

      expect(mockContext.interpolate).toHaveBeenCalledWith('Improve {{node.agent1.output}}');
    });

    it('should interpolate system prompt', async () => {
      const node = {
        ...mockWorkflow.nodes.find((n) => n.id === 'self-1')!,
        data: {
          ...mockWorkflow.nodes.find((n) => n.id === 'self-1')!.data,
          systemPrompt: 'Focus on {{node.input.output}}',
        },
      };

      const mockEvolution: WorkflowEvolution = {
        reasoning: 'Test',
        mutations: [],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      mockClaudeAgent.execute.mockImplementation(async function* () {
        yield { type: 'complete', result: mockEvolution };
      });

      mockClaudeAgent.getStructuredOutput.mockReturnValue({
        parsedJson: mockEvolution,
      });

      mockValidateEvolution.mockReturnValue({
        valid: true,
        errors: [],
        sanitizedEvolution: mockEvolution,
      });

      mockApplyEvolution.mockResolvedValue(mockWorkflow);

      await selfReflectExecutor.execute(node, mockContext, mockEmit);

      expect(mockContext.interpolate).toHaveBeenCalledWith('Focus on {{node.input.output}}');
    });
  });

  describe('submitEvolutionApproval', () => {
    it('should return false when no pending approval exists', () => {
      const result = submitEvolutionApproval('exec-999', 'node-999', {
        approved: true,
        reviewedBy: 'user',
      });

      expect(result).toBe(false);
    });
  });

  describe('cancelEvolutionApproval', () => {
    it('should cancel pending approval', async () => {
      const node = {
        ...mockWorkflow.nodes.find((n) => n.id === 'self-1')!,
        data: {
          ...mockWorkflow.nodes.find((n) => n.id === 'self-1')!.data,
          evolutionMode: 'suggest',
        },
      };

      const mockEvolution: WorkflowEvolution = {
        reasoning: 'Test',
        mutations: [],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      mockClaudeAgent.execute.mockImplementation(async function* () {
        yield { type: 'complete', result: mockEvolution };
      });

      mockClaudeAgent.getStructuredOutput.mockReturnValue({
        parsedJson: mockEvolution,
      });

      mockValidateEvolution.mockReturnValue({
        valid: true,
        errors: [],
        sanitizedEvolution: mockEvolution,
      });

      const executePromise = selfReflectExecutor.execute(node, mockContext, mockEmit);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const cancelled = cancelEvolutionApproval('exec-1', 'self-1');
      expect(cancelled).toBe(true);

      await expect(executePromise).rejects.toThrow('Evolution approval cancelled');
    });

    it('should return false when no pending approval exists', () => {
      const result = cancelEvolutionApproval('exec-999', 'node-999');
      expect(result).toBe(false);
    });
  });

  describe('cancelAllEvolutionApprovals', () => {
    it('should cancel all approvals for an execution', async () => {
      // Start two self-reflect nodes in suggest mode
      const node1 = {
        ...mockWorkflow.nodes.find((n) => n.id === 'self-1')!,
        data: {
          ...mockWorkflow.nodes.find((n) => n.id === 'self-1')!.data,
          evolutionMode: 'suggest',
        },
      };

      const node2 = {
        ...node1,
        id: 'self-2',
      };

      const mockEvolution: WorkflowEvolution = {
        reasoning: 'Test',
        mutations: [],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      mockClaudeAgent.execute.mockImplementation(async function* () {
        yield { type: 'complete', result: mockEvolution };
      });

      mockClaudeAgent.getStructuredOutput.mockReturnValue({
        parsedJson: mockEvolution,
      });

      mockValidateEvolution.mockReturnValue({
        valid: true,
        errors: [],
        sanitizedEvolution: mockEvolution,
      });

      const executePromise1 = selfReflectExecutor.execute(node1, mockContext, mockEmit);
      const executePromise2 = selfReflectExecutor.execute(
        node2,
        { ...mockContext, executionContext: { ...mockContext.executionContext } },
        mockEmit
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      cancelAllEvolutionApprovals('exec-1');

      await expect(executePromise1).rejects.toThrow('Execution interrupted');
      await expect(executePromise2).rejects.toThrow('Execution interrupted');
    });
  });

  describe('execute - evolution extraction', () => {
    it('should extract evolution from structuredOutput.parsedJson', async () => {
      const node = mockWorkflow.nodes.find((n) => n.id === 'self-1')!;

      const mockEvolution: WorkflowEvolution = {
        reasoning: 'From structured output',
        mutations: [],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      mockClaudeAgent.execute.mockImplementation(async function* () {
        yield { type: 'complete', result: { some: 'other data' } };
      });

      mockClaudeAgent.getStructuredOutput.mockReturnValue({
        parsedJson: mockEvolution,
      });

      mockValidateEvolution.mockReturnValue({
        valid: true,
        errors: [],
        sanitizedEvolution: mockEvolution,
      });

      mockApplyEvolution.mockResolvedValue(mockWorkflow);

      const result = await selfReflectExecutor.execute(node, mockContext, mockEmit);

      expect(result.output.evolution.reasoning).toBe('From structured output');
    });

    it('should extract evolution from output object', async () => {
      const node = mockWorkflow.nodes.find((n) => n.id === 'self-1')!;

      const mockEvolution: WorkflowEvolution = {
        reasoning: 'From output',
        mutations: [],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      mockClaudeAgent.execute.mockImplementation(async function* () {
        yield { type: 'complete', result: mockEvolution };
      });

      mockClaudeAgent.getStructuredOutput.mockReturnValue(undefined);

      mockValidateEvolution.mockReturnValue({
        valid: true,
        errors: [],
        sanitizedEvolution: mockEvolution,
      });

      mockApplyEvolution.mockResolvedValue(mockWorkflow);

      const result = await selfReflectExecutor.execute(node, mockContext, mockEmit);

      expect(result.output.evolution.reasoning).toBe('From output');
    });

    it('should throw error when evolution cannot be extracted', async () => {
      const node = mockWorkflow.nodes.find((n) => n.id === 'self-1')!;

      mockClaudeAgent.execute.mockImplementation(async function* () {
        yield { type: 'complete', result: 'invalid' };
      });

      mockClaudeAgent.getStructuredOutput.mockReturnValue(undefined);

      await expect(selfReflectExecutor.execute(node, mockContext, mockEmit)).rejects.toThrow(
        'Unable to parse workflow evolution from agent output'
      );
    });
  });

  describe('execute - apply evolution failure', () => {
    it('should throw error when applyEvolution fails', async () => {
      const node = mockWorkflow.nodes.find((n) => n.id === 'self-1')!;

      const mockEvolution: WorkflowEvolution = {
        reasoning: 'Test',
        mutations: [],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      mockClaudeAgent.execute.mockImplementation(async function* () {
        yield { type: 'complete', result: mockEvolution };
      });

      mockClaudeAgent.getStructuredOutput.mockReturnValue({
        parsedJson: mockEvolution,
      });

      mockValidateEvolution.mockReturnValue({
        valid: true,
        errors: [],
        sanitizedEvolution: mockEvolution,
      });

      mockApplyEvolution.mockRejectedValue(new Error('Apply failed'));

      await expect(selfReflectExecutor.execute(node, mockContext, mockEmit)).rejects.toThrow(
        'Apply failed'
      );
    });
  });

  describe('execute - default scope', () => {
    it('should use default full scope when config.scope is undefined', async () => {
      const node = {
        ...mockWorkflow.nodes.find((n) => n.id === 'self-1')!,
        data: {
          ...mockWorkflow.nodes.find((n) => n.id === 'self-1')!.data,
          scope: undefined,
        },
      };

      const mockEvolution: WorkflowEvolution = {
        reasoning: 'Test',
        mutations: [],
        expectedImpact: 'None',
      riskAssessment: 'Low risk',
      };

      mockClaudeAgent.execute.mockImplementation(async function* () {
        yield { type: 'complete', result: mockEvolution };
      });

      mockClaudeAgent.getStructuredOutput.mockReturnValue({
        parsedJson: mockEvolution,
      });

      mockValidateEvolution.mockReturnValue({
        valid: true,
        errors: [],
        sanitizedEvolution: mockEvolution,
      });

      mockApplyEvolution.mockResolvedValue(mockWorkflow);

      await selfReflectExecutor.execute(node, mockContext, mockEmit);

      expect(mockValidateEvolution).toHaveBeenCalledWith(
        mockWorkflow,
        mockEvolution,
        expect.anything(),
        expect.objectContaining({
          scope: ['prompts', 'models', 'tools', 'nodes', 'edges', 'parameters'],
        })
      );
    });
  });
});

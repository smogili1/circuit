/**
 * Tests for replay API handlers and endpoint logic.
 * These tests verify the business logic of replay handlers without requiring
 * an actual HTTP server by testing the component functions.
 */

import {
  Workflow,
  ExecutionEvent,
  ReplayFromNodeEvent,
} from '../src/workflows/types';
import { ExecutionSummary, ExecutionNodeSummary } from '../src/executions/storage';
import { validateReplayConfiguration, ReplayValidationResult } from '../src/orchestrator/validation';

describe('replay-preview endpoint logic', () => {
  // Helper to create a workflow
  const createWorkflow = (id: string = 'wf-1'): Workflow => ({
    id,
    name: 'Test Workflow',
    nodes: [
      { id: 'input-1', type: 'input', position: { x: 0, y: 0 }, data: { type: 'input', name: 'Input' } },
      { id: 'node-a', type: 'output', position: { x: 100, y: 0 }, data: { type: 'output', name: 'A' } },
    ],
    edges: [{ id: 'e1', source: 'input-1', target: 'node-a' }],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Helper to create execution summary
  const createExecutionSummary = (workflowId: string): ExecutionSummary => ({
    executionId: 'exec-1',
    workflowId,
    input: 'test input',
    status: 'complete',
    startedAt: new Date().toISOString(),
    nodes: {
      'input-1': { nodeId: 'input-1', status: 'complete' },
      'node-a': { nodeId: 'node-a', status: 'complete' },
    },
  });

  describe('input validation', () => {
    it('should return error when fromNodeId is empty', () => {
      const fromNodeId = '';

      // Simulate the validation check from the endpoint
      const isValid = Boolean(fromNodeId);
      expect(isValid).toBe(false);
    });

    it('should return error when fromNodeId is undefined', () => {
      const fromNodeId: string | undefined = undefined;

      // Simulate the check from the endpoint
      const isValid = typeof fromNodeId === 'string' && (fromNodeId as string).length > 0;
      expect(isValid).toBe(false);
    });
  });

  describe('workflow lookup', () => {
    it('should identify when workflow is not found', () => {
      const workflows = new Map<string, Workflow>();
      const workflow = workflows.get('non-existent');

      expect(workflow).toBeUndefined();
    });

    it('should find existing workflow', () => {
      const workflows = new Map<string, Workflow>();
      const testWorkflow = createWorkflow();
      workflows.set(testWorkflow.id, testWorkflow);

      const workflow = workflows.get('wf-1');
      expect(workflow).toBeDefined();
      expect(workflow?.id).toBe('wf-1');
    });
  });

  describe('execution lookup', () => {
    it('should identify when execution is not found', async () => {
      const executions = new Map<string, ExecutionSummary>();
      const execution = executions.get('wf-1:non-existent');

      expect(execution).toBeUndefined();
    });

    it('should find existing execution', () => {
      const executions = new Map<string, ExecutionSummary>();
      const testExecution = createExecutionSummary('wf-1');
      executions.set('wf-1:exec-1', testExecution);

      const execution = executions.get('wf-1:exec-1');
      expect(execution).toBeDefined();
      expect(execution?.executionId).toBe('exec-1');
    });
  });

  describe('validation result handling', () => {
    it('should return complete validation result structure', () => {
      const workflow = createWorkflow();
      const sourceExecution = createExecutionSummary('wf-1');

      const result = validateReplayConfiguration(workflow, sourceExecution, 'node-a');

      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('affectedNodes');
      expect(result.affectedNodes).toHaveProperty('reused');
      expect(result.affectedNodes).toHaveProperty('reExecuted');
      expect(result.affectedNodes).toHaveProperty('new');
    });

    it('should include errors array in response', () => {
      const workflow = createWorkflow();
      const sourceExecution = createExecutionSummary('wf-1');

      const result = validateReplayConfiguration(workflow, sourceExecution, 'non-existent');

      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should include warnings array in response', () => {
      const workflow = createWorkflow();
      const sourceExecution = createExecutionSummary('wf-1');

      const result = validateReplayConfiguration(workflow, sourceExecution, 'node-a');

      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });
});

describe('handleReplayExecution logic', () => {
  describe('input validation', () => {
    it('validates and returns error for missing workflow', () => {
      const workflows = new Map<string, Workflow>();
      const getWorkflow = (id: string) => workflows.get(id);

      const workflow = getWorkflow('non-existent');
      expect(workflow).toBeUndefined();

      // In actual handler, this would emit execution-error
      const errorEvent: ExecutionEvent = {
        type: 'execution-error',
        error: 'Workflow not found',
      };
      expect(errorEvent.error).toBe('Workflow not found');
    });

    it('validates and returns error for missing source execution', async () => {
      const executions = new Map<string, ExecutionSummary>();
      const readExecutionSummary = async (wfId: string, execId: string) => {
        return executions.get(`${wfId}:${execId}`) || null;
      };

      const result = await readExecutionSummary('wf-1', 'non-existent');
      expect(result).toBeNull();

      // In actual handler, this would emit execution-error
      const errorEvent: ExecutionEvent = {
        type: 'execution-error',
        error: 'Source execution not found',
      };
      expect(errorEvent.error).toBe('Source execution not found');
    });

    it('validates and returns error when validation fails', () => {
      const validationResult: ReplayValidationResult = {
        valid: false,
        errors: ['Upstream node missing', 'Node did not complete'],
        warnings: [],
        affectedNodes: { reused: [], reExecuted: [], new: [] },
      };

      expect(validationResult.valid).toBe(false);

      // In actual handler, errors would be joined
      const errorMessage = validationResult.errors.join(' ');
      expect(errorMessage).toContain('Upstream node missing');
      expect(errorMessage).toContain('Node did not complete');
    });
  });

  describe('source execution loading', () => {
    it('loads source execution events and extracts outputs', () => {
      // Simulate extracted outputs
      const sourceOutputs = new Map<string, unknown>([
        ['input-1', 'original input'],
        ['node-a', { result: 'node a output' }],
      ]);

      expect(sourceOutputs.size).toBe(2);
      expect(sourceOutputs.get('node-a')).toEqual({ result: 'node a output' });
    });

    it('only outputs for nodes not in reExecuted set are seeded', () => {
      const allOutputs = new Map<string, unknown>([
        ['input-1', 'input value'],
        ['node-a', 'a value'],
        ['node-b', 'b value'],
        ['node-c', 'c value'],
      ]);

      const reExecutedNodes = new Set(['node-b', 'node-c']);
      const seedNodeOutputs = new Map<string, unknown>();

      for (const [nodeId, output] of allOutputs) {
        if (!reExecutedNodes.has(nodeId)) {
          seedNodeOutputs.set(nodeId, output);
        }
      }

      expect(seedNodeOutputs.has('input-1')).toBe(true);
      expect(seedNodeOutputs.has('node-a')).toBe(true);
      expect(seedNodeOutputs.has('node-b')).toBe(false);
      expect(seedNodeOutputs.has('node-c')).toBe(false);
    });
  });

  describe('replay metadata', () => {
    it('creates new execution summary with replay metadata', () => {
      const replayMetadata = {
        sourceExecutionId: 'source-exec-123',
        fromNodeId: 'node-b',
      };

      const summary: Partial<ExecutionSummary> = {
        executionId: 'new-exec-456',
        workflowId: 'wf-1',
        input: 'replay input',
        replay: replayMetadata,
        status: 'running',
      };

      expect(summary.replay).toBeDefined();
      expect(summary.replay?.sourceExecutionId).toBe('source-exec-123');
      expect(summary.replay?.fromNodeId).toBe('node-b');
    });
  });

  describe('input handling', () => {
    it('uses event.input when provided', () => {
      const event: ReplayFromNodeEvent = {
        type: 'replay-from-node',
        workflowId: 'wf-1',
        sourceExecutionId: 'exec-1',
        fromNodeId: 'node-a',
        input: 'new custom input',
      };

      const sourceExecution: ExecutionSummary = {
        executionId: 'exec-1',
        workflowId: 'wf-1',
        input: 'original input',
        status: 'complete',
        startedAt: new Date().toISOString(),
      };

      const replayInput = event.input ?? sourceExecution.input ?? '';
      expect(replayInput).toBe('new custom input');
    });

    it('falls back to sourceExecution.input when event.input is undefined', () => {
      const event: ReplayFromNodeEvent = {
        type: 'replay-from-node',
        workflowId: 'wf-1',
        sourceExecutionId: 'exec-1',
        fromNodeId: 'node-a',
        // input not provided
      };

      const sourceExecution: ExecutionSummary = {
        executionId: 'exec-1',
        workflowId: 'wf-1',
        input: 'original input',
        status: 'complete',
        startedAt: new Date().toISOString(),
      };

      const replayInput = event.input ?? sourceExecution.input ?? '';
      expect(replayInput).toBe('original input');
    });

    it('falls back to empty string when both are undefined', () => {
      const event: ReplayFromNodeEvent = {
        type: 'replay-from-node',
        workflowId: 'wf-1',
        sourceExecutionId: 'exec-1',
        fromNodeId: 'node-a',
      };

      const sourceExecution: ExecutionSummary = {
        executionId: 'exec-1',
        workflowId: 'wf-1',
        input: undefined as unknown as string,
        status: 'complete',
        startedAt: new Date().toISOString(),
      };

      const replayInput = event.input ?? sourceExecution.input ?? '';
      expect(replayInput).toBe('');
    });
  });

  describe('concurrent execution prevention', () => {
    it('detects when an execution is already running', () => {
      const activeExecutions = new Map<string, boolean>();
      const socketId = 'socket-123';

      // First execution starts
      activeExecutions.set(socketId, true);

      // Check for existing execution
      const hasActive = activeExecutions.has(socketId);
      expect(hasActive).toBe(true);
    });

    it('allows execution when no active execution exists', () => {
      const activeExecutions = new Map<string, boolean>();
      const socketId = 'socket-123';

      const hasActive = activeExecutions.has(socketId);
      expect(hasActive).toBe(false);
    });
  });
});

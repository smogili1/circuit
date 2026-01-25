import { createReplayExecutionContext } from '../src/orchestrator/context';
import { ExecutionSummary } from '../src/executions/storage';

describe('createReplayExecutionContext', () => {
  const createMockExecutionSummary = (
    overrides: Partial<ExecutionSummary> = {}
  ): ExecutionSummary => ({
    executionId: 'source-exec-123',
    workflowId: 'workflow-1',
    workflowName: 'Test Workflow',
    input: 'original input',
    status: 'complete',
    startedAt: '2024-01-01T00:00:00Z',
    completedAt: '2024-01-01T00:01:00Z',
    workingDirectory: '/original/path',
    ...overrides,
  });

  describe('creates context with correct executionId (new)', () => {
    it('executionId is a valid UUID and differs from sourceExecution.executionId', () => {
      const sourceExecution = createMockExecutionSummary();
      const nodeOutputs = new Map<string, unknown>();

      const context = createReplayExecutionContext(
        'workflow-1',
        sourceExecution,
        nodeOutputs
      );

      // Should be a valid UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(context.executionId).toMatch(uuidRegex);

      // Should differ from source
      expect(context.executionId).not.toBe(sourceExecution.executionId);
    });

    it('workflowId matches the provided workflowId parameter', () => {
      const sourceExecution = createMockExecutionSummary({ workflowId: 'old-workflow' });
      const nodeOutputs = new Map<string, unknown>();

      const context = createReplayExecutionContext(
        'new-workflow-id',
        sourceExecution,
        nodeOutputs
      );

      expect(context.workflowId).toBe('new-workflow-id');
    });

    it('executionId is unique across multiple calls', () => {
      const sourceExecution = createMockExecutionSummary();
      const nodeOutputs = new Map<string, unknown>();

      const context1 = createReplayExecutionContext('wf-1', sourceExecution, nodeOutputs);
      const context2 = createReplayExecutionContext('wf-1', sourceExecution, nodeOutputs);
      const context3 = createReplayExecutionContext('wf-1', sourceExecution, nodeOutputs);

      const executionIds = [context1.executionId, context2.executionId, context3.executionId];
      const uniqueIds = new Set(executionIds);

      expect(uniqueIds.size).toBe(3);
    });
  });

  describe('creates context with pre-seeded nodeOutputs map', () => {
    it('nodeOutputs Map in context contains all entries from provided Map', () => {
      const sourceExecution = createMockExecutionSummary();
      const nodeOutputs = new Map<string, unknown>([
        ['node-1', 'output-1'],
        ['node-2', { data: 'complex' }],
        ['node-3', [1, 2, 3]],
      ]);

      const context = createReplayExecutionContext(
        'workflow-1',
        sourceExecution,
        nodeOutputs
      );

      expect(context.nodeOutputs.size).toBe(3);
      expect(context.nodeOutputs.get('node-1')).toBe('output-1');
      expect(context.nodeOutputs.get('node-2')).toEqual({ data: 'complex' });
      expect(context.nodeOutputs.get('node-3')).toEqual([1, 2, 3]);
    });

    it('nodeOutputs Map is a copy (not same reference) to prevent mutation', () => {
      const sourceExecution = createMockExecutionSummary();
      const originalOutputs = new Map<string, unknown>([
        ['node-1', 'original'],
      ]);

      const context = createReplayExecutionContext(
        'workflow-1',
        sourceExecution,
        originalOutputs
      );

      // Should not be the same reference
      expect(context.nodeOutputs).not.toBe(originalOutputs);

      // Values should still match
      expect(context.nodeOutputs.get('node-1')).toBe('original');
    });

    it('modifying the original Map does not affect the context nodeOutputs', () => {
      const sourceExecution = createMockExecutionSummary();
      const originalOutputs = new Map<string, unknown>([
        ['node-1', 'original'],
      ]);

      const context = createReplayExecutionContext(
        'workflow-1',
        sourceExecution,
        originalOutputs
      );

      // Modify the original
      originalOutputs.set('node-1', 'modified');
      originalOutputs.set('node-2', 'new-node');

      // Context should be unaffected
      expect(context.nodeOutputs.get('node-1')).toBe('original');
      expect(context.nodeOutputs.has('node-2')).toBe(false);
    });

    it('handles empty nodeOutputs Map correctly', () => {
      const sourceExecution = createMockExecutionSummary();
      const nodeOutputs = new Map<string, unknown>();

      const context = createReplayExecutionContext(
        'workflow-1',
        sourceExecution,
        nodeOutputs
      );

      expect(context.nodeOutputs).toBeInstanceOf(Map);
      expect(context.nodeOutputs.size).toBe(0);
    });
  });

  describe('uses correct working directory resolution', () => {
    it('uses explicit workingDirectory parameter when provided', () => {
      const sourceExecution = createMockExecutionSummary({
        workingDirectory: '/source/path',
      });
      const nodeOutputs = new Map<string, unknown>();

      const context = createReplayExecutionContext(
        'workflow-1',
        sourceExecution,
        nodeOutputs,
        '/explicit/path'
      );

      expect(context.workingDirectory).toBe('/explicit/path');
    });

    it('falls back to sourceExecution.workingDirectory when parameter not provided', () => {
      const sourceExecution = createMockExecutionSummary({
        workingDirectory: '/source/execution/path',
      });
      const nodeOutputs = new Map<string, unknown>();

      const context = createReplayExecutionContext(
        'workflow-1',
        sourceExecution,
        nodeOutputs
      );

      expect(context.workingDirectory).toBe('/source/execution/path');
    });

    it('falls back to process.cwd() when neither is available', () => {
      const sourceExecution = createMockExecutionSummary({
        workingDirectory: undefined,
      });
      const nodeOutputs = new Map<string, unknown>();

      const context = createReplayExecutionContext(
        'workflow-1',
        sourceExecution,
        nodeOutputs
      );

      expect(context.workingDirectory).toBe(process.cwd());
    });

    it('explicit parameter takes precedence over sourceExecution.workingDirectory', () => {
      const sourceExecution = createMockExecutionSummary({
        workingDirectory: '/source/path',
      });
      const nodeOutputs = new Map<string, unknown>();

      const context = createReplayExecutionContext(
        'workflow-1',
        sourceExecution,
        nodeOutputs,
        '/override/path'
      );

      expect(context.workingDirectory).toBe('/override/path');
    });
  });

  describe('initializes variables map empty', () => {
    it('variables Map is initialized as empty Map', () => {
      const sourceExecution = createMockExecutionSummary();
      const nodeOutputs = new Map<string, unknown>([['node-1', 'output']]);

      const context = createReplayExecutionContext(
        'workflow-1',
        sourceExecution,
        nodeOutputs
      );

      expect(context.variables).toBeInstanceOf(Map);
      expect(context.variables.size).toBe(0);
    });

    it('variables Map is instance of Map', () => {
      const sourceExecution = createMockExecutionSummary();
      const nodeOutputs = new Map<string, unknown>();

      const context = createReplayExecutionContext(
        'workflow-1',
        sourceExecution,
        nodeOutputs
      );

      expect(context.variables).toBeInstanceOf(Map);
    });

    it('variables.size equals 0', () => {
      const sourceExecution = createMockExecutionSummary();
      const nodeOutputs = new Map<string, unknown>();

      const context = createReplayExecutionContext(
        'workflow-1',
        sourceExecution,
        nodeOutputs
      );

      expect(context.variables.size).toBe(0);
    });
  });
});

import {
  createExecutionContext,
  getPredecessorOutputs,
  setNodeOutput,
  getNodeOutput,
  setVariable,
  getVariable,
} from '../src/orchestrator/context';

describe('Execution Context', () => {
  describe('createExecutionContext', () => {
    it('should create context with workflow id and default working directory', () => {
      const context = createExecutionContext('workflow-123');

      expect(context.workflowId).toBe('workflow-123');
      expect(context.executionId).toBeDefined();
      expect(context.executionId.length).toBeGreaterThan(0);
      expect(context.nodeOutputs).toBeInstanceOf(Map);
      expect(context.nodeOutputs.size).toBe(0);
      expect(context.variables).toBeInstanceOf(Map);
      expect(context.variables.size).toBe(0);
      expect(context.workingDirectory).toBe(process.cwd());
    });

    it('should create context with custom working directory', () => {
      const context = createExecutionContext('workflow-123', '/custom/path');

      expect(context.workingDirectory).toBe('/custom/path');
    });
  });

  describe('node outputs', () => {
    it('should set and get node output', () => {
      const context = createExecutionContext('workflow-1');

      setNodeOutput(context, 'node-1', { result: 'success' });

      expect(getNodeOutput(context, 'node-1')).toEqual({ result: 'success' });
    });

    it('should return undefined for non-existent node', () => {
      const context = createExecutionContext('workflow-1');

      expect(getNodeOutput(context, 'unknown-node')).toBeUndefined();
    });

    it('should overwrite existing output', () => {
      const context = createExecutionContext('workflow-1');

      setNodeOutput(context, 'node-1', 'first');
      setNodeOutput(context, 'node-1', 'second');

      expect(getNodeOutput(context, 'node-1')).toBe('second');
    });
  });

  describe('getPredecessorOutputs', () => {
    it('should get outputs for specified predecessor ids', () => {
      const context = createExecutionContext('workflow-1');

      setNodeOutput(context, 'node-1', 'output-1');
      setNodeOutput(context, 'node-2', 'output-2');
      setNodeOutput(context, 'node-3', 'output-3');

      const outputs = getPredecessorOutputs(context, ['node-1', 'node-2']);

      expect(outputs).toEqual({
        'node-1': 'output-1',
        'node-2': 'output-2',
      });
    });

    it('should skip non-existent nodes', () => {
      const context = createExecutionContext('workflow-1');

      setNodeOutput(context, 'node-1', 'output-1');

      const outputs = getPredecessorOutputs(context, [
        'node-1',
        'non-existent',
      ]);

      expect(outputs).toEqual({
        'node-1': 'output-1',
      });
    });

    it('should return empty object for no predecessors', () => {
      const context = createExecutionContext('workflow-1');

      const outputs = getPredecessorOutputs(context, []);

      expect(outputs).toEqual({});
    });
  });

  describe('variables', () => {
    it('should set and get variable', () => {
      const context = createExecutionContext('workflow-1');

      setVariable(context, 'apiKey', 'secret-123');

      expect(getVariable(context, 'apiKey')).toBe('secret-123');
    });

    it('should return undefined for non-existent variable', () => {
      const context = createExecutionContext('workflow-1');

      expect(getVariable(context, 'unknown')).toBeUndefined();
    });

    it('should handle complex variable values', () => {
      const context = createExecutionContext('workflow-1');

      const complexValue = {
        nested: { data: [1, 2, 3] },
        flag: true,
      };

      setVariable(context, 'config', complexValue);

      expect(getVariable(context, 'config')).toEqual(complexValue);
    });
  });
});

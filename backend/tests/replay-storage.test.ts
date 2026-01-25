import {
  extractNodeOutputsFromEvents,
  ExecutionEventRecord,
} from '../src/executions/storage';
import { ExecutionEvent } from '../src/workflows/types';

describe('extractNodeOutputsFromEvents', () => {
  describe('correctly reconstructs node outputs from event stream', () => {
    it('returns empty Map when given empty events array', () => {
      const events: ExecutionEventRecord[] = [];
      const result = extractNodeOutputsFromEvents(events);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });

    it('returns Map with correct node outputs when events contain node-start followed by node-complete', () => {
      const events: ExecutionEventRecord[] = [
        {
          timestamp: '2024-01-01T00:00:00Z',
          event: { type: 'execution-start', executionId: 'exec-1', workflowId: 'wf-1' },
        },
        {
          timestamp: '2024-01-01T00:00:01Z',
          event: { type: 'node-start', nodeId: 'node-1', nodeName: 'Node 1' },
        },
        {
          timestamp: '2024-01-01T00:00:02Z',
          event: { type: 'node-complete', nodeId: 'node-1', result: 'output-1' },
        },
        {
          timestamp: '2024-01-01T00:00:03Z',
          event: { type: 'node-start', nodeId: 'node-2', nodeName: 'Node 2' },
        },
        {
          timestamp: '2024-01-01T00:00:04Z',
          event: { type: 'node-complete', nodeId: 'node-2', result: { data: 'complex' } },
        },
      ];

      const result = extractNodeOutputsFromEvents(events);

      expect(result.size).toBe(2);
      expect(result.get('node-1')).toBe('output-1');
      expect(result.get('node-2')).toEqual({ data: 'complex' });
    });

    it('ignores node-complete events for nodes without prior node-start event', () => {
      const events: ExecutionEventRecord[] = [
        {
          timestamp: '2024-01-01T00:00:00Z',
          event: { type: 'node-complete', nodeId: 'orphan-node', result: 'orphan-output' },
        },
        {
          timestamp: '2024-01-01T00:00:01Z',
          event: { type: 'node-start', nodeId: 'valid-node', nodeName: 'Valid' },
        },
        {
          timestamp: '2024-01-01T00:00:02Z',
          event: { type: 'node-complete', nodeId: 'valid-node', result: 'valid-output' },
        },
      ];

      const result = extractNodeOutputsFromEvents(events);

      expect(result.size).toBe(1);
      expect(result.has('orphan-node')).toBe(false);
      expect(result.get('valid-node')).toBe('valid-output');
    });

    it('correctly handles string, object, and array outputs', () => {
      const events: ExecutionEventRecord[] = [
        {
          timestamp: '2024-01-01T00:00:01Z',
          event: { type: 'node-start', nodeId: 'string-node', nodeName: 'String Node' },
        },
        {
          timestamp: '2024-01-01T00:00:02Z',
          event: { type: 'node-complete', nodeId: 'string-node', result: 'hello world' },
        },
        {
          timestamp: '2024-01-01T00:00:03Z',
          event: { type: 'node-start', nodeId: 'object-node', nodeName: 'Object Node' },
        },
        {
          timestamp: '2024-01-01T00:00:04Z',
          event: { type: 'node-complete', nodeId: 'object-node', result: { nested: { value: 42 } } },
        },
        {
          timestamp: '2024-01-01T00:00:05Z',
          event: { type: 'node-start', nodeId: 'array-node', nodeName: 'Array Node' },
        },
        {
          timestamp: '2024-01-01T00:00:06Z',
          event: { type: 'node-complete', nodeId: 'array-node', result: [1, 2, { three: 3 }] },
        },
      ];

      const result = extractNodeOutputsFromEvents(events);

      expect(result.get('string-node')).toBe('hello world');
      expect(result.get('object-node')).toEqual({ nested: { value: 42 } });
      expect(result.get('array-node')).toEqual([1, 2, { three: 3 }]);
    });

    it('correctly handles null and undefined result values', () => {
      const events: ExecutionEventRecord[] = [
        {
          timestamp: '2024-01-01T00:00:01Z',
          event: { type: 'node-start', nodeId: 'null-node', nodeName: 'Null Node' },
        },
        {
          timestamp: '2024-01-01T00:00:02Z',
          event: { type: 'node-complete', nodeId: 'null-node', result: null },
        },
        {
          timestamp: '2024-01-01T00:00:03Z',
          event: { type: 'node-start', nodeId: 'undefined-node', nodeName: 'Undefined Node' },
        },
        {
          timestamp: '2024-01-01T00:00:04Z',
          event: { type: 'node-complete', nodeId: 'undefined-node', result: undefined },
        },
      ];

      const result = extractNodeOutputsFromEvents(events);

      expect(result.size).toBe(2);
      expect(result.get('null-node')).toBe(null);
      expect(result.get('undefined-node')).toBe(undefined);
      expect(result.has('null-node')).toBe(true);
      expect(result.has('undefined-node')).toBe(true);
    });

    it('handles events with timestamp ordering preserved', () => {
      // Events are processed in array order, timestamp doesn't affect logic
      const events: ExecutionEventRecord[] = [
        {
          timestamp: '2024-01-01T00:00:05Z', // Later timestamp
          event: { type: 'node-start', nodeId: 'node-a', nodeName: 'A' },
        },
        {
          timestamp: '2024-01-01T00:00:01Z', // Earlier timestamp but comes after in array
          event: { type: 'node-start', nodeId: 'node-b', nodeName: 'B' },
        },
        {
          timestamp: '2024-01-01T00:00:06Z',
          event: { type: 'node-complete', nodeId: 'node-a', result: 'output-a' },
        },
        {
          timestamp: '2024-01-01T00:00:02Z',
          event: { type: 'node-complete', nodeId: 'node-b', result: 'output-b' },
        },
      ];

      const result = extractNodeOutputsFromEvents(events);

      expect(result.size).toBe(2);
      expect(result.get('node-a')).toBe('output-a');
      expect(result.get('node-b')).toBe('output-b');
    });
  });

  describe('handles missing events gracefully', () => {
    it('returns empty Map when only node-start events exist (no completions)', () => {
      const events: ExecutionEventRecord[] = [
        {
          timestamp: '2024-01-01T00:00:01Z',
          event: { type: 'node-start', nodeId: 'node-1', nodeName: 'Node 1' },
        },
        {
          timestamp: '2024-01-01T00:00:02Z',
          event: { type: 'node-start', nodeId: 'node-2', nodeName: 'Node 2' },
        },
      ];

      const result = extractNodeOutputsFromEvents(events);

      expect(result.size).toBe(0);
    });

    it('returns partial Map when some nodes have complete sequences and others do not', () => {
      const events: ExecutionEventRecord[] = [
        {
          timestamp: '2024-01-01T00:00:01Z',
          event: { type: 'node-start', nodeId: 'complete-node', nodeName: 'Complete' },
        },
        {
          timestamp: '2024-01-01T00:00:02Z',
          event: { type: 'node-complete', nodeId: 'complete-node', result: 'done' },
        },
        {
          timestamp: '2024-01-01T00:00:03Z',
          event: { type: 'node-start', nodeId: 'incomplete-node', nodeName: 'Incomplete' },
        },
        // No node-complete for incomplete-node
      ];

      const result = extractNodeOutputsFromEvents(events);

      expect(result.size).toBe(1);
      expect(result.get('complete-node')).toBe('done');
      expect(result.has('incomplete-node')).toBe(false);
    });

    it('does not throw when events array contains only non-node events', () => {
      const events: ExecutionEventRecord[] = [
        {
          timestamp: '2024-01-01T00:00:00Z',
          event: { type: 'execution-start', executionId: 'exec-1', workflowId: 'wf-1' },
        },
        {
          timestamp: '2024-01-01T00:00:01Z',
          event: { type: 'execution-complete', result: { final: 'result' } },
        },
      ];

      expect(() => extractNodeOutputsFromEvents(events)).not.toThrow();
      const result = extractNodeOutputsFromEvents(events);
      expect(result.size).toBe(0);
    });

    it('handles malformed event objects gracefully without crashing', () => {
      const events: ExecutionEventRecord[] = [
        {
          timestamp: '2024-01-01T00:00:01Z',
          event: { type: 'node-start', nodeId: 'node-1', nodeName: 'Node 1' },
        },
        {
          timestamp: '2024-01-01T00:00:02Z',
          // Event with different structure
          event: { type: 'node-output', nodeId: 'node-1', event: { type: 'text-delta', content: 'test' } },
        },
        {
          timestamp: '2024-01-01T00:00:03Z',
          event: { type: 'node-complete', nodeId: 'node-1', result: 'output' },
        },
      ];

      expect(() => extractNodeOutputsFromEvents(events)).not.toThrow();
      const result = extractNodeOutputsFromEvents(events);
      expect(result.get('node-1')).toBe('output');
    });
  });

  describe('handles nodes that ran multiple times (loops) by keeping final output', () => {
    it('when node-1 has 3 node-start/node-complete cycles, Map contains only the final output', () => {
      const events: ExecutionEventRecord[] = [
        // First iteration
        {
          timestamp: '2024-01-01T00:00:01Z',
          event: { type: 'node-start', nodeId: 'node-1', nodeName: 'Loop Node' },
        },
        {
          timestamp: '2024-01-01T00:00:02Z',
          event: { type: 'node-complete', nodeId: 'node-1', result: 'iteration-1' },
        },
        // Second iteration
        {
          timestamp: '2024-01-01T00:00:03Z',
          event: { type: 'node-start', nodeId: 'node-1', nodeName: 'Loop Node' },
        },
        {
          timestamp: '2024-01-01T00:00:04Z',
          event: { type: 'node-complete', nodeId: 'node-1', result: 'iteration-2' },
        },
        // Third iteration
        {
          timestamp: '2024-01-01T00:00:05Z',
          event: { type: 'node-start', nodeId: 'node-1', nodeName: 'Loop Node' },
        },
        {
          timestamp: '2024-01-01T00:00:06Z',
          event: { type: 'node-complete', nodeId: 'node-1', result: 'iteration-3-final' },
        },
      ];

      const result = extractNodeOutputsFromEvents(events);

      expect(result.size).toBe(1);
      expect(result.get('node-1')).toBe('iteration-3-final');
    });

    it('intermediate outputs are overwritten by subsequent executions', () => {
      const events: ExecutionEventRecord[] = [
        {
          timestamp: '2024-01-01T00:00:01Z',
          event: { type: 'node-start', nodeId: 'node-1', nodeName: 'Node 1' },
        },
        {
          timestamp: '2024-01-01T00:00:02Z',
          event: { type: 'node-complete', nodeId: 'node-1', result: { count: 1 } },
        },
        {
          timestamp: '2024-01-01T00:00:03Z',
          event: { type: 'node-start', nodeId: 'node-1', nodeName: 'Node 1' },
        },
        {
          timestamp: '2024-01-01T00:00:04Z',
          event: { type: 'node-complete', nodeId: 'node-1', result: { count: 2 } },
        },
      ];

      const result = extractNodeOutputsFromEvents(events);

      // Should only have the final output
      expect(result.get('node-1')).toEqual({ count: 2 });
    });

    it('works correctly when multiple nodes are looping independently', () => {
      const events: ExecutionEventRecord[] = [
        // Node A iteration 1
        { timestamp: 't1', event: { type: 'node-start', nodeId: 'node-a', nodeName: 'A' } },
        { timestamp: 't2', event: { type: 'node-complete', nodeId: 'node-a', result: 'a-1' } },
        // Node B iteration 1
        { timestamp: 't3', event: { type: 'node-start', nodeId: 'node-b', nodeName: 'B' } },
        { timestamp: 't4', event: { type: 'node-complete', nodeId: 'node-b', result: 'b-1' } },
        // Node A iteration 2
        { timestamp: 't5', event: { type: 'node-start', nodeId: 'node-a', nodeName: 'A' } },
        { timestamp: 't6', event: { type: 'node-complete', nodeId: 'node-a', result: 'a-2' } },
        // Node B iteration 2
        { timestamp: 't7', event: { type: 'node-start', nodeId: 'node-b', nodeName: 'B' } },
        { timestamp: 't8', event: { type: 'node-complete', nodeId: 'node-b', result: 'b-2' } },
      ];

      const result = extractNodeOutputsFromEvents(events);

      expect(result.get('node-a')).toBe('a-2');
      expect(result.get('node-b')).toBe('b-2');
    });

    it('handles interleaved events from parallel loop executions', () => {
      const events: ExecutionEventRecord[] = [
        // Both nodes start
        { timestamp: 't1', event: { type: 'node-start', nodeId: 'node-a', nodeName: 'A' } },
        { timestamp: 't2', event: { type: 'node-start', nodeId: 'node-b', nodeName: 'B' } },
        // Interleaved completions
        { timestamp: 't3', event: { type: 'node-complete', nodeId: 'node-b', result: 'b-done' } },
        { timestamp: 't4', event: { type: 'node-complete', nodeId: 'node-a', result: 'a-done' } },
      ];

      const result = extractNodeOutputsFromEvents(events);

      expect(result.get('node-a')).toBe('a-done');
      expect(result.get('node-b')).toBe('b-done');
    });
  });
});

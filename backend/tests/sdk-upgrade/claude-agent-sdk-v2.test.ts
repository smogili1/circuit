/**
 * Claude Agent - SDK v0.2.x Compatibility Tests
 * Tests for SDK v0.2 message format, session resumption, and error handling
 */

// Mock the Claude Agent SDK before imports
const mockQuery = jest.fn();
jest.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: mockQuery,
}));

import { ClaudeAgent } from '../../src/agents/claude';
import { ClaudeNodeConfig, AgentInput, ExecutionContext } from '../../src/workflows/types';

describe('Claude Agent - SDK v0.2 Compatibility', () => {
  let mockContext: ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();

    mockContext = {
      workflowId: 'test-workflow',
      executionId: 'test-exec',
      workingDirectory: '/tmp/test',
      nodeOutputs: new Map(),
      variables: new Map(),
    };
  });

  describe('SDK v0.2 message format compatibility', () => {
    it('should handle assistant messages with nested message.content', async () => {
      mockQuery.mockReturnValue((async function* () {
        yield {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              { type: 'text', text: 'First text block' },
              { type: 'text', text: 'Second text block' },
            ],
          },
        };
        yield { type: 'result', subtype: 'success', result: 'Complete' };
      })());

      const config: ClaudeNodeConfig = {
        type: 'claude-agent',
        name: 'Test Agent',
        model: 'sonnet',
        userQuery: 'Test',
      };

      const agent = new ClaudeAgent(config);
      const events = [];
      for await (const event of agent.execute({ prompt: 'Test' }, mockContext)) {
        events.push(event);
      }

      // Verify text-delta events were emitted for both text blocks
      const textDeltas = events.filter(e => e.type === 'text-delta');
      expect(textDeltas).toHaveLength(2);
      expect(textDeltas[0].content).toBe('First text block');
      expect(textDeltas[1].content).toBe('Second text block');
    });

    it('should extract tool use blocks correctly', async () => {
      mockQuery.mockReturnValue((async function* () {
        yield {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'tool_123',
                name: 'Read',
                input: { file_path: '/test/file.txt' },
              },
            ],
          },
        };
        yield { type: 'result', subtype: 'success', result: 'Complete' };
      })());

      const config: ClaudeNodeConfig = {
        type: 'claude-agent',
        name: 'Test Agent',
        model: 'sonnet',
        userQuery: 'Test',
        tools: ['Read'],
      };

      const agent = new ClaudeAgent(config);
      const events = [];
      for await (const event of agent.execute({ prompt: 'Test' }, mockContext)) {
        events.push(event);
      }

      // Verify tool-use event was emitted
      const toolUseEvents = events.filter(e => e.type === 'tool-use');
      expect(toolUseEvents).toHaveLength(1);
      expect(toolUseEvents[0]).toMatchObject({
        type: 'tool-use',
        id: 'tool_123',
        name: 'Read',
        input: { file_path: '/test/file.txt' },
      });
    });

    it('should handle thinking blocks (extended thinking)', async () => {
      mockQuery.mockReturnValue((async function* () {
        yield {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: 'Let me think about this...' },
              { type: 'text', text: 'Here is my answer' },
            ],
          },
        };
        yield { type: 'result', subtype: 'success', result: 'Complete' };
      })());

      const config: ClaudeNodeConfig = {
        type: 'claude-agent',
        name: 'Test Agent',
        model: 'opus',
        userQuery: 'Test',
      };

      const agent = new ClaudeAgent(config);
      const events = [];
      for await (const event of agent.execute({ prompt: 'Test' }, mockContext)) {
        events.push(event);
      }

      // Verify thinking event was emitted
      const thinkingEvents = events.filter(e => e.type === 'thinking');
      expect(thinkingEvents).toHaveLength(1);
      expect(thinkingEvents[0].content).toBe('Let me think about this...');

      // Verify text event was also emitted
      const textEvents = events.filter(e => e.type === 'text-delta');
      expect(textEvents).toHaveLength(1);
      expect(textEvents[0].content).toBe('Here is my answer');
    });

    it('should handle thinking blocks with text field fallback', async () => {
      mockQuery.mockReturnValue((async function* () {
        yield {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              { type: 'thinking', text: 'Thinking via text field' },
            ],
          },
        };
        yield { type: 'result', subtype: 'success', result: 'Complete' };
      })());

      const config: ClaudeNodeConfig = {
        type: 'claude-agent',
        name: 'Test Agent',
        model: 'opus',
        userQuery: 'Test',
      };

      const agent = new ClaudeAgent(config);
      const events = [];
      for await (const event of agent.execute({ prompt: 'Test' }, mockContext)) {
        events.push(event);
      }

      // Verify thinking event uses text field when thinking field not present
      const thinkingEvents = events.filter(e => e.type === 'thinking');
      expect(thinkingEvents).toHaveLength(1);
      expect(thinkingEvents[0].content).toBe('Thinking via text field');
    });
  });

  describe('Tool result message format', () => {
    it('should process tool_result content blocks from user messages', async () => {
      mockQuery.mockReturnValue((async function* () {
        yield {
          type: 'user',
          message: {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'tool_123',
                content: 'File contents here',
              },
            ],
          },
        };
        yield { type: 'result', subtype: 'success', result: 'Complete' };
      })());

      const config: ClaudeNodeConfig = {
        type: 'claude-agent',
        name: 'Test Agent',
        model: 'sonnet',
        userQuery: 'Test',
        tools: ['Read'],
      };

      const agent = new ClaudeAgent(config);
      const events = [];
      for await (const event of agent.execute({ prompt: 'Test' }, mockContext)) {
        events.push(event);
      }

      // Verify tool-result event was emitted
      const toolResultEvents = events.filter(e => e.type === 'tool-result');
      expect(toolResultEvents).toHaveLength(1);
      expect(toolResultEvents[0]).toMatchObject({
        type: 'tool-result',
        name: 'tool_123',
        result: 'File contents here',
      });
    });

    it('should format structured tool result content as JSON', async () => {
      mockQuery.mockReturnValue((async function* () {
        yield {
          type: 'user',
          message: {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'tool_456',
                content: { files: ['a.txt', 'b.txt'], count: 2 },
              },
            ],
          },
        };
        yield { type: 'result', subtype: 'success', result: 'Complete' };
      })());

      const config: ClaudeNodeConfig = {
        type: 'claude-agent',
        name: 'Test Agent',
        model: 'sonnet',
        userQuery: 'Test',
        tools: ['Glob'],
      };

      const agent = new ClaudeAgent(config);
      const events = [];
      for await (const event of agent.execute({ prompt: 'Test' }, mockContext)) {
        events.push(event);
      }

      // Verify tool result is formatted as JSON
      const toolResultEvents = events.filter(e => e.type === 'tool-result');
      expect(toolResultEvents).toHaveLength(1);
      const resultContent = toolResultEvents[0].result;
      expect(resultContent).toContain('"files"');
      expect(resultContent).toContain('"count"');
      expect(() => JSON.parse(resultContent)).not.toThrow();
    });
  });

  describe('SDK v0.2 result message format', () => {
    it('should handle result message with structured_output field', async () => {
      const structuredData = {
        testFiles: ['test1.ts', 'test2.ts'],
        testCount: 2,
      };

      mockQuery.mockReturnValue((async function* () {
        yield {
          type: 'result',
          subtype: 'success',
          result: 'Task completed',
          structured_output: structuredData,
        };
      })());

      const config: ClaudeNodeConfig = {
        type: 'claude-agent',
        name: 'Test Agent',
        model: 'sonnet',
        userQuery: 'Test',
      };

      const agent = new ClaudeAgent(config);
      const input: AgentInput = {
        prompt: 'Test',
        outputConfig: {
          schema: JSON.stringify({
            type: 'object',
            properties: {
              testFiles: { type: 'array', items: { type: 'string' } },
              testCount: { type: 'number' },
            },
          }),
          filePath: '/output/result.json',
        },
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify structured output is captured
      const structuredOutput = agent.getStructuredOutput();
      expect(structuredOutput).toBeDefined();
      expect(structuredOutput?.format).toBe('json');
      expect(structuredOutput?.parsedJson).toEqual(structuredData);
      expect(structuredOutput?.filePath).toBe('/output/result.json');

      // Verify complete event is emitted
      const completeEvents = events.filter(e => e.type === 'complete');
      expect(completeEvents).toHaveLength(1);
    });
  });

  describe('Session resumption with SDK v0.2', () => {
    it('should capture session_id from system init message', async () => {
      mockQuery.mockReturnValue((async function* () {
        yield { type: 'system', subtype: 'init', session_id: 'session_abc123' };
        yield {
          type: 'assistant',
          message: { role: 'assistant', content: [{ type: 'text', text: 'Response' }] },
        };
        yield { type: 'result', subtype: 'success', result: 'Complete' };
      })());

      const config: ClaudeNodeConfig = {
        type: 'claude-agent',
        name: 'Test Agent',
        model: 'sonnet',
        userQuery: 'Test',
      };

      const agent = new ClaudeAgent(config);
      const events = [];
      for await (const event of agent.execute({ prompt: 'Test' }, mockContext)) {
        events.push(event);
      }

      // Verify session ID was captured
      expect(agent.getSessionId()).toBe('session_abc123');
    });

    it('should pass resume parameter when sessionId is provided', async () => {
      mockQuery.mockReturnValue((async function* () {
        yield {
          type: 'assistant',
          message: { role: 'assistant', content: [{ type: 'text', text: 'Resumed response' }] },
        };
        yield { type: 'result', subtype: 'success', result: 'Complete' };
      })());

      const config: ClaudeNodeConfig = {
        type: 'claude-agent',
        name: 'Test Agent',
        model: 'sonnet',
        userQuery: 'Test',
      };

      const agent = new ClaudeAgent(config);
      const input: AgentInput = {
        prompt: 'Continue task',
        sessionId: 'existing_session_123',
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify query was called with resume parameter
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.options.resume).toBe('existing_session_123');
    });
  });

  describe('Error handling with SDK v0.2', () => {
    it('should handle result message with errors array', async () => {
      mockQuery.mockReturnValue((async function* () {
        yield {
          type: 'result',
          subtype: 'error',
          errors: ['Invalid tool call', 'Missing required parameter'],
        };
      })());

      const config: ClaudeNodeConfig = {
        type: 'claude-agent',
        name: 'Test Agent',
        model: 'sonnet',
        userQuery: 'Test',
      };

      const agent = new ClaudeAgent(config);
      const events = [];
      for await (const event of agent.execute({ prompt: 'Test' }, mockContext)) {
        events.push(event);
      }

      // Verify error event contains joined error messages
      const errorEvents = events.filter(e => e.type === 'error');
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].message).toBe('Invalid tool call\nMissing required parameter');
    });

    it('should use subtype as error message when errors array is empty', async () => {
      mockQuery.mockReturnValue((async function* () {
        yield {
          type: 'result',
          subtype: 'timeout',
          errors: [],
        };
      })());

      const config: ClaudeNodeConfig = {
        type: 'claude-agent',
        name: 'Test Agent',
        model: 'sonnet',
        userQuery: 'Test',
      };

      const agent = new ClaudeAgent(config);
      const events = [];
      for await (const event of agent.execute({ prompt: 'Test' }, mockContext)) {
        events.push(event);
      }

      // Verify error event uses subtype when no errors array
      const errorEvents = events.filter(e => e.type === 'error');
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].message).toBe('timeout');
    });
  });

  describe('Interrupt handling', () => {
    it('should close active stream when interrupt is called', async () => {
      const mockStreamReturn = jest.fn();
      const mockStreamClose = jest.fn();

      const mockIterator = {
        return: mockStreamReturn,
      };

      const mockStream = {
        [Symbol.asyncIterator]: () => mockIterator,
        close: mockStreamClose,
      };

      mockQuery.mockReturnValue((async function* () {
        yield { type: 'system', subtype: 'init', session_id: 'test' };
        // Simulate long-running stream
        await new Promise(resolve => setTimeout(resolve, 100));
        yield { type: 'result', subtype: 'success', result: 'Complete' };
      })());

      const config: ClaudeNodeConfig = {
        type: 'claude-agent',
        name: 'Test Agent',
        model: 'sonnet',
        userQuery: 'Test',
      };

      const agent = new ClaudeAgent(config);

      // Start execution but don't await completion
      const executionPromise = (async () => {
        const events = [];
        for await (const event of agent.execute({ prompt: 'Test' }, mockContext)) {
          events.push(event);
        }
        return events;
      })();

      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 10));

      // Interrupt the execution
      await agent.interrupt();

      // Wait for completion
      const events = await executionPromise;

      // Verify error event was emitted
      const errorEvents = events.filter(e => e.type === 'error');
      expect(errorEvents.length).toBeGreaterThan(0);
      expect(errorEvents.some(e => e.message === 'Execution interrupted')).toBe(true);
    });
  });

  describe('TodoWrite tool integration', () => {
    it('should emit todo-list events when TodoWrite tool is used', async () => {
      mockQuery.mockReturnValue((async function* () {
        yield {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'todo_1',
                name: 'TodoWrite',
                input: {
                  todos: [
                    { content: 'Write tests', status: 'in_progress', activeForm: 'Writing tests' },
                    { content: 'Run tests', status: 'pending', activeForm: 'Running tests' },
                    { content: 'Fix bugs', status: 'completed', activeForm: 'Fixing bugs' },
                  ],
                },
              },
            ],
          },
        };
        yield { type: 'result', subtype: 'success', result: 'Complete' };
      })());

      const config: ClaudeNodeConfig = {
        type: 'claude-agent',
        name: 'Test Agent',
        model: 'sonnet',
        userQuery: 'Test',
        tools: ['TodoWrite'],
      };

      const agent = new ClaudeAgent(config);
      const events = [];
      for await (const event of agent.execute({ prompt: 'Test' }, mockContext)) {
        events.push(event);
      }

      // Verify todo-list event was emitted
      const todoEvents = events.filter(e => e.type === 'todo-list');
      expect(todoEvents).toHaveLength(1);
      expect(todoEvents[0].items).toHaveLength(3);
      expect(todoEvents[0].items[0]).toMatchObject({
        text: 'Writing tests',
        completed: false,
      });
      expect(todoEvents[0].items[1]).toMatchObject({
        text: 'Running tests',
        completed: false,
      });
      expect(todoEvents[0].items[2]).toMatchObject({
        text: 'Fixing bugs',
        completed: true,
      });
    });
  });
});

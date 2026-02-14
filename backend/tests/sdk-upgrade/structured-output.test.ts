/**
 * Structured Output Tests
 * Tests for structured output parsing in Claude and Codex agents with new SDK versions
 */

// Mock the SDKs before imports
const mockClaudeQuery = jest.fn();
jest.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: mockClaudeQuery,
}));

const mockStartThread = jest.fn();
const mockRunStreamed = jest.fn();
jest.mock('@openai/codex-sdk', () => ({
  Codex: jest.fn().mockImplementation(() => ({
    startThread: mockStartThread,
  })),
}));

import { ClaudeAgent } from '../../src/agents/claude';
import { CodexAgent } from '../../src/agents/codex';
import { ClaudeNodeConfig, CodexNodeConfig, AgentInput, ExecutionContext } from '../../src/workflows/types';

describe('Structured Output', () => {
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

    const mockThread = {
      runStreamed: mockRunStreamed,
    };

    mockStartThread.mockReturnValue(mockThread);
  });

  describe('Claude structured output with SDK v0.2.x', () => {
    it('should parse outputSchema from JSON string', async () => {
      const structuredData = {
        testFiles: ['test1.ts', 'test2.ts'],
        testCount: 2,
      };

      mockClaudeQuery.mockReturnValue((async function* () {
        yield { type: 'system', subtype: 'init', session_id: 'test' };
        yield {
          type: 'result',
          subtype: 'success',
          result: 'Tests written',
          structured_output: structuredData,
        };
      })());

      const config: ClaudeNodeConfig = {
        type: 'claude-agent',
        name: 'Test Agent',
        model: 'sonnet',
        userQuery: 'Write tests',
      };

      const schema = {
        type: 'object',
        properties: {
          testFiles: {
            type: 'array',
            items: { type: 'string' },
          },
          testCount: {
            type: 'number',
          },
        },
      };

      const agent = new ClaudeAgent(config);
      const input: AgentInput = {
        prompt: 'Write tests',
        outputConfig: {
          schema: JSON.stringify(schema),
          filePath: '/output/result.json',
        },
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify outputFormat was set in query options
      expect(mockClaudeQuery).toHaveBeenCalled();
      const callArgs = mockClaudeQuery.mock.calls[0][0];
      expect(callArgs.options.outputFormat).toBeDefined();
      expect(callArgs.options.outputFormat.type).toBe('json_schema');
      expect(callArgs.options.outputFormat.schema).toEqual(schema);

      // Verify structured output is captured
      const structuredOutput = agent.getStructuredOutput();
      expect(structuredOutput).toBeDefined();
      expect(structuredOutput?.format).toBe('json');
      expect(structuredOutput?.parsedJson).toEqual(structuredData);
      expect(structuredOutput?.filePath).toBe('/output/result.json');
    });

    it('should handle invalid JSON schema', async () => {
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
          schema: 'invalid json{',
          filePath: '/output/result.json',
        },
      };

      // Verify error is thrown for invalid schema
      await expect(async () => {
        const events = [];
        for await (const event of agent.execute(input, mockContext)) {
          events.push(event);
        }
      }).rejects.toThrow('Invalid JSON schema');
    });

    it('should preserve filePath in structured output', async () => {
      const structuredData = { result: 'success' };

      mockClaudeQuery.mockReturnValue((async function* () {
        yield { type: 'system', subtype: 'init', session_id: 'test' };
        yield {
          type: 'result',
          subtype: 'success',
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
          schema: JSON.stringify({ type: 'object', properties: { result: { type: 'string' } } }),
          filePath: '/custom/path/output.json',
        },
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      const structuredOutput = agent.getStructuredOutput();
      expect(structuredOutput?.filePath).toBe('/custom/path/output.json');
    });

    it('should not set outputFormat when no schema provided', async () => {
      mockClaudeQuery.mockReturnValue((async function* () {
        yield { type: 'system', subtype: 'init', session_id: 'test' };
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
      const input: AgentInput = {
        prompt: 'Test',
        // No outputConfig
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify outputFormat was not set
      const callArgs = mockClaudeQuery.mock.calls[0][0];
      expect(callArgs.options.outputFormat).toBeUndefined();

      // Verify no structured output
      expect(agent.getStructuredOutput()).toBeUndefined();
    });
  });

  describe('Codex structured output with SDK v0.79.x', () => {
    it('should parse and strictify output schema', async () => {
      const structuredData = {
        testFiles: ['test1.ts', 'test2.ts'],
        testCount: 2,
      };

      mockRunStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 'thread_1' };
          yield {
            type: 'item.completed',
            item: {
              id: 'msg_1',
              type: 'agent_message',
              text: JSON.stringify(structuredData),
            },
          };
          yield { type: 'turn.completed' };
        })(),
      });

      const config: CodexNodeConfig = {
        type: 'codex-agent',
        name: 'Test Agent',
        model: 'gpt-5.3-codex',
        userQuery: 'Write tests',
        approvalPolicy: 'never',
        sandbox: 'workspace-write',
      };

      const schema = {
        type: 'object',
        properties: {
          testFiles: {
            type: 'array',
            items: { type: 'string' },
          },
          testCount: {
            type: 'number',
          },
        },
      };

      const agent = new CodexAgent(config);
      const input: AgentInput = {
        prompt: 'Write tests',
        outputConfig: {
          schema: JSON.stringify(schema),
          filePath: '/output/result.json',
        },
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify outputSchema was passed to runStreamed
      expect(mockRunStreamed).toHaveBeenCalled();
      const turnOptions = mockRunStreamed.mock.calls[0][1];
      expect(turnOptions.outputSchema).toBeDefined();

      // Verify schema was strictified (additionalProperties: false added)
      expect(turnOptions.outputSchema.additionalProperties).toBe(false);

      // Verify required includes all properties
      expect(turnOptions.outputSchema.required).toContain('testFiles');
      expect(turnOptions.outputSchema.required).toContain('testCount');

      // Verify structured output is parsed
      const structuredOutput = agent.getStructuredOutput();
      expect(structuredOutput).toBeDefined();
      expect(structuredOutput?.format).toBe('json');
      expect(structuredOutput?.parsedJson).toEqual(structuredData);
      expect(structuredOutput?.filePath).toBe('/output/result.json');
    });

    it('should enforce strict schema constraints', async () => {
      mockRunStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 'thread_1' };
          yield {
            type: 'item.completed',
            item: {
              id: 'msg_1',
              type: 'agent_message',
              text: '{"result":"success"}',
            },
          };
          yield { type: 'turn.completed' };
        })(),
      });

      const config: CodexNodeConfig = {
        type: 'codex-agent',
        name: 'Test Agent',
        model: 'gpt-5.3-codex',
        userQuery: 'Test',
        approvalPolicy: 'never',
        sandbox: 'workspace-write',
      };

      const schema = {
        type: 'object',
        properties: {
          result: { type: 'string' },
          nested: {
            type: 'object',
            properties: {
              value: { type: 'number' },
            },
          },
        },
      };

      const agent = new CodexAgent(config);
      const input: AgentInput = {
        prompt: 'Test',
        outputConfig: {
          schema: JSON.stringify(schema),
        },
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      const turnOptions = mockRunStreamed.mock.calls[0][1];

      // Verify additionalProperties is false at root level
      expect(turnOptions.outputSchema.additionalProperties).toBe(false);

      // Verify nested object also has additionalProperties: false
      expect(turnOptions.outputSchema.properties.nested.additionalProperties).toBe(false);

      // Verify required arrays include all property keys
      expect(turnOptions.outputSchema.required).toContain('result');
      expect(turnOptions.outputSchema.required).toContain('nested');
      expect(turnOptions.outputSchema.properties.nested.required).toContain('value');
    });

    it('should handle array item schemas', async () => {
      mockRunStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 'thread_1' };
          yield {
            type: 'item.completed',
            item: {
              id: 'msg_1',
              type: 'agent_message',
              text: '{"items":[{"name":"test"}]}',
            },
          };
          yield { type: 'turn.completed' };
        })(),
      });

      const config: CodexNodeConfig = {
        type: 'codex-agent',
        name: 'Test Agent',
        model: 'gpt-5.3-codex',
        userQuery: 'Test',
        approvalPolicy: 'never',
        sandbox: 'workspace-write',
      };

      const schema = {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
              },
            },
          },
        },
      };

      const agent = new CodexAgent(config);
      const input: AgentInput = {
        prompt: 'Test',
        outputConfig: {
          schema: JSON.stringify(schema),
        },
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      const turnOptions = mockRunStreamed.mock.calls[0][1];

      // Verify array items schema is also strictified
      expect(turnOptions.outputSchema.properties.items.items.additionalProperties).toBe(false);
      expect(turnOptions.outputSchema.properties.items.items.required).toContain('name');
    });

    it('should handle anyOf/oneOf/allOf schemas', async () => {
      mockRunStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 'thread_1' };
          yield {
            type: 'item.completed',
            item: {
              id: 'msg_1',
              type: 'agent_message',
              text: '{"type":"a","value":1}',
            },
          };
          yield { type: 'turn.completed' };
        })(),
      });

      const config: CodexNodeConfig = {
        type: 'codex-agent',
        name: 'Test Agent',
        model: 'gpt-5.3-codex',
        userQuery: 'Test',
        approvalPolicy: 'never',
        sandbox: 'workspace-write',
      };

      const schema = {
        oneOf: [
          {
            type: 'object',
            properties: {
              type: { type: 'string' },
              value: { type: 'number' },
            },
          },
          {
            type: 'object',
            properties: {
              type: { type: 'string' },
              text: { type: 'string' },
            },
          },
        ],
      };

      const agent = new CodexAgent(config);
      const input: AgentInput = {
        prompt: 'Test',
        outputConfig: {
          schema: JSON.stringify(schema),
        },
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      const turnOptions = mockRunStreamed.mock.calls[0][1];

      // Verify oneOf schemas are processed
      expect(turnOptions.outputSchema.oneOf).toHaveLength(2);
      expect(turnOptions.outputSchema.oneOf[0].additionalProperties).toBe(false);
      expect(turnOptions.outputSchema.oneOf[1].additionalProperties).toBe(false);
    });

    it('should throw error on invalid JSON in response', async () => {
      mockRunStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 'thread_1' };
          yield {
            type: 'item.completed',
            item: {
              id: 'msg_1',
              type: 'agent_message',
              text: 'Not valid JSON{',
            },
          };
          yield { type: 'turn.completed' };
        })(),
      });

      const config: CodexNodeConfig = {
        type: 'codex-agent',
        name: 'Test Agent',
        model: 'gpt-5.3-codex',
        userQuery: 'Test',
        approvalPolicy: 'never',
        sandbox: 'workspace-write',
      };

      const agent = new CodexAgent(config);
      const input: AgentInput = {
        prompt: 'Test',
        outputConfig: {
          schema: JSON.stringify({ type: 'object', properties: { result: { type: 'string' } } }),
        },
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify error event is emitted
      const errorEvents = events.filter(e => e.type === 'error');
      expect(errorEvents.length).toBeGreaterThan(0);
      expect(errorEvents[0].message).toContain('Failed to parse structured output JSON');
    });

    it('should throw error when no response is returned', async () => {
      mockRunStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 'thread_1' };
          yield { type: 'turn.completed' };
        })(),
      });

      const config: CodexNodeConfig = {
        type: 'codex-agent',
        name: 'Test Agent',
        model: 'gpt-5.3-codex',
        userQuery: 'Test',
        approvalPolicy: 'never',
        sandbox: 'workspace-write',
      };

      const agent = new CodexAgent(config);
      const input: AgentInput = {
        prompt: 'Test',
        outputConfig: {
          schema: JSON.stringify({ type: 'object', properties: { result: { type: 'string' } } }),
        },
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify error event is emitted
      const errorEvents = events.filter(e => e.type === 'error');
      expect(errorEvents.length).toBeGreaterThan(0);
      expect(errorEvents[0].message).toContain('Structured output requested, but no response was returned');
    });

    it('should not set outputSchema when no schema provided', async () => {
      mockRunStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 'thread_1' };
          yield {
            type: 'item.completed',
            item: { id: 'msg_1', type: 'agent_message', text: 'Response' },
          };
          yield { type: 'turn.completed' };
        })(),
      });

      const config: CodexNodeConfig = {
        type: 'codex-agent',
        name: 'Test Agent',
        model: 'gpt-5.3-codex',
        userQuery: 'Test',
        approvalPolicy: 'never',
        sandbox: 'workspace-write',
      };

      const agent = new CodexAgent(config);
      const input: AgentInput = {
        prompt: 'Test',
        // No outputConfig
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify outputSchema was not set
      const turnOptions = mockRunStreamed.mock.calls[0][1];
      expect(turnOptions.outputSchema).toBeUndefined();

      // Verify no structured output
      expect(agent.getStructuredOutput()).toBeUndefined();
    });
  });
});

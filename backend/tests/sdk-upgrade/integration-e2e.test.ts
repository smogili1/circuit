/**
 * End-to-End Integration Tests
 * Comprehensive integration tests for SDK upgrades covering real-world scenarios
 */

// Mock the SDKs before imports
const mockClaudeQuery = jest.fn();
jest.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: mockClaudeQuery,
}));

const mockStartThread = jest.fn();
const mockResumeThread = jest.fn();
const mockRunStreamed = jest.fn();
jest.mock('@openai/codex-sdk', () => ({
  Codex: jest.fn().mockImplementation(() => ({
    startThread: mockStartThread,
    resumeThread: mockResumeThread,
  })),
}));

// Mock MCP server manager
const mockServerManager = {
  get: jest.fn(),
};

jest.mock('../../src/mcp/server-manager', () => ({
  getMCPServerManager: () => mockServerManager,
}));

import { ClaudeAgent } from '../../src/agents/claude';
import { CodexAgent } from '../../src/agents/codex';
import { ClaudeNodeConfig, CodexNodeConfig, AgentInput, ExecutionContext } from '../../src/workflows/types';
import { MCPServer } from '../../src/mcp/types';
import { MCPConfigConverter } from '../../src/mcp/config-converter';

describe('End-to-End Integration Tests', () => {
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
    mockResumeThread.mockReturnValue(mockThread);
  });

  describe('Claude Opus 4.5 - Full workflow execution', () => {
    it('should execute complete workflow with new model', async () => {
      mockClaudeQuery.mockReturnValue((async function* () {
        yield { type: 'system', subtype: 'init', session_id: 'test_session' };
        yield {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: 'Planning the implementation...' },
              { type: 'text', text: 'I will create the file' },
              { type: 'tool_use', id: 'tool_1', name: 'Write', input: { file_path: '/test/new.txt', content: 'Hello' } },
            ],
          },
        };
        yield {
          type: 'user',
          message: {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'tool_1', content: 'File written successfully' },
            ],
          },
        };
        yield {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'File created successfully' }],
          },
        };
        yield { type: 'result', subtype: 'success', result: 'Task completed' };
      })());

      const config: ClaudeNodeConfig = {
        type: 'claude-agent',
        name: 'Claude Opus Agent',
        model: 'claude-opus-4-5',
        userQuery: 'Create a new file',
        tools: ['Write'],
      };

      const agent = new ClaudeAgent(config);
      const input: AgentInput = {
        prompt: 'Create /test/new.txt with content "Hello"',
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify model parameter
      expect(mockClaudeQuery).toHaveBeenCalled();
      const callArgs = mockClaudeQuery.mock.calls[0][0];
      expect(callArgs.options.model).toBe('claude-opus-4-5');

      // Verify all event types are emitted
      expect(events.some(e => e.type === 'thinking')).toBe(true);
      expect(events.some(e => e.type === 'text-delta')).toBe(true);
      expect(events.some(e => e.type === 'tool-use')).toBe(true);
      expect(events.some(e => e.type === 'tool-result')).toBe(true);
      expect(events.some(e => e.type === 'complete')).toBe(true);

      // Verify session ID captured
      expect(agent.getSessionId()).toBe('test_session');

      // Verify no errors
      expect(events.some(e => e.type === 'error')).toBe(false);
    });
  });

  describe('Codex GPT-5.3 - Full workflow execution', () => {
    it('should execute complete workflow with new model', async () => {
      mockRunStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 'test_thread' };
          yield {
            type: 'item.started',
            item: { id: 'reason_1', type: 'reasoning', text: '' },
          };
          yield {
            type: 'item.completed',
            item: { id: 'reason_1', type: 'reasoning', text: 'Analyzing the task...' },
          };
          yield {
            type: 'item.started',
            item: {
              id: 'cmd_1',
              type: 'command_execution',
              command: 'ls -la',
              aggregated_output: '',
            },
          };
          yield {
            type: 'item.completed',
            item: {
              id: 'cmd_1',
              type: 'command_execution',
              command: 'ls -la',
              aggregated_output: 'file1.txt\nfile2.txt\n',
              exit_code: 0,
            },
          };
          yield {
            type: 'item.completed',
            item: { id: 'msg_1', type: 'agent_message', text: 'Found 2 files' },
          };
          yield { type: 'turn.completed' };
        })(),
      });

      const config: CodexNodeConfig = {
        type: 'codex-agent',
        name: 'Codex Agent',
        model: 'gpt-5.3-codex',
        userQuery: 'List files',
        approvalPolicy: 'never',
        sandbox: 'workspace-write',
        reasoningEffort: 'high',
      };

      const agent = new CodexAgent(config);
      const input: AgentInput = {
        prompt: 'List all files in the current directory',
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify model and reasoning effort
      expect(mockStartThread).toHaveBeenCalled();
      const threadOptions = mockStartThread.mock.calls[0][0];
      expect(threadOptions.model).toBe('gpt-5.3-codex');
      expect(threadOptions.modelReasoningEffort).toBe('high');

      // Verify all event types are emitted
      expect(events.some(e => e.type === 'thinking')).toBe(true);
      expect(events.some(e => e.type === 'tool-use')).toBe(true);
      expect(events.some(e => e.type === 'tool-result')).toBe(true);
      expect(events.some(e => e.type === 'text-delta')).toBe(true);
      expect(events.some(e => e.type === 'complete')).toBe(true);

      // Verify thread ID captured
      expect(agent.getThreadId()).toBe('test_thread');

      // Verify no errors
      expect(events.some(e => e.type === 'error')).toBe(false);
    });
  });

  describe('MCP Integration with Claude SDK v0.2', () => {
    it('should integrate MCP servers correctly', async () => {
      const mockMCPServer: MCPServer = {
        id: 'test-mcp',
        name: 'Filesystem',
        transport: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        },
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockServerManager.get.mockResolvedValue(mockMCPServer);

      mockClaudeQuery.mockReturnValue((async function* () {
        yield { type: 'system', subtype: 'init', session_id: 'mcp_session' };
        yield {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              { type: 'tool_use', id: 'mcp_tool_1', name: 'mcp__filesystem__read_file', input: { path: '/test.txt' } },
            ],
          },
        };
        yield {
          type: 'user',
          message: {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'mcp_tool_1', content: 'File contents' },
            ],
          },
        };
        yield { type: 'result', subtype: 'success', result: 'Complete' };
      })());

      const sdkConfig = MCPConfigConverter.toSDKServersConfig([mockMCPServer]);
      const toolPatterns = MCPConfigConverter.generateToolPatterns('Filesystem', '*');

      const config: ClaudeNodeConfig = {
        type: 'claude-agent',
        name: 'Claude with MCP',
        model: 'sonnet',
        userQuery: 'Read file',
        tools: ['Read'],
      };

      const mcpConfig = {
        mcpServers: sdkConfig,
        env: {},
        allowedToolPatterns: toolPatterns,
      };

      const agent = new ClaudeAgent(config, mcpConfig);
      const input: AgentInput = {
        prompt: 'Read /test.txt using MCP',
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify MCP config was passed
      const callArgs = mockClaudeQuery.mock.calls[0][0];
      expect(callArgs.options.mcpServers).toBeDefined();
      expect(callArgs.options.mcpServers).toHaveProperty('filesystem');

      // Verify allowed tools include MCP pattern
      expect(callArgs.options.allowedTools).toContain('mcp__filesystem__*');

      // Verify MCP tool was used
      const toolUseEvents = events.filter(e => e.type === 'tool-use');
      expect(toolUseEvents.some(e => e.name === 'mcp__filesystem__read_file')).toBe(true);

      // Verify execution completed
      expect(events.some(e => e.type === 'complete')).toBe(true);
    });
  });

  describe('Structured output - End to end', () => {
    it('should handle structured output with Claude v0.2', async () => {
      const structuredData = {
        testFiles: ['backend/tests/test1.test.ts', 'backend/tests/test2.test.ts'],
        testCount: 2,
      };

      mockClaudeQuery.mockReturnValue((async function* () {
        yield { type: 'system', subtype: 'init', session_id: 'struct_session' };
        yield {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Writing tests...' }],
          },
        };
        yield {
          type: 'result',
          subtype: 'success',
          result: 'Tests created',
          structured_output: structuredData,
        };
      })());

      const config: ClaudeNodeConfig = {
        type: 'claude-agent',
        name: 'Test Writer',
        model: 'claude-sonnet-4-5',
        userQuery: 'Write tests',
        tools: ['Write'],
      };

      const schema = {
        type: 'object',
        properties: {
          testFiles: { type: 'array', items: { type: 'string' } },
          testCount: { type: 'number' },
        },
      };

      const agent = new ClaudeAgent(config);
      const input: AgentInput = {
        prompt: 'Write unit tests for the user module',
        outputConfig: {
          schema: JSON.stringify(schema),
          filePath: '/output/tests.json',
        },
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify structured output
      const structuredOutput = agent.getStructuredOutput();
      expect(structuredOutput).toBeDefined();
      expect(structuredOutput?.format).toBe('json');
      expect(structuredOutput?.parsedJson).toEqual(structuredData);
      expect(structuredOutput?.filePath).toBe('/output/tests.json');

      // Verify content is valid JSON
      const content = structuredOutput?.content;
      expect(() => JSON.parse(content!)).not.toThrow();
    });

    it('should handle structured output with Codex v0.79', async () => {
      const structuredData = {
        files: ['src/module.ts', 'src/module.test.ts'],
        summary: 'Created module and tests',
      };

      mockRunStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 'struct_thread' };
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
        name: 'Module Creator',
        model: 'gpt-5.3-codex',
        userQuery: 'Create module',
        approvalPolicy: 'never',
        sandbox: 'workspace-write',
      };

      const schema = {
        type: 'object',
        properties: {
          files: { type: 'array', items: { type: 'string' } },
          summary: { type: 'string' },
        },
      };

      const agent = new CodexAgent(config);
      const input: AgentInput = {
        prompt: 'Create a new TypeScript module with tests',
        outputConfig: {
          schema: JSON.stringify(schema),
          filePath: '/output/module.json',
        },
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify structured output
      const structuredOutput = agent.getStructuredOutput();
      expect(structuredOutput).toBeDefined();
      expect(structuredOutput?.format).toBe('json');
      expect(structuredOutput?.parsedJson).toEqual(structuredData);
      expect(structuredOutput?.filePath).toBe('/output/module.json');

      // Verify schema was strictified
      const turnOptions = mockRunStreamed.mock.calls[0][1];
      expect(turnOptions.outputSchema.additionalProperties).toBe(false);
      expect(turnOptions.outputSchema.required).toContain('files');
      expect(turnOptions.outputSchema.required).toContain('summary');
    });
  });

  describe('Session resumption - End to end', () => {
    it('should resume conversation across multiple turns with Claude', async () => {
      // First turn
      mockClaudeQuery.mockReturnValueOnce((async function* () {
        yield { type: 'system', subtype: 'init', session_id: 'conversation_123' };
        yield {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'My name is Claude. What can I help you with?' }],
          },
        };
        yield { type: 'result', subtype: 'success', result: 'Complete' };
      })());

      // Second turn
      mockClaudeQuery.mockReturnValueOnce((async function* () {
        yield {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'You asked me to remember your name: Alice' }],
          },
        };
        yield { type: 'result', subtype: 'success', result: 'Complete' };
      })());

      const config: ClaudeNodeConfig = {
        type: 'claude-agent',
        name: 'Conversational Agent',
        model: 'claude-sonnet-4-5',
        userQuery: 'Chat',
      };

      const agent = new ClaudeAgent(config);

      // First turn
      const events1 = [];
      for await (const event of agent.execute({ prompt: 'Hello, what is your name?' }, mockContext)) {
        events1.push(event);
      }

      const sessionId = agent.getSessionId();
      expect(sessionId).toBe('conversation_123');

      // Second turn with session resumption
      const events2 = [];
      for await (const event of agent.execute({ prompt: 'What did I ask you to remember?', sessionId }, mockContext)) {
        events2.push(event);
      }

      // Verify resume was used
      expect(mockClaudeQuery).toHaveBeenCalledTimes(2);
      const secondCallArgs = mockClaudeQuery.mock.calls[1][0];
      expect(secondCallArgs.options.resume).toBe('conversation_123');

      // Verify both turns completed
      expect(events1.some(e => e.type === 'complete')).toBe(true);
      expect(events2.some(e => e.type === 'complete')).toBe(true);
    });
  });

  describe('Error handling - End to end', () => {
    it('should handle SDK errors gracefully', async () => {
      mockClaudeQuery.mockReturnValue((async function* () {
        yield { type: 'system', subtype: 'init', session_id: 'error_session' };
        yield {
          type: 'result',
          subtype: 'rate_limit_error',
          errors: ['Rate limit exceeded', 'Please retry after 60 seconds'],
        };
      })());

      const config: ClaudeNodeConfig = {
        type: 'claude-agent',
        name: 'Error Test Agent',
        model: 'sonnet',
        userQuery: 'Test',
      };

      const agent = new ClaudeAgent(config);
      const input: AgentInput = {
        prompt: 'Test error handling',
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify error event is emitted
      const errorEvents = events.filter(e => e.type === 'error');
      expect(errorEvents.length).toBeGreaterThan(0);
      expect(errorEvents[0].message).toContain('Rate limit exceeded');
      expect(errorEvents[0].message).toContain('Please retry after 60 seconds');

      // Verify no complete event
      expect(events.some(e => e.type === 'complete')).toBe(false);
    });

    it('should handle network errors gracefully', async () => {
      mockClaudeQuery.mockImplementation(() => {
        throw new Error('Network connection failed');
      });

      const config: ClaudeNodeConfig = {
        type: 'claude-agent',
        name: 'Network Error Agent',
        model: 'sonnet',
        userQuery: 'Test',
      };

      const agent = new ClaudeAgent(config);
      const input: AgentInput = {
        prompt: 'Test network error',
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify error event is emitted
      const errorEvents = events.filter(e => e.type === 'error');
      expect(errorEvents.length).toBeGreaterThan(0);
      expect(errorEvents[0].message).toContain('Network connection failed');
    });
  });

  describe('Backward compatibility', () => {
    it('should work with legacy model names', async () => {
      mockClaudeQuery.mockReturnValue((async function* () {
        yield { type: 'system', subtype: 'init', session_id: 'legacy_session' };
        yield {
          type: 'assistant',
          message: { role: 'assistant', content: [{ type: 'text', text: 'Legacy model works' }] },
        };
        yield { type: 'result', subtype: 'success', result: 'Complete' };
      })());

      const config: ClaudeNodeConfig = {
        type: 'claude-agent',
        name: 'Legacy Agent',
        model: 'opus', // Legacy name
        userQuery: 'Test',
      };

      const agent = new ClaudeAgent(config);
      const input: AgentInput = {
        prompt: 'Test legacy model',
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify legacy model name is passed
      const callArgs = mockClaudeQuery.mock.calls[0][0];
      expect(callArgs.options.model).toBe('opus');

      // Verify execution succeeds
      expect(events.some(e => e.type === 'complete')).toBe(true);
      expect(events.some(e => e.type === 'error')).toBe(false);
    });
  });
});

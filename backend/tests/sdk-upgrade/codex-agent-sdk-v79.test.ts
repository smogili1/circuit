/**
 * Codex Agent - SDK v0.79.x Compatibility Tests
 * Tests for SDK v0.79 ThreadEvent format, thread resumption, and item processing
 */

// Mock the Codex SDK before imports
const mockStartThread = jest.fn();
const mockResumeThread = jest.fn();
const mockRunStreamed = jest.fn();

jest.mock('@openai/codex-sdk', () => ({
  Codex: jest.fn().mockImplementation(() => ({
    startThread: mockStartThread,
    resumeThread: mockResumeThread,
  })),
}));

import { CodexAgent } from '../../src/agents/codex';
import { CodexNodeConfig, AgentInput, ExecutionContext } from '../../src/workflows/types';

describe('Codex Agent - SDK v0.79 Compatibility', () => {
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

  describe('SDK v0.79 ThreadEvent format', () => {
    it('should capture thread_id from thread.started event', async () => {
      mockRunStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 'thread_abc123' };
          yield {
            type: 'item.updated',
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
      const events = [];
      for await (const event of agent.execute({ prompt: 'Test' }, mockContext)) {
        events.push(event);
      }

      // Verify thread ID was captured
      expect(agent.getThreadId()).toBe('thread_abc123');
      expect(agent.getSessionId()).toBe('thread_abc123');
    });

    it('should dispatch item events correctly', async () => {
      mockRunStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 'thread_1' };
          yield {
            type: 'item.started',
            item: { id: 'msg_1', type: 'agent_message', text: '' },
          };
          yield {
            type: 'item.updated',
            item: { id: 'msg_1', type: 'agent_message', text: 'Hello' },
          };
          yield {
            type: 'item.completed',
            item: { id: 'msg_1', type: 'agent_message', text: 'Hello World' },
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
      const events = [];
      for await (const event of agent.execute({ prompt: 'Test' }, mockContext)) {
        events.push(event);
      }

      // Verify text deltas are emitted
      const textDeltas = events.filter(e => e.type === 'text-delta');
      expect(textDeltas.length).toBeGreaterThan(0);
    });

    it('should emit complete event on turn.completed', async () => {
      mockRunStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 'thread_1' };
          yield {
            type: 'item.completed',
            item: { id: 'msg_1', type: 'agent_message', text: 'Final response' },
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
      const events = [];
      for await (const event of agent.execute({ prompt: 'Test' }, mockContext)) {
        events.push(event);
      }

      // Verify complete event is emitted
      const completeEvents = events.filter(e => e.type === 'complete');
      expect(completeEvents).toHaveLength(1);
      expect(completeEvents[0].result).toBe('Final response');
    });
  });

  describe('Thread resumption', () => {
    it('should use startThread on first execution', async () => {
      mockRunStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 'thread_new' };
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
      const events = [];
      for await (const event of agent.execute({ prompt: 'First message' }, mockContext)) {
        events.push(event);
      }

      // Verify startThread was used
      expect(mockStartThread).toHaveBeenCalledTimes(1);
      expect(mockResumeThread).not.toHaveBeenCalled();
    });

    it('should use resumeThread when sessionId is provided', async () => {
      mockRunStreamed.mockResolvedValue({
        events: (async function* () {
          yield {
            type: 'item.completed',
            item: { id: 'msg_2', type: 'agent_message', text: 'Resumed response' },
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
        prompt: 'Continue conversation',
        sessionId: 'existing_thread_123',
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify resumeThread was used
      expect(mockResumeThread).toHaveBeenCalledTimes(1);
      expect(mockResumeThread).toHaveBeenCalledWith('existing_thread_123', expect.any(Object));
      expect(mockStartThread).not.toHaveBeenCalled();
    });

    it('should preserve thread state across executions', async () => {
      // First execution
      mockRunStreamed.mockResolvedValueOnce({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 'persistent_thread' };
          yield {
            type: 'item.completed',
            item: { id: 'msg_1', type: 'agent_message', text: 'First response' },
          };
          yield { type: 'turn.completed' };
        })(),
      });

      // Second execution
      mockRunStreamed.mockResolvedValueOnce({
        events: (async function* () {
          yield {
            type: 'item.completed',
            item: { id: 'msg_2', type: 'agent_message', text: 'Second response' },
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

      // First execution
      const events1 = [];
      for await (const event of agent.execute({ prompt: 'First' }, mockContext)) {
        events1.push(event);
      }

      const threadId = agent.getThreadId();
      expect(threadId).toBe('persistent_thread');

      // Second execution with captured thread ID
      const events2 = [];
      for await (const event of agent.execute({ prompt: 'Second', sessionId: threadId }, mockContext)) {
        events2.push(event);
      }

      // Verify resumeThread was called with the captured ID
      expect(mockResumeThread).toHaveBeenCalledWith('persistent_thread', expect.any(Object));
    });
  });

  describe('ThreadItem agent_message processing', () => {
    it('should calculate incremental text deltas', async () => {
      mockRunStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 'thread_1' };
          yield {
            type: 'item.updated',
            item: { id: 'msg_1', type: 'agent_message', text: 'Hello' },
          };
          yield {
            type: 'item.updated',
            item: { id: 'msg_1', type: 'agent_message', text: 'Hello world' },
          };
          yield {
            type: 'item.updated',
            item: { id: 'msg_1', type: 'agent_message', text: 'Hello world!' },
          };
          yield {
            type: 'item.completed',
            item: { id: 'msg_1', type: 'agent_message', text: 'Hello world!' },
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
      const events = [];
      for await (const event of agent.execute({ prompt: 'Test' }, mockContext)) {
        events.push(event);
      }

      // Verify only new text is emitted as deltas
      const textDeltas = events.filter(e => e.type === 'text-delta');
      expect(textDeltas).toHaveLength(4);
      expect(textDeltas[0].content).toBe('Starting Codex agent: Test Agent\n');
      expect(textDeltas[1].content).toBe('Hello');
      expect(textDeltas[2].content).toBe(' world');
      expect(textDeltas[3].content).toBe('!');

      // Verify final response contains full text
      const completeEvents = events.filter(e => e.type === 'complete');
      expect(completeEvents[0].result).toBe('Hello world!');
    });
  });

  describe('ThreadItem reasoning processing', () => {
    it('should emit thinking events for reasoning items on completed state', async () => {
      mockRunStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 'thread_1' };
          yield {
            type: 'item.started',
            item: { id: 'reason_1', type: 'reasoning', text: '' },
          };
          yield {
            type: 'item.completed',
            item: { id: 'reason_1', type: 'reasoning', text: 'Let me analyze this problem...' },
          };
          yield {
            type: 'item.completed',
            item: { id: 'msg_1', type: 'agent_message', text: 'Here is the solution' },
          };
          yield { type: 'turn.completed' };
        })(),
      });

      const config: CodexNodeConfig = {
        type: 'codex-agent',
        name: 'Test Agent',
        model: 'gpt-5.2',
        userQuery: 'Test',
        approvalPolicy: 'never',
        sandbox: 'workspace-write',
      };

      const agent = new CodexAgent(config);
      const events = [];
      for await (const event of agent.execute({ prompt: 'Test' }, mockContext)) {
        events.push(event);
      }

      // Verify thinking event is emitted only on completed state
      const thinkingEvents = events.filter(e => e.type === 'thinking');
      expect(thinkingEvents).toHaveLength(1);
      expect(thinkingEvents[0].content).toBe('Let me analyze this problem...');
    });
  });

  describe('ThreadItem command_execution processing', () => {
    it('should emit tool-use and tool-result events for commands', async () => {
      mockRunStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 'thread_1' };
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
      const events = [];
      for await (const event of agent.execute({ prompt: 'Test' }, mockContext)) {
        events.push(event);
      }

      // Verify tool-use event with command input
      const toolUseEvents = events.filter(e => e.type === 'tool-use');
      expect(toolUseEvents).toHaveLength(1);
      expect(toolUseEvents[0]).toMatchObject({
        type: 'tool-use',
        id: 'cmd_1',
        name: 'Bash',
        input: { command: 'ls -la' },
      });

      // Verify tool-result event with output
      const toolResultEvents = events.filter(e => e.type === 'tool-result');
      expect(toolResultEvents).toHaveLength(1);
      expect(toolResultEvents[0]).toMatchObject({
        type: 'tool-result',
        name: 'cmd_1',
        result: 'file1.txt\nfile2.txt\n',
      });
    });

    it('should append exit code to result if non-zero', async () => {
      mockRunStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 'thread_1' };
          yield {
            type: 'item.completed',
            item: {
              id: 'cmd_2',
              type: 'command_execution',
              command: 'npm test',
              aggregated_output: 'Tests failed',
              exit_code: 1,
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
      const events = [];
      for await (const event of agent.execute({ prompt: 'Test' }, mockContext)) {
        events.push(event);
      }

      // Verify exit code is appended
      const toolResultEvents = events.filter(e => e.type === 'tool-result');
      expect(toolResultEvents).toHaveLength(1);
      expect(toolResultEvents[0].result).toContain('Tests failed');
      expect(toolResultEvents[0].result).toContain('[Exit code: 1]');
    });
  });

  describe('ThreadItem file_change processing', () => {
    it('should emit tool events for file changes', async () => {
      mockRunStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 'thread_1' };
          yield {
            type: 'item.started',
            item: {
              id: 'file_1',
              type: 'file_change',
              changes: [
                { kind: 'create', path: '/test/new.txt' },
                { kind: 'edit', path: '/test/existing.txt' },
              ],
              status: 'in_progress',
            },
          };
          yield {
            type: 'item.completed',
            item: {
              id: 'file_1',
              type: 'file_change',
              changes: [
                { kind: 'create', path: '/test/new.txt' },
                { kind: 'edit', path: '/test/existing.txt' },
              ],
              status: 'completed',
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
      const events = [];
      for await (const event of agent.execute({ prompt: 'Test' }, mockContext)) {
        events.push(event);
      }

      // Verify tool-use event with change descriptions
      const toolUseEvents = events.filter(e => e.type === 'tool-use');
      expect(toolUseEvents).toHaveLength(1);
      expect(toolUseEvents[0].name).toBe('FileChange');
      expect(toolUseEvents[0].input.changes).toContain('create: /test/new.txt');
      expect(toolUseEvents[0].input.changes).toContain('edit: /test/existing.txt');

      // Verify tool-result event with status
      const toolResultEvents = events.filter(e => e.type === 'tool-result');
      expect(toolResultEvents).toHaveLength(1);
      expect(toolResultEvents[0].result).toContain('Success');
      expect(toolResultEvents[0].result).toContain('create: /test/new.txt');
    });
  });

  describe('ThreadItem mcp_tool_call processing', () => {
    it('should emit tool events for MCP tool calls', async () => {
      mockRunStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 'thread_1' };
          yield {
            type: 'item.started',
            item: {
              id: 'mcp_1',
              type: 'mcp_tool_call',
              server: 'filesystem',
              tool: 'read_file',
              arguments: { path: '/test/file.txt' },
            },
          };
          yield {
            type: 'item.completed',
            item: {
              id: 'mcp_1',
              type: 'mcp_tool_call',
              server: 'filesystem',
              tool: 'read_file',
              arguments: { path: '/test/file.txt' },
              result: {
                structured_content: { content: 'File contents here' },
              },
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
      const events = [];
      for await (const event of agent.execute({ prompt: 'Test' }, mockContext)) {
        events.push(event);
      }

      // Verify tool-use event with server:tool name
      const toolUseEvents = events.filter(e => e.type === 'tool-use');
      expect(toolUseEvents).toHaveLength(1);
      expect(toolUseEvents[0]).toMatchObject({
        type: 'tool-use',
        id: 'mcp_1',
        name: 'filesystem:read_file',
        input: { path: '/test/file.txt' },
      });

      // Verify tool-result event with structured content
      const toolResultEvents = events.filter(e => e.type === 'tool-result');
      expect(toolResultEvents).toHaveLength(1);
      expect(toolResultEvents[0].result).toContain('File contents here');
    });

    it('should handle MCP tool errors', async () => {
      mockRunStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 'thread_1' };
          yield {
            type: 'item.completed',
            item: {
              id: 'mcp_2',
              type: 'mcp_tool_call',
              server: 'github',
              tool: 'create_pr',
              arguments: { title: 'Test PR' },
              error: { message: 'Authentication failed' },
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
      const events = [];
      for await (const event of agent.execute({ prompt: 'Test' }, mockContext)) {
        events.push(event);
      }

      // Verify error is included in result
      const toolResultEvents = events.filter(e => e.type === 'tool-result');
      expect(toolResultEvents).toHaveLength(1);
      expect(toolResultEvents[0].result).toContain('Error: Authentication failed');
    });
  });

  describe('ThreadItem web_search processing', () => {
    it('should emit tool events for web search', async () => {
      mockRunStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 'thread_1' };
          yield {
            type: 'item.started',
            item: {
              id: 'search_1',
              type: 'web_search',
              query: 'TypeScript testing best practices',
            },
          };
          yield {
            type: 'item.completed',
            item: {
              id: 'search_1',
              type: 'web_search',
              query: 'TypeScript testing best practices',
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
      const events = [];
      for await (const event of agent.execute({ prompt: 'Test' }, mockContext)) {
        events.push(event);
      }

      // Verify tool-use event with query
      const toolUseEvents = events.filter(e => e.type === 'tool-use');
      expect(toolUseEvents).toHaveLength(1);
      expect(toolUseEvents[0]).toMatchObject({
        type: 'tool-use',
        name: 'WebSearch',
        input: { query: 'TypeScript testing best practices' },
      });

      // Verify tool-result event
      const toolResultEvents = events.filter(e => e.type === 'tool-result');
      expect(toolResultEvents).toHaveLength(1);
      expect(toolResultEvents[0].result).toContain('Search completed');
    });
  });

  describe('ThreadItem todo_list processing', () => {
    it('should emit todo-list events', async () => {
      mockRunStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 'thread_1' };
          yield {
            type: 'item.updated',
            item: {
              id: 'todo_1',
              type: 'todo_list',
              items: [
                { text: 'Write tests', completed: false },
                { text: 'Run tests', completed: false },
                { text: 'Fix bugs', completed: true },
              ],
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
      const events = [];
      for await (const event of agent.execute({ prompt: 'Test' }, mockContext)) {
        events.push(event);
      }

      // Verify todo-list event is emitted
      const todoEvents = events.filter(e => e.type === 'todo-list');
      expect(todoEvents).toHaveLength(1);
      expect(todoEvents[0].items).toHaveLength(3);
      expect(todoEvents[0].items[0]).toMatchObject({
        text: 'Write tests',
        completed: false,
      });
      expect(todoEvents[0].items[2]).toMatchObject({
        text: 'Fix bugs',
        completed: true,
      });
    });

    it('should not emit todo-list event when items array is empty', async () => {
      mockRunStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 'thread_1' };
          yield {
            type: 'item.updated',
            item: {
              id: 'todo_2',
              type: 'todo_list',
              items: [],
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
      const events = [];
      for await (const event of agent.execute({ prompt: 'Test' }, mockContext)) {
        events.push(event);
      }

      // Verify no todo-list event is emitted for empty items
      const todoEvents = events.filter(e => e.type === 'todo-list');
      expect(todoEvents).toHaveLength(0);
    });
  });

  describe('ThreadItem error processing', () => {
    it('should emit error events for error items', async () => {
      mockRunStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 'thread_1' };
          yield {
            type: 'item.completed',
            item: {
              id: 'err_1',
              type: 'error',
              message: 'Failed to execute command',
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
      const events = [];
      for await (const event of agent.execute({ prompt: 'Test' }, mockContext)) {
        events.push(event);
      }

      // Verify error event is emitted
      const errorEvents = events.filter(e => e.type === 'error');
      expect(errorEvents.length).toBeGreaterThan(0);
      expect(errorEvents.some(e => e.message === 'Failed to execute command')).toBe(true);
    });
  });

  describe('Turn failed event handling', () => {
    it('should handle turn.failed event and terminate execution', async () => {
      mockRunStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 'thread_1' };
          yield {
            type: 'turn.failed',
            error: { message: 'Rate limit exceeded' },
          };
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
      const events = [];
      for await (const event of agent.execute({ prompt: 'Test' }, mockContext)) {
        events.push(event);
      }

      // Verify error event is emitted
      const errorEvents = events.filter(e => e.type === 'error');
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].message).toBe('Rate limit exceeded');

      // Verify complete event is NOT emitted
      const completeEvents = events.filter(e => e.type === 'complete');
      expect(completeEvents).toHaveLength(0);
    });
  });

  describe('Abort signal handling', () => {
    it('should pass abort signal to runStreamed', async () => {
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
      const events = [];
      for await (const event of agent.execute({ prompt: 'Test' }, mockContext)) {
        events.push(event);
      }

      // Verify runStreamed was called with signal
      expect(mockRunStreamed).toHaveBeenCalledTimes(1);
      const turnOptions = mockRunStreamed.mock.calls[0][1];
      expect(turnOptions.signal).toBeDefined();
      expect(turnOptions.signal).toBeInstanceOf(AbortSignal);
    });
  });
});

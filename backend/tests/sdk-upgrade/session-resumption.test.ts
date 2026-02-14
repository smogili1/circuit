/**
 * Session Resumption Tests
 * Tests for session/thread resumption in Claude and Codex agents
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

import { ClaudeAgent } from '../../src/agents/claude';
import { CodexAgent } from '../../src/agents/codex';
import { ClaudeNodeConfig, CodexNodeConfig, AgentInput, ExecutionContext } from '../../src/workflows/types';

describe('Session Resumption', () => {
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

  describe('Claude session resumption', () => {
    it('should capture session ID from init message on first execution', async () => {
      mockClaudeQuery.mockReturnValue((async function* () {
        yield { type: 'system', subtype: 'init', session_id: 'session_first_abc' };
        yield {
          type: 'assistant',
          message: { role: 'assistant', content: [{ type: 'text', text: 'First response' }] },
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
        prompt: 'First message',
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify session ID was captured
      expect(agent.getSessionId()).toBe('session_first_abc');

      // Verify no resume parameter was passed
      const callArgs = mockClaudeQuery.mock.calls[0][0];
      expect(callArgs.options.resume).toBeUndefined();
    });

    it('should pass resume parameter when sessionId is provided in input', async () => {
      mockClaudeQuery.mockReturnValue((async function* () {
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
        prompt: 'Continue conversation',
        sessionId: 'existing_session_xyz',
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify resume parameter was passed
      const callArgs = mockClaudeQuery.mock.calls[0][0];
      expect(callArgs.options.resume).toBe('existing_session_xyz');
    });

    it('should maintain conversation context across executions', async () => {
      // First execution
      mockClaudeQuery.mockReturnValueOnce((async function* () {
        yield { type: 'system', subtype: 'init', session_id: 'session_context_123' };
        yield {
          type: 'assistant',
          message: { role: 'assistant', content: [{ type: 'text', text: 'I remember that' }] },
        };
        yield { type: 'result', subtype: 'success', result: 'Complete' };
      })());

      // Second execution
      mockClaudeQuery.mockReturnValueOnce((async function* () {
        yield {
          type: 'assistant',
          message: { role: 'assistant', content: [{ type: 'text', text: 'Continuing from before' }] },
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

      // First execution
      const events1 = [];
      for await (const event of agent.execute({ prompt: 'Remember this: user123' }, mockContext)) {
        events1.push(event);
      }

      const sessionId = agent.getSessionId();
      expect(sessionId).toBe('session_context_123');

      // Second execution with captured session ID
      const events2 = [];
      for await (const event of agent.execute({ prompt: 'What did I tell you?', sessionId }, mockContext)) {
        events2.push(event);
      }

      // Verify both executions completed
      expect(events1.some(e => e.type === 'complete')).toBe(true);
      expect(events2.some(e => e.type === 'complete')).toBe(true);

      // Verify resume was used in second execution
      expect(mockClaudeQuery).toHaveBeenCalledTimes(2);
      const secondCallArgs = mockClaudeQuery.mock.calls[1][0];
      expect(secondCallArgs.options.resume).toBe('session_context_123');
    });

    it('should use agent internal session ID when input sessionId not provided', async () => {
      // First execution
      mockClaudeQuery.mockReturnValueOnce((async function* () {
        yield { type: 'system', subtype: 'init', session_id: 'internal_session_456' };
        yield {
          type: 'assistant',
          message: { role: 'assistant', content: [{ type: 'text', text: 'First' }] },
        };
        yield { type: 'result', subtype: 'success', result: 'Complete' };
      })());

      // Second execution
      mockClaudeQuery.mockReturnValueOnce((async function* () {
        yield {
          type: 'assistant',
          message: { role: 'assistant', content: [{ type: 'text', text: 'Second' }] },
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

      // First execution
      const events1 = [];
      for await (const event of agent.execute({ prompt: 'First' }, mockContext)) {
        events1.push(event);
      }

      // Second execution WITHOUT providing sessionId
      // Agent should use internal session ID
      const events2 = [];
      for await (const event of agent.execute({ prompt: 'Second' }, mockContext)) {
        events2.push(event);
      }

      // Verify internal session ID was used
      const secondCallArgs = mockClaudeQuery.mock.calls[1][0];
      expect(secondCallArgs.options.resume).toBe('internal_session_456');
    });

    it('should override internal session ID when input sessionId is provided', async () => {
      // First execution
      mockClaudeQuery.mockReturnValueOnce((async function* () {
        yield { type: 'system', subtype: 'init', session_id: 'internal_session_111' };
        yield {
          type: 'assistant',
          message: { role: 'assistant', content: [{ type: 'text', text: 'First' }] },
        };
        yield { type: 'result', subtype: 'success', result: 'Complete' };
      })());

      // Second execution
      mockClaudeQuery.mockReturnValueOnce((async function* () {
        yield {
          type: 'assistant',
          message: { role: 'assistant', content: [{ type: 'text', text: 'Different session' }] },
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

      // First execution
      const events1 = [];
      for await (const event of agent.execute({ prompt: 'First' }, mockContext)) {
        events1.push(event);
      }

      // Second execution WITH explicit sessionId (different from internal)
      const events2 = [];
      for await (const event of agent.execute({ prompt: 'Second', sessionId: 'external_session_222' }, mockContext)) {
        events2.push(event);
      }

      // Verify external session ID was used instead of internal
      const secondCallArgs = mockClaudeQuery.mock.calls[1][0];
      expect(secondCallArgs.options.resume).toBe('external_session_222');
    });
  });

  describe('Codex thread resumption', () => {
    it('should capture thread ID from thread.started event on first execution', async () => {
      mockRunStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 'thread_first_xyz' };
          yield {
            type: 'item.completed',
            item: { id: 'msg_1', type: 'agent_message', text: 'First response' },
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
        prompt: 'First message',
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify thread ID was captured
      expect(agent.getThreadId()).toBe('thread_first_xyz');
      expect(agent.getSessionId()).toBe('thread_first_xyz');

      // Verify startThread was used, not resumeThread
      expect(mockStartThread).toHaveBeenCalledTimes(1);
      expect(mockResumeThread).not.toHaveBeenCalled();
    });

    it('should use resumeThread when sessionId is provided in input', async () => {
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
        sessionId: 'existing_thread_abc',
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify resumeThread was called with correct thread ID
      expect(mockResumeThread).toHaveBeenCalledTimes(1);
      expect(mockResumeThread).toHaveBeenCalledWith('existing_thread_abc', expect.any(Object));
      expect(mockStartThread).not.toHaveBeenCalled();
    });

    it('should preserve thread state across executions', async () => {
      // First execution
      mockRunStreamed.mockResolvedValueOnce({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 'thread_persistent_789' };
          yield {
            type: 'item.completed',
            item: { id: 'msg_1', type: 'agent_message', text: 'Stored in context' },
          };
          yield { type: 'turn.completed' };
        })(),
      });

      // Second execution
      mockRunStreamed.mockResolvedValueOnce({
        events: (async function* () {
          yield {
            type: 'item.completed',
            item: { id: 'msg_2', type: 'agent_message', text: 'Retrieved from context' },
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
      for await (const event of agent.execute({ prompt: 'Store: key=value' }, mockContext)) {
        events1.push(event);
      }

      const threadId = agent.getThreadId();
      expect(threadId).toBe('thread_persistent_789');

      // Second execution with captured thread ID
      const events2 = [];
      for await (const event of agent.execute({ prompt: 'Retrieve: key', sessionId: threadId }, mockContext)) {
        events2.push(event);
      }

      // Verify both executions completed
      expect(events1.some(e => e.type === 'complete')).toBe(true);
      expect(events2.some(e => e.type === 'complete')).toBe(true);

      // Verify resumeThread was used in second execution
      expect(mockResumeThread).toHaveBeenCalledWith('thread_persistent_789', expect.any(Object));
    });

    it('should pass thread options to resumeThread', async () => {
      mockRunStreamed.mockResolvedValue({
        events: (async function* () {
          yield {
            type: 'item.completed',
            item: { id: 'msg_1', type: 'agent_message', text: 'Resumed' },
          };
          yield { type: 'turn.completed' };
        })(),
      });

      const config: CodexNodeConfig = {
        type: 'codex-agent',
        name: 'Test Agent',
        model: 'gpt-5.2-codex',
        userQuery: 'Test',
        approvalPolicy: 'on-request',
        sandbox: 'read-only',
        reasoningEffort: 'high',
      };

      const agent = new CodexAgent(config);
      const input: AgentInput = {
        prompt: 'Continue',
        sessionId: 'thread_with_options',
        workingDirectory: '/custom/path',
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify thread options were passed
      expect(mockResumeThread).toHaveBeenCalledWith('thread_with_options', {
        model: 'gpt-5.2-codex',
        sandboxMode: 'read-only',
        approvalPolicy: 'on-request',
        modelReasoningEffort: 'high',
        workingDirectory: '/custom/path',
      });
    });
  });

  describe('Cross-execution session management', () => {
    it('should allow different agents to share session ID', async () => {
      mockClaudeQuery.mockReturnValue((async function* () {
        yield {
          type: 'assistant',
          message: { role: 'assistant', content: [{ type: 'text', text: 'Shared session' }] },
        };
        yield { type: 'result', subtype: 'success', result: 'Complete' };
      })());

      const config1: ClaudeNodeConfig = {
        type: 'claude-agent',
        name: 'Agent 1',
        model: 'sonnet',
        userQuery: 'Test',
      };

      const config2: ClaudeNodeConfig = {
        type: 'claude-agent',
        name: 'Agent 2',
        model: 'opus',
        userQuery: 'Test',
      };

      const agent1 = new ClaudeAgent(config1);
      const agent2 = new ClaudeAgent(config2);

      const sharedSessionId = 'shared_session_456';

      // Execute both agents with same session ID
      const events1 = [];
      for await (const event of agent1.execute({ prompt: 'Test 1', sessionId: sharedSessionId }, mockContext)) {
        events1.push(event);
      }

      const events2 = [];
      for await (const event of agent2.execute({ prompt: 'Test 2', sessionId: sharedSessionId }, mockContext)) {
        events2.push(event);
      }

      // Verify both used the same session ID
      expect(mockClaudeQuery).toHaveBeenCalledTimes(2);
      expect(mockClaudeQuery.mock.calls[0][0].options.resume).toBe(sharedSessionId);
      expect(mockClaudeQuery.mock.calls[1][0].options.resume).toBe(sharedSessionId);
    });
  });
});

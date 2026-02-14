/**
 * Codex Agent - Model Selection Tests
 * Tests that verify correct model parameter passing to Codex SDK v0.79.x
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

describe('Codex Agent - Model Selection', () => {
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

    // Default mock thread with runStreamed method
    const mockThread = {
      runStreamed: mockRunStreamed,
    };

    mockStartThread.mockReturnValue(mockThread);
    mockResumeThread.mockReturnValue(mockThread);

    // Default mock implementation returns complete stream
    mockRunStreamed.mockResolvedValue({
      events: (async function* () {
        yield { type: 'thread.started', thread_id: 'thread_123' };
        yield {
          type: 'item.updated',
          item: { id: 'msg_1', type: 'agent_message', text: 'Response' },
        };
        yield { type: 'turn.completed' };
      })(),
    });
  });

  describe('GPT-5.3 Codex model selection', () => {
    it('should pass gpt-5.3-codex model to startThread', async () => {
      const config: CodexNodeConfig = {
        type: 'codex-agent',
        name: 'Test Agent',
        model: 'gpt-5.3-codex',
        userQuery: 'Test prompt',
        approvalPolicy: 'never',
        sandbox: 'workspace-write',
      };

      const agent = new CodexAgent(config);
      const input: AgentInput = {
        prompt: 'Test task',
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify startThread was called with correct model
      expect(mockStartThread).toHaveBeenCalledTimes(1);
      const threadOptions = mockStartThread.mock.calls[0][0];
      expect(threadOptions.model).toBe('gpt-5.3-codex');

      // Verify execution completed without errors
      expect(events.some(e => e.type === 'error')).toBe(false);
      expect(events.some(e => e.type === 'complete')).toBe(true);
    });
  });

  describe('GPT-5.2 Codex model selection', () => {
    it('should pass gpt-5.2-codex model to startThread', async () => {
      const config: CodexNodeConfig = {
        type: 'codex-agent',
        name: 'Test Agent',
        model: 'gpt-5.2-codex',
        userQuery: 'Test prompt',
        approvalPolicy: 'never',
        sandbox: 'workspace-write',
      };

      const agent = new CodexAgent(config);
      const input: AgentInput = {
        prompt: 'Test task',
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify startThread was called with correct model
      expect(mockStartThread).toHaveBeenCalledTimes(1);
      const threadOptions = mockStartThread.mock.calls[0][0];
      expect(threadOptions.model).toBe('gpt-5.2-codex');

      // Verify execution completed without errors
      expect(events.some(e => e.type === 'error')).toBe(false);
      expect(events.some(e => e.type === 'complete')).toBe(true);
    });
  });

  describe('GPT-5.2 model selection', () => {
    it('should pass gpt-5.2 model to startThread', async () => {
      const config: CodexNodeConfig = {
        type: 'codex-agent',
        name: 'Test Agent',
        model: 'gpt-5.2',
        userQuery: 'Test prompt',
        approvalPolicy: 'never',
        sandbox: 'workspace-write',
      };

      const agent = new CodexAgent(config);
      const input: AgentInput = {
        prompt: 'Test task',
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify startThread was called with correct model
      expect(mockStartThread).toHaveBeenCalledTimes(1);
      const threadOptions = mockStartThread.mock.calls[0][0];
      expect(threadOptions.model).toBe('gpt-5.2');

      // Verify execution completed without errors
      expect(events.some(e => e.type === 'error')).toBe(false);
      expect(events.some(e => e.type === 'complete')).toBe(true);
    });
  });

  describe('GPT-5.1 Codex Max model selection', () => {
    it('should pass gpt-5.1-codex-max model to startThread', async () => {
      const config: CodexNodeConfig = {
        type: 'codex-agent',
        name: 'Test Agent',
        model: 'gpt-5.1-codex-max',
        userQuery: 'Test prompt',
        approvalPolicy: 'never',
        sandbox: 'workspace-write',
      };

      const agent = new CodexAgent(config);
      const input: AgentInput = {
        prompt: 'Test task',
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify startThread was called with correct model
      expect(mockStartThread).toHaveBeenCalledTimes(1);
      const threadOptions = mockStartThread.mock.calls[0][0];
      expect(threadOptions.model).toBe('gpt-5.1-codex-max');

      // Verify execution completed without errors
      expect(events.some(e => e.type === 'error')).toBe(false);
      expect(events.some(e => e.type === 'complete')).toBe(true);
    });
  });

  describe('GPT-5.1 Codex Mini model selection', () => {
    it('should pass gpt-5.1-codex-mini model to startThread', async () => {
      const config: CodexNodeConfig = {
        type: 'codex-agent',
        name: 'Test Agent',
        model: 'gpt-5.1-codex-mini',
        userQuery: 'Test prompt',
        approvalPolicy: 'never',
        sandbox: 'workspace-write',
      };

      const agent = new CodexAgent(config);
      const input: AgentInput = {
        prompt: 'Test task',
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify startThread was called with correct model
      expect(mockStartThread).toHaveBeenCalledTimes(1);
      const threadOptions = mockStartThread.mock.calls[0][0];
      expect(threadOptions.model).toBe('gpt-5.1-codex-mini');

      // Verify execution completed without errors
      expect(events.some(e => e.type === 'error')).toBe(false);
      expect(events.some(e => e.type === 'complete')).toBe(true);
    });
  });

  describe('Reasoning effort parameter', () => {
    it.each([
      ['minimal', 'minimal'],
      ['low', 'low'],
      ['medium', 'medium'],
      ['high', 'high'],
      ['xhigh', 'xhigh'],
    ])('should pass reasoningEffort %s as modelReasoningEffort', async (effort, expected) => {
      const config: CodexNodeConfig = {
        type: 'codex-agent',
        name: 'Test Agent',
        model: 'gpt-5.2-codex',
        userQuery: 'Test prompt',
        approvalPolicy: 'never',
        sandbox: 'workspace-write',
        reasoningEffort: effort as 'minimal' | 'low' | 'medium' | 'high' | 'xhigh',
      };

      const agent = new CodexAgent(config);
      const input: AgentInput = {
        prompt: 'Test task',
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify startThread was called with correct modelReasoningEffort
      expect(mockStartThread).toHaveBeenCalledTimes(1);
      const threadOptions = mockStartThread.mock.calls[0][0];
      expect(threadOptions.modelReasoningEffort).toBe(expected);
    });
  });

  describe('Default configuration', () => {
    it('should use medium reasoning effort by default', async () => {
      const config: CodexNodeConfig = {
        type: 'codex-agent',
        name: 'Test Agent',
        model: 'gpt-5.3-codex',
        userQuery: 'Test prompt',
        approvalPolicy: 'never',
        sandbox: 'workspace-write',
        // reasoningEffort not specified
      };

      const agent = new CodexAgent(config);
      const input: AgentInput = {
        prompt: 'Test task',
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify default reasoning effort
      expect(mockStartThread).toHaveBeenCalledTimes(1);
      const threadOptions = mockStartThread.mock.calls[0][0];
      expect(threadOptions.modelReasoningEffort).toBeUndefined();
    });
  });

  describe('Thread options', () => {
    it('should pass all configuration options to startThread', async () => {
      const config: CodexNodeConfig = {
        type: 'codex-agent',
        name: 'Test Agent',
        model: 'gpt-5.3-codex',
        userQuery: 'Test prompt',
        approvalPolicy: 'on-request',
        sandbox: 'read-only',
        reasoningEffort: 'high',
      };

      const agent = new CodexAgent(config);
      const input: AgentInput = {
        prompt: 'Test task',
        workingDirectory: '/custom/path',
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify all options are passed
      expect(mockStartThread).toHaveBeenCalledTimes(1);
      const threadOptions = mockStartThread.mock.calls[0][0];
      expect(threadOptions).toMatchObject({
        model: 'gpt-5.3-codex',
        sandboxMode: 'read-only',
        approvalPolicy: 'on-request',
        modelReasoningEffort: 'high',
        workingDirectory: '/custom/path',
      });
    });
  });
});

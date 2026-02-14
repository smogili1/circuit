/**
 * Claude Agent - Model Selection Tests
 * Tests that verify correct model parameter passing to Claude SDK v0.2.x
 */

// Mock the Claude Agent SDK before imports
const mockQuery = jest.fn();
jest.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: mockQuery,
}));

import { ClaudeAgent } from '../../src/agents/claude';
import { ClaudeNodeConfig, AgentInput, ExecutionContext } from '../../src/workflows/types';

describe('Claude Agent - Model Selection', () => {
  let mockContext: ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock context
    mockContext = {
      workflowId: 'test-workflow',
      executionId: 'test-exec',
      workingDirectory: '/tmp/test',
      nodeOutputs: new Map(),
      variables: new Map(),
    };

    // Default mock implementation returns a complete stream
    mockQuery.mockReturnValue((async function* () {
      yield { type: 'system', subtype: 'init', session_id: 'test-session' };
      yield { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Response' }] } };
      yield { type: 'result', subtype: 'success', result: 'Complete' };
    })());
  });

  describe('Claude Opus 4.5 model selection', () => {
    it('should pass claude-opus-4-5 model to SDK query function', async () => {
      const config: ClaudeNodeConfig = {
        type: 'claude-agent',
        name: 'Test Agent',
        model: 'claude-opus-4-5',
        userQuery: 'Test prompt',
        tools: ['Read', 'Write'],
      };

      const agent = new ClaudeAgent(config);
      const input: AgentInput = {
        prompt: 'Test task',
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify query was called with correct model
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.options.model).toBe('claude-opus-4-5');

      // Verify execution completed without errors
      expect(events.some(e => e.type === 'error')).toBe(false);
      expect(events.some(e => e.type === 'complete')).toBe(true);

      // Verify stream returns expected AgentEvent objects
      expect(events.some(e => e.type === 'text-delta')).toBe(true);
    });
  });

  describe('Claude Sonnet 4.5 model selection', () => {
    it('should pass claude-sonnet-4-5 model to SDK query function', async () => {
      const config: ClaudeNodeConfig = {
        type: 'claude-agent',
        name: 'Test Agent',
        model: 'claude-sonnet-4-5',
        userQuery: 'Test prompt',
        tools: ['Read', 'Write'],
      };

      const agent = new ClaudeAgent(config);
      const input: AgentInput = {
        prompt: 'Test task',
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify query was called with correct model
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.options.model).toBe('claude-sonnet-4-5');

      // Verify execution completed without errors
      expect(events.some(e => e.type === 'error')).toBe(false);
      expect(events.some(e => e.type === 'complete')).toBe(true);
    });
  });

  describe('Claude Haiku 4.5 model selection', () => {
    it('should pass claude-haiku-4-5 model to SDK query function', async () => {
      const config: ClaudeNodeConfig = {
        type: 'claude-agent',
        name: 'Test Agent',
        model: 'claude-haiku-4-5',
        userQuery: 'Test prompt',
        tools: ['Read', 'Write'],
      };

      const agent = new ClaudeAgent(config);
      const input: AgentInput = {
        prompt: 'Test task',
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify query was called with correct model
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.options.model).toBe('claude-haiku-4-5');

      // Verify execution completed without errors
      expect(events.some(e => e.type === 'error')).toBe(false);
      expect(events.some(e => e.type === 'complete')).toBe(true);
    });
  });

  describe('Legacy model compatibility', () => {
    it.each([
      ['opus', 'opus'],
      ['sonnet', 'sonnet'],
      ['haiku', 'haiku'],
    ])('should support legacy model name: %s', async (legacyModel, expectedModel) => {
      const config: ClaudeNodeConfig = {
        type: 'claude-agent',
        name: 'Test Agent',
        model: legacyModel as 'opus' | 'sonnet' | 'haiku',
        userQuery: 'Test prompt',
        tools: ['Read', 'Write'],
      };

      const agent = new ClaudeAgent(config);
      const input: AgentInput = {
        prompt: 'Test task',
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify query was called with legacy model name
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.options.model).toBe(expectedModel);

      // Verify execution completed without errors
      expect(events.some(e => e.type === 'error')).toBe(false);
      expect(events.some(e => e.type === 'complete')).toBe(true);
    });

    it('should not throw deprecated warnings for legacy models', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const config: ClaudeNodeConfig = {
        type: 'claude-agent',
        name: 'Test Agent',
        model: 'opus',
        userQuery: 'Test prompt',
        tools: ['Read', 'Write'],
      };

      const agent = new ClaudeAgent(config);
      const input: AgentInput = {
        prompt: 'Test task',
      };

      const events = [];
      for await (const event of agent.execute(input, mockContext)) {
        events.push(event);
      }

      // Verify no deprecation warnings
      expect(consoleWarnSpy).not.toHaveBeenCalledWith(expect.stringContaining('deprecated'));

      consoleWarnSpy.mockRestore();
    });
  });
});

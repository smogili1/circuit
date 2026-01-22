/**
 * MCP Integration Tests
 * Tests that MCP server configuration is correctly passed to agent executors
 */

// Mock MCP server manager before imports
const mockServerManager = {
  get: jest.fn(),
  list: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

jest.mock('../src/mcp/server-manager', () => ({
  getMCPServerManager: () => mockServerManager,
  MCPServerManager: jest.fn().mockImplementation(() => mockServerManager),
}));

// Track MCP config passed to agents
let claudeMCPConfig: unknown = null;
let codexMCPConfig: unknown = null;

// Mock the agent modules
jest.mock('../src/agents/claude', () => ({
  ClaudeAgent: jest.fn().mockImplementation((config, mcpConfig) => {
    claudeMCPConfig = mcpConfig;
    return {
      execute: jest.fn().mockImplementation(async function* () {
        yield { type: 'text-delta', content: 'Mock Claude response' };
        yield { type: 'complete', result: 'Mock Claude complete' };
      }),
      interrupt: jest.fn(),
      getStructuredOutput: jest.fn().mockReturnValue(undefined),
      getSessionId: jest.fn().mockReturnValue(undefined),
    };
  }),
}));

jest.mock('../src/agents/codex', () => ({
  CodexAgent: jest.fn().mockImplementation((config, mcpConfig) => {
    codexMCPConfig = mcpConfig;
    return {
      execute: jest.fn().mockImplementation(async function* () {
        yield { type: 'text-delta', content: 'Mock Codex response' };
        yield { type: 'complete', result: 'Mock Codex complete' };
      }),
      interrupt: jest.fn(),
      getStructuredOutput: jest.fn().mockReturnValue(undefined),
      getSessionId: jest.fn().mockReturnValue(undefined),
    };
  }),
}));

import { DAGExecutionEngine } from '../src/orchestrator/engine';
import { Workflow, MCPNodeServerConfig } from '../src/workflows/types';
import { MCPServer } from '../src/mcp/types';
// Ensure executors are registered
import '../src/orchestrator/executors';

describe('MCP Integration', () => {
  // Sample MCP server config
  const mockMCPServer: MCPServer = {
    id: 'test-mcp-server-id',
    name: 'Filesystem',
    transport: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp/test'],
    },
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    claudeMCPConfig = null;
    codexMCPConfig = null;

    // Setup mock server manager to return our test server
    mockServerManager.get.mockImplementation(async (id: string) => {
      if (id === 'test-mcp-server-id') {
        return mockMCPServer;
      }
      return null;
    });
  });

  const createClaudeWorkflowWithMCP = (mcpServers?: MCPNodeServerConfig[]): Workflow => ({
    id: 'workflow-claude-mcp',
    name: 'Claude MCP Workflow',
    nodes: [
      {
        id: 'input-1',
        type: 'input',
        position: { x: 0, y: 0 },
        data: { type: 'input', name: 'Input' },
      },
      {
        id: 'claude-1',
        type: 'claude-agent',
        position: { x: 100, y: 0 },
        data: {
          type: 'claude-agent',
          name: 'Claude with MCP',
          userQuery: 'Test prompt',
          model: 'sonnet',
          tools: ['Read', 'Write'],
          mcpServers,
        },
      },
      {
        id: 'output-1',
        type: 'output',
        position: { x: 200, y: 0 },
        data: { type: 'output', name: 'Output' },
      },
    ],
    edges: [
      { id: 'edge-1', source: 'input-1', target: 'claude-1' },
      { id: 'edge-2', source: 'claude-1', target: 'output-1' },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const createCodexWorkflowWithMCP = (mcpServers?: MCPNodeServerConfig[]): Workflow => ({
    id: 'workflow-codex-mcp',
    name: 'Codex MCP Workflow',
    nodes: [
      {
        id: 'input-1',
        type: 'input',
        position: { x: 0, y: 0 },
        data: { type: 'input', name: 'Input' },
      },
      {
        id: 'codex-1',
        type: 'codex-agent',
        position: { x: 100, y: 0 },
        data: {
          type: 'codex-agent',
          name: 'Codex with MCP',
          userQuery: 'Test prompt',
          model: 'gpt-5.2-codex',
          approvalPolicy: 'never',
          sandbox: 'workspace-write',
          mcpServers,
        },
      },
      {
        id: 'output-1',
        type: 'output',
        position: { x: 200, y: 0 },
        data: { type: 'output', name: 'Output' },
      },
    ],
    edges: [
      { id: 'edge-1', source: 'input-1', target: 'codex-1' },
      { id: 'edge-2', source: 'codex-1', target: 'output-1' },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  describe('Claude Agent MCP Integration', () => {
    it('should pass MCP config to Claude agent when configured', async () => {
      const mcpServers: MCPNodeServerConfig[] = [
        { serverId: 'test-mcp-server-id', enabledTools: '*' },
      ];

      const workflow = createClaudeWorkflowWithMCP(mcpServers);
      const engine = new DAGExecutionEngine(workflow, '/tmp/test');

      await engine.execute('Test input');

      // Verify MCP server manager was called
      expect(mockServerManager.get).toHaveBeenCalledWith('test-mcp-server-id');

      // Verify MCP config was passed to Claude agent
      expect(claudeMCPConfig).toBeDefined();
      expect(claudeMCPConfig).toHaveProperty('mcpServers');

      const config = claudeMCPConfig as { mcpServers: Record<string, unknown> };
      expect(config.mcpServers).toHaveProperty('filesystem');

      const fsConfig = config.mcpServers.filesystem as { command: string; args: string[] };
      expect(fsConfig.command).toBe('npx');
      expect(fsConfig.args).toContain('@modelcontextprotocol/server-filesystem');
    });

    it('should not pass MCP config when no servers configured', async () => {
      const workflow = createClaudeWorkflowWithMCP(undefined);
      const engine = new DAGExecutionEngine(workflow, '/tmp/test');

      await engine.execute('Test input');

      // Verify MCP server manager was not called
      expect(mockServerManager.get).not.toHaveBeenCalled();

      // Verify no MCP config was passed
      expect(claudeMCPConfig).toBeUndefined();
    });

    it('should handle disabled MCP server gracefully', async () => {
      const disabledServer: MCPServer = {
        ...mockMCPServer,
        enabled: false,
      };

      mockServerManager.get.mockResolvedValue(disabledServer);

      const mcpServers: MCPNodeServerConfig[] = [
        { serverId: 'test-mcp-server-id', enabledTools: '*' },
      ];

      const workflow = createClaudeWorkflowWithMCP(mcpServers);
      const engine = new DAGExecutionEngine(workflow, '/tmp/test');

      await engine.execute('Test input');

      // Agent should still execute, but without MCP config
      expect(claudeMCPConfig).toBeUndefined();
    });

    it('should handle non-existent MCP server gracefully', async () => {
      mockServerManager.get.mockResolvedValue(null);

      const mcpServers: MCPNodeServerConfig[] = [
        { serverId: 'non-existent-server', enabledTools: '*' },
      ];

      const workflow = createClaudeWorkflowWithMCP(mcpServers);
      const engine = new DAGExecutionEngine(workflow, '/tmp/test');

      await engine.execute('Test input');

      // Agent should still execute, but without MCP config
      expect(claudeMCPConfig).toBeUndefined();
    });
  });

  describe('Codex Agent MCP Integration', () => {
    it('should pass MCP config to Codex agent when configured', async () => {
      const mcpServers: MCPNodeServerConfig[] = [
        { serverId: 'test-mcp-server-id', enabledTools: '*' },
      ];

      const workflow = createCodexWorkflowWithMCP(mcpServers);
      const engine = new DAGExecutionEngine(workflow, '/tmp/test');

      await engine.execute('Test input');

      // Verify MCP server manager was called
      expect(mockServerManager.get).toHaveBeenCalledWith('test-mcp-server-id');

      // Verify MCP config was passed to Codex agent
      expect(codexMCPConfig).toBeDefined();
      expect(codexMCPConfig).toHaveProperty('mcpServers');

      const config = codexMCPConfig as { mcpServers: Record<string, unknown> };
      expect(config.mcpServers).toHaveProperty('filesystem');

      const fsConfig = config.mcpServers.filesystem as { command: string; args: string[] };
      expect(fsConfig.command).toBe('npx');
      expect(fsConfig.args).toContain('@modelcontextprotocol/server-filesystem');
    });

    it('should not pass MCP config when no servers configured', async () => {
      const workflow = createCodexWorkflowWithMCP(undefined);
      const engine = new DAGExecutionEngine(workflow, '/tmp/test');

      await engine.execute('Test input');

      // Verify MCP server manager was not called
      expect(mockServerManager.get).not.toHaveBeenCalled();

      // Verify no MCP config was passed
      expect(codexMCPConfig).toBeUndefined();
    });
  });

  describe('Parallel Workflow with MCP', () => {
    it('should pass MCP config to both Claude and Codex agents in parallel workflow', async () => {
      const mcpServers: MCPNodeServerConfig[] = [
        { serverId: 'test-mcp-server-id', enabledTools: '*' },
      ];

      const workflow: Workflow = {
        id: 'workflow-parallel-mcp',
        name: 'Parallel MCP Workflow',
        nodes: [
          {
            id: 'input-1',
            type: 'input',
            position: { x: 0, y: 100 },
            data: { type: 'input', name: 'Input' },
          },
          {
            id: 'claude-1',
            type: 'claude-agent',
            position: { x: 150, y: 0 },
            data: {
              type: 'claude-agent',
              name: 'Claude MCP Agent',
              userQuery: 'Test prompt',
              model: 'sonnet',
              tools: ['Read', 'Write'],
              mcpServers,
            },
          },
          {
            id: 'codex-1',
            type: 'codex-agent',
            position: { x: 150, y: 200 },
            data: {
              type: 'codex-agent',
              name: 'Codex MCP Agent',
              userQuery: 'Test prompt',
              model: 'gpt-5.2-codex',
              approvalPolicy: 'never',
              sandbox: 'workspace-write',
              mcpServers,
            },
          },
          {
            id: 'output-1',
            type: 'output',
            position: { x: 300, y: 100 },
            data: { type: 'output', name: 'Output' },
          },
        ],
        edges: [
          { id: 'e1', source: 'input-1', target: 'claude-1' },
          { id: 'e2', source: 'input-1', target: 'codex-1' },
          { id: 'e3', source: 'claude-1', target: 'output-1' },
          { id: 'e4', source: 'codex-1', target: 'output-1' },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const engine = new DAGExecutionEngine(workflow, '/tmp/test');
      await engine.execute('Test parallel MCP');

      // Verify MCP server manager was called twice (once for each agent)
      expect(mockServerManager.get).toHaveBeenCalledTimes(2);
      expect(mockServerManager.get).toHaveBeenCalledWith('test-mcp-server-id');

      // Verify both agents received MCP config
      expect(claudeMCPConfig).toBeDefined();
      expect(codexMCPConfig).toBeDefined();

      // Verify config structure for Claude
      const claudeConfig = claudeMCPConfig as { mcpServers: Record<string, unknown> };
      expect(claudeConfig.mcpServers).toHaveProperty('filesystem');

      // Verify config structure for Codex
      const codexConfig = codexMCPConfig as { mcpServers: Record<string, unknown> };
      expect(codexConfig.mcpServers).toHaveProperty('filesystem');
    });
  });

  describe('Multiple MCP Servers', () => {
    const mockSecondServer: MCPServer = {
      id: 'second-mcp-server-id',
      name: 'GitHub',
      transport: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
      },
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it('should pass multiple MCP servers to agent', async () => {
      mockServerManager.get.mockImplementation(async (id: string) => {
        if (id === 'test-mcp-server-id') return mockMCPServer;
        if (id === 'second-mcp-server-id') return mockSecondServer;
        return null;
      });

      const mcpServers: MCPNodeServerConfig[] = [
        { serverId: 'test-mcp-server-id', enabledTools: '*' },
        { serverId: 'second-mcp-server-id', enabledTools: '*' },
      ];

      const workflow = createClaudeWorkflowWithMCP(mcpServers);
      const engine = new DAGExecutionEngine(workflow, '/tmp/test');

      await engine.execute('Test multiple servers');

      // Verify both servers were fetched
      expect(mockServerManager.get).toHaveBeenCalledTimes(2);
      expect(mockServerManager.get).toHaveBeenCalledWith('test-mcp-server-id');
      expect(mockServerManager.get).toHaveBeenCalledWith('second-mcp-server-id');

      // Verify both servers are in the config
      expect(claudeMCPConfig).toBeDefined();
      const config = claudeMCPConfig as { mcpServers: Record<string, unknown> };
      expect(config.mcpServers).toHaveProperty('filesystem');
      expect(config.mcpServers).toHaveProperty('github');
    });
  });
});

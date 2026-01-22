/**
 * Claude agent node executor.
 * Executes Claude Code agent with streaming output.
 * Supports same-session retry for rejection feedback loops.
 */

import {
  NodeExecutor,
  ExecutionResult,
  ExecutorContext,
  ExecutorEmitter,
} from './types.js';
import {
  WorkflowNode,
  ClaudeNodeConfig,
  AgentEvent,
} from '../../workflows/types.js';
import { ClaudeAgent } from '../../agents/claude.js';
import { getMCPServerManager } from '../../mcp/server-manager.js';
import { MCPConfigConverter, SDKMCPServersConfig } from '../../mcp/config-converter.js';
import { executeAgentNode, ExecutableAgent } from './agent-shared.js';

/**
 * MCP configuration for Claude agent.
 */
interface ClaudeMCPConfig {
  mcpServers: SDKMCPServersConfig;
  env: Record<string, string>;
  allowedToolPatterns: string[];
}

/**
 * Build MCP server configuration for the SDK.
 * Converts our node config to the format expected by Claude Agent SDK.
 */
async function buildMCPConfig(config: ClaudeNodeConfig): Promise<ClaudeMCPConfig | null> {
  if (!config.mcpServers || config.mcpServers.length === 0) {
    return null;
  }

  const serverManager = getMCPServerManager();
  const result: SDKMCPServersConfig = {};
  const allEnv: Record<string, string> = {};
  const allowedToolPatterns: string[] = [];

  for (const nodeServerConfig of config.mcpServers) {
    const server = await serverManager.get(nodeServerConfig.serverId);
    if (!server || !server.enabled) {
      console.warn(`[ClaudeAgentExecutor] MCP server not found or disabled: ${nodeServerConfig.serverId}`);
      continue;
    }

    const sdkConfig = MCPConfigConverter.toSDKFormat(server);

    // Extract env from each server config and merge
    for (const [serverName, serverConf] of Object.entries(sdkConfig)) {
      result[serverName] = serverConf;

      // Extract environment variables from the config
      if (serverConf.env) {
        Object.assign(allEnv, serverConf.env);
      }
    }

    // Generate allowed tool patterns for this server
    const toolPatterns = MCPConfigConverter.generateToolPatterns(
      server.name,
      nodeServerConfig.enabledTools
    );
    allowedToolPatterns.push(...toolPatterns);
  }

  if (Object.keys(result).length === 0) {
    return null;
  }

  return { mcpServers: result, env: allEnv, allowedToolPatterns };
}

/**
 * Handle Claude-specific events (tool-use and tool-result).
 * Returns true if the event was handled.
 */
function handleClaudeEvent(
  event: AgentEvent,
  transcriptParts: string[],
  flushText: () => void
): boolean {
  switch (event.type) {
    case 'tool-use':
      flushText();
      transcriptParts.push(
        `[tool-use:${event.name}]\n${JSON.stringify(event.input, null, 2)}`
      );
      return true;

    case 'tool-result':
      flushText();
      transcriptParts.push(`[tool-result:${event.name}]\n${event.result}`);
      return true;

    default:
      return false;
  }
}

/**
 * Executor for Claude agent nodes.
 * Creates and runs a Claude agent with the configured parameters.
 */
export const claudeAgentExecutor: NodeExecutor = {
  nodeType: 'claude-agent',

  async execute(
    node: WorkflowNode,
    context: ExecutorContext,
    emit: ExecutorEmitter
  ): Promise<ExecutionResult> {
    return executeAgentNode<ClaudeNodeConfig, ClaudeMCPConfig>(node, context, emit, {
      nodeType: 'ClaudeAgent',
      getConfig: (n) => n.data as ClaudeNodeConfig,
      buildMCPConfig,
      createAgent: (config, mcpConfig): ExecutableAgent => new ClaudeAgent(config, mcpConfig),
      interpolateConfig: (config, ctx) => {
        if (config.systemPrompt) {
          return { ...config, systemPrompt: ctx.interpolate(config.systemPrompt) };
        }
        return config;
      },
      handleEvent: handleClaudeEvent,
    });
  },
};

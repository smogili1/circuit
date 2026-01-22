/**
 * Codex agent node executor.
 * Executes OpenAI Codex agent with streaming output.
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
  CodexNodeConfig,
} from '../../workflows/types.js';
import { CodexAgent, CodexMCPConfig } from '../../agents/codex.js';
import { getMCPServerManager } from '../../mcp/server-manager.js';
import { MCPConfigConverter, SDKMCPServersConfig } from '../../mcp/config-converter.js';
import { executeAgentNode, ExecutableAgent } from './agent-shared.js';

/**
 * Build MCP server configuration for the SDK.
 * Converts our node config to the format expected by Codex SDK.
 */
async function buildMCPConfig(config: CodexNodeConfig): Promise<CodexMCPConfig | null> {
  if (!config.mcpServers || config.mcpServers.length === 0) {
    return null;
  }

  const serverManager = getMCPServerManager();
  const result: SDKMCPServersConfig = {};
  const allEnv: Record<string, string> = {};

  for (const nodeServerConfig of config.mcpServers) {
    const server = await serverManager.get(nodeServerConfig.serverId);
    if (!server || !server.enabled) {
      console.warn(`[CodexAgentExecutor] MCP server not found or disabled: ${nodeServerConfig.serverId}`);
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
  }

  if (Object.keys(result).length === 0) {
    return null;
  }

  return { mcpServers: result, env: allEnv };
}

/**
 * Executor for Codex agent nodes.
 * Creates and runs a Codex agent with the configured parameters.
 */
export const codexAgentExecutor: NodeExecutor = {
  nodeType: 'codex-agent',

  async execute(
    node: WorkflowNode,
    context: ExecutorContext,
    emit: ExecutorEmitter
  ): Promise<ExecutionResult> {
    return executeAgentNode<CodexNodeConfig, CodexMCPConfig>(node, context, emit, {
      nodeType: 'CodexAgent',
      getConfig: (n) => n.data as CodexNodeConfig,
      buildMCPConfig,
      createAgent: (config, mcpConfig): ExecutableAgent => new CodexAgent(config, mcpConfig),
      interpolateConfig: (config, ctx) => {
        if (config.baseInstructions) {
          return { ...config, baseInstructions: ctx.interpolate(config.baseInstructions) };
        }
        return config;
      },
      // No agent-specific event handling needed for Codex
    });
  },
};

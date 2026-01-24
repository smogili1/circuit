/**
 * MCP Config Converter
 *
 * Converts our MCP server configurations to the format expected by
 * the Claude Agent SDK. For SSE/HTTP transports, uses mcp-remote
 * as a stdio-to-remote bridge.
 */

import type {
  MCPServer,
  MCPStdioTransport,
  MCPSSETransport,
  MCPHTTPTransport,
  MCPAuthConfig,
  MCPOAuthConfig,
  SDKMCPServerConfig,
  SDKMCPServersConfig,
} from './types.js';

// Re-export SDK types for consumers
export type { SDKMCPServerConfig, SDKMCPServersConfig };

// mcp-remote version to use (pin to avoid security issues)
const MCP_REMOTE_VERSION = '0.1.16';

export class MCPConfigConverter {
  /**
   * Convert multiple MCP server configs to SDK format
   */
  static toSDKServersConfig(servers: MCPServer[]): SDKMCPServersConfig {
    const result: SDKMCPServersConfig = {};

    for (const server of servers) {
      if (!server.enabled) continue;

      const config = this.toSDKFormat(server);
      Object.assign(result, config);
    }

    return result;
  }

  /**
   * Convert a single MCP server config to Claude SDK format.
   * All configs become stdio - SSE/HTTP use mcp-remote as bridge.
   */
  static toSDKFormat(server: MCPServer): SDKMCPServersConfig {
    const sanitizedName = this.sanitizeName(server.name);

    if (server.transport.type === 'stdio') {
      return this.convertStdio(sanitizedName, server.transport);
    } else {
      return this.convertRemote(sanitizedName, server.transport, server.auth);
    }
  }

  /**
   * Convert stdio transport (pass-through)
   */
  private static convertStdio(
    name: string,
    transport: MCPStdioTransport
  ): SDKMCPServersConfig {
    return {
      [name]: {
        command: transport.command,
        args: transport.args,
        env: transport.env,
      },
    };
  }

  /**
   * Convert remote (SSE/HTTP) transport via mcp-remote
   */
  private static convertRemote(
    name: string,
    transport: MCPSSETransport | MCPHTTPTransport,
    auth?: MCPAuthConfig
  ): SDKMCPServersConfig {
    const args: string[] = [
      `mcp-remote@^${MCP_REMOTE_VERSION}`,
      transport.url,
      '--transport',
      transport.type === 'sse' ? 'sse-only' : 'http-only',
    ];

    const env: Record<string, string> = {};

    // Add auth headers
    const headers = this.resolveAuthHeaders(auth);
    let headerIndex = 0;
    for (const [headerName, headerValue] of headers) {
      // Use environment variables to avoid exposing secrets in args
      // Note: mcp-remote requires no space around colon due to parsing bugs
      const envKey = `MCP_HDR_${name}_${headerIndex}`;
      args.push('--header', `${headerName}:\${${envKey}}`);
      env[envKey] = headerValue;
      headerIndex++;
    }

    return {
      [name]: {
        command: 'npx',
        args,
        env: Object.keys(env).length > 0 ? env : undefined,
      },
    };
  }

  /**
   * Resolve authentication config to HTTP headers
   */
  private static resolveAuthHeaders(auth?: MCPAuthConfig): Map<string, string> {
    const headers = new Map<string, string>();

    if (!auth || auth.type === 'none') {
      return headers;
    }

    switch (auth.type) {
      case 'api-key': {
        const headerName = auth.headerName || 'Authorization';
        const prefix = auth.prefix ?? 'Bearer ';
        headers.set(headerName, `${prefix}${auth.key}`);
        break;
      }

      case 'headers': {
        for (const [key, value] of Object.entries(auth.headers)) {
          headers.set(key, value);
        }
        break;
      }

      case 'oauth': {
        // OAuth tokens should be decrypted before calling this
        if (auth.accessToken) {
          headers.set('Authorization', `Bearer ${auth.accessToken}`);
        }
        break;
      }
    }

    return headers;
  }

  /**
   * Sanitize server name for use as SDK config key
   */
  static sanitizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Generate allowed tools pattern for a server
   */
  static generateToolPatterns(
    serverName: string,
    enabledTools: string[] | '*'
  ): string[] {
    const sanitizedName = this.sanitizeName(serverName);

    if (enabledTools === '*') {
      // Wildcard pattern to allow all tools from this server
      return [`mcp__${sanitizedName}__*`];
    }

    // Specific tools
    return enabledTools.map(tool => `mcp__${sanitizedName}__${tool}`);
  }

  /**
   * Get the full tool name as it will appear in the SDK
   */
  static getFullToolName(serverName: string, toolName: string): string {
    const sanitizedName = this.sanitizeName(serverName);
    return `mcp__${sanitizedName}__${toolName}`;
  }
}

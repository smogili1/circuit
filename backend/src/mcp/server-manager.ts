/**
 * MCP Server Manager
 *
 * Manages MCP server configurations with YAML persistence.
 * Handles CRUD operations for MCP servers.
 */

import { v4 as uuidv4 } from 'uuid';
import yaml from 'js-yaml';
import { promises as fs } from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import {
  MCPServer,
  MCPServersFile,
  CreateMCPServerInput,
  UpdateMCPServerInput,
  MCPToolDefinition,
  ConnectionTestResult,
  MCPServerResponse,
  MCPAuthResponseConfig,
  MCPOAuthConfig,
  MCPStdioTransport,
} from './types.js';

// Directory for storing MCP config (in top-level data/ folder)
const MCP_CONFIG_DIR = process.env.MCP_CONFIG_DIR || path.join(process.cwd(), '..', 'data');
const MCP_SERVERS_FILE = 'mcp-servers.yaml';

export class MCPServerManager {
  private servers: Map<string, MCPServer> = new Map();
  private configPath: string;
  private initialized = false;

  constructor(configDir?: string) {
    const dir = configDir || MCP_CONFIG_DIR;
    this.configPath = path.join(dir, MCP_SERVERS_FILE);
  }

  /**
   * Initialize the manager by loading from disk
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.ensureConfigDir();
    await this.loadFromDisk();
    this.initialized = true;
  }

  /**
   * Ensure config directory exists
   */
  private async ensureConfigDir(): Promise<void> {
    const dir = path.dirname(this.configPath);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch {
      // Directory might already exist
    }
  }

  /**
   * Load servers from disk
   */
  private async loadFromDisk(): Promise<void> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      const data = yaml.load(content) as MCPServersFile;

      if (data?.servers) {
        for (const server of data.servers) {
          this.servers.set(server.id, server);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('Failed to load MCP servers:', error);
      }
      // File doesn't exist yet, that's ok
    }
  }

  /**
   * Save servers to disk
   */
  private async saveToDisk(): Promise<void> {
    await this.ensureConfigDir();

    const data: MCPServersFile = {
      servers: Array.from(this.servers.values()),
    };

    const yamlContent = yaml.dump(data, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
    });

    await fs.writeFile(this.configPath, yamlContent, 'utf-8');
  }

  /**
   * List all servers
   */
  async list(): Promise<MCPServer[]> {
    await this.initialize();
    return Array.from(this.servers.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  /**
   * Get server by ID
   */
  async get(id: string): Promise<MCPServer | null> {
    await this.initialize();
    return this.servers.get(id) || null;
  }

  /**
   * Create a new server
   */
  async create(input: CreateMCPServerInput): Promise<MCPServer> {
    await this.initialize();

    const now = new Date().toISOString();
    const server: MCPServer = {
      id: uuidv4(),
      name: input.name,
      description: input.description,
      transport: input.transport,
      auth: input.auth || { type: 'none' },
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    };

    this.servers.set(server.id, server);
    await this.saveToDisk();

    return server;
  }

  /**
   * Update a server
   */
  async update(id: string, updates: UpdateMCPServerInput): Promise<MCPServer | null> {
    await this.initialize();

    const server = this.servers.get(id);
    if (!server) return null;

    const updated: MCPServer = {
      ...server,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.servers.set(id, updated);
    await this.saveToDisk();

    return updated;
  }

  /**
   * Delete a server
   */
  async delete(id: string): Promise<boolean> {
    await this.initialize();

    const deleted = this.servers.delete(id);
    if (deleted) {
      await this.saveToDisk();
    }

    return deleted;
  }

  /**
   * Update server tools after discovery
   */
  async updateTools(id: string, tools: MCPToolDefinition[]): Promise<MCPServer | null> {
    return this.update(id, {
      tools,
      lastDiscoveredAt: new Date().toISOString(),
    });
  }

  /**
   * Convert server to API response format (redact secrets)
   */
  toResponse(server: MCPServer): MCPServerResponse {
    const { auth, ...rest } = server;

    let authResponse: MCPAuthResponseConfig | undefined;

    if (auth) {
      switch (auth.type) {
        case 'none':
          authResponse = { type: 'none' };
          break;
        case 'api-key':
          authResponse = {
            type: 'api-key',
            headerName: auth.headerName,
            prefix: auth.prefix,
          };
          break;
        case 'headers':
          // Redact header values
          authResponse = {
            type: 'headers',
            headers: Object.fromEntries(
              Object.keys(auth.headers).map(k => [k, '***'])
            ),
          };
          break;
        case 'oauth':
          authResponse = {
            type: 'oauth',
            clientId: auth.clientId,
            authorizationUrl: auth.authorizationUrl,
            tokenUrl: auth.tokenUrl,
            scopes: auth.scopes,
            connected: !!auth.accessToken,
            expiresAt: auth.expiresAt,
          };
          break;
      }
    }

    return {
      ...rest,
      auth: authResponse,
    };
  }

  /**
   * Test connection to an MCP server
   * This is a placeholder - actual implementation will spawn the process
   * or connect via mcp-remote and list tools
   */
  async testConnection(id: string): Promise<ConnectionTestResult> {
    const server = await this.get(id);
    if (!server) {
      return { success: false, error: 'Server not found' };
    }

    // TODO: Implement actual connection test
    // For now, return a placeholder success
    return {
      success: true,
      serverInfo: {
        name: server.name,
        version: '1.0.0',
      },
      toolCount: server.tools?.length || 0,
    };
  }

  /**
   * Discover tools from an MCP server by connecting and calling tools/list
   */
  async discoverTools(id: string): Promise<MCPToolDefinition[]> {
    const server = await this.get(id);
    if (!server) {
      throw new Error('Server not found');
    }

    let tools: MCPToolDefinition[] = [];

    if (server.transport.type === 'stdio') {
      tools = await this.discoverToolsStdio(server.transport);
    } else {
      // SSE/HTTP transport - use mcp-remote bridge
      tools = await this.discoverToolsRemote(server);
    }

    // Update server with discovered tools
    await this.updateTools(id, tools);

    return tools;
  }

  /**
   * Discover tools from a stdio MCP server
   */
  private async discoverToolsStdio(transport: MCPStdioTransport): Promise<MCPToolDefinition[]> {
    return new Promise((resolve, reject) => {
      const timeout = 30000; // 30 second timeout
      let childProcess: ChildProcess | null = null;
      let buffer = '';
      let initialized = false;
      let messageId = 1;
      let timeoutHandle: NodeJS.Timeout;

      const cleanup = () => {
        clearTimeout(timeoutHandle);
        if (childProcess && !childProcess.killed) {
          childProcess.kill();
        }
      };

      timeoutHandle = setTimeout(() => {
        cleanup();
        reject(new Error('Tool discovery timed out'));
      }, timeout);

      try {
        childProcess = spawn(transport.command, transport.args, {
          env: { ...globalThis.process.env, ...transport.env },
          cwd: transport.cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        const sendMessage = (method: string, params?: Record<string, unknown>) => {
          const message = {
            jsonrpc: '2.0',
            id: messageId++,
            method,
            params: params || {},
          };
          childProcess!.stdin!.write(JSON.stringify(message) + '\n');
        };

        childProcess.stdout!.on('data', (data: Buffer) => {
          buffer += data.toString();

          // Process complete JSON-RPC messages (newline-delimited)
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.trim()) continue;

            try {
              const message = JSON.parse(line);

              // Handle initialize response
              if (message.id === 1 && !initialized) {
                initialized = true;
                // Now request tools list
                sendMessage('tools/list');
              }

              // Handle tools/list response
              if (message.id === 2 && message.result) {
                const tools: MCPToolDefinition[] = (message.result.tools || []).map(
                  (tool: { name: string; description?: string; inputSchema?: Record<string, unknown> }) => ({
                    name: tool.name,
                    description: tool.description,
                    inputSchema: tool.inputSchema || {},
                  })
                );
                cleanup();
                resolve(tools);
              }

              // Handle errors
              if (message.error) {
                cleanup();
                reject(new Error(message.error.message || 'MCP error'));
              }
            } catch {
              // Ignore parse errors for incomplete messages
            }
          }
        });

        childProcess.stderr!.on('data', (data: Buffer) => {
          console.error('[MCP stderr]', data.toString());
        });

        childProcess.on('error', (err) => {
          cleanup();
          reject(new Error(`Failed to spawn MCP server: ${err.message}`));
        });

        childProcess.on('close', (code) => {
          if (code !== 0 && code !== null) {
            cleanup();
            reject(new Error(`MCP server exited with code ${code}`));
          }
        });

        // Send initialize request
        sendMessage('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'circuit',
            version: '1.0.0',
          },
        });
      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  }

  /**
   * Discover tools from SSE/HTTP MCP server using mcp-remote bridge
   */
  private async discoverToolsRemote(server: MCPServer): Promise<MCPToolDefinition[]> {
    // For SSE/HTTP, use mcp-remote as a bridge
    const transport = server.transport;
    if (transport.type === 'stdio') {
      throw new Error('Use discoverToolsStdio for stdio transport');
    }

    const args = ['-y', 'mcp-remote@0.1.16', transport.url];

    // Add auth headers if needed
    if (server.auth?.type === 'api-key') {
      const headerName = server.auth.headerName || 'Authorization';
      const prefix = server.auth.prefix || 'Bearer ';
      args.push('--header', `${headerName}: ${prefix}${server.auth.key}`);
    }

    return this.discoverToolsStdio({
      type: 'stdio',
      command: 'npx',
      args,
    });
  }
}

// Singleton instance
let instance: MCPServerManager | null = null;

export function getMCPServerManager(): MCPServerManager {
  if (!instance) {
    instance = new MCPServerManager();
  }
  return instance;
}

export async function initializeMCPServerManager(): Promise<MCPServerManager> {
  const manager = getMCPServerManager();
  await manager.initialize();
  return manager;
}

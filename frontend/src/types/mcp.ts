/**
 * MCP Server Types (Frontend)
 */

// ============================================================================
// Transport Configuration
// ============================================================================

export interface MCPStdioTransport {
  type: 'stdio';
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface MCPSSETransport {
  type: 'sse';
  url: string;
}

export interface MCPHTTPTransport {
  type: 'http';
  url: string;
}

export type MCPTransportConfig = MCPStdioTransport | MCPSSETransport | MCPHTTPTransport;

// ============================================================================
// Authentication Configuration
// ============================================================================

export interface MCPNoAuth {
  type: 'none';
}

export interface MCPApiKeyAuth {
  type: 'api-key';
  key?: string;  // Only present when creating/updating
  headerName?: string;
  prefix?: string;
}

export interface MCPHeaderAuth {
  type: 'headers';
  headers: Record<string, string>;
}

export interface MCPOAuthConfig {
  type: 'oauth';
  clientId: string;
  clientSecret?: string;  // Only present when creating/updating
  authorizationUrl: string;
  tokenUrl: string;
  scopes?: string[];
  // Response-only fields
  connected?: boolean;
  expiresAt?: string;
}

export type MCPAuthConfig = MCPNoAuth | MCPApiKeyAuth | MCPHeaderAuth | MCPOAuthConfig;

// ============================================================================
// Tool Definitions
// ============================================================================

export interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

// ============================================================================
// MCP Server (API Response)
// ============================================================================

export interface MCPServer {
  id: string;
  name: string;
  description?: string;
  transport: MCPTransportConfig;
  auth?: MCPAuthConfig;
  enabled: boolean;
  tools?: MCPToolDefinition[];
  lastDiscoveredAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// API Request Types
// ============================================================================

export interface CreateMCPServerInput {
  name: string;
  description?: string;
  transport: MCPTransportConfig;
  auth?: MCPAuthConfig;
  enabled?: boolean;
}

export interface UpdateMCPServerInput {
  name?: string;
  description?: string;
  transport?: MCPTransportConfig;
  auth?: MCPAuthConfig;
  enabled?: boolean;
}

// ============================================================================
// Node Configuration
// ============================================================================

export interface MCPNodeServerConfig {
  serverId: string;
  enabledTools: string[] | '*';
}

// ============================================================================
// Connection Test Result
// ============================================================================

export interface ConnectionTestResult {
  success: boolean;
  serverInfo?: {
    name: string;
    version: string;
  };
  toolCount?: number;
  error?: string;
}

// ============================================================================
// Tool Discovery Result
// ============================================================================

export interface ToolDiscoveryResult {
  serverId: string;
  tools: MCPToolDefinition[];
  discoveredAt: string;
}

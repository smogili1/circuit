/**
 * MCP Server Types
 *
 * Data models for MCP server configuration, authentication,
 * and tool definitions.
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
  key: string;
  headerName?: string;  // Default: "Authorization"
  prefix?: string;      // Default: "Bearer "
}

export interface MCPHeaderAuth {
  type: 'headers';
  headers: Record<string, string>;
}

export interface MCPOAuthConfig {
  type: 'oauth';
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  scopes?: string[];
  // Runtime state (managed by our app)
  accessToken?: string;
  refreshToken?: string;
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
// MCP Server
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
  tools?: MCPToolDefinition[];
  lastDiscoveredAt?: string;
}

// ============================================================================
// Node Configuration
// ============================================================================

export interface MCPNodeServerConfig {
  serverId: string;
  enabledTools: string[] | '*';
}

// ============================================================================
// SDK Format (output of MCPConfigConverter)
// ============================================================================

export interface SDKMCPServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export type SDKMCPServersConfig = Record<string, SDKMCPServerConfig>;

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
// OAuth Types
// ============================================================================

export interface PendingOAuthState {
  serverId: string;
  createdAt: number;
  expiresAt: number;
}

export interface AuthorizationUrlResult {
  authorizationUrl: string;
  state: string;
}

export interface OAuthCallbackResult {
  success: boolean;
  connected: boolean;
  expiresAt?: string;
  error?: string;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface MCPServerResponse extends Omit<MCPServer, 'auth'> {
  auth?: MCPAuthResponseConfig;
}

// Auth config for API responses (secrets redacted)
export type MCPAuthResponseConfig =
  | MCPNoAuth
  | { type: 'api-key'; headerName?: string; prefix?: string }
  | { type: 'headers'; headers: Record<string, string> }
  | { type: 'oauth'; clientId: string; authorizationUrl: string; tokenUrl: string; scopes?: string[]; connected: boolean; expiresAt?: string };

// ============================================================================
// Storage Format
// ============================================================================

export interface MCPServersFile {
  servers: MCPServer[];
}

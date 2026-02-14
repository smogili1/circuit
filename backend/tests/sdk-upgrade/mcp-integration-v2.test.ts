/**
 * MCP Integration Tests for SDK v0.2.x and v0.79.x
 * Tests MCP config conversion and integration with both Claude and Codex agents
 */

import { MCPConfigConverter } from '../../src/mcp/config-converter';
import { MCPServer, SDKMCPServerConfig, SDKMCPServersConfig } from '../../src/mcp/types';

describe('MCP Integration - SDK Compatibility', () => {
  describe('MCP Config Converter - SDK format compatibility', () => {
    it('should convert stdio transport to SDK v0.2.x format', () => {
      const server: MCPServer = {
        id: 'test-server',
        name: 'Filesystem',
        transport: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
          env: { NODE_ENV: 'production' },
        },
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = MCPConfigConverter.toSDKFormat(server);

      // Verify output format
      expect(result).toHaveProperty('filesystem');
      const config = result.filesystem as SDKMCPServerConfig;

      // Verify fields match SDK expectations
      expect(config.type).toBe('stdio');
      expect(config.command).toBe('npx');
      expect(config.args).toEqual(['-y', '@modelcontextprotocol/server-filesystem', '/tmp']);
      expect(config.env).toEqual({ NODE_ENV: 'production' });
    });

    it('should convert SSE transport to mcp-remote format', () => {
      const server: MCPServer = {
        id: 'test-sse',
        name: 'Remote SSE Server',
        transport: {
          type: 'sse',
          url: 'https://example.com/mcp',
        },
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = MCPConfigConverter.toSDKFormat(server);

      expect(result).toHaveProperty('remote-sse-server');
      const config = result['remote-sse-server'] as SDKMCPServerConfig;

      // Verify it uses npx with mcp-remote
      expect(config.type).toBe('stdio');
      expect(config.command).toBe('npx');
      expect(config.args[0]).toMatch(/^mcp-remote@/);
      expect(config.args).toContain('https://example.com/mcp');
      expect(config.args).toContain('--transport');
      expect(config.args).toContain('sse-only');
    });

    it('should convert HTTP transport to mcp-remote format', () => {
      const server: MCPServer = {
        id: 'test-http',
        name: 'Remote HTTP Server',
        transport: {
          type: 'http',
          url: 'https://api.example.com/mcp',
        },
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = MCPConfigConverter.toSDKFormat(server);

      expect(result).toHaveProperty('remote-http-server');
      const config = result['remote-http-server'] as SDKMCPServerConfig;

      expect(config.type).toBe('stdio');
      expect(config.command).toBe('npx');
      expect(config.args).toContain('--transport');
      expect(config.args).toContain('http-only');
    });

    it('should handle stdio servers with no env', () => {
      const server: MCPServer = {
        id: 'test-no-env',
        name: 'Simple Server',
        transport: {
          type: 'stdio',
          command: 'node',
          args: ['server.js'],
          // No env specified
        },
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = MCPConfigConverter.toSDKFormat(server);

      expect(result).toHaveProperty('simple-server');
      const config = result['simple-server'] as SDKMCPServerConfig;

      expect(config.command).toBe('node');
      expect(config.args).toEqual(['server.js']);
      expect(config.env).toBeUndefined();
    });
  });

  describe('Remote transport auth headers', () => {
    it('should convert api-key auth to header environment variables', () => {
      const server: MCPServer = {
        id: 'test-auth',
        name: 'Authenticated Server',
        transport: {
          type: 'sse',
          url: 'https://secure.example.com/mcp',
        },
        auth: {
          type: 'api-key',
          key: 'secret-key-123',
          headerName: 'X-API-Key',
        },
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = MCPConfigConverter.toSDKFormat(server);

      const config = result['authenticated-server'] as SDKMCPServerConfig;

      // Verify auth header is passed via --header argument
      expect(config.args).toContain('--header');
      const headerArgIndex = config.args.indexOf('--header');
      const headerValue = config.args[headerArgIndex + 1];

      // Header format should be 'Name:${ENV_VAR}' (no space around colon)
      expect(headerValue).toMatch(/^X-API-Key:\$\{MCP_HDR_/);

      // Verify secret is in env variables
      expect(config.env).toBeDefined();
      const envKeys = Object.keys(config.env!);
      expect(envKeys.length).toBeGreaterThan(0);

      // Verify the env variable contains the secret
      const envValues = Object.values(config.env!);
      expect(envValues).toContain('Bearer secret-key-123');
    });

    it('should handle custom auth prefix', () => {
      const server: MCPServer = {
        id: 'test-custom-prefix',
        name: 'Custom Auth Server',
        transport: {
          type: 'sse',
          url: 'https://example.com/mcp',
        },
        auth: {
          type: 'api-key',
          key: 'token-abc',
          headerName: 'Authorization',
          prefix: 'Token ',
        },
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = MCPConfigConverter.toSDKFormat(server);

      const config = result['custom-auth-server'] as SDKMCPServerConfig;

      // Verify the env variable has the custom prefix
      const envValues = Object.values(config.env!);
      expect(envValues).toContain('Token token-abc');
    });

    it('should handle headers auth type', () => {
      const server: MCPServer = {
        id: 'test-headers',
        name: 'Multi Header Server',
        transport: {
          type: 'sse',
          url: 'https://example.com/mcp',
        },
        auth: {
          type: 'headers',
          headers: {
            'X-API-Key': 'key123',
            'X-User-ID': 'user456',
          },
        },
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = MCPConfigConverter.toSDKFormat(server);

      const config = result['multi-header-server'] as SDKMCPServerConfig;

      // Verify multiple --header arguments
      const headerCount = config.args.filter(arg => arg === '--header').length;
      expect(headerCount).toBe(2);

      // Verify env variables contain the header values
      const envValues = Object.values(config.env!);
      expect(envValues).toContain('key123');
      expect(envValues).toContain('user456');
    });

    it('should handle OAuth with access token', () => {
      const server: MCPServer = {
        id: 'test-oauth',
        name: 'OAuth Server',
        transport: {
          type: 'sse',
          url: 'https://oauth.example.com/mcp',
        },
        auth: {
          type: 'oauth',
          clientId: 'client-id',
          clientSecret: 'client-secret',
          authorizationUrl: 'https://oauth.example.com/authorize',
          tokenUrl: 'https://oauth.example.com/token',
          accessToken: 'access-token-xyz',
        },
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = MCPConfigConverter.toSDKFormat(server);

      const config = result['oauth-server'] as SDKMCPServerConfig;

      // Verify OAuth token is passed as Bearer token
      const envValues = Object.values(config.env!);
      expect(envValues).toContain('Bearer access-token-xyz');
    });

    it('should not add headers for no-auth type', () => {
      const server: MCPServer = {
        id: 'test-no-auth',
        name: 'Public Server',
        transport: {
          type: 'sse',
          url: 'https://public.example.com/mcp',
        },
        auth: {
          type: 'none',
        },
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = MCPConfigConverter.toSDKFormat(server);

      const config = result['public-server'] as SDKMCPServerConfig;

      // Verify no --header arguments
      expect(config.args).not.toContain('--header');

      // Verify env is undefined or empty
      expect(config.env).toBeUndefined();
    });

    it('should format headers without space around colon', () => {
      const server: MCPServer = {
        id: 'test-format',
        name: 'Format Test',
        transport: {
          type: 'sse',
          url: 'https://example.com/mcp',
        },
        auth: {
          type: 'api-key',
          key: 'test-key',
          headerName: 'X-Test',
        },
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = MCPConfigConverter.toSDKFormat(server);

      const config = result['format-test'] as SDKMCPServerConfig;

      const headerArgIndex = config.args.indexOf('--header');
      const headerValue = config.args[headerArgIndex + 1];

      // Verify no space around colon (required by mcp-remote)
      expect(headerValue).toMatch(/^X-Test:\$\{MCP_HDR_/);
      expect(headerValue).not.toContain(': ');
    });
  });

  describe('Multiple servers conversion', () => {
    it('should convert multiple servers to SDK format', () => {
      const servers: MCPServer[] = [
        {
          id: 'server-1',
          name: 'Filesystem',
          transport: {
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
          },
          enabled: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'server-2',
          name: 'GitHub',
          transport: {
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
          },
          enabled: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const result = MCPConfigConverter.toSDKServersConfig(servers);

      // Verify both servers are in the config
      expect(result).toHaveProperty('filesystem');
      expect(result).toHaveProperty('github');
      expect(Object.keys(result)).toHaveLength(2);
    });

    it('should skip disabled servers', () => {
      const servers: MCPServer[] = [
        {
          id: 'server-enabled',
          name: 'Enabled Server',
          transport: {
            type: 'stdio',
            command: 'node',
            args: ['server.js'],
          },
          enabled: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'server-disabled',
          name: 'Disabled Server',
          transport: {
            type: 'stdio',
            command: 'node',
            args: ['disabled.js'],
          },
          enabled: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const result = MCPConfigConverter.toSDKServersConfig(servers);

      // Verify only enabled server is included
      expect(result).toHaveProperty('enabled-server');
      expect(result).not.toHaveProperty('disabled-server');
      expect(Object.keys(result)).toHaveLength(1);
    });
  });

  describe('Server name sanitization', () => {
    it('should sanitize server names for SDK keys', () => {
      expect(MCPConfigConverter.sanitizeName('My Server')).toBe('my-server');
      expect(MCPConfigConverter.sanitizeName('Server_Name')).toBe('server-name');
      expect(MCPConfigConverter.sanitizeName('Server@123')).toBe('server-123');
      expect(MCPConfigConverter.sanitizeName('--server--')).toBe('server');
      expect(MCPConfigConverter.sanitizeName('CamelCaseServer')).toBe('camelcaseserver');
    });
  });

  describe('Tool patterns generation', () => {
    it('should generate wildcard pattern for all tools', () => {
      const patterns = MCPConfigConverter.generateToolPatterns('Filesystem', '*');

      expect(patterns).toHaveLength(1);
      expect(patterns[0]).toBe('mcp__filesystem__*');
    });

    it('should generate specific tool patterns', () => {
      const patterns = MCPConfigConverter.generateToolPatterns('GitHub', ['create_pr', 'list_repos']);

      expect(patterns).toHaveLength(2);
      expect(patterns).toContain('mcp__github__create_pr');
      expect(patterns).toContain('mcp__github__list_repos');
    });

    it('should sanitize server name in tool patterns', () => {
      const patterns = MCPConfigConverter.generateToolPatterns('My Server', ['read_file']);

      expect(patterns).toHaveLength(1);
      expect(patterns[0]).toBe('mcp__my-server__read_file');
    });
  });

  describe('Full tool name generation', () => {
    it('should generate full tool name with server prefix', () => {
      const fullName = MCPConfigConverter.getFullToolName('Filesystem', 'read_file');

      expect(fullName).toBe('mcp__filesystem__read_file');
    });

    it('should sanitize server name in full tool name', () => {
      const fullName = MCPConfigConverter.getFullToolName('My Custom Server', 'do_action');

      expect(fullName).toBe('mcp__my-custom-server__do_action');
    });
  });

  describe('SDKMCPServerConfig type compatibility', () => {
    it('should match SDK v0.2.x expectations', () => {
      const config: SDKMCPServerConfig = {
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'mcp-server'],
        env: { KEY: 'value' },
      };

      // Verify all required fields are present
      expect(config.command).toBeDefined();
      expect(config.args).toBeDefined();

      // Verify optional fields
      expect(config.type).toBe('stdio');
      expect(config.env).toBeDefined();
    });

    it('should allow env to be optional', () => {
      const config: SDKMCPServerConfig = {
        command: 'node',
        args: ['server.js'],
        // env is optional
      };

      expect(config.env).toBeUndefined();
    });

    it('should allow type to be optional', () => {
      const config: SDKMCPServerConfig = {
        command: 'node',
        args: ['server.js'],
        // type is optional
      };

      expect(config.type).toBeUndefined();
    });
  });

  describe('Environment variable uniqueness', () => {
    it('should generate unique env variable names for same server with multiple headers', () => {
      const server: MCPServer = {
        id: 'test-multi-env',
        name: 'Multi Env',
        transport: {
          type: 'sse',
          url: 'https://example.com/mcp',
        },
        auth: {
          type: 'headers',
          headers: {
            'Header-1': 'value1',
            'Header-2': 'value2',
            'Header-3': 'value3',
          },
        },
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = MCPConfigConverter.toSDKFormat(server);

      const config = result['multi-env'] as SDKMCPServerConfig;

      // Verify all env variables have unique names
      const envKeys = Object.keys(config.env!);
      const uniqueKeys = new Set(envKeys);
      expect(envKeys.length).toBe(uniqueKeys.size);
      expect(envKeys.length).toBe(3);
    });
  });
});

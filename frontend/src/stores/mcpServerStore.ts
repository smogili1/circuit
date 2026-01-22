/**
 * MCP Server Store (Zustand)
 *
 * Manages MCP server state and API interactions.
 */

import { create } from 'zustand';
import {
  MCPServer,
  CreateMCPServerInput,
  UpdateMCPServerInput,
  ConnectionTestResult,
  ToolDiscoveryResult,
} from '../types/mcp';

interface MCPServerState {
  // Server list
  servers: MCPServer[];

  // Loading states
  loading: boolean;
  error: string | null;
  initialized: boolean;

  // Operation-specific loading
  testingConnection: string | null;  // Server ID being tested
  discoveringTools: string | null;   // Server ID discovering tools

  // Actions
  fetchServers: () => Promise<void>;
  getServer: (id: string) => MCPServer | undefined;
  createServer: (input: CreateMCPServerInput) => Promise<MCPServer>;
  updateServer: (id: string, updates: UpdateMCPServerInput) => Promise<MCPServer>;
  deleteServer: (id: string) => Promise<void>;
  testConnection: (id: string) => Promise<ConnectionTestResult>;
  discoverTools: (id: string) => Promise<ToolDiscoveryResult>;
  enableServer: (id: string) => Promise<MCPServer>;
  disableServer: (id: string) => Promise<MCPServer>;

  // Clear error
  clearError: () => void;
}

export const useMCPServerStore = create<MCPServerState>((set, get) => ({
  servers: [],
  loading: false,
  error: null,
  initialized: false,
  testingConnection: null,
  discoveringTools: null,

  fetchServers: async () => {
    // Don't refetch if already initialized successfully
    if (get().initialized && !get().error) return;

    set({ loading: true, error: null });

    try {
      const response = await fetch(`/api/mcp-servers`);
      if (!response.ok) {
        throw new Error(`Failed to fetch MCP servers: ${response.statusText}`);
      }

      const servers: MCPServer[] = await response.json();
      set({ servers, loading: false, initialized: true });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch MCP servers',
        loading: false,
      });
    }
  },

  getServer: (id: string) => {
    return get().servers.find(s => s.id === id);
  },

  createServer: async (input: CreateMCPServerInput) => {
    set({ loading: true, error: null });

    try {
      const response = await fetch(`/api/mcp-servers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create MCP server');
      }

      const server: MCPServer = await response.json();
      set(state => ({
        servers: [...state.servers, server],
        loading: false,
      }));

      return server;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create MCP server',
        loading: false,
      });
      throw error;
    }
  },

  updateServer: async (id: string, updates: UpdateMCPServerInput) => {
    set({ loading: true, error: null });

    try {
      const response = await fetch(`/api/mcp-servers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update MCP server');
      }

      const server: MCPServer = await response.json();
      set(state => ({
        servers: state.servers.map(s => s.id === id ? server : s),
        loading: false,
      }));

      return server;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update MCP server',
        loading: false,
      });
      throw error;
    }
  },

  deleteServer: async (id: string) => {
    set({ loading: true, error: null });

    try {
      const response = await fetch(`/api/mcp-servers/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok && response.status !== 204) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete MCP server');
      }

      set(state => ({
        servers: state.servers.filter(s => s.id !== id),
        loading: false,
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete MCP server',
        loading: false,
      });
      throw error;
    }
  },

  testConnection: async (id: string) => {
    set({ testingConnection: id, error: null });

    try {
      const response = await fetch(`/api/mcp-servers/${id}/test`, {
        method: 'POST',
      });

      const result: ConnectionTestResult = await response.json();
      set({ testingConnection: null });

      return result;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to test connection',
        testingConnection: null,
      });
      throw error;
    }
  },

  discoverTools: async (id: string) => {
    set({ discoveringTools: id, error: null });

    try {
      const response = await fetch(`/api/mcp-servers/${id}/discover`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to discover tools');
      }

      const result: ToolDiscoveryResult = await response.json();

      // Update server with discovered tools
      set(state => ({
        servers: state.servers.map(s =>
          s.id === id
            ? { ...s, tools: result.tools, lastDiscoveredAt: result.discoveredAt }
            : s
        ),
        discoveringTools: null,
      }));

      return result;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to discover tools',
        discoveringTools: null,
      });
      throw error;
    }
  },

  enableServer: async (id: string) => {
    try {
      const response = await fetch(`/api/mcp-servers/${id}/enable`, {
        method: 'PATCH',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to enable MCP server');
      }

      const server: MCPServer = await response.json();
      set(state => ({
        servers: state.servers.map(s => s.id === id ? server : s),
      }));

      return server;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to enable MCP server',
      });
      throw error;
    }
  },

  disableServer: async (id: string) => {
    try {
      const response = await fetch(`/api/mcp-servers/${id}/disable`, {
        method: 'PATCH',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to disable MCP server');
      }

      const server: MCPServer = await response.json();
      set(state => ({
        servers: state.servers.map(s => s.id === id ? server : s),
      }));

      return server;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to disable MCP server',
      });
      throw error;
    }
  },

  clearError: () => set({ error: null }),
}));

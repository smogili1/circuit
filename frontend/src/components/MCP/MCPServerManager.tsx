/**
 * MCP Server Manager Modal
 *
 * Global management UI for MCP server configurations.
 */

import { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Server,
  Wifi,
  WifiOff,
  RefreshCw,
  Trash2,
  Edit2,
  Check,
  AlertCircle,
  Globe,
  Terminal,
  Key,
} from 'lucide-react';
import { useMCPServerStore } from '../../stores/mcpServerStore';
import {
  MCPServer,
  MCPTransportConfig,
  MCPAuthConfig,
  CreateMCPServerInput,
  MCPToolDefinition,
} from '../../types/mcp';

interface MCPServerManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MCPServerManager({ isOpen, onClose }: MCPServerManagerProps) {
  const {
    servers,
    loading,
    error,
    fetchServers,
    testConnection,
    discoverTools,
    deleteServer,
    enableServer,
    disableServer,
    testingConnection,
    discoveringTools,
    clearError,
  } = useMCPServerStore();

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingServer, setEditingServer] = useState<MCPServer | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; error?: string }>>({});

  useEffect(() => {
    if (isOpen) {
      fetchServers();
    }
  }, [isOpen, fetchServers]);

  const handleTest = async (id: string) => {
    try {
      const result = await testConnection(id);
      setTestResults(prev => ({ ...prev, [id]: result }));
    } catch (err) {
      setTestResults(prev => ({
        ...prev,
        [id]: { success: false, error: err instanceof Error ? err.message : 'Test failed' }
      }));
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this MCP server?')) {
      await deleteServer(id);
    }
  };

  const handleToggleEnabled = async (server: MCPServer) => {
    if (server.enabled) {
      await disableServer(server.id);
    } else {
      await enableServer(server.id);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-indigo-600 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <div className="flex items-center gap-3">
            <Server className="text-white" size={24} />
            <div>
              <h2 className="text-lg font-semibold text-white">MCP Servers</h2>
              <p className="text-indigo-200 text-sm">Manage Model Context Protocol servers</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-indigo-700 rounded-lg transition-colors"
          >
            <X className="text-white" size={20} />
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
            <AlertCircle className="text-red-500" size={18} />
            <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
            <button onClick={clearError} className="ml-auto text-red-500 hover:text-red-700">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && servers.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="animate-spin text-gray-400" size={24} />
              <span className="ml-2 text-gray-500">Loading servers...</span>
            </div>
          ) : servers.length === 0 && !showAddForm ? (
            <div className="text-center py-12">
              <Server className="mx-auto text-gray-300 dark:text-gray-600 mb-4" size={48} />
              <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">
                No MCP Servers Configured
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">
                Add an MCP server to extend agent capabilities with custom tools.
              </p>
              <button
                onClick={() => setShowAddForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                <Plus size={18} />
                Add MCP Server
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Server list */}
              {servers.map(server => (
                <ServerCard
                  key={server.id}
                  server={server}
                  testResult={testResults[server.id]}
                  isTesting={testingConnection === server.id}
                  isDiscovering={discoveringTools === server.id}
                  onTest={() => handleTest(server.id)}
                  onDiscover={() => discoverTools(server.id)}
                  onToggleEnabled={() => handleToggleEnabled(server)}
                  onEdit={() => setEditingServer(server)}
                  onDelete={() => handleDelete(server.id)}
                />
              ))}

              {/* Add button */}
              {!showAddForm && !editingServer && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="w-full p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg
                    hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20
                    transition-colors flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400"
                >
                  <Plus size={20} />
                  Add MCP Server
                </button>
              )}

              {/* Add/Edit form */}
              {(showAddForm || editingServer) && (
                <ServerForm
                  server={editingServer}
                  onClose={() => {
                    setShowAddForm(false);
                    setEditingServer(null);
                  }}
                />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/50 rounded-b-xl flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

interface ServerCardProps {
  server: MCPServer;
  testResult?: { success: boolean; error?: string };
  isTesting: boolean;
  isDiscovering: boolean;
  onTest: () => void;
  onDiscover: () => void;
  onToggleEnabled: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function ServerCard({
  server,
  testResult,
  isTesting,
  isDiscovering,
  onTest,
  onDiscover,
  onToggleEnabled,
  onEdit,
  onDelete,
}: ServerCardProps) {
  const [showTools, setShowTools] = useState(false);

  const TransportIcon = server.transport.type === 'stdio' ? Terminal : Globe;
  const transportLabel = {
    stdio: 'Local Process',
    sse: 'SSE',
    http: 'HTTP',
  }[server.transport.type];

  return (
    <div className={`border rounded-lg ${server.enabled ? 'border-gray-200 dark:border-gray-600' : 'border-gray-100 dark:border-gray-700 opacity-60'}`}>
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${server.enabled ? 'bg-indigo-100 dark:bg-indigo-900/30' : 'bg-gray-100 dark:bg-gray-700'}`}>
              <Server className={server.enabled ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'} size={20} />
            </div>
            <div>
              <h4 className="font-medium text-gray-800 dark:text-gray-200">{server.name}</h4>
              <div className="flex items-center gap-2 mt-1">
                <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                  <TransportIcon size={12} />
                  {transportLabel}
                </span>
                {server.auth && server.auth.type !== 'none' && (
                  <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <Key size={12} />
                    {server.auth.type === 'oauth'
                      ? server.auth.connected ? 'Connected' : 'Not connected'
                      : server.auth.type}
                  </span>
                )}
                {server.tools && (
                  <button
                    onClick={() => setShowTools(!showTools)}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    {server.tools.length} tools
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Test result indicator */}
            {testResult && (
              <span className={`text-xs ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
                {testResult.success ? <Check size={16} /> : <AlertCircle size={16} />}
              </span>
            )}

            {/* Toggle enabled */}
            <button
              onClick={onToggleEnabled}
              className={`p-1.5 rounded ${server.enabled ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20' : 'text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
              title={server.enabled ? 'Disable' : 'Enable'}
            >
              {server.enabled ? <Wifi size={18} /> : <WifiOff size={18} />}
            </button>

            {/* Test connection */}
            <button
              onClick={onTest}
              disabled={isTesting}
              className="p-1.5 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 rounded disabled:opacity-50"
              title="Test connection"
            >
              <RefreshCw size={18} className={isTesting ? 'animate-spin' : ''} />
            </button>

            {/* Discover tools */}
            <button
              onClick={onDiscover}
              disabled={isDiscovering}
              className="p-1.5 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 rounded disabled:opacity-50"
              title="Discover tools"
            >
              <RefreshCw size={18} className={isDiscovering ? 'animate-spin' : ''} />
            </button>

            {/* Edit */}
            <button
              onClick={onEdit}
              className="p-1.5 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 rounded"
              title="Edit"
            >
              <Edit2 size={18} />
            </button>

            {/* Delete */}
            <button
              onClick={onDelete}
              className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
              title="Delete"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        {/* Description */}
        {server.description && (
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{server.description}</p>
        )}

        {/* Tools list */}
        {showTools && server.tools && server.tools.length > 0 && (
          <div className="mt-3 pt-3 border-t dark:border-gray-600">
            <div className="flex flex-wrap gap-2">
              {server.tools.map(tool => (
                <ToolBadge key={tool.name} tool={tool} />
              ))}
            </div>
          </div>
        )}

        {/* Test error */}
        {testResult && !testResult.success && testResult.error && (
          <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs text-red-600 dark:text-red-400">
            {testResult.error}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolBadge({ tool }: { tool: MCPToolDefinition }) {
  return (
    <span
      className="inline-flex items-center px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
      title={tool.description}
    >
      {tool.name}
    </span>
  );
}

interface ServerFormProps {
  server: MCPServer | null;
  onClose: () => void;
}

function ServerForm({ server, onClose }: ServerFormProps) {
  const { createServer, updateServer } = useMCPServerStore();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(server?.name || '');
  const [description, setDescription] = useState(server?.description || '');
  const [transportType, setTransportType] = useState<'stdio' | 'sse' | 'http'>(
    server?.transport.type || 'stdio'
  );
  const [command, setCommand] = useState(
    server?.transport.type === 'stdio' ? server.transport.command : ''
  );
  const [args, setArgs] = useState(
    server?.transport.type === 'stdio' ? server.transport.args.join(' ') : ''
  );
  const [url, setUrl] = useState(
    server?.transport.type !== 'stdio' ? (server?.transport as { url: string })?.url || '' : ''
  );
  const [authType, setAuthType] = useState<'none' | 'api-key' | 'headers' | 'oauth'>(
    server?.auth?.type || 'none'
  );
  const [apiKey, setApiKey] = useState('');
  const [headerName, setHeaderName] = useState(
    server?.auth?.type === 'api-key' ? server.auth.headerName || 'Authorization' : 'Authorization'
  );
  const [prefix, setPrefix] = useState(
    server?.auth?.type === 'api-key' ? server.auth.prefix || 'Bearer ' : 'Bearer '
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      let transport: MCPTransportConfig;
      if (transportType === 'stdio') {
        transport = {
          type: 'stdio',
          command,
          args: args.split(/\s+/).filter(Boolean),
        };
      } else {
        transport = {
          type: transportType,
          url,
        };
      }

      let auth: MCPAuthConfig | undefined;
      if (authType === 'none') {
        auth = { type: 'none' };
      } else if (authType === 'api-key') {
        auth = {
          type: 'api-key',
          key: apiKey,
          headerName,
          prefix,
        };
      }
      // TODO: Add headers and oauth auth types

      const input: CreateMCPServerInput = {
        name,
        description: description || undefined,
        transport,
        auth,
      };

      if (server) {
        await updateServer(server.id, input);
      } else {
        await createServer(input);
      }

      onClose();
    } catch (err) {
      console.error('Failed to save server:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-700/50">
      <h4 className="font-medium text-gray-800 dark:text-gray-200 mb-4">
        {server ? 'Edit MCP Server' : 'Add MCP Server'}
      </h4>

      <div className="space-y-4">
        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            placeholder="My MCP Server"
            className="w-full px-3 py-2 text-sm border rounded-md dark:bg-gray-800 dark:border-gray-600"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Description
          </label>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Optional description"
            className="w-full px-3 py-2 text-sm border rounded-md dark:bg-gray-800 dark:border-gray-600"
          />
        </div>

        {/* Transport Type */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Transport
          </label>
          <select
            value={transportType}
            onChange={e => setTransportType(e.target.value as 'stdio' | 'sse' | 'http')}
            className="w-full px-3 py-2 text-sm border rounded-md dark:bg-gray-800 dark:border-gray-600"
          >
            <option value="stdio">Local Process (stdio)</option>
            <option value="sse">Server-Sent Events (SSE)</option>
            <option value="http">HTTP Streaming</option>
          </select>
        </div>

        {/* Transport-specific fields */}
        {transportType === 'stdio' ? (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Command
              </label>
              <input
                type="text"
                value={command}
                onChange={e => setCommand(e.target.value)}
                required
                placeholder="npx"
                className="w-full px-3 py-2 text-sm border rounded-md dark:bg-gray-800 dark:border-gray-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Arguments
              </label>
              <input
                type="text"
                value={args}
                onChange={e => setArgs(e.target.value)}
                placeholder="-y @anthropic-ai/mcp-server-filesystem /path"
                className="w-full px-3 py-2 text-sm border rounded-md dark:bg-gray-800 dark:border-gray-600"
              />
              <p className="mt-1 text-xs text-gray-500">Space-separated arguments</p>
            </div>
          </>
        ) : (
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Server URL
            </label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              required
              placeholder="https://mcp.example.com/sse"
              className="w-full px-3 py-2 text-sm border rounded-md dark:bg-gray-800 dark:border-gray-600"
            />
          </div>
        )}

        {/* Auth Type */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Authentication
          </label>
          <select
            value={authType}
            onChange={e => setAuthType(e.target.value as 'none' | 'api-key' | 'headers' | 'oauth')}
            className="w-full px-3 py-2 text-sm border rounded-md dark:bg-gray-800 dark:border-gray-600"
          >
            <option value="none">No Authentication</option>
            <option value="api-key">API Key</option>
            <option value="headers">Custom Headers</option>
            <option value="oauth">OAuth 2.0</option>
          </select>
        </div>

        {/* Auth-specific fields */}
        {authType === 'api-key' && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                required={!server}
                placeholder={server ? '(unchanged)' : 'Enter API key'}
                className="w-full px-3 py-2 text-sm border rounded-md dark:bg-gray-800 dark:border-gray-600"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Header Name
                </label>
                <input
                  type="text"
                  value={headerName}
                  onChange={e => setHeaderName(e.target.value)}
                  placeholder="Authorization"
                  className="w-full px-3 py-2 text-sm border rounded-md dark:bg-gray-800 dark:border-gray-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Prefix
                </label>
                <input
                  type="text"
                  value={prefix}
                  onChange={e => setPrefix(e.target.value)}
                  placeholder="Bearer "
                  className="w-full px-3 py-2 text-sm border rounded-md dark:bg-gray-800 dark:border-gray-600"
                />
              </div>
            </div>
          </>
        )}

        {authType === 'oauth' && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            OAuth configuration will be available after creating the server.
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50"
        >
          {saving ? 'Saving...' : server ? 'Update' : 'Create'}
        </button>
      </div>
    </form>
  );
}

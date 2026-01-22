/**
 * MCP Servers Page
 *
 * Dedicated page for managing MCP server configurations.
 */

import { useState, useEffect } from 'react';
import {
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
  X,
  Search,
} from 'lucide-react';
import { useMCPServerStore } from '../stores/mcpServerStore';
import {
  MCPServer,
  MCPTransportConfig,
  MCPAuthConfig,
  CreateMCPServerInput,
  MCPToolDefinition,
} from '../types/mcp';

export function MCPServersPage() {
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
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

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

  // Filter servers by search query
  const filteredServers = servers.filter(server =>
    server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    server.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Page Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
              <Server className="text-indigo-600 dark:text-indigo-400" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                MCP Servers
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Manage Model Context Protocol servers to extend agent capabilities
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-6">
          {/* Error banner */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
              <AlertCircle className="text-red-500" size={18} />
              <span className="text-sm text-red-700 dark:text-red-300 flex-1">{error}</span>
              <button onClick={clearError} className="text-red-500 hover:text-red-700">
                <X size={16} />
              </button>
            </div>
          )}

          {/* Toolbar */}
          <div className="flex items-center gap-4 mb-6">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Search servers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm
                  bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Add button */}
            <button
              onClick={() => {
                setEditingServer(null);
                setShowAddForm(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
            >
              <Plus size={18} />
              Add Server
            </button>
          </div>

          {/* Loading state */}
          {loading && servers.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="animate-spin text-gray-400" size={24} />
              <span className="ml-2 text-gray-500">Loading servers...</span>
            </div>
          ) : filteredServers.length === 0 && !showAddForm ? (
            /* Empty state */
            <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
              <Server className="mx-auto text-gray-300 dark:text-gray-600 mb-4" size={48} />
              <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">
                {searchQuery ? 'No servers found' : 'No MCP Servers Configured'}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-500 mb-4 max-w-md mx-auto">
                {searchQuery
                  ? 'Try adjusting your search query'
                  : 'Add an MCP server to extend agent capabilities with custom tools like file system access, database queries, and more.'
                }
              </p>
              {!searchQuery && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  <Plus size={18} />
                  Add MCP Server
                </button>
              )}
            </div>
          ) : (
            /* Server list */
            <div className="space-y-4">
              {filteredServers.map(server => (
                <ServerCard
                  key={server.id}
                  server={server}
                  testResult={testResults[server.id]}
                  isTesting={testingConnection === server.id}
                  isDiscovering={discoveringTools === server.id}
                  onTest={() => handleTest(server.id)}
                  onDiscover={() => discoverTools(server.id)}
                  onToggleEnabled={() => handleToggleEnabled(server)}
                  onEdit={() => {
                    setEditingServer(server);
                    setShowAddForm(true);
                  }}
                  onDelete={() => handleDelete(server.id)}
                />
              ))}
            </div>
          )}

          {/* Add/Edit form modal */}
          {showAddForm && (
            <ServerFormModal
              server={editingServer}
              onClose={() => {
                setShowAddForm(false);
                setEditingServer(null);
              }}
            />
          )}
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
    <div className={`bg-white dark:bg-gray-900 border rounded-xl shadow-sm transition-all ${
      server.enabled
        ? 'border-gray-200 dark:border-gray-700'
        : 'border-gray-100 dark:border-gray-800 opacity-60'
    }`}>
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl ${
              server.enabled
                ? 'bg-indigo-100 dark:bg-indigo-900/30'
                : 'bg-gray-100 dark:bg-gray-800'
            }`}>
              <Server className={
                server.enabled
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-gray-400'
              } size={24} />
            </div>
            <div>
              <h4 className="font-semibold text-gray-800 dark:text-gray-200 text-lg">
                {server.name}
              </h4>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                  <TransportIcon size={14} />
                  {transportLabel}
                </span>
                {server.auth && server.auth.type !== 'none' && (
                  <span className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                    <Key size={14} />
                    {server.auth.type === 'oauth'
                      ? server.auth.connected ? 'Connected' : 'Not connected'
                      : server.auth.type}
                  </span>
                )}
                {server.tools && (
                  <button
                    onClick={() => setShowTools(!showTools)}
                    className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    {server.tools.length} tool{server.tools.length !== 1 ? 's' : ''}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Test result indicator */}
            {testResult && (
              <span className={`p-1.5 rounded ${testResult.success ? 'text-green-600 bg-green-50 dark:bg-green-900/20' : 'text-red-600 bg-red-50 dark:bg-red-900/20'}`}>
                {testResult.success ? <Check size={18} /> : <AlertCircle size={18} />}
              </span>
            )}

            {/* Toggle enabled */}
            <button
              onClick={onToggleEnabled}
              className={`p-2 rounded-lg transition-colors ${
                server.enabled
                  ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'
                  : 'text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
              title={server.enabled ? 'Disable server' : 'Enable server'}
            >
              {server.enabled ? <Wifi size={20} /> : <WifiOff size={20} />}
            </button>

            {/* Test connection */}
            <button
              onClick={onTest}
              disabled={isTesting}
              className="p-2 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg disabled:opacity-50 transition-colors"
              title="Test connection"
            >
              <RefreshCw size={20} className={isTesting ? 'animate-spin' : ''} />
            </button>

            {/* Discover tools */}
            <button
              onClick={onDiscover}
              disabled={isDiscovering}
              className="p-2 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg disabled:opacity-50 transition-colors"
              title="Discover tools"
            >
              <Search size={20} className={isDiscovering ? 'animate-pulse' : ''} />
            </button>

            {/* Edit */}
            <button
              onClick={onEdit}
              className="p-2 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title="Edit"
            >
              <Edit2 size={20} />
            </button>

            {/* Delete */}
            <button
              onClick={onDelete}
              className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              title="Delete"
            >
              <Trash2 size={20} />
            </button>
          </div>
        </div>

        {/* Description */}
        {server.description && (
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-400 pl-16">
            {server.description}
          </p>
        )}

        {/* Tools list */}
        {showTools && server.tools && server.tools.length > 0 && (
          <div className="mt-4 pt-4 border-t dark:border-gray-700 pl-16">
            <div className="flex flex-wrap gap-2">
              {server.tools.map(tool => (
                <ToolBadge key={tool.name} tool={tool} />
              ))}
            </div>
          </div>
        )}

        {/* Test error */}
        {testResult && !testResult.success && testResult.error && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-600 dark:text-red-400 pl-16">
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
      className="inline-flex items-center px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg cursor-help"
      title={tool.description}
    >
      {tool.name}
    </span>
  );
}

interface ServerFormModalProps {
  server: MCPServer | null;
  onClose: () => void;
}

function ServerFormModal({ server, onClose }: ServerFormModalProps) {
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-indigo-600 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <h2 className="text-lg font-semibold text-white">
            {server ? 'Edit MCP Server' : 'Add MCP Server'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-indigo-700 rounded-lg transition-colors"
          >
            <X className="text-white" size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                placeholder="My MCP Server"
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Optional description"
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Transport Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Transport
              </label>
              <select
                value={transportType}
                onChange={e => setTransportType(e.target.value as 'stdio' | 'sse' | 'http')}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Command
                  </label>
                  <input
                    type="text"
                    value={command}
                    onChange={e => setCommand(e.target.value)}
                    required
                    placeholder="npx"
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Arguments
                  </label>
                  <input
                    type="text"
                    value={args}
                    onChange={e => setArgs(e.target.value)}
                    placeholder="-y @anthropic-ai/mcp-server-filesystem /path"
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">Space-separated arguments</p>
                </div>
              </>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Server URL
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  required
                  placeholder="https://mcp.example.com/sse"
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}

            {/* Auth Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Authentication
              </label>
              <select
                value={authType}
                onChange={e => setAuthType(e.target.value as 'none' | 'api-key' | 'headers' | 'oauth')}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    API Key
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    required={!server}
                    placeholder={server ? '(unchanged)' : 'Enter API key'}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Header Name
                    </label>
                    <input
                      type="text"
                      value={headerName}
                      onChange={e => setHeaderName(e.target.value)}
                      placeholder="Authorization"
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Prefix
                    </label>
                    <input
                      type="text"
                      value={prefix}
                      onChange={e => setPrefix(e.target.value)}
                      placeholder="Bearer "
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
              className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : server ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

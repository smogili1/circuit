/**
 * MCP Server Selector Component
 *
 * Used in agent node properties to select which MCP servers
 * and tools are available to the agent.
 */

import { useState, useEffect } from 'react';
import { Server, ChevronDown, ChevronRight, Settings, ExternalLink } from 'lucide-react';
import { useMCPServerStore } from '../../stores/mcpServerStore';
import { MCPNodeServerConfig, MCPServer, MCPToolDefinition } from '../../types/mcp';
import { useNavigation } from '../../contexts/NavigationContext';

interface MCPServerSelectorProps {
  value: MCPNodeServerConfig[];
  onChange: (value: MCPNodeServerConfig[]) => void;
}

export function MCPServerSelector({ value, onChange }: MCPServerSelectorProps) {
  const { servers, fetchServers, initialized } = useMCPServerStore();
  const { navigateTo } = useNavigation();
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!initialized) {
      fetchServers();
    }
  }, [initialized, fetchServers]);

  // Get enabled servers only
  const enabledServers = servers.filter(s => s.enabled);

  // Check if a server is selected
  const isServerSelected = (serverId: string) => {
    return value.some(v => v.serverId === serverId);
  };

  // Get the config for a server
  const getServerConfig = (serverId: string): MCPNodeServerConfig | undefined => {
    return value.find(v => v.serverId === serverId);
  };

  // Toggle server selection
  const toggleServer = (serverId: string) => {
    if (isServerSelected(serverId)) {
      onChange(value.filter(v => v.serverId !== serverId));
    } else {
      onChange([...value, { serverId, enabledTools: '*' }]);
    }
  };

  // Toggle tool selection
  const toggleTool = (serverId: string, toolName: string) => {
    const config = getServerConfig(serverId);
    if (!config) return;

    const server = servers.find(s => s.id === serverId);
    if (!server?.tools) return;

    let newEnabledTools: string[] | '*';

    if (config.enabledTools === '*') {
      // Switching from all to specific - start with all except this one
      newEnabledTools = server.tools
        .map(t => t.name)
        .filter(n => n !== toolName);
    } else {
      const tools = config.enabledTools as string[];
      if (tools.includes(toolName)) {
        // Remove tool
        newEnabledTools = tools.filter(t => t !== toolName);
      } else {
        // Add tool
        newEnabledTools = [...tools, toolName];
      }

      // If all tools are now selected, switch to '*'
      if (newEnabledTools.length === server.tools.length) {
        newEnabledTools = '*';
      }
    }

    onChange(
      value.map(v =>
        v.serverId === serverId
          ? { ...v, enabledTools: newEnabledTools }
          : v
      )
    );
  };

  // Check if a tool is enabled
  const isToolEnabled = (serverId: string, toolName: string): boolean => {
    const config = getServerConfig(serverId);
    if (!config) return false;
    if (config.enabledTools === '*') return true;
    return (config.enabledTools as string[]).includes(toolName);
  };

  // Toggle all tools for a server
  const toggleAllTools = (serverId: string) => {
    const config = getServerConfig(serverId);
    if (!config) return;

    const newEnabledTools: string[] | '*' = config.enabledTools === '*' ? [] : '*';

    onChange(
      value.map(v =>
        v.serverId === serverId
          ? { ...v, enabledTools: newEnabledTools }
          : v
      )
    );
  };

  // Toggle expanded state
  const toggleExpanded = (serverId: string) => {
    const newExpanded = new Set(expandedServers);
    if (newExpanded.has(serverId)) {
      newExpanded.delete(serverId);
    } else {
      newExpanded.add(serverId);
    }
    setExpandedServers(newExpanded);
  };

  // Count enabled tools
  const countEnabledTools = (serverId: string): string => {
    const config = getServerConfig(serverId);
    if (!config) return '0';
    if (config.enabledTools === '*') return 'all';
    return String((config.enabledTools as string[]).length);
  };

  return (
    <div className="space-y-2">
      {enabledServers.length === 0 ? (
        <div className="text-xs text-gray-500 dark:text-gray-400 py-2">
          No MCP servers configured.
        </div>
      ) : (
        <div className="space-y-2">
          {enabledServers.map(server => (
            <ServerItem
              key={server.id}
              server={server}
              isSelected={isServerSelected(server.id)}
              isExpanded={expandedServers.has(server.id)}
              toolCount={countEnabledTools(server.id)}
              onToggleServer={() => toggleServer(server.id)}
              onToggleExpanded={() => toggleExpanded(server.id)}
              onToggleTool={(toolName) => toggleTool(server.id, toolName)}
              onToggleAllTools={() => toggleAllTools(server.id)}
              isToolEnabled={(toolName) => isToolEnabled(server.id, toolName)}
              allToolsEnabled={getServerConfig(server.id)?.enabledTools === '*'}
            />
          ))}
        </div>
      )}

      {/* Manage servers link */}
      <button
        type="button"
        onClick={() => navigateTo('mcp')}
        className="w-full mt-2 px-3 py-2 text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded flex items-center justify-center gap-1.5"
      >
        <Settings size={14} />
        Manage MCP Servers
        <ExternalLink size={12} />
      </button>
    </div>
  );
}

interface ServerItemProps {
  server: MCPServer;
  isSelected: boolean;
  isExpanded: boolean;
  toolCount: string;
  onToggleServer: () => void;
  onToggleExpanded: () => void;
  onToggleTool: (toolName: string) => void;
  onToggleAllTools: () => void;
  isToolEnabled: (toolName: string) => boolean;
  allToolsEnabled: boolean;
}

function ServerItem({
  server,
  isSelected,
  isExpanded,
  toolCount,
  onToggleServer,
  onToggleExpanded,
  onToggleTool,
  onToggleAllTools,
  isToolEnabled,
  allToolsEnabled,
}: ServerItemProps) {
  const hasTools = server.tools && server.tools.length > 0;

  return (
    <div className={`border rounded ${isSelected ? 'border-indigo-300 dark:border-indigo-600 bg-indigo-50/50 dark:bg-indigo-900/20' : 'border-gray-200 dark:border-gray-600'}`}>
      <div className="flex items-center gap-2 p-2">
        {/* Expand/collapse button */}
        {hasTools && isSelected && (
          <button
            type="button"
            onClick={onToggleExpanded}
            className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}

        {/* Checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleServer}
          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />

        {/* Server info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Server size={14} className="text-gray-400 flex-shrink-0" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
              {server.name}
            </span>
          </div>
        </div>

        {/* Tool count badge */}
        {isSelected && hasTools && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {toolCount} tools
          </span>
        )}
      </div>

      {/* Tools list */}
      {isSelected && isExpanded && hasTools && (
        <div className="border-t border-gray-200 dark:border-gray-600 p-2 pt-2 space-y-1">
          {/* Select all toggle */}
          <label className="flex items-center gap-2 text-xs cursor-pointer p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
            <input
              type="checkbox"
              checked={allToolsEnabled}
              onChange={onToggleAllTools}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="font-medium text-gray-600 dark:text-gray-400">
              {allToolsEnabled ? 'Deselect All' : 'Select All'}
            </span>
          </label>

          {/* Individual tools */}
          <div className="grid grid-cols-2 gap-1 pt-1">
            {server.tools!.map(tool => (
              <ToolCheckbox
                key={tool.name}
                tool={tool}
                isEnabled={isToolEnabled(tool.name)}
                onToggle={() => onToggleTool(tool.name)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface ToolCheckboxProps {
  tool: MCPToolDefinition;
  isEnabled: boolean;
  onToggle: () => void;
}

function ToolCheckbox({ tool, isEnabled, onToggle }: ToolCheckboxProps) {
  return (
    <label
      className="flex items-center gap-1.5 text-xs cursor-pointer p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
      title={tool.description}
    >
      <input
        type="checkbox"
        checked={isEnabled}
        onChange={onToggle}
        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
      />
      <span className="text-gray-600 dark:text-gray-400 truncate">{tool.name}</span>
    </label>
  );
}

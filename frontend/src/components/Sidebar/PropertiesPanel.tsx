import { useEffect, useState, useCallback } from 'react';
import { useWorkflowStore } from '../../stores/workflowStore';
import { useSchemaStore } from '../../stores/schemaStore';
import { SchemaPropertyRenderer } from './SchemaPropertyRenderer';
import { Trash2 } from 'lucide-react';

export function PropertiesPanel() {
  const { nodes, selectedNodeId, updateNodeConfig, deleteNode, selectNode, workflow, updateWorkflowSettings, isNameAvailable } =
    useWorkflowStore();

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const [localName, setLocalName] = useState<string>('');
  const [nameError, setNameError] = useState<string | null>(null);

  const schema = useSchemaStore((s) =>
    selectedNode ? s.getSchema(selectedNode.data.config.type) : undefined
  );

  // Sync local name with store when selected node changes
  useEffect(() => {
    if (selectedNode) {
      setLocalName(selectedNode.data.config.name);
    }
    setNameError(null);
  }, [selectedNodeId, selectedNode?.data.config.name]);

  // Validate name and update error state
  const validateName = useCallback((name: string): boolean => {
    if (!selectedNodeId) return false;

    if (!name.trim()) {
      setNameError('Name cannot be empty');
      return false;
    }

    if (!isNameAvailable(name, selectedNodeId)) {
      setNameError('Name already exists');
      return false;
    }

    setNameError(null);
    return true;
  }, [selectedNodeId, isNameAvailable]);

  // Handle name input change - update local state and validate
  const handleNameChange = useCallback((newName: string) => {
    setLocalName(newName);
    const isValid = validateName(newName);
    // Only update store if valid
    if (isValid && selectedNodeId) {
      updateNodeConfig(selectedNodeId, { name: newName });
    }
  }, [selectedNodeId, validateName, updateNodeConfig]);

  if (!selectedNode) {
    return (
      <div className="p-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          Workflow Settings
        </h3>
        <div className="space-y-3">
          <Field label="Working Directory">
            <input
              type="text"
              value={workflow?.workingDirectory || ''}
              onChange={(e) => updateWorkflowSettings({ workingDirectory: e.target.value })}
              placeholder="/path/to/project"
              className="w-full px-3 py-2 text-sm border rounded-md dark:bg-gray-800 dark:border-gray-600"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Base directory for all agent operations
            </p>
          </Field>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 pt-4 border-t dark:border-gray-700">
          Select a node to edit its properties
        </p>
      </div>
    );
  }

  const config = selectedNode.data.config;

  const handleChange = (updates: Record<string, unknown>) => {
    updateNodeConfig(selectedNodeId!, updates);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          Properties
        </h3>
        <button
          onClick={() => {
            deleteNode(selectedNodeId!);
            selectNode(null);
          }}
          className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
          title="Delete node"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* Common name field */}
      <div className="space-y-3">
        <Field label="Name">
          <input
            type="text"
            value={localName}
            onChange={(e) => handleNameChange(e.target.value)}
            className={`w-full px-3 py-2 text-sm border rounded-md dark:bg-gray-800 dark:border-gray-600 ${
              nameError ? 'border-red-500 dark:border-red-500' : ''
            }`}
          />
          {nameError && (
            <p className="mt-1 text-xs text-red-500">{nameError}</p>
          )}
        </Field>
      </div>

      {/* Schema-driven properties */}
      {schema && (
        <SchemaPropertyRenderer
          schema={schema}
          config={config as unknown as Record<string, unknown>}
          onChange={handleChange}
          nodeId={selectedNodeId!}
        />
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useWorkflowStore } from '../../stores/workflowStore';
import { InputSelection } from '../../types/workflow';
import { findUpstreamNodes, getNodeOutputFields } from '../../config/nodeSchemaLoader';

interface InputSelectorProps {
  value: InputSelection[];
  onChange: (selections: InputSelection[]) => void;
  nodeId: string;
}

function getFallbackFields(nodeType: string): string[] {
  switch (nodeType) {
    case 'claude-agent':
    case 'codex-agent':
      return ['result', 'transcript', 'runCount', 'structuredOutput'];
    case 'input':
      return ['result', 'prompt'];
    case 'condition':
      return ['result', 'matched'];
    case 'merge':
      return ['result'];
    case 'javascript':
      return ['result', 'error'];
    default:
      return ['result'];
  }
}

function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

export function InputSelector({ value, onChange, nodeId }: InputSelectorProps) {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const [customFields, setCustomFields] = useState<Record<string, string>>({});

  const upstreamNodes = useMemo(() => {
    const upstreamIds = findUpstreamNodes(nodeId, edges);
    return nodes.filter((node) => upstreamIds.has(node.id));
  }, [edges, nodes, nodeId]);

  const selectionsById = useMemo(() => {
    return new Map(value.map((selection) => [selection.nodeId, selection]));
  }, [value]);

  const updateSelection = (nodeId: string, updates: Partial<InputSelection>) => {
    const current = selectionsById.get(nodeId);
    if (!current) return;
    const next = value.map((selection) =>
      selection.nodeId === nodeId ? { ...selection, ...updates } : selection
    );
    onChange(next);
  };

  const addSelection = (selection: InputSelection) => {
    onChange([...value, selection]);
  };

  const removeSelection = (nodeId: string) => {
    onChange(value.filter((selection) => selection.nodeId !== nodeId));
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getSuggestedFields = (nodeType: string, nodeConfig: any, fields: string[]) => {
    const schemaFields = Object.keys(getNodeOutputFields(nodeType, nodeConfig));
    const fallbackFields = getFallbackFields(nodeType);
    return uniq([...schemaFields, ...fallbackFields, ...fields]);
  };

  if (upstreamNodes.length === 0) {
    return (
      <div className="text-xs text-gray-500 dark:text-gray-400">
        Connect upstream nodes to select inputs.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {upstreamNodes.map((node) => {
        const selection = selectionsById.get(node.id);
        const isSelected = Boolean(selection);
        const fields = selection?.fields || [];
        const useAllFields = fields.length === 0;
        const suggestedFields = getSuggestedFields(
          node.data.config.type,
          node.data.config,
          fields
        );

        const defaultFields = suggestedFields.length > 0 ? [suggestedFields[0]] : ['result'];
        const customFieldValue = customFields[node.id] || '';

        return (
          <div
            key={node.id}
            className="p-3 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
          >
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => {
                  if (e.target.checked) {
                    addSelection({
                      nodeId: node.id,
                      nodeName: node.data.config.name,
                      fields: [],
                    });
                  } else {
                    removeSelection(node.id);
                  }
                }}
                className="rounded"
              />
              <span>{node.data.config.name}</span>
              <span className="text-xs text-gray-400">({node.data.config.type})</span>
            </label>

            {isSelected && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-300">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`fields-${node.id}`}
                      checked={useAllFields}
                      onChange={() => updateSelection(node.id, { fields: [] })}
                      className="rounded"
                    />
                    All fields
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`fields-${node.id}`}
                      checked={!useAllFields}
                      onChange={() => updateSelection(node.id, { fields: fields.length > 0 ? fields : defaultFields })}
                      className="rounded"
                    />
                    Selected fields
                  </label>
                </div>

                {!useAllFields && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      {suggestedFields.map((field) => (
                        <label key={field} className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={fields.includes(field)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                updateSelection(node.id, { fields: [...fields, field] });
                              } else if (fields.length > 1) {
                                updateSelection(node.id, {
                                  fields: fields.filter((f) => f !== field),
                                });
                              }
                            }}
                            className="rounded"
                          />
                          {field}
                        </label>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={customFieldValue}
                        onChange={(e) =>
                          setCustomFields((prev) => ({ ...prev, [node.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && customFieldValue.trim()) {
                            const trimmed = customFieldValue.trim();
                            if (!fields.includes(trimmed)) {
                              updateSelection(node.id, { fields: [...fields, trimmed] });
                            }
                            setCustomFields((prev) => ({ ...prev, [node.id]: '' }));
                          }
                        }}
                        placeholder="Add custom field"
                        className="flex-1 px-2 py-1 text-xs border rounded dark:bg-gray-800 dark:border-gray-600"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const trimmed = customFieldValue.trim();
                          if (!trimmed) return;
                          if (!fields.includes(trimmed)) {
                            updateSelection(node.id, { fields: [...fields, trimmed] });
                          }
                          setCustomFields((prev) => ({ ...prev, [node.id]: '' }));
                        }}
                        className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                      >
                        Add
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Schema-driven property renderer
// Dynamically renders form fields based on node schema definitions

import { useState } from 'react';
import { NodeSchemaDefinition, PropertyDefinition } from '../../config/nodeSchema.types';
import { ReferenceTextarea, ReferenceInput } from './ReferencePicker';
import { InputSelector } from './InputSelector';
import { MCPServerSelector } from '../MCP/MCPServerSelector';
import { CodeEditor } from './CodeEditor';
import { MCPNodeServerConfig, InputSelection, ConditionRule, ConditionOperator, ConditionJoiner } from '../../types/workflow';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { useWorkflowStore } from '../../stores/workflowStore';
import { getAvailableReferences } from '../../config/nodeSchemaLoader';
import { v4 as uuidv4 } from 'uuid';

interface SchemaPropertyRendererProps {
  schema: NodeSchemaDefinition;
  config: Record<string, unknown>;
  onChange: (updates: Record<string, unknown>) => void;
  nodeId: string;
}

export function SchemaPropertyRenderer({
  schema,
  config,
  onChange,
  nodeId,
}: SchemaPropertyRendererProps) {
  const properties = schema.properties;

  // Filter out 'name' since it's handled separately in PropertiesPanel
  // Also filter out hidden properties (legacy fields)
  const propertyEntries = Object.entries(properties).filter(
    ([key, prop]) => key !== 'name' && !prop.hidden
  );

  return (
    <div className="space-y-3">
      {propertyEntries.map(([key, prop]) => (
        <PropertyField
          key={key}
          property={prop}
          value={config[key]}
          config={config}
          onChange={(value) => onChange({ [key]: value })}
          nodeId={nodeId}
        />
      ))}
    </div>
  );
}

interface PropertyFieldProps {
  property: PropertyDefinition;
  value: unknown;
  config: Record<string, unknown>;
  onChange: (value: unknown) => void;
  nodeId: string;
}

function PropertyField({
  property,
  value,
  config,
  onChange,
  nodeId,
}: PropertyFieldProps) {
  // Handle showWhen conditions
  if (property.showWhen) {
    const { field, equals, notEmpty } = property.showWhen as { field: string; equals?: unknown; notEmpty?: boolean };
    const fieldValue = config[field];

    if (notEmpty !== undefined) {
      const isEmpty = fieldValue === undefined || fieldValue === null || fieldValue === '';
      if (notEmpty && isEmpty) return null;
      if (!notEmpty && !isEmpty) return null;
    } else if (equals !== undefined && fieldValue !== equals) {
      return null;
    }
  }

  // Group type has its own wrapper, don't double-wrap
  if (property.type === 'group') {
    return (
      <GroupField
        property={property}
        value={value}
        onChange={onChange}
        nodeId={nodeId}
      />
    );
  }

  return (
    <Field label={property.displayName} optional={!property.required}>
      {renderPropertyInput(property, value, onChange, nodeId)}
      {property.description && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {property.description}
        </p>
      )}
    </Field>
  );
}

function renderPropertyInput(
  property: PropertyDefinition,
  value: unknown,
  onChange: (value: unknown) => void,
  nodeId: string
): React.ReactNode {
  const placeholder = property.placeholder || '';

  switch (property.type) {
    case 'string':
      if (property.supportsReferences) {
        return (
          <ReferenceInput
            value={(value as string) || ''}
            onChange={onChange}
            currentNodeId={nodeId}
            placeholder={placeholder}
          />
        );
      }
      return (
        <input
          type="text"
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 text-sm border rounded-md dark:bg-gray-800 dark:border-gray-600"
        />
      );

    case 'textarea':
      if (property.supportsReferences) {
        return (
          <ReferenceTextarea
            value={(value as string) || ''}
            onChange={onChange}
            currentNodeId={nodeId}
            rows={3}
            placeholder={placeholder}
          />
        );
      }
      return (
        <textarea
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder={placeholder}
          className="w-full px-3 py-2 text-sm border rounded-md dark:bg-gray-800 dark:border-gray-600"
        />
      );

    case 'number':
      return (
        <input
          type="number"
          value={value !== undefined && value !== null ? String(value) : ''}
          onChange={(e) => {
            const val = e.target.value;
            if (val === '') {
              onChange(undefined);
            } else {
              const num = parseFloat(val);
              if (!isNaN(num)) {
                onChange(num);
              }
            }
          }}
          placeholder={placeholder}
          className="w-full px-3 py-2 text-sm border rounded-md dark:bg-gray-800 dark:border-gray-600"
        />
      );

    case 'boolean':
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="rounded"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {property.displayName}
          </span>
        </label>
      );

    case 'select': {
      const selectValue = (value as string) ?? (property.default as string) ?? '';
      return (
        <select
          value={selectValue}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 text-sm border rounded-md dark:bg-gray-800 dark:border-gray-600"
        >
          {property.options?.map((option) => {
            const optValue = typeof option === 'string' ? option : option.value;
            const optLabel = typeof option === 'string' ? option : option.label;
            return (
              <option key={optValue} value={optValue}>
                {optLabel}
              </option>
            );
          })}
        </select>
      );
    }

    case 'multiselect': {
      const selectedValues = (value as string[]) || [];
      return (
        <div className="space-y-1">
          {property.options?.map((option) => {
            const optValue = typeof option === 'string' ? option : option.value;
            const optLabel = typeof option === 'string' ? option : option.label;
            return (
              <label key={optValue} className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedValues.includes(optValue)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      onChange([...selectedValues, optValue]);
                    } else {
                      onChange(selectedValues.filter((v) => v !== optValue));
                    }
                  }}
                  className="rounded"
                />
                {optLabel}
              </label>
            );
          })}
        </div>
      );
    }

    case 'code':
      return (
        <CodeEditor
          value={(value as string) || ''}
          onChange={onChange}
          placeholder={placeholder}
          rows={10}
          nodeId={nodeId}
        />
      );

    case 'inputSelector':
      return (
        <InputSelector
          value={(value as InputSelection[]) || []}
          onChange={onChange}
          nodeId={nodeId}
        />
      );

    case 'mcp-server-selector':
      return (
        <MCPServerSelector
          value={(value as MCPNodeServerConfig[]) || []}
          onChange={onChange}
        />
      );

    case 'schemaBuilder':
      return (
        <SchemaBuilderField
          value={(value as string) || ''}
          onChange={onChange}
        />
      );

    case 'group':
      return (
        <GroupField
          property={property}
          value={value}
          onChange={onChange}
          nodeId={nodeId}
        />
      );

    case 'conditionRules':
      return (
        <ConditionRulesField
          value={(value as ConditionRule[]) || []}
          onChange={onChange}
          nodeId={nodeId}
        />
      );

    default:
      return (
        <input
          type="text"
          value={String(value || '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 text-sm border rounded-md dark:bg-gray-800 dark:border-gray-600"
        />
      );
  }
}

// Group field component for nested properties
function GroupField({
  property,
  value,
  onChange,
  nodeId,
}: {
  property: PropertyDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  nodeId: string;
}) {
  const [collapsed, setCollapsed] = useState(
    (property as PropertyDefinition & { collapsed?: boolean }).collapsed ?? false
  );
  const groupValue = (value as Record<string, unknown>) || {};
  const properties = property.properties || {};

  const handleGroupChange = (key: string, newValue: unknown) => {
    onChange({ ...groupValue, [key]: newValue });
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-md">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 p-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        {property.displayName}
      </button>
      {!collapsed && (
        <div className="p-3 pt-0 space-y-3">
          {Object.entries(properties).map(([key, prop]) => {
            // Check showWhen for nested properties (relative to group value)
            if (prop.showWhen) {
              const { field, equals } = prop.showWhen;
              if (groupValue[field] !== equals) return null;
            }

            return (
              <Field key={key} label={prop.displayName} optional={!prop.required}>
                {renderPropertyInput(prop, groupValue[key], (v) => handleGroupChange(key, v), nodeId)}
                {prop.description && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {prop.description}
                  </p>
                )}
              </Field>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Schema builder for JSON output schemas
interface SchemaField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
}

function parseSchemaFields(schema?: string): SchemaField[] {
  if (!schema) return [];
  try {
    const parsed = JSON.parse(schema);
    if (parsed.properties) {
      const required = parsed.required || [];
      return Object.entries(parsed.properties).map(([name, prop]) => ({
        name,
        type: (prop as { type?: string }).type as SchemaField['type'] || 'string',
        required: required.includes(name),
      }));
    }
  } catch {
    // Invalid JSON
  }
  return [];
}

function fieldsToSchema(fields: SchemaField[]): string {
  const properties: Record<string, { type: string }> = {};
  const required: string[] = [];

  for (const field of fields) {
    properties[field.name] = { type: field.type };
    if (field.required) {
      required.push(field.name);
    }
  }

  return JSON.stringify({
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  }, null, 2);
}

function SchemaBuilderField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: unknown) => void;
}) {
  const [fields, setFields] = useState<SchemaField[]>(() => parseSchemaFields(value));

  const updateFields = (newFields: SchemaField[]) => {
    setFields(newFields);
    onChange(fieldsToSchema(newFields));
  };

  const addField = () => {
    updateFields([...fields, { name: '', type: 'string', required: false }]);
  };

  const removeField = (index: number) => {
    updateFields(fields.filter((_, i) => i !== index));
  };

  const updateField = (index: number, updates: Partial<SchemaField>) => {
    updateFields(fields.map((f, i) => i === index ? { ...f, ...updates } : f));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Schema Fields</span>
        <button
          type="button"
          onClick={addField}
          className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          + Add Field
        </button>
      </div>

      {fields.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 py-2">
          No fields defined. Add fields to define the JSON structure.
        </p>
      ) : (
        <div className="space-y-2">
          {fields.map((field, index) => (
            <div key={index} className="flex gap-2 items-center p-2 bg-gray-50 dark:bg-gray-800 rounded">
              <input
                type="text"
                value={field.name}
                onChange={(e) => updateField(index, { name: e.target.value })}
                placeholder="field name"
                className="flex-1 px-2 py-1 text-xs border rounded dark:bg-gray-700 dark:border-gray-600"
              />
              <select
                value={field.type}
                onChange={(e) => updateField(index, { type: e.target.value as SchemaField['type'] })}
                className="px-2 py-1 text-xs border rounded dark:bg-gray-700 dark:border-gray-600"
              >
                <option value="string">string</option>
                <option value="number">number</option>
                <option value="boolean">boolean</option>
                <option value="array">array</option>
                <option value="object">object</option>
              </select>
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) => updateField(index, { required: e.target.checked })}
                  className="rounded"
                />
                req
              </label>
              <button
                type="button"
                onClick={() => removeField(index)}
                className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Condition rules editor
const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  equals: 'Equals (==)',
  not_equals: 'Not Equals (!=)',
  contains: 'Contains',
  not_contains: 'Does Not Contain',
  greater_than: 'Greater Than (>)',
  less_than: 'Less Than (<)',
  greater_than_or_equals: 'Greater Than or Equals (>=)',
  less_than_or_equals: 'Less Than or Equals (<=)',
  is_empty: 'Is Empty',
  is_not_empty: 'Is Not Empty',
  regex: 'Matches Regex',
};

const UNARY_OPERATORS: ConditionOperator[] = ['is_empty', 'is_not_empty'];
const JOINER_LABELS: Record<ConditionJoiner, string> = { and: 'AND', or: 'OR' };

function createEmptyCondition(): ConditionRule {
  return {
    id: uuidv4(),
    inputReference: '',
    operator: 'equals',
    compareValue: '',
  };
}

function normalizeJoiners(conds: ConditionRule[]): ConditionRule[] {
  return conds.map((c, i) => ({
    ...c,
    joiner: i === 0 ? undefined : c.joiner || 'and',
  }));
}

function ConditionRulesField({
  value,
  onChange,
  nodeId,
}: {
  value: ConditionRule[];
  onChange: (value: unknown) => void;
  nodeId: string;
}) {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);

  // Get available references from upstream nodes
  const references = getAvailableReferences(
    nodeId,
    nodes.map((n) => ({
      id: n.id,
      type: n.data.config.type || n.type || '',
      data: { config: { ...n.data.config } as { name: string } & Record<string, unknown> },
    })),
    edges.map((e) => ({ source: e.source, target: e.target }))
  );

  // Group references by node
  const groupedReferences = references.reduce((acc, ref) => {
    if (!acc[ref.nodeName]) acc[ref.nodeName] = [];
    acc[ref.nodeName].push(ref);
    return acc;
  }, {} as Record<string, typeof references>);

  // Ensure we always have at least one condition
  const conditions = value.length > 0 ? value : [createEmptyCondition()];

  const updateCondition = (index: number, updates: Partial<ConditionRule>) => {
    const newConditions = conditions.map((c, i) => (i === index ? { ...c, ...updates } : c));
    onChange(normalizeJoiners(newConditions));
  };

  const addCondition = () => {
    const newCondition = { ...createEmptyCondition(), joiner: 'and' as ConditionJoiner };
    onChange(normalizeJoiners([...conditions, newCondition]));
  };

  const removeCondition = (index: number) => {
    const newConditions = conditions.filter((_, i) => i !== index);
    onChange(normalizeJoiners(newConditions.length > 0 ? newConditions : [createEmptyCondition()]));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Rules</span>
        <button
          type="button"
          onClick={addCondition}
          className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100"
        >
          <Plus size={12} />
          Add
        </button>
      </div>

      {conditions.map((condition, index) => {
        const operator = condition.operator || 'equals';
        const needsCompareValue = !UNARY_OPERATORS.includes(operator as ConditionOperator);

        return (
          <div key={condition.id || index} className="space-y-2">
            {index > 0 && (
              <div className="flex justify-center">
                <JoinerToggle
                  value={(condition.joiner || 'and') as ConditionJoiner}
                  onChange={(joiner) => updateCondition(index, { joiner })}
                />
              </div>
            )}

            <div className="relative rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 pr-8">
              <button
                type="button"
                onClick={() => removeCondition(index)}
                className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                title="Remove condition"
              >
                <X size={14} />
              </button>
              <div className="space-y-2">
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Input
                    </label>
                    <select
                      value={condition.inputReference || ''}
                      onChange={(e) => updateCondition(index, { inputReference: e.target.value })}
                      className="w-full px-2 py-1.5 text-xs border rounded dark:bg-gray-800 dark:border-gray-600"
                    >
                      <option value="">Select...</option>
                      {Object.entries(groupedReferences).map(([nodeName, refs]) => (
                        <optgroup key={nodeName} label={nodeName}>
                          {refs.map((ref) => (
                            <option key={ref.reference} value={ref.reference}>
                              {ref.field}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Operator
                    </label>
                    <select
                      value={operator}
                      onChange={(e) => updateCondition(index, { operator: e.target.value as ConditionOperator })}
                      className="w-full px-2 py-1.5 text-xs border rounded dark:bg-gray-800 dark:border-gray-600"
                    >
                      {(Object.keys(OPERATOR_LABELS) as ConditionOperator[]).map((op) => (
                        <option key={op} value={op}>
                          {OPERATOR_LABELS[op]}
                        </option>
                      ))}
                    </select>
                  </div>

                  {needsCompareValue && (
                    <div>
                      <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Value
                      </label>
                      <ReferenceInput
                        value={condition.compareValue || ''}
                        onChange={(v) => updateCondition(index, { compareValue: v as string })}
                        currentNodeId={nodeId}
                        placeholder={operator === 'regex' ? '^pattern.*$' : 'Compare value'}
                      />
                    </div>
                  )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function JoinerToggle({
  value,
  onChange,
}: {
  value: ConditionJoiner;
  onChange: (value: ConditionJoiner) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-900/20">
      {(Object.keys(JOINER_LABELS) as ConditionJoiner[]).map((joiner) => (
        <button
          key={joiner}
          type="button"
          onClick={() => onChange(joiner)}
          className={`px-2.5 py-1 text-[10px] font-semibold tracking-wide transition-colors
            ${value === joiner
              ? 'text-amber-900 dark:text-amber-100 bg-white dark:bg-amber-800/70 shadow-sm'
              : 'text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100'
            }`}
        >
          {JOINER_LABELS[joiner]}
        </button>
      ))}
    </div>
  );
}

function Field({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
        {label}
        {optional && (
          <span className="ml-1 text-gray-400 dark:text-gray-500 font-normal">(optional)</span>
        )}
      </label>
      {children}
    </div>
  );
}

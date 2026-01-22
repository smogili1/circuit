// TypeScript types for YAML node schema definitions

export interface NodeMeta {
  type: string;
  displayName: string;
  description: string;
  icon: string;
  color: string;
  borderColor: string;
  category: 'agents' | 'flow';
}

export type PropertyType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'textarea'
  | 'code'
  | 'reference'
  | 'inputSelector'
  | 'mcp-server-selector'
  | 'schemaBuilder'
  | 'group'
  | 'conditionRules';

export interface PropertyOption {
  value: string;
  label: string;
}

export interface ShowWhen {
  field: string;
  equals: string | boolean | number;
}

export interface PropertyDefinition {
  type: PropertyType;
  displayName: string;
  description?: string;
  default?: unknown;
  placeholder?: string;
  required?: boolean;
  supportsReferences?: boolean;
  options?: PropertyOption[] | string[];
  showWhen?: ShowWhen;
  properties?: Record<string, PropertyDefinition>;  // For 'group' type
  hidden?: boolean;  // Hide from UI but keep for backward compatibility
}

export interface SchemaField {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'any';
  displayName: string;
  description: string;
  required?: boolean;
  auto?: boolean;  // Auto-populated from connected nodes
  multiple?: boolean;  // Accepts multiple connections
}

export interface HandleDefinition {
  id: string;
  label: string;
  position?: number;  // 0-1 relative position
}

export interface NodeSchemaDefinition {
  meta: NodeMeta;
  properties: Record<string, PropertyDefinition>;
  inputs: Record<string, SchemaField> | SchemaField[];
  outputs: Record<string, SchemaField | string>;  // string for dynamic references
  handles?: {
    source?: HandleDefinition[];
    target?: HandleDefinition[];
  };
  execution?: {
    mode: 'passthrough' | 'agent' | 'evaluate' | 'merge';
    sdk?: string;
    promptTemplate?: string;
    evaluator?: string;
    handler?: string;
  };
}

// Reference format: {{nodeName.outputField}} or {{nodeName.outputField.path.to.value}}
export interface VariableReference {
  nodeId: string;
  nodeName: string;
  field: string;
  path?: string[];  // For deep access like data.items[0].name
  fullPath: string; // The complete reference string
}

// Parsed reference from a string like "{{Input.prompt}}"
export function parseReference(ref: string): VariableReference | null {
  const match = ref.match(/^\{\{([^.]+)\.(.+)\}\}$/);
  if (!match) return null;

  const [, nodeName, fieldPath] = match;
  const parts = fieldPath.split('.');
  const field = parts[0];
  const path = parts.length > 1 ? parts.slice(1) : undefined;

  return {
    nodeId: '', // Will be resolved at runtime
    nodeName,
    field,
    path,
    fullPath: ref,
  };
}

// Find all references in a string
export function findReferences(text: string): VariableReference[] {
  const regex = /\{\{([^}]+)\}\}/g;
  const refs: VariableReference[] = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    const parsed = parseReference(match[0]);
    if (parsed) {
      refs.push(parsed);
    }
  }

  return refs;
}

// Interpolate references in a string with actual values
export function interpolateReferences(
  text: string,
  values: Record<string, Record<string, unknown>>
): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const parts = path.split('.');
    const nodeName = parts[0];
    const fieldPath = parts.slice(1);

    let value: unknown = values[nodeName];
    for (const part of fieldPath) {
      if (value && typeof value === 'object') {
        // Handle array access like items[0]
        const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
        if (arrayMatch) {
          const [, key, index] = arrayMatch;
          value = (value as Record<string, unknown>)[key];
          if (Array.isArray(value)) {
            value = value[parseInt(index, 10)];
          }
        } else {
          value = (value as Record<string, unknown>)[part];
        }
      } else {
        return match; // Keep original if path doesn't resolve
      }
    }

    if (value === undefined) return match;
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  });
}

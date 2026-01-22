// TypeScript types for node schemas - mirrors backend schema types
// These are fetched from the backend API at runtime

export interface NodeMeta {
  type: string;
  displayName: string;
  description: string;
  icon: string;
  color: string;
  borderColor: string;
  category: 'agents' | 'flow';
  hidden?: boolean;     // Hide from node palette
  deletable?: boolean;  // false = cannot be deleted by user
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
  | 'group';

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
}

export interface SchemaField {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'any';
  displayName: string;
  description: string;
  required?: boolean;
  auto?: boolean;
  multiple?: boolean;
  supportsReferences?: boolean;
}

export interface HandleDefinition {
  id: string;
  label: string;
  position?: number;
}

export interface NodeSchemaDefinition {
  meta: NodeMeta;
  properties: Record<string, PropertyDefinition>;
  inputs: Record<string, SchemaField> | SchemaField[];
  outputs: Record<string, SchemaField | string>;
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

export type NodeSchemaRegistry = Record<string, NodeSchemaDefinition>;

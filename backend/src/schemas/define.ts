// Schema definition utilities with type inference
// This is the single source of truth for node schemas and their TypeScript types

// =============================================================================
// Base Types for Schema Definition
// =============================================================================

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
  | 'array'
  | 'conditionRules';

export type NodeCategory = 'agents' | 'flow';

export interface PropertyOption {
  readonly value: string;
  readonly label: string;
}

export interface ShowWhen {
  readonly field: string;
  readonly equals?: string | boolean | number;
  readonly notEmpty?: boolean;
}

// =============================================================================
// Property Definition Types
// =============================================================================

interface BasePropertyDef {
  readonly displayName?: string;
  readonly description?: string;
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly supportsReferences?: boolean;
  readonly showWhen?: ShowWhen;
  readonly collapsed?: boolean;
  readonly hidden?: boolean;  // Hide from UI but keep for backward compatibility
}

interface StringPropertyDef extends BasePropertyDef {
  readonly type: 'string' | 'textarea' | 'code' | 'reference' | 'schemaBuilder';
  readonly default?: string;
}

interface NumberPropertyDef extends BasePropertyDef {
  readonly type: 'number';
  readonly default?: number;
}

interface BooleanPropertyDef extends BasePropertyDef {
  readonly type: 'boolean';
  readonly default?: boolean;
}

interface SelectPropertyDef<T extends readonly PropertyOption[]> extends BasePropertyDef {
  readonly type: 'select';
  readonly options: T;
  readonly default?: T[number]['value'];
}

interface MultiSelectPropertyDef extends BasePropertyDef {
  readonly type: 'multiselect';
  readonly options: readonly string[];
  readonly default?: readonly string[];
}

interface InputSelectorPropertyDef extends BasePropertyDef {
  readonly type: 'inputSelector';
  readonly default?: readonly unknown[];
}

interface MCPServerSelectorPropertyDef extends BasePropertyDef {
  readonly type: 'mcp-server-selector';
  readonly default?: readonly unknown[];
}

interface GroupPropertyDef<P extends PropertyDefinitions> extends BasePropertyDef {
  readonly type: 'group';
  readonly properties: P;
}

interface ArrayPropertyDef<I extends PropertyDefinitions> extends BasePropertyDef {
  readonly type: 'array';
  readonly items: I;
  readonly default?: readonly unknown[];
}

interface ConditionRulesPropertyDef extends BasePropertyDef {
  readonly type: 'conditionRules';
  readonly default?: readonly ConditionRuleType[];
}

// Forward declaration for condition rules (actual type is in condition.ts)
// This is just for the property definition type system
interface ConditionRuleType {
  id?: string;
  inputReference: string;
  operator: string;
  compareValue?: string;
  joiner?: 'and' | 'or';
}

export type PropertyDefinition =
  | StringPropertyDef
  | NumberPropertyDef
  | BooleanPropertyDef
  | SelectPropertyDef<readonly PropertyOption[]>
  | MultiSelectPropertyDef
  | InputSelectorPropertyDef
  | MCPServerSelectorPropertyDef
  | GroupPropertyDef<PropertyDefinitions>
  | ArrayPropertyDef<PropertyDefinitions>
  | ConditionRulesPropertyDef;

export type PropertyDefinitions = {
  readonly [key: string]: PropertyDefinition;
};

// =============================================================================
// Schema Field Types (inputs/outputs)
// =============================================================================

export interface SchemaField {
  readonly type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'any';
  readonly displayName: string;
  readonly description: string;
  readonly required?: boolean;
  readonly auto?: boolean;
  readonly multiple?: boolean;
  readonly supportsReferences?: boolean;
}

export interface HandleDefinition {
  readonly id: string;
  readonly label: string;
  readonly position?: number;
  readonly color?: string;
  readonly dashed?: boolean;
}

// =============================================================================
// Node Meta Type
// =============================================================================

export interface NodeMeta<T extends string = string> {
  readonly type: T;
  readonly displayName: string;
  readonly description: string;
  readonly icon: string;
  readonly color: string;
  readonly borderColor: string;
  readonly category: NodeCategory;
  readonly hidden?: boolean;
  readonly deletable?: boolean;
}

// =============================================================================
// Full Schema Definition Type
// =============================================================================

export interface SchemaDefinition<
  T extends string = string,
  P extends PropertyDefinitions = PropertyDefinitions
> {
  readonly meta: NodeMeta<T>;
  readonly properties: P;
  readonly inputs?: Record<string, SchemaField>;
  readonly outputs?: Record<string, SchemaField | string>;
  readonly handles?: {
    readonly source?: readonly HandleDefinition[];
    readonly target?: readonly HandleDefinition[];
  };
  readonly execution?: {
    readonly mode: 'passthrough' | 'agent' | 'evaluate' | 'merge' | 'approval';
    readonly sdk?: string;
    readonly promptTemplate?: string;
    readonly handler?: string;
    readonly waitForUser?: boolean;
  };
}

// =============================================================================
// Type Inference Utilities
// =============================================================================

// Extract option values from a select property
type ExtractOptionValues<T extends readonly PropertyOption[]> = T[number]['value'];

// Infer the TypeScript type from a property definition
type InferPropertyType<P extends PropertyDefinition> =
  P extends { type: 'string' | 'textarea' | 'code' | 'reference' | 'schemaBuilder' } ? string :
  P extends { type: 'number' } ? number :
  P extends { type: 'boolean' } ? boolean :
  P extends { type: 'select'; options: infer O extends readonly PropertyOption[] } ? ExtractOptionValues<O> :
  P extends { type: 'multiselect' } ? string[] :
  P extends { type: 'inputSelector' } ? InputSelection[] :
  P extends { type: 'mcp-server-selector' } ? MCPNodeServerConfig[] :
  P extends { type: 'conditionRules' } ? ConditionRuleType[] :
  P extends { type: 'group'; properties: infer GP extends PropertyDefinitions } ? InferPropertiesType<GP> :
  P extends { type: 'array'; items: infer I extends PropertyDefinitions } ? InferPropertiesType<I>[] :
  unknown;

// Infer types for all properties, respecting required vs optional
type InferPropertiesType<P extends PropertyDefinitions> = {
  [K in keyof P as P[K] extends { required: true } ? K : never]: InferPropertyType<P[K]>;
} & {
  [K in keyof P as P[K] extends { required: true } ? never : K]?: InferPropertyType<P[K]>;
};

// Main type inference - creates node config type from schema
export type InferNodeConfig<S extends SchemaDefinition> =
  { type: S['meta']['type'] } & InferPropertiesType<S['properties']>;

// =============================================================================
// Supporting Types (used by inferred types)
// =============================================================================

export interface InputSelection {
  nodeId: string;
  nodeName: string;
  fields: string[];
}

export interface MCPNodeServerConfig {
  serverId: string;
  enabledTools: string[] | '*';
}

// =============================================================================
// Schema Definition Helper
// =============================================================================

// This function preserves the literal types for inference
export function defineSchema<
  T extends string,
  P extends PropertyDefinitions
>(schema: SchemaDefinition<T, P>): SchemaDefinition<T, P> {
  return schema;
}

// =============================================================================
// Schema Registry Type
// =============================================================================

export type NodeSchemaRegistry = Record<string, SchemaDefinition>;

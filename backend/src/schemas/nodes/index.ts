// Node Schema Registry
// Single source of truth for all node types and their configurations

// Re-export schema definition utilities
export {
  defineSchema,
  type InferNodeConfig,
  type PropertyType,
  type PropertyDefinition,
  type PropertyDefinitions,
  type PropertyOption,
  type ShowWhen,
  type SchemaField,
  type HandleDefinition,
  type NodeMeta,
  type NodeCategory,
  type SchemaDefinition,
  type NodeSchemaRegistry,
  type InputSelection,
  type MCPNodeServerConfig,
} from '../define';

// Export individual schemas and their config types
export { claudeAgentSchema, type ClaudeNodeConfig } from './claude-agent';
export { codexAgentSchema, type CodexNodeConfig } from './codex-agent';
export { inputSchema, type InputNodeConfig } from './input';
export { outputSchema, type OutputNodeConfig } from './output';
export { conditionSchema, type ConditionNodeConfig, type ConditionOperator, type ConditionJoiner, type ConditionRule, CONDITION_OPERATORS } from './condition';
export { mergeSchema, type MergeNodeConfig } from './merge';
export { javascriptSchema, type JavaScriptNodeConfig } from './javascript';
export { approvalSchema, type ApprovalNodeConfig, type ApprovalInputSelection } from './approval';
export { bashSchema, type BashNodeConfig } from './bash';
export { selfReflectSchema, type SelfReflectNodeConfig } from './self-reflect';

// Import for registry
import { claudeAgentSchema } from './claude-agent';
import { codexAgentSchema } from './codex-agent';
import { inputSchema } from './input';
import { outputSchema } from './output';
import { conditionSchema } from './condition';
import { mergeSchema } from './merge';
import { javascriptSchema } from './javascript';
import { approvalSchema } from './approval';
import { bashSchema } from './bash';
import { selfReflectSchema } from './self-reflect';

import type { ClaudeNodeConfig } from './claude-agent';
import type { CodexNodeConfig } from './codex-agent';
import type { InputNodeConfig } from './input';
import type { OutputNodeConfig } from './output';
import type { ConditionNodeConfig } from './condition';
import type { MergeNodeConfig } from './merge';
import type { JavaScriptNodeConfig } from './javascript';
import type { ApprovalNodeConfig } from './approval';
import type { BashNodeConfig } from './bash';
import type { SelfReflectNodeConfig } from './self-reflect';

// Schema registry - maps node type to schema definition
export const schemas = {
  'claude-agent': claudeAgentSchema,
  'codex-agent': codexAgentSchema,
  'input': inputSchema,
  'output': outputSchema,
  'condition': conditionSchema,
  'merge': mergeSchema,
  'javascript': javascriptSchema,
  'approval': approvalSchema,
  'bash': bashSchema,
  'self-reflect': selfReflectSchema,
} as const;

// Union type of all node configurations
export type NodeConfig =
  | ClaudeNodeConfig
  | CodexNodeConfig
  | InputNodeConfig
  | OutputNodeConfig
  | ConditionNodeConfig
  | MergeNodeConfig
  | JavaScriptNodeConfig
  | ApprovalNodeConfig
  | BashNodeConfig
  | SelfReflectNodeConfig;

// Node type string literal union
export type NodeType = NodeConfig['type'];

// Get schema by node type
export function getSchema(nodeType: string) {
  return schemas[nodeType as keyof typeof schemas];
}

// Get all node types
export function getNodeTypes(): NodeType[] {
  return Object.keys(schemas) as NodeType[];
}

// Get default config for a node type
export function getDefaultConfig(nodeType: string): Record<string, unknown> {
  const schema = getSchema(nodeType);
  if (!schema) return {};

  const defaults: Record<string, unknown> = { type: nodeType };

  for (const [key, prop] of Object.entries(schema.properties)) {
    if ('default' in prop && prop.default !== undefined) {
      defaults[key] = prop.default;
    }
  }

  return defaults;
}

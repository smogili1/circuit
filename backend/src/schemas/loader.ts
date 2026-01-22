// Schema loader - provides access to TypeScript schemas
// Now loads from TypeScript modules instead of YAML files

import { schemas, getSchema as getSchemaFromIndex, getNodeTypes as getNodeTypesFromIndex, getDefaultConfig as getDefaultConfigFromIndex } from './nodes/index.js';
import type { SchemaDefinition } from './define.js';

// Re-export the schemas registry
export { schemas };

// Convert TypeScript schemas to the format expected by the API
// (compatible with the old NodeSchemaDefinition format)
function convertToApiFormat(schema: SchemaDefinition): Record<string, unknown> {
  return {
    meta: schema.meta,
    properties: schema.properties,
    inputs: schema.inputs || {},
    outputs: schema.outputs || {},
    handles: schema.handles,
    execution: schema.execution,
  };
}

/**
 * Load all node schemas
 * Now returns TypeScript schemas directly instead of loading from YAML
 */
export function loadAllSchemas(): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [type, schema] of Object.entries(schemas)) {
    result[type] = convertToApiFormat(schema);
  }
  return result;
}

/**
 * Get a specific schema by node type
 */
export function getSchema(nodeType: string): Record<string, unknown> | undefined {
  const schema = getSchemaFromIndex(nodeType);
  if (!schema) return undefined;
  return convertToApiFormat(schema);
}

/**
 * Get all available node types
 */
export function getNodeTypes(): string[] {
  return getNodeTypesFromIndex();
}

/**
 * Clear the schema cache (no-op now, kept for API compatibility)
 */
export function clearSchemaCache(): void {
  // No longer needed - schemas are loaded from TypeScript modules
}

/**
 * Get default config for a node type based on schema defaults
 */
export function getDefaultConfig(nodeType: string): Record<string, unknown> {
  return getDefaultConfigFromIndex(nodeType);
}

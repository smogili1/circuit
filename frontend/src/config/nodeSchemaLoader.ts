// Node schema loader - now uses schemaStore which fetches from backend API
// This module provides helper functions for accessing schema data

import { useSchemaStore } from '../stores/schemaStore';
import { SchemaField } from './nodeSchema.types';

/**
 * Get schema for a specific node type (from store)
 */
export function getNodeSchema(nodeType: string) {
  return useSchemaStore.getState().getSchema(nodeType);
}

/**
 * Get output fields for a node, including dynamic fields from JSON schema
 */
export function getNodeOutputFields(
  nodeType: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nodeConfig?: any
): Record<string, SchemaField> {
  const schema = getNodeSchema(nodeType);
  if (!schema) return {};

  const outputs: Record<string, SchemaField> = {};

  // Add static outputs
  for (const [key, value] of Object.entries(schema.outputs)) {
    if (typeof value === 'object' && !key.startsWith('_')) {
      outputs[key] = value as SchemaField;
    }
  }

  // Handle dynamic outputs from JSON schema
  const dynamicKey = schema.outputs._dynamicFromSchema;
  if (dynamicKey && typeof dynamicKey === 'string' && nodeConfig) {
    // Parse the path like "outputConfig.schema"
    const pathParts = dynamicKey.split('.');
    let schemaValue: unknown = nodeConfig;
    for (const part of pathParts) {
      if (schemaValue && typeof schemaValue === 'object') {
        schemaValue = (schemaValue as Record<string, unknown>)[part];
      }
    }

    // If we have a JSON schema string, parse it to extract fields
    if (typeof schemaValue === 'string') {
      try {
        const jsonSchema = JSON.parse(schemaValue);
        if (jsonSchema.properties) {
          for (const [propName, propDef] of Object.entries(jsonSchema.properties)) {
            const prop = propDef as Record<string, unknown>;
            outputs[propName] = {
              type: mapJsonSchemaType(prop.type as string),
              displayName: propName,
              description: (prop.description as string) || `JSON field: ${propName}`,
            };
          }
        }
      } catch {
        // Invalid JSON schema, skip
      }
    }
  }

  return outputs;
}

/**
 * Map JSON Schema types to our internal types
 */
function mapJsonSchemaType(jsonType: string): SchemaField['type'] {
  switch (jsonType) {
    case 'string': return 'string';
    case 'number':
    case 'integer': return 'number';
    case 'boolean': return 'boolean';
    case 'array': return 'array';
    case 'object': return 'object';
    default: return 'any';
  }
}

/**
 * Get all available references from upstream nodes
 */
export interface AvailableReference {
  nodeId: string;
  nodeName: string;
  field: string;
  fieldDef: SchemaField;
  reference: string; // e.g., "{{NodeName.field}}"
}

export function getAvailableReferences(
  currentNodeId: string,
  nodes: Array<{ id: string; type: string; data: { config: { name: string } & Record<string, unknown> } }>,
  edges: Array<{ source: string; target: string }>
): AvailableReference[] {
  const references: AvailableReference[] = [];

  // Find all upstream nodes (nodes that can reach the current node)
  const upstreamNodeIds = findUpstreamNodes(currentNodeId, edges);

  for (const nodeId of upstreamNodeIds) {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) continue;

    const nodeName = node.data.config.name;
    const outputFields = getNodeOutputFields(node.type, node.data.config);

    for (const [fieldName, fieldDef] of Object.entries(outputFields)) {
      references.push({
        nodeId,
        nodeName,
        field: fieldName,
        fieldDef,
        reference: `{{${nodeName}.${fieldName}}}`,
      });
    }
  }

  return references;
}

/**
 * Find all nodes upstream of the given node (traverse backwards through edges)
 */
export function findUpstreamNodes(
  nodeId: string,
  edges: Array<{ source: string; target: string }>
): Set<string> {
  const visited = new Set<string>();

  const visit = (currentId: string) => {
    const incomingEdges = edges.filter(e => e.target === currentId);

    for (const edge of incomingEdges) {
      if (visited.has(edge.source)) continue;
      visited.add(edge.source);
      visit(edge.source);
    }
  };

  visit(nodeId);
  visited.delete(nodeId);

  return visited;
}

/**
 * Reference interpolation utilities for workflow execution.
 * Handles {{NodeName.field}} syntax for referencing upstream node outputs.
 */

export interface ParsedReference {
  nodeName: string;
  field: string;
  path: string[];
  fullMatch: string;
}

/**
 * Parse a single reference like {{NodeName.field.path}}
 */
export function parseReference(ref: string): ParsedReference | null {
  const match = ref.match(/^\{\{([^.]+)\.(.+)\}\}$/);
  if (!match) return null;

  const [fullMatch, nodeName, fieldPath] = match;
  const parts = fieldPath.split('.');
  const field = parts[0];
  const path = parts.slice(1);

  return {
    nodeName,
    field,
    path,
    fullMatch,
  };
}

/**
 * Find all references in a string
 */
export function findReferences(text: string): ParsedReference[] {
  const regex = /\{\{([^}]+)\}\}/g;
  const refs: ParsedReference[] = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    const parsed = parseReference(match[0]);
    if (parsed) {
      refs.push(parsed);
    }
  }

  return refs;
}

/**
 * Get a value from a nested object using a path array
 */
function getNestedValue(obj: unknown, path: string[]): unknown {
  let current = obj;

  for (const part of path) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (typeof current !== 'object') {
      return undefined;
    }

    // Handle array access like items[0]
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, indexStr] = arrayMatch;
      const index = parseInt(indexStr, 10);
      current = (current as Record<string, unknown>)[key];
      if (Array.isArray(current)) {
        current = current[index];
      } else {
        return undefined;
      }
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }

  return current;
}

/**
 * Resolve a reference to its actual value
 */
export function resolveReference(
  ref: ParsedReference,
  nodeOutputs: Map<string, unknown>,
  nodeNameToId: Map<string, string>,
  variables?: Map<string, unknown>
): unknown {
  // Find the node ID by name
  const nodeId = nodeNameToId.get(ref.nodeName);
  if (!nodeId) {
    return undefined;
  }

  // Handle special variable-based fields that exist even without output
  if (variables) {
    if (ref.field === 'runCount' && ref.path.length === 0) {
      return variables.get(`node.${nodeId}.runCount`) ?? 0;
    }
  }

  // Get the node's output
  const output = nodeOutputs.get(nodeId);
  if (output === undefined) {
    if (ref.field === 'transcript' && variables) {
      return variables.get(`node.${nodeId}.transcript`);
    }
    return undefined;
  }

  // If output is a simple value and we're looking for 'result', return it
  if (ref.field === 'result' && typeof output !== 'object') {
    return ref.path.length === 0 ? output : undefined;
  }

  // If output is an object, navigate to the field
  if (typeof output === 'object' && output !== null) {
    const outputObj = output as Record<string, unknown>;
    if (!(ref.field in outputObj)) {
      if (ref.field === 'result') {
        if (ref.path.length === 0) {
          return output;
        }
        return getNestedValue(outputObj, ref.path);
      }
      if (ref.field === 'transcript' && variables) {
        return variables.get(`node.${nodeId}.transcript`);
      }
      return undefined;
    }

    const fieldValue = outputObj[ref.field];

    if (ref.path.length === 0) {
      return fieldValue;
    }

    return getNestedValue(fieldValue, ref.path);
  }

  // For simple outputs, if asking for 'prompt' (input node), return it
  if (ref.field === 'prompt' && ref.path.length === 0) {
    return output;
  }

  if (ref.field === 'transcript' && variables) {
    return variables.get(`node.${nodeId}.transcript`);
  }

  return undefined;
}

/**
 * Interpolate all references in a string with actual values
 */
export function interpolateReferences(
  text: string,
  nodeOutputs: Map<string, unknown>,
  nodeNameToId: Map<string, string>,
  variables?: Map<string, unknown>
): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (match) => {
    const parsed = parseReference(match);
    if (!parsed) {
      return match; // Keep original if can't parse
    }

    const value = resolveReference(parsed, nodeOutputs, nodeNameToId, variables);

    if (value === undefined) {
      return match; // Keep original if can't resolve
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  });
}

/**
 * Build a node name to ID mapping from workflow nodes
 */
export function buildNodeNameMap(
  nodes: Array<{ id: string; data: { name?: string } }>
): Map<string, string> {
  const map = new Map<string, string>();

  for (const node of nodes) {
    if (node.data.name) {
      map.set(node.data.name, node.id);
    }
  }

  return map;
}

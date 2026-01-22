import { create } from 'zustand';
import { NodeSchemaDefinition, NodeSchemaRegistry } from '../types/schema';

interface SchemaState {
  // Schema registry
  schemas: NodeSchemaRegistry;

  // Loading state
  loading: boolean;
  error: string | null;
  initialized: boolean;

  // Actions
  fetchSchemas: () => Promise<void>;
  getSchema: (nodeType: string) => NodeSchemaDefinition | undefined;
  getNodeTypes: () => string[];
  getDefaultConfig: (nodeType: string) => Record<string, unknown>;
}

/**
 * Extract default config values from a schema's properties
 */
function extractDefaults(schema: NodeSchemaDefinition): Record<string, unknown> {
  const config: Record<string, unknown> = {
    type: schema.meta.type,
  };

  for (const [key, prop] of Object.entries(schema.properties)) {
    if (prop.default !== undefined) {
      config[key] = prop.default;
    }

    // Handle nested group properties
    if (prop.type === 'group' && prop.properties) {
      const groupConfig: Record<string, unknown> = {};
      for (const [groupKey, groupProp] of Object.entries(prop.properties)) {
        if (groupProp.default !== undefined) {
          groupConfig[groupKey] = groupProp.default;
        }
      }
      if (Object.keys(groupConfig).length > 0) {
        config[key] = groupConfig;
      }
    }
  }

  return config;
}

export const useSchemaStore = create<SchemaState>((set, get) => ({
  schemas: {},
  loading: false,
  error: null,
  initialized: false,

  fetchSchemas: async () => {
    // Don't refetch if already initialized successfully
    if (get().initialized && !get().error) return;

    set({ loading: true, error: null, initialized: false });

    try {
      const response = await fetch('/api/schemas');
      if (!response.ok) {
        throw new Error(`Failed to fetch schemas: ${response.statusText}`);
      }

      const schemas: NodeSchemaRegistry = await response.json();
      set({ schemas, loading: false, initialized: true });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch schemas',
        loading: false
      });
    }
  },

  getSchema: (nodeType: string) => {
    return get().schemas[nodeType];
  },

  getNodeTypes: () => {
    return Object.keys(get().schemas);
  },

  getDefaultConfig: (nodeType: string) => {
    const schema = get().schemas[nodeType];
    if (!schema) {
      return { type: nodeType, name: nodeType };
    }
    return extractDefaults(schema);
  },
}));

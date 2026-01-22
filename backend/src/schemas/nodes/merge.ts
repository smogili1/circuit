// Merge Node Schema
// Combines multiple upstream branches

import { defineSchema, InferNodeConfig } from '../define';

export const mergeSchema = defineSchema({
  meta: {
    type: 'merge' as const,
    displayName: 'Merge',
    description: 'Merge multiple upstream branches into one',
    icon: 'Merge',
    color: '#6366f1',
    borderColor: '#4f46e5',
    category: 'flow',
  },
  properties: {
    name: {
      type: 'string',
      displayName: 'Name',
      default: 'Merge',
      required: true as const,
    },
    strategy: {
      type: 'select',
      displayName: 'Strategy',
      default: 'wait-all',
      options: [
        { value: 'wait-all', label: 'Wait All (wait for all inputs)' },
        { value: 'first-complete', label: 'First Complete (proceed on first)' },
      ] as const,
    },
  },
  inputs: {
    _dynamic: {
      type: 'any',
      displayName: 'Inputs',
      description: 'Accepts connections from multiple upstream nodes',
      multiple: true,
    },
  },
  outputs: {
    all: {
      type: 'object',
      displayName: 'All Inputs',
      description: 'All upstream outputs keyed by node name',
    },
    _dynamicFromInputs: 'true',
  },
  execution: {
    mode: 'merge',
  },
});

export type MergeNodeConfig = InferNodeConfig<typeof mergeSchema>;

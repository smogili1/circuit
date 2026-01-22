// Output Node Schema
// Terminal node that collects workflow results

import { defineSchema, InferNodeConfig } from '../define';

export const outputSchema = defineSchema({
  meta: {
    type: 'output' as const,
    displayName: 'Output',
    description: 'Workflow output endpoint',
    icon: 'CheckCircle2',
    color: '#8b5cf6',
    borderColor: '#7c3aed',
    category: 'flow',
    hidden: true,
    deletable: false,
  },
  properties: {
    name: {
      type: 'string',
      displayName: 'Name',
      default: 'Output',
      required: true as const,
    },
  },
  inputs: {
    value: {
      type: 'any',
      displayName: 'Value',
      description: 'The final result to output',
      required: true,
      supportsReferences: true,
    },
  },
  outputs: {
    result: {
      type: 'any',
      displayName: 'Result',
      description: 'The workflow\'s final output',
    },
  },
  handles: {
    source: [],
  },
  execution: {
    mode: 'passthrough',
  },
});

export type OutputNodeConfig = InferNodeConfig<typeof outputSchema>;

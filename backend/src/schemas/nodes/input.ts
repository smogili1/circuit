// Input Node Schema
// Entry point for user prompts into the workflow

import { defineSchema, InferNodeConfig } from '../define';

export const inputSchema = defineSchema({
  meta: {
    type: 'input' as const,
    displayName: 'Input',
    description: 'User input entry point for the workflow',
    icon: 'ArrowRightCircle',
    color: '#3b82f6',
    borderColor: '#2563eb',
    category: 'flow',
    hidden: true,
    deletable: false,
  },
  properties: {
    name: {
      type: 'string',
      displayName: 'Name',
      default: 'Input',
      required: true as const,
    },
    description: {
      type: 'string',
      displayName: 'Description',
      default: 'Enter your prompt',
      placeholder: 'Describe what input is expected',
    },
  },
  inputs: {},
  outputs: {
    prompt: {
      type: 'string',
      displayName: 'Prompt',
      description: 'The user\'s input text',
    },
  },
  execution: {
    mode: 'passthrough',
  },
});

export type InputNodeConfig = InferNodeConfig<typeof inputSchema>;

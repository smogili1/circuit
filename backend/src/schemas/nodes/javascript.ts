// JavaScript Execution Node Schema
// Executes user-provided JavaScript in a sandboxed VM context

import { defineSchema, InputSelection } from '../define';

export const javascriptSchema = defineSchema({
  meta: {
    type: 'javascript' as const,
    displayName: 'JavaScript',
    description: 'Execute custom JavaScript code',
    icon: 'Code',
    color: '#f7df1e',
    borderColor: '#c9b515',
    category: 'flow',
  },
  properties: {
    name: {
      type: 'string',
      displayName: 'Name',
      default: 'JavaScript Executor',
      required: true as const,
    },
    code: {
      type: 'code',
      displayName: 'Code',
      placeholder: `// Access upstream outputs via \`inputs\` object
// Return value becomes this node's output

const { AgentName } = inputs;
return {
  processed: AgentName.result.toUpperCase()
};`,
      description: 'JavaScript code to execute. Use `inputs` to access upstream node outputs.',
      required: true as const,
    },
    timeout: {
      type: 'number',
      displayName: 'Timeout (ms)',
      default: 5000,
      description: 'Maximum execution time in milliseconds',
    },
    inputMappings: {
      type: 'inputSelector',
      displayName: 'Input Data',
      description: 'Select which upstream outputs to make available',
    },
  },
  inputs: {
    data: {
      type: 'any',
      displayName: 'Input',
      description: 'Data from upstream nodes',
      multiple: true,
    },
  },
  outputs: {
    result: {
      type: 'any',
      displayName: 'Result',
      description: 'Return value from the JavaScript code',
    },
  },
  execution: {
    mode: 'evaluate',
  },
});

export interface JavaScriptNodeConfig {
  type: 'javascript';
  name: string;
  code: string;
  timeout?: number;
  inputMappings?: InputSelection[];
}

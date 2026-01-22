// Bash Execution Node Schema
// Executes bash commands with streaming output

import { defineSchema, InferNodeConfig, InputSelection } from '../define';

export const bashSchema = defineSchema({
  meta: {
    type: 'bash' as const,
    displayName: 'Bash',
    description: 'Execute bash commands',
    icon: 'Code2',
    color: '#4EAA25',
    borderColor: '#3d8b1f',
    category: 'flow',
  },
  properties: {
    name: {
      type: 'string',
      displayName: 'Name',
      default: 'Bash Executor',
      required: true as const,
    },
    script: {
      type: 'code',
      displayName: 'Script',
      placeholder: `#!/bin/bash
# Access upstream outputs via {{NodeName.field}} syntax
echo "Hello World"`,
      description: 'Bash script to execute. Use {{NodeName.field}} to reference upstream outputs.',
      required: true as const,
    },
    timeout: {
      type: 'number',
      displayName: 'Timeout (ms)',
      default: 30000,
      description: 'Maximum execution time in milliseconds',
    },
    workingDirectory: {
      type: 'string',
      displayName: 'Working Directory',
      description: 'Directory to execute the script in (defaults to workflow directory)',
      supportsReferences: true,
    },
    inputMappings: {
      type: 'inputSelector',
      displayName: 'Input Data',
      description: 'Select which upstream outputs to make available as environment variables',
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
    stdout: {
      type: 'string',
      displayName: 'Output',
      description: 'Standard output from the command',
    },
    stderr: {
      type: 'string',
      displayName: 'Error Output',
      description: 'Standard error from the command',
    },
    exitCode: {
      type: 'number',
      displayName: 'Exit Code',
      description: 'Process exit code (0 = success)',
    },
  },
  execution: {
    mode: 'evaluate',
  },
});

export interface BashNodeConfig {
  type: 'bash';
  name: string;
  script: string;
  timeout?: number;
  workingDirectory?: string;
  inputMappings?: InputSelection[];
}

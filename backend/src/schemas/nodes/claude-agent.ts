// Claude Agent Node Schema
// Executes tasks using Claude Code SDK

import { defineSchema, InferNodeConfig } from '../define';
import {
  sharedAgentProperties,
  sharedAgentInputs,
  sharedAgentOutputs,
} from './agent-shared';

export const claudeAgentSchema = defineSchema({
  meta: {
    type: 'claude-agent' as const,
    displayName: 'Claude Agent',
    description: 'AI coding agent powered by Claude',
    icon: 'Sparkles',
    color: '#d48a5f',
    borderColor: '#c77347',
    category: 'agents',
  },
  properties: {
    name: {
      type: 'string',
      displayName: 'Name',
      default: 'Claude Agent',
      required: true as const,
    },
    userQuery: sharedAgentProperties.userQuery,
    model: {
      type: 'select',
      displayName: 'Model',
      default: 'sonnet',
      options: [
        { value: 'opus', label: 'Opus (Most capable)' },
        { value: 'sonnet', label: 'Sonnet (Balanced)' },
        { value: 'haiku', label: 'Haiku (Fastest)' },
      ] as const,
    },
    systemPrompt: {
      type: 'textarea',
      displayName: 'System Prompt',
      placeholder: 'Optional instructions for the agent',
      supportsReferences: true,
    },
    tools: {
      type: 'multiselect',
      displayName: 'Built-in Tools',
      default: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
      options: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
    },
    mcpServers: sharedAgentProperties.mcpServers,
    workingDirectory: sharedAgentProperties.workingDirectory,
    maxTurns: {
      type: 'number',
      displayName: 'Max Turns',
      placeholder: 'No limit',
      description: 'Maximum conversation turns. Leave empty for unlimited.',
    },
    timeout: {
      type: 'number',
      displayName: 'Timeout (ms)',
      placeholder: 'Execution timeout',
    },
    conversationMode: sharedAgentProperties.conversationMode,
    outputConfig: sharedAgentProperties.outputConfig,
    rejectionHandler: sharedAgentProperties.rejectionHandler,
  },
  inputs: sharedAgentInputs,
  outputs: sharedAgentOutputs,
  execution: {
    mode: 'agent',
    sdk: 'claude-code',
  },
});

// Inferred type from schema
export type ClaudeNodeConfig = InferNodeConfig<typeof claudeAgentSchema>;

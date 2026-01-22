// Codex Agent Node Schema
// Executes tasks using OpenAI Codex SDK

import { defineSchema, InferNodeConfig } from '../define';
import {
  sharedAgentProperties,
  sharedAgentInputs,
  sharedAgentOutputs,
} from './agent-shared';

export const codexAgentSchema = defineSchema({
  meta: {
    type: 'codex-agent' as const,
    displayName: 'Codex Agent',
    description: 'AI coding agent powered by OpenAI Codex',
    icon: 'Code2',
    color: '#22c55e',
    borderColor: '#16a34a',
    category: 'agents',
  },
  properties: {
    name: {
      type: 'string',
      displayName: 'Name',
      default: 'Codex Agent',
      required: true as const,
    },
    userQuery: sharedAgentProperties.userQuery,
    model: {
      type: 'select',
      displayName: 'Model',
      default: 'gpt-5.2-codex',
      options: [
        { value: 'gpt-5.2-codex', label: 'GPT-5.2 Codex' },
        { value: 'gpt-5.1-codex-max', label: 'GPT-5.1 Codex Max' },
      ] as const,
    },
    approvalPolicy: {
      type: 'select',
      displayName: 'Approval Policy',
      default: 'never',
      options: [
        { value: 'untrusted', label: 'Untrusted (Always approve)' },
        { value: 'on-request', label: 'On Request' },
        { value: 'on-failure', label: 'On Failure' },
        { value: 'never', label: 'Never (Auto-approve)' },
      ] as const,
    },
    sandbox: {
      type: 'select',
      displayName: 'Sandbox',
      default: 'workspace-write',
      options: [
        { value: 'read-only', label: 'Read Only' },
        { value: 'workspace-write', label: 'Workspace Write' },
        { value: 'danger-full-access', label: 'Full Access (Dangerous)' },
      ] as const,
    },
    workingDirectory: sharedAgentProperties.workingDirectory,
    baseInstructions: {
      type: 'textarea',
      displayName: 'Base Instructions',
      placeholder: 'Instructions prepended to every prompt',
      supportsReferences: true,
    },
    mcpServers: sharedAgentProperties.mcpServers,
    conversationMode: sharedAgentProperties.conversationMode,
    outputConfig: sharedAgentProperties.outputConfig,
    rejectionHandler: sharedAgentProperties.rejectionHandler,
  },
  inputs: sharedAgentInputs,
  outputs: sharedAgentOutputs,
  execution: {
    mode: 'agent',
    sdk: 'openai-codex',
  },
});

export type CodexNodeConfig = InferNodeConfig<typeof codexAgentSchema>;

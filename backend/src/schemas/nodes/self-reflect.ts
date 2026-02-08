// Self-Reflection Agent Node Schema
// Introspects workflow execution and proposes structured evolutions

import { defineSchema, InferNodeConfig } from '../define';
import { sharedAgentProperties } from './agent-shared';

const MODEL_OPTIONS = [
  { value: 'opus', label: 'Opus (Most capable)' },
  { value: 'sonnet', label: 'Sonnet (Balanced)' },
  { value: 'haiku', label: 'Haiku (Fastest)' },
  { value: 'gpt-5.2-codex', label: 'GPT-5.2 Codex (Latest frontier)' },
  { value: 'gpt-5.2', label: 'GPT-5.2 (Frontier reasoning)' },
  { value: 'gpt-5.1-codex-max', label: 'GPT-5.1 Codex Max (Deep reasoning)' },
  { value: 'gpt-5.1-codex-mini', label: 'GPT-5.1 Codex Mini (Faster)' },
] as const;

export const selfReflectSchema = defineSchema({
  meta: {
    type: 'self-reflect' as const,
    displayName: 'Self-Reflect',
    description: 'Analyze execution context and propose workflow evolutions',
    icon: 'Brain',
    color: '#8b5cf6',
    borderColor: '#7c3aed',
    category: 'agents',
  },
  properties: {
    name: {
      type: 'string',
      displayName: 'Name',
      default: 'Self-Reflect',
      required: true as const,
    },
    agentType: {
      type: 'select',
      displayName: 'Reflection Agent',
      default: 'claude-agent',
      options: [
        { value: 'claude-agent', label: 'Claude Agent' },
        { value: 'codex-agent', label: 'Codex Agent' },
      ] as const,
    },
    model: {
      type: 'select',
      displayName: 'Model',
      default: 'sonnet',
      options: MODEL_OPTIONS,
      showWhen: { field: 'agentType', notEmpty: true },
    },
    reflectionGoal: {
      type: 'textarea',
      displayName: 'Reflection Goal',
      placeholder: 'Improve output quality, fix errors, optimize for speed, etc.',
      supportsReferences: true,
      required: true as const,
    },
    evolutionMode: {
      type: 'select',
      displayName: 'Evolution Mode',
      default: 'suggest',
      options: [
        { value: 'suggest', label: 'Suggest (requires approval)' },
        { value: 'auto-apply', label: 'Auto-apply' },
        { value: 'dry-run', label: 'Dry run (no changes)' },
      ] as const,
    },
    scope: {
      type: 'multiselect',
      displayName: 'Allowed Scope',
      description: 'Which parts of the workflow can be modified',
      default: ['prompts', 'models', 'tools', 'nodes', 'edges', 'parameters'],
      options: ['prompts', 'models', 'tools', 'nodes', 'edges', 'parameters'],
    },
    maxMutations: {
      type: 'number',
      displayName: 'Max Mutations',
      default: 10,
      description: 'Safety limit on the number of changes per execution',
    },
    includeTranscripts: {
      type: 'boolean',
      displayName: 'Include Transcripts',
      default: true,
      description: 'Include full execution transcripts from completed nodes',
    },
    systemPrompt: {
      type: 'textarea',
      displayName: 'System Prompt',
      placeholder: 'Optional additional instructions for the reflection agent',
      supportsReferences: true,
    },
    workingDirectory: sharedAgentProperties.workingDirectory,
  },
  inputs: {
    trigger: {
      type: 'any',
      displayName: 'Trigger',
      description: 'Upstream dependencies for ordering',
      multiple: true,
    },
  },
  outputs: {
    evolution: {
      type: 'object',
      displayName: 'Evolution',
      description: 'Structured evolution proposal',
    },
    applied: {
      type: 'boolean',
      displayName: 'Applied',
      description: 'Whether the evolution was applied',
    },
    validationErrors: {
      type: 'array',
      displayName: 'Validation Errors',
      description: 'Validation errors for rejected evolutions',
    },
    beforeSnapshot: {
      type: 'object',
      displayName: 'Before Snapshot',
      description: 'Workflow snapshot before evolution',
    },
    afterSnapshot: {
      type: 'object',
      displayName: 'After Snapshot',
      description: 'Workflow snapshot after evolution',
    },
  },
  execution: {
    mode: 'agent',
    handler: 'self-reflect',
  },
});

export type SelfReflectNodeConfig = InferNodeConfig<typeof selfReflectSchema>;

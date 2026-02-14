/**
 * Schema Validation Tests
 * Tests for Claude and Codex agent schema configurations
 */

import { claudeAgentSchema } from '../../src/schemas/nodes/claude-agent';
import { codexAgentSchema } from '../../src/schemas/nodes/codex-agent';

describe('Schema Validation', () => {
  describe('Claude Agent Schema', () => {
    describe('Model options', () => {
      it('should include claude-opus-4-5 in model options', () => {
        const modelProperty = claudeAgentSchema.properties.model;
        expect(modelProperty.type).toBe('select');
        expect(modelProperty.options).toBeDefined();

        const modelValues = modelProperty.options.map((opt: { value: string }) => opt.value);
        expect(modelValues).toContain('claude-opus-4-5');
      });

      it('should include claude-sonnet-4-5 in model options', () => {
        const modelProperty = claudeAgentSchema.properties.model;
        const modelValues = modelProperty.options.map((opt: { value: string }) => opt.value);
        expect(modelValues).toContain('claude-sonnet-4-5');
      });

      it('should include claude-haiku-4-5 in model options', () => {
        const modelProperty = claudeAgentSchema.properties.model;
        const modelValues = modelProperty.options.map((opt: { value: string }) => opt.value);
        expect(modelValues).toContain('claude-haiku-4-5');
      });

      it('should include legacy opus option', () => {
        const modelProperty = claudeAgentSchema.properties.model;
        const modelValues = modelProperty.options.map((opt: { value: string }) => opt.value);
        expect(modelValues).toContain('opus');
      });

      it('should include legacy sonnet option', () => {
        const modelProperty = claudeAgentSchema.properties.model;
        const modelValues = modelProperty.options.map((opt: { value: string }) => opt.value);
        expect(modelValues).toContain('sonnet');
      });

      it('should include legacy haiku option', () => {
        const modelProperty = claudeAgentSchema.properties.model;
        const modelValues = modelProperty.options.map((opt: { value: string }) => opt.value);
        expect(modelValues).toContain('haiku');
      });

      it('should have sonnet as default model', () => {
        const modelProperty = claudeAgentSchema.properties.model;
        expect(modelProperty.default).toBe('sonnet');
      });

      it('should have correct labels for all model options', () => {
        const modelProperty = claudeAgentSchema.properties.model;
        const options = modelProperty.options;

        const opusOption = options.find((opt: { value: string }) => opt.value === 'claude-opus-4-5');
        expect(opusOption?.label).toContain('Opus 4.5');
        expect(opusOption?.label).toContain('Most capable');

        const sonnetOption = options.find((opt: { value: string }) => opt.value === 'claude-sonnet-4-5');
        expect(sonnetOption?.label).toContain('Sonnet 4.5');
        expect(sonnetOption?.label).toContain('Balanced');

        const haikuOption = options.find((opt: { value: string }) => opt.value === 'claude-haiku-4-5');
        expect(haikuOption?.label).toContain('Haiku 4.5');
        expect(haikuOption?.label).toContain('Fastest');

        const legacyOpusOption = options.find((opt: { value: string }) => opt.value === 'opus');
        expect(legacyOpusOption?.label).toContain('Opus');

        const legacySonnetOption = options.find((opt: { value: string }) => opt.value === 'sonnet');
        expect(legacySonnetOption?.label).toContain('Sonnet');

        const legacyHaikuOption = options.find((opt: { value: string }) => opt.value === 'haiku');
        expect(legacyHaikuOption?.label).toContain('Haiku');
      });
    });

    describe('Schema metadata', () => {
      it('should have correct schema type', () => {
        expect(claudeAgentSchema.meta.type).toBe('claude-agent');
      });

      it('should have display name and description', () => {
        expect(claudeAgentSchema.meta.displayName).toBe('Claude Agent');
        expect(claudeAgentSchema.meta.description).toBeDefined();
      });

      it('should be in agents category', () => {
        expect(claudeAgentSchema.meta.category).toBe('agents');
      });
    });

    describe('Properties', () => {
      it('should have required properties', () => {
        expect(claudeAgentSchema.properties.name).toBeDefined();
        expect(claudeAgentSchema.properties.userQuery).toBeDefined();
        expect(claudeAgentSchema.properties.model).toBeDefined();
        expect(claudeAgentSchema.properties.tools).toBeDefined();
      });

      it('should have optional properties', () => {
        expect(claudeAgentSchema.properties.systemPrompt).toBeDefined();
        expect(claudeAgentSchema.properties.mcpServers).toBeDefined();
        expect(claudeAgentSchema.properties.workingDirectory).toBeDefined();
        expect(claudeAgentSchema.properties.maxTurns).toBeDefined();
        expect(claudeAgentSchema.properties.timeout).toBeDefined();
        expect(claudeAgentSchema.properties.conversationMode).toBeDefined();
        expect(claudeAgentSchema.properties.outputConfig).toBeDefined();
      });
    });
  });

  describe('Codex Agent Schema', () => {
    describe('Model options', () => {
      it('should include gpt-5.3-codex in model options', () => {
        const modelProperty = codexAgentSchema.properties.model;
        expect(modelProperty.type).toBe('select');
        expect(modelProperty.options).toBeDefined();

        const modelValues = modelProperty.options.map((opt: { value: string }) => opt.value);
        expect(modelValues).toContain('gpt-5.3-codex');
      });

      it('should include gpt-5.2-codex in model options', () => {
        const modelProperty = codexAgentSchema.properties.model;
        const modelValues = modelProperty.options.map((opt: { value: string }) => opt.value);
        expect(modelValues).toContain('gpt-5.2-codex');
      });

      it('should include gpt-5.2 in model options', () => {
        const modelProperty = codexAgentSchema.properties.model;
        const modelValues = modelProperty.options.map((opt: { value: string }) => opt.value);
        expect(modelValues).toContain('gpt-5.2');
      });

      it('should include gpt-5.1-codex-max in model options', () => {
        const modelProperty = codexAgentSchema.properties.model;
        const modelValues = modelProperty.options.map((opt: { value: string }) => opt.value);
        expect(modelValues).toContain('gpt-5.1-codex-max');
      });

      it('should include gpt-5.1-codex-mini in model options', () => {
        const modelProperty = codexAgentSchema.properties.model;
        const modelValues = modelProperty.options.map((opt: { value: string }) => opt.value);
        expect(modelValues).toContain('gpt-5.1-codex-mini');
      });

      it('should have gpt-5.3-codex as default model', () => {
        const modelProperty = codexAgentSchema.properties.model;
        expect(modelProperty.default).toBe('gpt-5.3-codex');
      });

      it('should have correct labels for all model options', () => {
        const modelProperty = codexAgentSchema.properties.model;
        const options = modelProperty.options;

        const gpt53Option = options.find((opt: { value: string }) => opt.value === 'gpt-5.3-codex');
        expect(gpt53Option?.label).toContain('GPT-5.3 Codex');
        expect(gpt53Option?.label).toContain('Latest frontier');

        const gpt52CodexOption = options.find((opt: { value: string }) => opt.value === 'gpt-5.2-codex');
        expect(gpt52CodexOption?.label).toContain('GPT-5.2 Codex');

        const gpt52Option = options.find((opt: { value: string }) => opt.value === 'gpt-5.2');
        expect(gpt52Option?.label).toContain('GPT-5.2');

        const gpt51MaxOption = options.find((opt: { value: string }) => opt.value === 'gpt-5.1-codex-max');
        expect(gpt51MaxOption?.label).toContain('GPT-5.1 Codex Max');

        const gpt51MiniOption = options.find((opt: { value: string }) => opt.value === 'gpt-5.1-codex-mini');
        expect(gpt51MiniOption?.label).toContain('GPT-5.1 Codex Mini');
      });
    });

    describe('Reasoning effort options', () => {
      it('should have reasoningEffort property', () => {
        const reasoningEffortProperty = codexAgentSchema.properties.reasoningEffort;
        expect(reasoningEffortProperty).toBeDefined();
        expect(reasoningEffortProperty.type).toBe('select');
      });

      it('should include all reasoning effort levels', () => {
        const reasoningEffortProperty = codexAgentSchema.properties.reasoningEffort;
        const values = reasoningEffortProperty.options.map((opt: { value: string }) => opt.value);

        expect(values).toContain('minimal');
        expect(values).toContain('low');
        expect(values).toContain('medium');
        expect(values).toContain('high');
        expect(values).toContain('xhigh');
      });

      it('should have medium as default reasoning effort', () => {
        const reasoningEffortProperty = codexAgentSchema.properties.reasoningEffort;
        expect(reasoningEffortProperty.default).toBe('medium');
      });

      it('should have correct labels for reasoning effort options', () => {
        const reasoningEffortProperty = codexAgentSchema.properties.reasoningEffort;
        const options = reasoningEffortProperty.options;

        const minimalOption = options.find((opt: { value: string }) => opt.value === 'minimal');
        expect(minimalOption?.label).toBe('Minimal');

        const lowOption = options.find((opt: { value: string }) => opt.value === 'low');
        expect(lowOption?.label).toBe('Low');

        const mediumOption = options.find((opt: { value: string }) => opt.value === 'medium');
        expect(mediumOption?.label).toBe('Medium');

        const highOption = options.find((opt: { value: string }) => opt.value === 'high');
        expect(highOption?.label).toBe('High');

        const xhighOption = options.find((opt: { value: string }) => opt.value === 'xhigh');
        expect(xhighOption?.label).toBe('Extra High');
      });
    });

    describe('Schema metadata', () => {
      it('should have correct schema type', () => {
        expect(codexAgentSchema.meta.type).toBe('codex-agent');
      });

      it('should have display name and description', () => {
        expect(codexAgentSchema.meta.displayName).toBe('Codex Agent');
        expect(codexAgentSchema.meta.description).toBeDefined();
      });

      it('should be in agents category', () => {
        expect(codexAgentSchema.meta.category).toBe('agents');
      });
    });

    describe('Properties', () => {
      it('should have required properties', () => {
        expect(codexAgentSchema.properties.name).toBeDefined();
        expect(codexAgentSchema.properties.userQuery).toBeDefined();
        expect(codexAgentSchema.properties.model).toBeDefined();
        expect(codexAgentSchema.properties.approvalPolicy).toBeDefined();
        expect(codexAgentSchema.properties.sandbox).toBeDefined();
      });

      it('should have optional properties', () => {
        expect(codexAgentSchema.properties.reasoningEffort).toBeDefined();
        expect(codexAgentSchema.properties.workingDirectory).toBeDefined();
        expect(codexAgentSchema.properties.baseInstructions).toBeDefined();
        expect(codexAgentSchema.properties.mcpServers).toBeDefined();
        expect(codexAgentSchema.properties.conversationMode).toBeDefined();
        expect(codexAgentSchema.properties.outputConfig).toBeDefined();
      });

      it('should have approval policy options', () => {
        const approvalPolicyProperty = codexAgentSchema.properties.approvalPolicy;
        const values = approvalPolicyProperty.options.map((opt: { value: string }) => opt.value);

        expect(values).toContain('untrusted');
        expect(values).toContain('on-request');
        expect(values).toContain('on-failure');
        expect(values).toContain('never');
        expect(approvalPolicyProperty.default).toBe('never');
      });

      it('should have sandbox options', () => {
        const sandboxProperty = codexAgentSchema.properties.sandbox;
        const values = sandboxProperty.options.map((opt: { value: string }) => opt.value);

        expect(values).toContain('read-only');
        expect(values).toContain('workspace-write');
        expect(values).toContain('danger-full-access');
        expect(sandboxProperty.default).toBe('workspace-write');
      });
    });
  });

  describe('Execution configuration', () => {
    it('should have correct execution mode for Claude', () => {
      expect(claudeAgentSchema.execution).toBeDefined();
      expect(claudeAgentSchema.execution?.mode).toBe('agent');
      expect(claudeAgentSchema.execution?.sdk).toBe('claude-code');
    });

    it('should have correct execution mode for Codex', () => {
      expect(codexAgentSchema.execution).toBeDefined();
      expect(codexAgentSchema.execution?.mode).toBe('agent');
      expect(codexAgentSchema.execution?.sdk).toBe('openai-codex');
    });
  });

  describe('Input/Output configuration', () => {
    it('should have inputs defined for Claude', () => {
      expect(claudeAgentSchema.inputs).toBeDefined();
    });

    it('should have outputs defined for Claude', () => {
      expect(claudeAgentSchema.outputs).toBeDefined();
    });

    it('should have inputs defined for Codex', () => {
      expect(codexAgentSchema.inputs).toBeDefined();
    });

    it('should have outputs defined for Codex', () => {
      expect(codexAgentSchema.outputs).toBeDefined();
    });
  });
});

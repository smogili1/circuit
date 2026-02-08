import { selfReflectSchema } from '../../../../src/schemas/nodes/self-reflect';

describe('Self-Reflect Schema', () => {
  describe('schema definition', () => {
    it('should have correct meta information', () => {
      expect(selfReflectSchema.meta.type).toBe('self-reflect');
      expect(selfReflectSchema.meta.displayName).toBe('Self-Reflect');
      expect(selfReflectSchema.meta.category).toBe('agents');
    });

    it('should have correct execution configuration', () => {
      expect(selfReflectSchema.execution.mode).toBe('agent');
      expect(selfReflectSchema.execution.handler).toBe('self-reflect');
    });

    it('should have trigger input with multiple: true', () => {
      expect(selfReflectSchema.inputs.trigger).toBeDefined();
      expect(selfReflectSchema.inputs.trigger.multiple).toBe(true);
    });

    it('should have all required outputs', () => {
      expect(selfReflectSchema.outputs).toHaveProperty('evolution');
      expect(selfReflectSchema.outputs).toHaveProperty('applied');
      expect(selfReflectSchema.outputs).toHaveProperty('validationErrors');
      expect(selfReflectSchema.outputs).toHaveProperty('beforeSnapshot');
      expect(selfReflectSchema.outputs).toHaveProperty('afterSnapshot');
    });
  });

  describe('properties', () => {
    it('should have name property with correct configuration', () => {
      const nameProperty = selfReflectSchema.properties.name;

      expect(nameProperty).toBeDefined();
      expect(nameProperty.type).toBe('string');
      expect(nameProperty.default).toBe('Self-Reflect');
      expect(nameProperty.required).toBe(true);
    });

    it('should have agentType property with correct configuration', () => {
      const agentTypeProperty = selfReflectSchema.properties.agentType;

      expect(agentTypeProperty).toBeDefined();
      expect(agentTypeProperty.type).toBe('select');
      expect(agentTypeProperty.default).toBe('claude-agent');
      expect(agentTypeProperty.options).toEqual([
        { value: 'claude-agent', label: 'Claude Agent' },
        { value: 'codex-agent', label: 'Codex Agent' },
      ]);
    });

    it('should have model property with correct configuration', () => {
      const modelProperty = selfReflectSchema.properties.model;

      expect(modelProperty).toBeDefined();
      expect(modelProperty.type).toBe('select');
      expect(modelProperty.default).toBe('sonnet');
      expect(modelProperty.showWhen).toEqual({
        field: 'agentType',
        notEmpty: true,
      });
      expect(modelProperty.options).toBeDefined();
      expect(Array.isArray(modelProperty.options)).toBe(true);
    });

    it('should have reflectionGoal property with correct configuration', () => {
      const reflectionGoalProperty = selfReflectSchema.properties.reflectionGoal;

      expect(reflectionGoalProperty).toBeDefined();
      expect(reflectionGoalProperty.type).toBe('textarea');
      expect(reflectionGoalProperty.required).toBe(true);
      expect(reflectionGoalProperty.supportsReferences).toBe(true);
    });

    it('should have evolutionMode property with correct configuration', () => {
      const evolutionModeProperty = selfReflectSchema.properties.evolutionMode;

      expect(evolutionModeProperty).toBeDefined();
      expect(evolutionModeProperty.type).toBe('select');
      expect(evolutionModeProperty.default).toBe('suggest');
      expect(evolutionModeProperty.options).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ value: 'suggest' }),
          expect.objectContaining({ value: 'auto-apply' }),
          expect.objectContaining({ value: 'dry-run' }),
        ])
      );
    });

    it('should have scope property with correct configuration', () => {
      const scopeProperty = selfReflectSchema.properties.scope;

      expect(scopeProperty).toBeDefined();
      expect(scopeProperty.type).toBe('multiselect');
      expect(scopeProperty.default).toEqual(['prompts', 'models', 'tools', 'nodes', 'edges', 'parameters']);
      expect(scopeProperty.options).toEqual(['prompts', 'models', 'tools', 'nodes', 'edges', 'parameters']);
    });

    it('should have maxMutations property with correct configuration', () => {
      const maxMutationsProperty = selfReflectSchema.properties.maxMutations;

      expect(maxMutationsProperty).toBeDefined();
      expect(maxMutationsProperty.type).toBe('number');
      expect(maxMutationsProperty.default).toBe(10);
    });

    it('should have includeTranscripts property with correct configuration', () => {
      const includeTranscriptsProperty = selfReflectSchema.properties.includeTranscripts;

      expect(includeTranscriptsProperty).toBeDefined();
      expect(includeTranscriptsProperty.type).toBe('boolean');
      expect(includeTranscriptsProperty.default).toBe(true);
    });

    it('should have systemPrompt property with correct configuration', () => {
      const systemPromptProperty = selfReflectSchema.properties.systemPrompt;

      expect(systemPromptProperty).toBeDefined();
      expect(systemPromptProperty.type).toBe('textarea');
      expect(systemPromptProperty.supportsReferences).toBe(true);
      expect(systemPromptProperty.required).toBeFalsy();
    });

    it('should have workingDirectory property', () => {
      const workingDirectoryProperty = selfReflectSchema.properties.workingDirectory;

      expect(workingDirectoryProperty).toBeDefined();
      expect(workingDirectoryProperty.type).toBe('string');
    });
  });

  describe('default values', () => {
    it('should have correct default for agentType', () => {
      expect(selfReflectSchema.properties.agentType.default).toBe('claude-agent');
    });

    it('should have correct default for model', () => {
      expect(selfReflectSchema.properties.model.default).toBe('sonnet');
    });

    it('should have correct default for evolutionMode', () => {
      expect(selfReflectSchema.properties.evolutionMode.default).toBe('suggest');
    });

    it('should have correct default for scope', () => {
      expect(selfReflectSchema.properties.scope.default).toEqual([
        'prompts',
        'models',
        'tools',
        'nodes',
        'edges',
        'parameters',
      ]);
    });

    it('should have correct default for maxMutations', () => {
      expect(selfReflectSchema.properties.maxMutations.default).toBe(10);
    });

    it('should have correct default for includeTranscripts', () => {
      expect(selfReflectSchema.properties.includeTranscripts.default).toBe(true);
    });
  });

  describe('required fields', () => {
    it('should require name', () => {
      expect(selfReflectSchema.properties.name.required).toBe(true);
    });

    it('should require reflectionGoal', () => {
      expect(selfReflectSchema.properties.reflectionGoal.required).toBe(true);
    });

    it('should not require systemPrompt', () => {
      expect(selfReflectSchema.properties.systemPrompt.required).toBeFalsy();
    });

    it('should not require workingDirectory', () => {
      expect(selfReflectSchema.properties.workingDirectory.required).toBeFalsy();
    });
  });

  describe('property types', () => {
    it('should have string type for name', () => {
      expect(selfReflectSchema.properties.name.type).toBe('string');
    });

    it('should have select type for agentType', () => {
      expect(selfReflectSchema.properties.agentType.type).toBe('select');
    });

    it('should have select type for model', () => {
      expect(selfReflectSchema.properties.model.type).toBe('select');
    });

    it('should have textarea type for reflectionGoal', () => {
      expect(selfReflectSchema.properties.reflectionGoal.type).toBe('textarea');
    });

    it('should have select type for evolutionMode', () => {
      expect(selfReflectSchema.properties.evolutionMode.type).toBe('select');
    });

    it('should have multiselect type for scope', () => {
      expect(selfReflectSchema.properties.scope.type).toBe('multiselect');
    });

    it('should have number type for maxMutations', () => {
      expect(selfReflectSchema.properties.maxMutations.type).toBe('number');
    });

    it('should have boolean type for includeTranscripts', () => {
      expect(selfReflectSchema.properties.includeTranscripts.type).toBe('boolean');
    });

    it('should have textarea type for systemPrompt', () => {
      expect(selfReflectSchema.properties.systemPrompt.type).toBe('textarea');
    });
  });

  describe('select options', () => {
    it('should have correct agentType options', () => {
      const options = selfReflectSchema.properties.agentType.options;

      expect(options).toContainEqual({ value: 'claude-agent', label: 'Claude Agent' });
      expect(options).toContainEqual({ value: 'codex-agent', label: 'Codex Agent' });
      expect(options).toHaveLength(2);
    });

    it('should have correct evolutionMode options', () => {
      const options = selfReflectSchema.properties.evolutionMode.options;

      expect(options).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ value: 'suggest' }),
          expect.objectContaining({ value: 'auto-apply' }),
          expect.objectContaining({ value: 'dry-run' }),
        ])
      );
      expect(options.length).toBe(3);
    });

    it('should have correct scope options', () => {
      const options = selfReflectSchema.properties.scope.options;

      expect(options).toEqual(['prompts', 'models', 'tools', 'nodes', 'edges', 'parameters']);
    });

    it('should have model options including Claude and Codex models', () => {
      const options = selfReflectSchema.properties.model.options;

      expect(Array.isArray(options)).toBe(true);
      expect(options.length).toBeGreaterThan(0);

      // Check for some expected models
      const modelValues = options.map((opt: any) => opt.value);
      expect(modelValues).toContain('sonnet');
      expect(modelValues).toContain('opus');
      expect(modelValues).toContain('haiku');
    });
  });

  describe('references support', () => {
    it('should support references in reflectionGoal', () => {
      expect(selfReflectSchema.properties.reflectionGoal.supportsReferences).toBe(true);
    });

    it('should support references in systemPrompt', () => {
      expect(selfReflectSchema.properties.systemPrompt.supportsReferences).toBe(true);
    });

    it('should not support references in name', () => {
      expect(selfReflectSchema.properties.name.supportsReferences).toBeUndefined();
    });
  });

  describe('conditional display', () => {
    it('should have showWhen condition for model field', () => {
      const showWhen = selfReflectSchema.properties.model.showWhen;

      expect(showWhen).toBeDefined();
      expect(showWhen?.field).toBe('agentType');
      expect(showWhen?.notEmpty).toBe(true);
    });
  });

  describe('schema structure', () => {
    it('should have all required top-level properties', () => {
      expect(selfReflectSchema).toHaveProperty('meta');
      expect(selfReflectSchema).toHaveProperty('properties');
      expect(selfReflectSchema).toHaveProperty('inputs');
      expect(selfReflectSchema).toHaveProperty('outputs');
      expect(selfReflectSchema).toHaveProperty('execution');
    });

    it('should have meta with required fields', () => {
      expect(selfReflectSchema.meta).toHaveProperty('type');
      expect(selfReflectSchema.meta).toHaveProperty('displayName');
      expect(selfReflectSchema.meta).toHaveProperty('category');
      expect(selfReflectSchema.meta).toHaveProperty('description');
    });

    it('should have execution with required fields', () => {
      expect(selfReflectSchema.execution).toHaveProperty('mode');
      expect(selfReflectSchema.execution).toHaveProperty('handler');
    });
  });

  describe('property descriptions', () => {
    it('should have description for reflectionGoal', () => {
      expect(selfReflectSchema.properties.reflectionGoal.description).toBeDefined();
      expect(typeof selfReflectSchema.properties.reflectionGoal.description).toBe('string');
    });

    it('should have description for evolutionMode', () => {
      expect(selfReflectSchema.properties.evolutionMode.description).toBeDefined();
      expect(typeof selfReflectSchema.properties.evolutionMode.description).toBe('string');
    });

    it('should have description for scope', () => {
      expect(selfReflectSchema.properties.scope.description).toBeDefined();
      expect(typeof selfReflectSchema.properties.scope.description).toBe('string');
    });

    it('should have description for maxMutations', () => {
      expect(selfReflectSchema.properties.maxMutations.description).toBeDefined();
      expect(typeof selfReflectSchema.properties.maxMutations.description).toBe('string');
    });
  });

  describe('option labels', () => {
    it('should have labels for evolutionMode options', () => {
      const options = selfReflectSchema.properties.evolutionMode.options;

      options.forEach((option: any) => {
        expect(option).toHaveProperty('value');
        expect(option).toHaveProperty('label');
        expect(typeof option.label).toBe('string');
      });
    });

    it('should have labels for agentType options', () => {
      const options = selfReflectSchema.properties.agentType.options;

      options.forEach((option: any) => {
        expect(option).toHaveProperty('value');
        expect(option).toHaveProperty('label');
        expect(typeof option.label).toBe('string');
      });
    });
  });
});

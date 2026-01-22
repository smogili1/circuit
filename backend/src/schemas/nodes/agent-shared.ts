// Shared Agent Schema Properties
// Common properties used by both Claude and Codex agent schemas

/**
 * Common properties shared by all agent node types
 */
export const sharedAgentProperties = {
  userQuery: {
    type: 'textarea' as const,
    displayName: 'User Query',
    placeholder: 'Enter the task for the agent, e.g. {{Input.value}}',
    description:
      'The main prompt/query for the agent. Use references like {{NodeName.field}} to include upstream data.',
    supportsReferences: true,
    required: true as const,
  },
  workingDirectory: {
    type: 'string' as const,
    displayName: 'Subfolder',
    placeholder: 'Relative to workflow directory',
  },
  mcpServers: {
    type: 'mcp-server-selector' as const,
    displayName: 'MCP Servers',
    description: 'Configure MCP servers and tools for this agent',
    default: [] as string[],
  },
  conversationMode: {
    type: 'select' as const,
    displayName: 'Conversation Mode',
    description: 'How to handle conversation history in loops',
    default: 'fresh',
    options: [
      { value: 'fresh', label: 'Fresh (new conversation each run)' },
      { value: 'persist', label: 'Persist (continue conversation in loops)' },
    ] as const,
  },
  outputConfig: {
    type: 'group' as const,
    displayName: 'Output',
    properties: {
      format: {
        type: 'select' as const,
        displayName: 'Format',
        default: 'text',
        required: true as const,
        options: [
          { value: 'text', label: 'Text' },
          { value: 'json', label: 'JSON' },
        ] as const,
      },
      schema: {
        type: 'schemaBuilder' as const,
        displayName: 'Schema Fields',
        showWhen: { field: 'format', equals: 'json' },
      },
    },
  },
  rejectionHandler: {
    type: 'group' as const,
    displayName: 'Rejection Handling',
    description: 'Configure behavior when user rejects output from downstream approval node',
    collapsed: true,
    properties: {
      enabled: {
        type: 'boolean' as const,
        displayName: 'Enable Rejection Handling',
        default: false,
        description: 'Allow retrying when user rejects output',
      },
      continueSession: {
        type: 'boolean' as const,
        displayName: 'Continue Same Session',
        default: true,
        description: 'Keep conversation history when retrying (recommended for context)',
        showWhen: { field: 'enabled', equals: true },
      },
      feedbackTemplate: {
        type: 'textarea' as const,
        displayName: 'Feedback Message Template',
        default:
          'The user rejected your previous output.\nFeedback: {{feedback}}\nPlease revise accordingly.',
        placeholder: "Use {{feedback}} for user's feedback",
        showWhen: { field: 'enabled', equals: true },
      },
      maxRetries: {
        type: 'number' as const,
        displayName: 'Max Retries',
        default: 3,
        description: 'Maximum retry attempts before taking fallback action',
        showWhen: { field: 'enabled', equals: true },
      },
      onMaxRetries: {
        type: 'select' as const,
        displayName: 'On Max Retries',
        default: 'fail',
        options: [
          { value: 'fail', label: 'Fail workflow' },
          { value: 'skip', label: 'Skip with last output' },
          { value: 'approve-anyway', label: 'Continue anyway' },
        ] as const,
        showWhen: { field: 'enabled', equals: true },
      },
    },
  },
};

/**
 * Common inputs shared by all agent node types
 */
export const sharedAgentInputs = {
  prompt: {
    type: 'string' as const,
    displayName: 'Prompt',
    description: 'Task prompt for the agent',
    supportsReferences: true,
    required: true,
  },
  context: {
    type: 'object' as const,
    displayName: 'Context',
    description: 'Additional context from upstream nodes',
    auto: true,
  },
};

/**
 * Common outputs shared by all agent node types
 */
export const sharedAgentOutputs = {
  result: {
    type: 'string' as const,
    displayName: 'Result',
    description: "The agent's text response",
  },
  transcript: {
    type: 'string' as const,
    displayName: 'Transcript',
    description: 'Full accumulated transcript across all runs',
  },
  runCount: {
    type: 'number' as const,
    displayName: 'Run Count',
    description: 'Number of times this node has executed (useful in loops)',
  },
  _dynamicFromSchema: 'outputConfig.schema' as const,
};

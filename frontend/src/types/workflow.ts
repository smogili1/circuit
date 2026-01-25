// Frontend Workflow Types
// Note: Node config types should match backend/src/schemas/nodes/
// This file maintains frontend-specific types and re-declares config types for bundling

// =============================================================================
// Output Configuration Types
// =============================================================================

export type AgentOutputFormat = 'text' | 'json';

export interface AgentOutputConfig {
  format: AgentOutputFormat;
  filePath?: string;
  schema?: string;
}

export interface MCPNodeServerConfig {
  serverId: string;
  enabledTools: string[] | '*';
}

export type ConversationMode = 'fresh' | 'persist';

// =============================================================================
// Node Configuration Types (must match backend schemas)
// =============================================================================

export interface ClaudeNodeConfig {
  type: 'claude-agent';
  name: string;
  userQuery: string;
  model?: 'opus' | 'sonnet' | 'haiku';
  systemPrompt?: string;
  tools?: string[];
  mcpServers?: MCPNodeServerConfig[];
  workingDirectory?: string;
  maxTurns?: number;
  timeout?: number;
  conversationMode?: ConversationMode;
  outputConfig?: {
    format: AgentOutputFormat;
    schema?: string;
  };
  rejectionHandler?: RejectionHandlerConfig;
}

export interface CodexNodeConfig {
  type: 'codex-agent';
  name: string;
  userQuery: string;
  model?: 'gpt-5.2-codex' | 'gpt-5.1-codex-max';
  approvalPolicy?: 'untrusted' | 'on-request' | 'on-failure' | 'never';
  sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access';
  workingDirectory?: string;
  baseInstructions?: string;
  mcpServers?: MCPNodeServerConfig[];
  conversationMode?: ConversationMode;
  outputConfig?: {
    format: AgentOutputFormat;
    schema?: string;
  };
  rejectionHandler?: RejectionHandlerConfig;
}

export interface InputNodeConfig {
  type: 'input';
  name: string;
  description?: string;
}

export interface OutputNodeConfig {
  type: 'output';
  name: string;
}

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'greater_than'
  | 'less_than'
  | 'greater_than_or_equals'
  | 'less_than_or_equals'
  | 'is_empty'
  | 'is_not_empty'
  | 'regex';

export type ConditionJoiner = 'and' | 'or';

export interface ConditionRule {
  id?: string;
  inputReference: string;
  operator: ConditionOperator;
  compareValue?: string;
  joiner?: ConditionJoiner;
}

export interface ConditionNodeConfig {
  type: 'condition';
  name: string;
  conditions?: ConditionRule[];
  inputReference?: string;
  operator?: ConditionOperator;
  compareValue?: string;
}

export interface MergeNodeConfig {
  type: 'merge';
  name: string;
  strategy?: 'wait-all' | 'first-complete';
}

export interface InputSelection {
  nodeId: string;
  nodeName: string;
  fields: string[];
}

export interface JavaScriptNodeConfig {
  type: 'javascript';
  name: string;
  code: string;
  timeout?: number;
  inputMappings?: InputSelection[];
}

export interface ApprovalInputSelection extends InputSelection {}

export interface ApprovalNodeConfig {
  type: 'approval';
  name: string;
  promptMessage: string;
  inputSelections: ApprovalInputSelection[];
  feedbackPrompt?: string;
  timeoutMinutes?: number;
  timeoutAction?: 'approve' | 'reject' | 'fail';
}

export interface RejectionHandlerConfig {
  enabled?: boolean;
  continueSession?: boolean;
  feedbackTemplate?: string;
  maxRetries?: number;
  onMaxRetries?: 'fail' | 'skip' | 'approve-anyway';
}

// =============================================================================
// Union Types
// =============================================================================

export type NodeConfig =
  | ClaudeNodeConfig
  | CodexNodeConfig
  | InputNodeConfig
  | OutputNodeConfig
  | ConditionNodeConfig
  | MergeNodeConfig
  | JavaScriptNodeConfig
  | ApprovalNodeConfig;

export type NodeType = NodeConfig['type'];

// =============================================================================
// Workflow Graph Types
// =============================================================================

export interface WorkflowNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: NodeConfig;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  workingDirectory?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// Execution Types
// =============================================================================

export type NodeStatus = 'pending' | 'running' | 'complete' | 'error' | 'skipped' | 'waiting';

export interface NodeState {
  status: NodeStatus;
  output?: unknown;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AgentTodoItem {
  text: string;
  completed: boolean;
}

export type AgentEvent =
  | { type: 'text-delta'; content: string }
  | { type: 'tool-use'; id?: string; name: string; input: Record<string, unknown> }
  | { type: 'tool-result'; name: string; result: string }
  | { type: 'thinking'; content: string }
  | { type: 'todo-list'; items: AgentTodoItem[] }
  | { type: 'complete'; result: string }
  | { type: 'error'; message: string }
  | { type: 'run-start'; runCount: number; nodeName: string };

export interface ApprovalRequest {
  nodeId: string;
  nodeName: string;
  promptMessage: string;
  feedbackPrompt?: string;
  displayData: Record<string, unknown>;
  timeoutAt?: string;
}

export interface ApprovalResponse {
  approved: boolean;
  feedback?: string;
  respondedAt: string;
}

export interface WorkflowValidationError {
  code: string;
  message: string;
  nodeId?: string;
}

// =============================================================================
// WebSocket Event Types
// =============================================================================

export type ExecutionEvent =
  | { type: 'execution-start'; executionId: string; workflowId: string }
  | { type: 'node-start'; nodeId: string; nodeName: string }
  | { type: 'node-output'; nodeId: string; event: AgentEvent }
  | { type: 'node-complete'; nodeId: string; result: unknown }
  | { type: 'node-error'; nodeId: string; error: string }
  | { type: 'node-waiting'; nodeId: string; nodeName: string; approval: ApprovalRequest }
  | { type: 'execution-complete'; result: unknown }
  | { type: 'execution-error'; error: string }
  | { type: 'validation-error'; errors: WorkflowValidationError[] };

export type ExecutionStatus = 'running' | 'complete' | 'error' | 'interrupted';

export interface ExecutionEventRecord {
  timestamp: string;
  event: ExecutionEvent;
}

export interface ExecutionNodeSummary {
  nodeId: string;
  nodeName?: string;
  status: NodeStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  result?: unknown;
}

export interface ExecutionSummary {
  executionId: string;
  workflowId: string;
  workflowName?: string;
  input: string;
  status: ExecutionStatus;
  startedAt: string;
  completedAt?: string;
  finalResult?: unknown;
  error?: string;
  workingDirectory?: string;
  outputDirectory?: string;
  nodes?: Record<string, ExecutionNodeSummary>;
}

export type ControlEvent =
  | { type: 'start-execution'; workflowId: string; input: string }
  | { type: 'replay-from-node'; workflowId: string; sourceExecutionId: string; fromNodeId: string; input?: string }
  | { type: 'interrupt'; executionId: string }
  | { type: 'resume'; executionId: string }
  | { type: 'submit-approval'; executionId: string; nodeId: string; response: ApprovalResponse };

// =============================================================================
// Replay Types
// =============================================================================

export interface ReplayValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  affectedNodes: {
    reused: string[];
    reExecuted: string[];
    new: string[];
  };
}

// =============================================================================
// Constants
// =============================================================================

export const CLAUDE_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Bash',
  'Glob',
  'Grep',
  'WebFetch',
  'WebSearch',
] as const;

export type ClaudeTool = (typeof CLAUDE_TOOLS)[number];

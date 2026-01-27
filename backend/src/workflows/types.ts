// Workflow Types
// Node config types are now defined in schemas/nodes/

// Import types needed within this file
import type { NodeConfig, NodeType } from '../schemas/nodes';

// Re-export all node config types from schemas (single source of truth)
export type {
  NodeConfig,
  NodeType,
  ClaudeNodeConfig,
  CodexNodeConfig,
  InputNodeConfig,
  OutputNodeConfig,
  ConditionNodeConfig,
  MergeNodeConfig,
  JavaScriptNodeConfig,
  ApprovalNodeConfig,
  BashNodeConfig,
  ConditionOperator,
  ConditionJoiner,
  ConditionRule,
  InputSelection,
  MCPNodeServerConfig,
  ApprovalInputSelection,
} from '../schemas/nodes';

// =============================================================================
// Output Configuration Types
// =============================================================================

export type AgentOutputFormat = 'text' | 'json';

export interface AgentOutputConfig {
  format: AgentOutputFormat;
  filePath?: string;
  schema?: string;
}

// Conversation mode for agent loops
export type ConversationMode = 'fresh' | 'persist';

// Rejection handler config for agent nodes
export interface RejectionHandlerConfig {
  enabled: boolean;
  continueSession: boolean;
  feedbackTemplate: string;
  maxRetries: number;
  onMaxRetries: 'fail' | 'skip' | 'approve-anyway';
}

// =============================================================================
// Workflow Graph Types
// =============================================================================

export interface WorkflowNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: NodeConfig;
}

export type EdgeType = 'default' | 'approval' | 'rejection';

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  edgeType?: EdgeType;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  workingDirectory?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Execution Types
// =============================================================================

export type NodeStatus = 'pending' | 'running' | 'complete' | 'error' | 'skipped' | 'waiting';

export interface NodeState {
  status: NodeStatus;
  output?: unknown;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface ExecutionContext {
  workflowId: string;
  executionId: string;
  nodeOutputs: Map<string, unknown>;
  variables: Map<string, unknown>;
  workingDirectory: string;
}

// =============================================================================
// Agent Types
// =============================================================================

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

export type ControlEvent =
  | { type: 'start-execution'; workflowId: string; input: string }
  | { type: 'interrupt'; executionId: string }
  | { type: 'resume'; executionId: string }
  | { type: 'subscribe-execution'; executionId: string; afterTimestamp?: string }
  | {
      type: 'replay-execution';
      workflowId: string;
      sourceExecutionId: string;
      fromNodeId: string;
      useOriginalInput?: boolean;
      input?: string;
    }
  | { type: 'submit-approval'; executionId: string; nodeId: string; response: ApprovalResponse };

// =============================================================================
// Agent Session Types
// =============================================================================

export interface AgentSessionState {
  sessionId: string;
  nodeId: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  lastOutput: unknown;
  retryCount: number;
  runCount: number; // Tracks how many times this node has been executed (for loops)
  accumulatedTranscript: string; // Accumulated transcript across runs (for persist mode)
  createdAt: string;
  lastUpdatedAt: string;
}

export interface AgentInput {
  prompt: string;
  context?: Record<string, unknown>;
  previousOutputs?: Record<string, unknown>;
  workingDirectory?: string;
  sessionId?: string;
  outputConfig?: AgentOutputConfig;
  requiresJsonOutput?: boolean;
  existingSession?: AgentSessionState;
}

export interface AgentStructuredOutput {
  format: AgentOutputFormat;
  filePath: string;
  content: string;
  parsedJson?: unknown;
}

// =============================================================================
// Replay Types
// =============================================================================

export interface WorkflowSnapshot {
  id: string;
  name?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  capturedAt: string;
}

export interface CheckpointNodeState {
  status: NodeStatus;
  error?: string;
}

export interface CheckpointState {
  capturedAt: string;
  nodeStates: Record<string, CheckpointNodeState>;
  nodeOutputs: Record<string, unknown>;
  variables: Record<string, unknown>;
}

export interface ReplayConfig {
  sourceExecutionId: string;
  fromNodeId: string;
  useOriginalInput?: boolean;
  input?: string;
}

export type ReplayWarningType =
  | 'workflow-snapshot-missing'
  | 'checkpoint-missing'
  | 'node-removed'
  | 'node-added'
  | 'node-changed'
  | 'edge-changed'
  | 'inactive-branch'
  | 'dependency-missing';

export interface ReplayWarning {
  type: ReplayWarningType;
  message: string;
  nodeId?: string;
}

export type ReplayErrorType =
  | 'invalid-node'
  | 'missing-checkpoint'
  | 'dependency-missing'
  | 'inactive-branch';

export interface ReplayError {
  type: ReplayErrorType;
  message: string;
  nodeId?: string;
}

export interface ReplayCheckpoint {
  nodeId: string;
  nodeName: string;
  status: NodeStatus;
  replayable: boolean;
  reason?: string;
}

export interface ReplayInfo {
  sourceExecutionId: string;
  workflowId: string;
  checkpoints: ReplayCheckpoint[];
  warnings: ReplayWarning[];
  errors: ReplayError[];
  isReplayBlocked: boolean;
}

export interface ReplayValidationResult {
  isBlocked: boolean;
  blockingReasons: string[];
  warnings: string[];
  replayableNodeIds: string[];
}

// =============================================================================
// Helper Functions
// =============================================================================

export function requiresJsonInput(nodeType: NodeType): boolean {
  return nodeType === 'condition' || nodeType === 'merge';
}

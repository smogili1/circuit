/**
 * Node executor types for the workflow engine.
 * Defines the interface for pluggable node execution strategies.
 */

import { EventEmitter } from 'events';
import {
  WorkflowNode,
  WorkflowEdge,
  ExecutionContext,
  NodeState,
  AgentStructuredOutput,
} from '../../workflows/types.js';

/**
 * Result of executing a node.
 */
export interface ExecutionResult {
  /** The output value to store and pass to downstream nodes */
  output: unknown;
  /** Optional metadata about the execution */
  metadata?: Record<string, unknown>;
  /** Structured output for agent nodes */
  structuredOutput?: AgentStructuredOutput;
}

/**
 * Validation result for node configuration.
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Context passed to executors with helper methods.
 */
export interface ExecutorContext {
  /** The underlying execution context */
  readonly executionContext: ExecutionContext;
  /** All workflow nodes */
  readonly nodes: WorkflowNode[];
  /** All workflow edges */
  readonly edges: WorkflowEdge[];
  /** Map of node name to node ID */
  readonly nodeNameToId: Map<string, string>;
  /** Map of node ID to node name */
  readonly nodeIdToName: Map<string, string>;
  /** Current node states */
  readonly nodeStates: Map<string, NodeState>;
  /** Abort signal for interrupting execution */
  readonly abortSignal: AbortSignal;

  /** Get the workflow input */
  getWorkflowInput(): string;

  /** Get IDs of predecessor nodes (immediate only) */
  getPredecessorIds(nodeId: string): string[];

  /** Get IDs of all ancestor nodes (transitive predecessors) */
  getAllAncestorIds(nodeId: string): string[];

  /** Get IDs of successor nodes */
  getSuccessorIds(nodeId: string): string[];

  /** Get outputs from predecessor nodes */
  getPredecessorOutputs(nodeId: string): Record<string, unknown>;

  /** Get output from a specific node */
  getNodeOutput(nodeId: string): unknown;

  /** Get node name by ID */
  getNodeName(nodeId: string): string;

  /** Interpolate references in a string */
  interpolate(text: string): string;

  /** Resolve a single reference to its actual value (preserves type) */
  resolveReference(reference: string): unknown;

  /** Set a variable in the context */
  setVariable(name: string, value: unknown): void;

  /** Get a variable from the context */
  getVariable(name: string): unknown;

  /** Get the working directory for this execution */
  getWorkingDirectory(nodeWorkingDirectory?: string): string;

  /** Get the output directory for file outputs */
  getOutputDirectory(): string;

  /** Check if any successor requires JSON output */
  successorRequiresJson(nodeId: string): boolean;
}

/**
 * Event emitter interface for node executors.
 */
export interface ExecutorEmitter {
  /** Emit an execution event */
  emit(event: string, data: unknown): void;
}

/**
 * Interface for node type executors.
 * Each node type implements this interface to define its execution behavior.
 */
export interface NodeExecutor {
  /** The node type this executor handles */
  readonly nodeType: string;

  /**
   * Execute the node and return its result.
   *
   * @param node - The workflow node to execute
   * @param context - Execution context with helper methods
   * @param emit - Event emitter for streaming output
   * @returns Promise resolving to the execution result
   */
  execute(
    node: WorkflowNode,
    context: ExecutorContext,
    emit: ExecutorEmitter
  ): Promise<ExecutionResult>;

  /**
   * Optionally validate node configuration before execution.
   * Return null if valid, or ValidationResult with error if invalid.
   *
   * @param node - The workflow node to validate
   * @returns Validation result or null if valid
   */
  validate?(node: WorkflowNode): ValidationResult | null;

  /**
   * For branching nodes (like conditions), determine which output handle is active.
   * Return null if all outputs should be active.
   *
   * @param result - The execution result
   * @param node - The workflow node
   * @returns The active output handle ID, or null for all
   */
  getOutputHandle?(result: ExecutionResult, node: WorkflowNode): string | null;
}

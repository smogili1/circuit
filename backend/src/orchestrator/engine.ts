import { EventEmitter } from 'events';
import path from 'path';
import {
  Workflow,
  WorkflowNode,
  NodeState,
  NodeStatus,
  ExecutionEvent,
  AgentStructuredOutput,
  ExecutionContext,
  requiresJsonInput,
} from '../workflows/types.js';
import { BaseAgent } from '../agents/base.js';
import {
  createExecutionContext,
  getPredecessorOutputs as getContextPredecessorOutputs,
  setNodeOutput,
  setVariable,
  getVariable,
} from './context.js';
import { interpolateReferences, buildNodeNameMap, parseReference, resolveReference } from './references.js';
import { executorRegistry, ExecutorContext, ExecutorEmitter } from './executors/index.js';
import { ExecutionError, ErrorCodes } from './errors.js';

/**
 * DAG-based workflow execution engine.
 * Executes nodes in topological order, running parallel branches concurrently.
 * Uses the executor registry pattern for node type handling.
 */
export class DAGExecutionEngine extends EventEmitter {
  private workflow: Workflow;
  private context: ExecutionContext;
  private nodeStates: Map<string, NodeState>;
  private agents: Map<string, BaseAgent>;
  private structuredOutputs: Map<string, AgentStructuredOutput>;
  private nodeNameToId: Map<string, string>;
  private nodeIdToName: Map<string, string>;
  private aborted: boolean = false;
  private outputDirectory: string;
  private workflowInput: string = '';
  private runningNodeAbortControllers: Map<string, AbortController> = new Map();

  constructor(workflow: Workflow, workingDirectory?: string) {
    super();
    this.workflow = workflow;
    this.context = createExecutionContext(workflow.id, workingDirectory);
    this.nodeStates = new Map();
    this.agents = new Map();
    this.structuredOutputs = new Map();
    this.outputDirectory = path.join(
      workingDirectory || process.cwd(),
      '.workflow-outputs',
      this.context.executionId
    );

    // Build node name to ID mapping for reference resolution
    this.nodeNameToId = buildNodeNameMap(
      workflow.nodes.map((n) => ({ id: n.id, data: { name: n.data.name } }))
    );

    // Build reverse mapping (ID to name)
    this.nodeIdToName = new Map();
    for (const [name, id] of this.nodeNameToId) {
      this.nodeIdToName.set(id, name);
    }

    // Initialize all nodes as pending
    for (const node of workflow.nodes) {
      this.nodeStates.set(node.id, { status: 'pending' });
    }
  }

  /**
   * Execute the workflow with the given input.
   */
  async execute(input: string): Promise<void> {
    console.log(`[Engine] Starting workflow execution: ${this.workflow.id}`);
    console.log(`[Engine] Input: ${input.slice(0, 200)}`);
    console.log(
      `[Engine] Nodes: ${this.workflow.nodes.map((n) => `${n.id}(${n.type})`).join(', ')}`
    );
    this.aborted = false;
    this.workflowInput = input;

    this.emit('event', {
      type: 'execution-start',
      executionId: this.context.executionId,
      workflowId: this.workflow.id,
    } as ExecutionEvent);

    try {
      // Execute input nodes first (they don't use the registry pattern)
      const inputNodes = this.workflow.nodes.filter((n) => n.type === 'input');
      for (const node of inputNodes) {
        setNodeOutput(this.context, node.id, input);
        this.updateNodeState(node.id, 'complete', input);
      }

      // Execute remaining nodes in topological order
      while (!this.aborted) {
        const readyNodes = this.getReadyNodes();

        if (readyNodes.length === 0) {
          // Check if all nodes are complete or if we're stuck
          const allComplete = Array.from(this.nodeStates.values()).every(
            (state) =>
              state.status === 'complete' ||
              state.status === 'error' ||
              state.status === 'skipped'
          );

          if (allComplete) {
            break;
          }

          // Check if any nodes are still running (e.g., waiting for approval)
          const hasRunning = Array.from(this.nodeStates.values()).some(
            (state) => state.status === 'running'
          );

          if (hasRunning) {
            // Wait a bit and check again - running nodes will eventually complete
            await new Promise((resolve) => setTimeout(resolve, 100));
            continue;
          }

          // If there are pending nodes but none ready, we might have a cycle
          const hasPending = Array.from(this.nodeStates.values()).some(
            (state) => state.status === 'pending'
          );

          if (hasPending) {
            throw new ExecutionError({
              code: ErrorCodes.CYCLE_DETECTED,
              message: 'Workflow has a cycle or unsatisfied dependencies',
              recoverable: false,
            });
          }

          break;
        }

        // Execute all ready nodes in parallel
        await Promise.all(readyNodes.map((node) => this.executeNode(node)));
      }

      // Collect final output
      const outputNodes = this.workflow.nodes.filter((n) => n.type === 'output');
      const results: Record<string, unknown> = {};

      for (const node of outputNodes) {
        const state = this.nodeStates.get(node.id);
        if (state?.output !== undefined) {
          results[node.id] = state.output;
        }
      }

      this.emit('event', {
        type: 'execution-complete',
        result: results,
      } as ExecutionEvent);
    } catch (error) {
      const execError = ExecutionError.from(error);
      this.emit('event', {
        type: 'execution-error',
        error: execError.message,
      } as ExecutionEvent);
    }
  }

  /**
   * Interrupt the current execution.
   */
  async interrupt(): Promise<void> {
    console.log('[Engine] Interrupting execution');
    this.aborted = true;

    // Abort all running node executions
    for (const [nodeId, controller] of this.runningNodeAbortControllers) {
      console.log(`[Engine] Aborting node: ${nodeId}`);
      controller.abort();
    }
    this.runningNodeAbortControllers.clear();

    // Also interrupt any registered agents (legacy support)
    for (const agent of this.agents.values()) {
      await agent.interrupt();
    }
  }

  /**
   * Get the execution context.
   */
  getContext(): ExecutionContext {
    return this.context;
  }

  /**
   * Get the state of a specific node.
   */
  getNodeState(nodeId: string): NodeState | undefined {
    return this.nodeStates.get(nodeId);
  }

  /**
   * Get the structured output for a specific node.
   */
  getNodeStructuredOutput(nodeId: string): AgentStructuredOutput | undefined {
    return this.structuredOutputs.get(nodeId);
  }

  /**
   * Get all structured outputs.
   */
  getAllStructuredOutputs(): Map<string, AgentStructuredOutput> {
    return new Map(this.structuredOutputs);
  }

  /**
   * Get nodes that are ready to execute (all predecessors complete).
   */
  private getReadyNodes(): WorkflowNode[] {
    const ready: WorkflowNode[] = [];

    for (const node of this.workflow.nodes) {
      const state = this.nodeStates.get(node.id);

      // Skip if not pending
      if (state?.status !== 'pending') {
        continue;
      }

      // Skip input nodes (already handled)
      if (node.type === 'input') {
        continue;
      }

      // Check if all predecessors are satisfied for execution
      // A predecessor is satisfied if:
      // 1. It's complete, OR
      // 2. It's skipped (that branch wasn't taken), OR
      // 3. It's pending AND has a back-edge to this node (it's a loop condition)
      const predecessorIds = this.getPredecessorIds(node.id);
      const allPredecessorsSatisfied = predecessorIds.every((predId) => {
        const predState = this.nodeStates.get(predId);
        if (predState?.status === 'complete' || predState?.status === 'skipped') {
          return true;
        }
        // Check if this predecessor has a back-edge to the current node
        // If so, it's a loop condition and shouldn't block execution
        if (predState?.status === 'pending') {
          const hasBackEdge = this.workflow.edges.some(
            (e) => e.source === predId && e.target === node.id
          );
          return hasBackEdge;
        }
        return false;
      });

      // At least one predecessor must be complete (not all skipped/pending)
      const hasCompletePredecessor = predecessorIds.some((id) => {
        const predState = this.nodeStates.get(id);
        return predState?.status === 'complete';
      });

      if (allPredecessorsSatisfied && hasCompletePredecessor) {
        ready.push(node);
      }
    }

    return ready;
  }

  /**
   * Get predecessor node IDs for a given node.
   */
  private getPredecessorIds(nodeId: string): string[] {
    return this.workflow.edges
      .filter((edge) => edge.target === nodeId)
      .map((edge) => edge.source);
  }

  /**
   * Get successor node IDs for a given node.
   */
  private getSuccessorIds(nodeId: string): string[] {
    return this.workflow.edges
      .filter((edge) => edge.source === nodeId)
      .map((edge) => edge.target);
  }

  /**
   * Get all ancestor node IDs for a given node (transitive predecessors).
   * Returns nodes in topological order (furthest ancestors first).
   * Excludes the starting node itself to handle cycles in the graph.
   */
  private getAllAncestorIds(nodeId: string): string[] {
    const ancestors = new Set<string>();
    const queue = this.getPredecessorIds(nodeId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      // Skip the starting node itself to avoid infinite loops in cyclic graphs
      if (current === nodeId) continue;
      if (!ancestors.has(current)) {
        ancestors.add(current);
        const preds = this.getPredecessorIds(current);
        queue.push(...preds);
      }
    }

    // Return in topological order (furthest ancestors first)
    // by doing a reverse BFS from the node
    const ordered: string[] = [];
    const visited = new Set<string>();
    const toProcess = [...ancestors];

    // Safety counter to prevent infinite loops in case of unexpected cycles
    let iterations = 0;
    const maxIterations = ancestors.size * ancestors.size;

    while (toProcess.length > 0 && iterations < maxIterations) {
      iterations++;
      const candidate = toProcess.shift()!;
      if (visited.has(candidate)) continue;

      // Check if all predecessors of this candidate that are in ancestors have been visited
      // Also exclude the starting node from predecessor checks
      const candPreds = this.getPredecessorIds(candidate).filter(
        (p) => p !== nodeId && ancestors.has(p)
      );
      if (candPreds.every((p) => visited.has(p))) {
        visited.add(candidate);
        ordered.push(candidate);
      } else {
        // Put it back at the end
        toProcess.push(candidate);
      }
    }

    // If we hit max iterations, just return what we have (handles edge cases)
    if (iterations >= maxIterations && toProcess.length > 0) {
      console.warn(`[Engine] getAllAncestorIds reached max iterations for node ${nodeId}, returning partial result`);
      // Add remaining unvisited nodes
      for (const remaining of toProcess) {
        if (!visited.has(remaining)) {
          ordered.push(remaining);
        }
      }
    }

    return ordered;
  }

  /**
   * Create an executor context for a node.
   */
  private createExecutorContext(abortSignal: AbortSignal): ExecutorContext {
    const self = this;

    return {
      executionContext: this.context,
      nodes: this.workflow.nodes,
      edges: this.workflow.edges,
      nodeNameToId: this.nodeNameToId,
      nodeIdToName: this.nodeIdToName,
      nodeStates: this.nodeStates,
      abortSignal,

      getWorkflowInput(): string {
        return self.workflowInput;
      },

      getPredecessorIds(nodeId: string): string[] {
        return self.getPredecessorIds(nodeId);
      },

      getAllAncestorIds(nodeId: string): string[] {
        return self.getAllAncestorIds(nodeId);
      },

      getSuccessorIds(nodeId: string): string[] {
        return self.getSuccessorIds(nodeId);
      },

      getPredecessorOutputs(nodeId: string): Record<string, unknown> {
        const predecessorIds = self.getPredecessorIds(nodeId);
        return getContextPredecessorOutputs(self.context, predecessorIds);
      },

      getNodeOutput(nodeId: string): unknown {
        return self.context.nodeOutputs.get(nodeId);
      },

      getNodeName(nodeId: string): string {
        return self.nodeIdToName.get(nodeId) || nodeId;
      },

      interpolate(text: string): string {
        return interpolateReferences(
          text,
          self.context.nodeOutputs,
          self.nodeNameToId,
          self.context.variables
        );
      },

      resolveReference(reference: string): unknown {
        const parsed = parseReference(reference);
        if (!parsed) {
          return undefined;
        }
        return resolveReference(
          parsed,
          self.context.nodeOutputs,
          self.nodeNameToId,
          self.context.variables
        );
      },

      setVariable(name: string, value: unknown): void {
        setVariable(self.context, name, value);
      },

      getVariable(name: string): unknown {
        return getVariable(self.context, name);
      },

      getWorkingDirectory(nodeWorkingDirectory?: string): string {
        const baseDirectory = self.context.workingDirectory || process.cwd();
        if (!nodeWorkingDirectory) {
          return baseDirectory;
        }

        return path.isAbsolute(nodeWorkingDirectory)
          ? nodeWorkingDirectory
          : path.join(baseDirectory, nodeWorkingDirectory);
      },

      getOutputDirectory(): string {
        return self.outputDirectory;
      },

      successorRequiresJson(nodeId: string): boolean {
        const successorIds = self.getSuccessorIds(nodeId);
        return successorIds.some((id) => {
          const successorNode = self.workflow.nodes.find((n) => n.id === id);
          return successorNode && requiresJsonInput(successorNode.type);
        });
      },
    };
  }

  /**
   * Create an emitter for a node executor.
   */
  private createExecutorEmitter(): ExecutorEmitter {
    return {
      emit: (event: string, data: unknown) => {
        this.emit(event, data);
      },
    };
  }

  /**
   * Execute a single node using its registered executor.
   */
  private async executeNode(node: WorkflowNode): Promise<void> {
    console.log(
      `[Engine] Starting node execution: ${node.id} (${node.type}) - ${node.data.name}`
    );
    this.updateNodeState(node.id, 'running');

    this.emit('event', {
      type: 'node-start',
      nodeId: node.id,
      nodeName: node.data.name,
    } as ExecutionEvent);

    // Create an abort controller for this node
    const abortController = new AbortController();
    this.runningNodeAbortControllers.set(node.id, abortController);

    try {
      // Get the executor for this node type
      const executor = executorRegistry.get(node.type);

      // Validate if the executor supports it
      if (executor.validate) {
        const validation = executor.validate(node);
        if (validation && !validation.valid) {
          throw new ExecutionError({
            code: ErrorCodes.VALIDATION_FAILED,
            message: validation.error || 'Validation failed',
            recoverable: false,
            nodeId: node.id,
          });
        }
      }

      // Create context and emitter
      const executorContext = this.createExecutorContext(abortController.signal);
      const emitter = this.createExecutorEmitter();

      // Execute the node
      const result = await executor.execute(node, executorContext, emitter);

      // Store the output
      setNodeOutput(this.context, node.id, result.output);
      this.updateNodeState(node.id, 'complete', result.output);

      // Store structured output if available
      if (result.structuredOutput) {
        this.structuredOutputs.set(node.id, result.structuredOutput);
      }

      // Handle branching (condition nodes)
      if (executor.getOutputHandle) {
        const activeHandle = executor.getOutputHandle(result, node);
        if (activeHandle !== null) {
          this.markInactiveBranches(node.id, activeHandle);
        }
      }

      this.emit('event', {
        type: 'node-complete',
        nodeId: node.id,
        result: result.output,
      } as ExecutionEvent);
    } catch (error) {
      const execError = ExecutionError.from(error, node.id);
      this.updateNodeState(node.id, 'error', undefined, execError.message);

      this.emit('event', {
        type: 'node-error',
        nodeId: node.id,
        error: execError.message,
      } as ExecutionEvent);

      // Future: route to error handler node if configured
      // For now, non-recoverable errors are not re-thrown to allow other branches to continue
      if (!execError.recoverable) {
        // Log but don't throw to allow parallel branches to complete
        console.error(`[Engine] Node ${node.id} failed:`, execError.message);
        // Propagate error to downstream nodes so they don't block execution
        this.propagateError(node.id, execError.message);
      }
    } finally {
      // Clean up the abort controller for this node
      this.runningNodeAbortControllers.delete(node.id);
    }
  }

  /**
   * Mark downstream nodes of inactive branches as skipped.
   * Also handles back-edges by resetting target nodes and their successors for re-execution.
   *
   * IMPORTANT: Order of operations matters for loops!
   * 1. First, skip inactive branches while loop target is still 'complete'
   *    (skipNode only affects 'pending' nodes, so complete nodes are protected)
   * 2. Then, reset active back-edges to 'pending' for re-execution
   *
   * If we reset before skip, the skip cascade would mark the loop target as skipped.
   */
  private markInactiveBranches(nodeId: string, activeHandle: string): void {
    const outgoingEdges = this.workflow.edges.filter((e) => e.source === nodeId);

    // Step 1: Skip all inactive branches first
    // Loop targets are still 'complete' at this point, so skipNode won't affect them
    // Pass nodeId as skipFromPredecessorId so the condition node itself isn't counted
    // as an active predecessor for nodes on the inactive branch
    for (const edge of outgoingEdges) {
      if (edge.sourceHandle !== activeHandle) {
        this.skipNode(edge.target, nodeId);
      }
    }

    // Step 2: Handle active branches
    // - Reset 'complete' nodes (back-edges/loops) for re-execution
    // - Reset 'skipped' nodes that were previously inactive but now active
    for (const edge of outgoingEdges) {
      if (edge.sourceHandle === activeHandle) {
        const targetState = this.nodeStates.get(edge.target);
        if (targetState?.status === 'complete') {
          // This is a loop - reset the target and its successors for re-execution
          this.resetNodeForReExecution(edge.target, edge.target);
        } else if (targetState?.status === 'skipped') {
          // This node was skipped in a previous iteration but is now on the active branch
          // Reset it and its successors so they can execute
          this.resetSkippedBranch(edge.target);
        }
      }
    }
  }

  /**
   * Reset a node and its successors that were previously skipped.
   * Used when a branch that was inactive becomes active.
   */
  private resetSkippedBranch(nodeId: string): void {
    const state = this.nodeStates.get(nodeId);
    if (!state || state.status !== 'skipped') return;

    console.log(`[Engine] Resetting skipped node ${nodeId} for execution`);

    // Reset to pending
    this.updateNodeState(nodeId, 'pending');
    state.output = undefined;
    state.error = undefined;

    // Reset skipped successors recursively
    const successorIds = this.getSuccessorIds(nodeId);
    for (const successorId of successorIds) {
      const successorState = this.nodeStates.get(successorId);
      if (successorState?.status === 'skipped') {
        this.resetSkippedBranch(successorId);
      }
    }
  }

  /**
   * Reset a node and all its downstream successors for re-execution.
   * Used when a back-edge is taken in a loop.
   * @param nodeId - The node to reset
   * @param loopTargetId - The original loop target; used to track back-edge nodes
   * @param backEdgeNodes - Set of node IDs that have back-edges to the loop target
   */
  private resetNodeForReExecution(
    nodeId: string,
    loopTargetId: string,
    backEdgeNodes: Set<string> = new Set()
  ): void {
    const state = this.nodeStates.get(nodeId);
    if (!state) return;

    // Only reset if the node is complete (not pending, running, or error)
    if (state.status === 'complete') {
      console.log(`[Engine] Resetting node ${nodeId} for re-execution (loop detected)`);
      this.nodeStates.set(nodeId, { status: 'pending' });

      // Track if this node has a back-edge to the loop target
      const hasBackEdge = this.workflow.edges.some(
        (e) => e.source === nodeId && e.target === loopTargetId
      );
      if (hasBackEdge) {
        backEdgeNodes.add(nodeId);
      }

      // Also reset all downstream successors that are complete or skipped
      const successorIds = this.getSuccessorIds(nodeId);
      for (const successorId of successorIds) {
        // Don't loop back to the target
        if (successorId === loopTargetId) continue;

        const successorState = this.nodeStates.get(successorId);
        if (successorState?.status === 'complete' || successorState?.status === 'skipped') {
          this.resetNodeForReExecution(successorId, loopTargetId, backEdgeNodes);
        }
      }
    }
  }

  /**
   * Skip a node and all its successors.
   * Only skips a node if ALL its predecessors are skipped (no active input paths).
   * @param nodeId - The node to skip
   * @param skipFromPredecessorId - Optional: the predecessor triggering the skip (e.g., a condition node).
   *                                This predecessor won't count as an "active" path.
   */
  private skipNode(nodeId: string, skipFromPredecessorId?: string): void {
    const state = this.nodeStates.get(nodeId);
    if (state?.status !== 'pending') {
      return;
    }

    // Check if this node has any predecessors that might still provide input
    // A node should NOT be skipped if it has any predecessor that is:
    // - 'pending' (not yet executed, might be on an active path)
    // - 'running' (currently executing)
    // - 'complete' (already has output that this node can use)
    // EXCEPT: if that predecessor is the one triggering this skip (e.g., a condition node
    // that decided this branch is inactive)
    const predecessorIds = this.getPredecessorIds(nodeId);
    const hasActivePredecessor = predecessorIds.some((predId) => {
      // If this predecessor is the one that triggered the skip, don't count it as active
      if (predId === skipFromPredecessorId) {
        return false;
      }
      const predState = this.nodeStates.get(predId);
      return (
        predState?.status === 'pending' ||
        predState?.status === 'running' ||
        predState?.status === 'complete'
      );
    });

    if (hasActivePredecessor) {
      // Don't skip this node - it might still receive input from another path
      console.log(
        `[Engine] Not skipping ${nodeId} - has active predecessor(s)`
      );
      return;
    }

    // All predecessors are skipped or error, safe to skip this node
    console.log(`[Engine] Skipping node ${nodeId} - all predecessors skipped`);
    this.updateNodeState(nodeId, 'skipped');

    this.emit('event', {
      type: 'node-complete',
      nodeId,
      result: null,
    } as ExecutionEvent);

    // Recursively skip successors
    const successorIds = this.getSuccessorIds(nodeId);
    for (const successorId of successorIds) {
      this.skipNode(successorId);
    }
  }

  /**
   * Propagate error to downstream nodes.
   * Marks all pending downstream nodes as 'error' so they don't block execution.
   */
  private propagateError(nodeId: string, errorMessage: string): void {
    const successorIds = this.getSuccessorIds(nodeId);
    for (const successorId of successorIds) {
      const state = this.nodeStates.get(successorId);
      if (state?.status === 'pending') {
        const propagatedError = `Upstream node '${nodeId}' failed: ${errorMessage}`;
        this.updateNodeState(successorId, 'error', undefined, propagatedError);

        this.emit('event', {
          type: 'node-error',
          nodeId: successorId,
          error: propagatedError,
        } as ExecutionEvent);

        // Recursively propagate to further downstream nodes
        this.propagateError(successorId, errorMessage);
      }
    }
  }

  /**
   * Update the state of a node.
   */
  private updateNodeState(
    nodeId: string,
    status: NodeStatus,
    output?: unknown,
    error?: string
  ): void {
    const current = this.nodeStates.get(nodeId) || { status: 'pending' };

    const updated: NodeState = {
      ...current,
      status,
    };

    if (status === 'running') {
      updated.startedAt = new Date();
    }

    if (status === 'complete' || status === 'error' || status === 'skipped') {
      updated.completedAt = new Date();
    }

    if (output !== undefined) {
      updated.output = output;
    }

    if (error !== undefined) {
      updated.error = error;
    }

    this.nodeStates.set(nodeId, updated);
  }
}

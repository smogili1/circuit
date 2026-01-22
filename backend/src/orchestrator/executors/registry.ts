/**
 * Executor registry for node type handlers.
 * Provides a central registry for looking up executors by node type.
 */

import { NodeExecutor } from './types.js';
import { ExecutionError, ErrorCodes } from '../errors.js';

/**
 * Registry for node executors.
 * Allows registration and lookup of executors by node type.
 */
export class ExecutorRegistry {
  private executors = new Map<string, NodeExecutor>();

  /**
   * Register an executor for a node type.
   * Throws if an executor is already registered for the type.
   *
   * @param executor - The executor to register
   * @returns this for chaining
   */
  register(executor: NodeExecutor): this {
    if (this.executors.has(executor.nodeType)) {
      throw new Error(
        `Executor already registered for node type: ${executor.nodeType}`
      );
    }
    this.executors.set(executor.nodeType, executor);
    return this;
  }

  /**
   * Get an executor for a node type.
   * Throws ExecutionError if no executor is registered.
   *
   * @param nodeType - The node type to look up
   * @returns The registered executor
   */
  get(nodeType: string): NodeExecutor {
    const executor = this.executors.get(nodeType);
    if (!executor) {
      throw new ExecutionError({
        code: ErrorCodes.UNKNOWN_NODE_TYPE,
        message: `No executor registered for node type: ${nodeType}`,
        recoverable: false,
      });
    }
    return executor;
  }

  /**
   * Check if an executor is registered for a node type.
   *
   * @param nodeType - The node type to check
   * @returns true if an executor is registered
   */
  has(nodeType: string): boolean {
    return this.executors.has(nodeType);
  }

  /**
   * Get all registered executors.
   *
   * @returns Array of all registered executors
   */
  getAll(): NodeExecutor[] {
    return Array.from(this.executors.values());
  }

  /**
   * Get all registered node types.
   *
   * @returns Array of all registered node type names
   */
  getNodeTypes(): string[] {
    return Array.from(this.executors.keys());
  }

  /**
   * Unregister an executor (mainly for testing).
   *
   * @param nodeType - The node type to unregister
   * @returns true if an executor was unregistered
   */
  unregister(nodeType: string): boolean {
    return this.executors.delete(nodeType);
  }

  /**
   * Clear all registered executors (mainly for testing).
   */
  clear(): void {
    this.executors.clear();
  }
}

/**
 * Global executor registry instance.
 */
export const executorRegistry = new ExecutorRegistry();

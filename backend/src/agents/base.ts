import { AgentEvent, AgentInput, ExecutionContext } from '../workflows/types.js';

/**
 * Abstract base class for all agent implementations.
 * Provides a unified interface for executing agent tasks and handling interrupts.
 */
export abstract class BaseAgent {
  protected abortController: AbortController | null = null;

  /**
   * Execute the agent with the given input and context.
   * Returns an async generator that yields AgentEvents as they occur.
   */
  abstract execute(
    input: AgentInput,
    context: ExecutionContext
  ): AsyncGenerator<AgentEvent, void, unknown>;

  /**
   * Interrupt the currently running execution.
   */
  async interrupt(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Check if the agent is currently executing.
   */
  get isRunning(): boolean {
    return this.abortController !== null;
  }

  /**
   * Create a new abort controller for this execution.
   */
  protected createAbortController(): AbortController {
    this.abortController = new AbortController();
    return this.abortController;
  }

  /**
   * Clean up after execution completes.
   */
  protected cleanup(): void {
    this.abortController = null;
  }
}

/**
 * Factory function type for creating agents by type.
 */
export type AgentFactory = (type: 'claude-agent' | 'codex-agent') => BaseAgent;

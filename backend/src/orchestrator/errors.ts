/**
 * Execution error types for the workflow engine.
 * Provides structured error handling with codes for future error-handling flows.
 */

/**
 * Error codes for categorizing execution failures.
 * These codes can be used by error-handler nodes to route errors appropriately.
 */
export const ErrorCodes = {
  // Node execution errors
  UNKNOWN_NODE_TYPE: 'UNKNOWN_NODE_TYPE',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  EXECUTION_FAILED: 'EXECUTION_FAILED',
  TIMEOUT: 'TIMEOUT',

  // Reference errors
  INVALID_REFERENCE: 'INVALID_REFERENCE',
  CIRCULAR_REFERENCE: 'CIRCULAR_REFERENCE',
  MISSING_PREDECESSOR: 'MISSING_PREDECESSOR',

  // Agent errors
  AGENT_ERROR: 'AGENT_ERROR',
  AGENT_TIMEOUT: 'AGENT_TIMEOUT',
  AGENT_INTERRUPTED: 'AGENT_INTERRUPTED',

  // Flow errors
  NO_VALID_PATH: 'NO_VALID_PATH',
  MISSING_INPUT: 'MISSING_INPUT',
  CYCLE_DETECTED: 'CYCLE_DETECTED',

  // Condition errors
  INVALID_CONDITION_TYPE: 'INVALID_CONDITION_TYPE',
  CONDITION_EVALUATION_FAILED: 'CONDITION_EVALUATION_FAILED',

  // Evolution errors
  EVOLUTION_VALIDATION_FAILED: 'EVOLUTION_VALIDATION_FAILED',
  EVOLUTION_APPLY_FAILED: 'EVOLUTION_APPLY_FAILED',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Structured execution error with code, recoverability, and context.
 */
export class ExecutionError extends Error {
  readonly code: ErrorCode;
  readonly recoverable: boolean;
  readonly nodeId?: string;
  readonly details?: unknown;

  constructor(options: {
    code: ErrorCode;
    message: string;
    recoverable?: boolean;
    nodeId?: string;
    details?: unknown;
  }) {
    super(options.message);
    this.name = 'ExecutionError';
    this.code = options.code;
    this.recoverable = options.recoverable ?? false;
    this.nodeId = options.nodeId;
    this.details = options.details;

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ExecutionError);
    }
  }

  /**
   * Create an ExecutionError from an unknown error.
   */
  static from(
    error: unknown,
    nodeId?: string,
    defaultCode: ErrorCode = ErrorCodes.EXECUTION_FAILED
  ): ExecutionError {
    if (error instanceof ExecutionError) {
      // If already an ExecutionError, optionally add nodeId
      if (nodeId && !error.nodeId) {
        return new ExecutionError({
          code: error.code,
          message: error.message,
          recoverable: error.recoverable,
          nodeId,
          details: error.details,
        });
      }
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    return new ExecutionError({
      code: defaultCode,
      message,
      recoverable: false,
      nodeId,
      details: error instanceof Error ? { stack: error.stack } : undefined,
    });
  }

  /**
   * Serialize to JSON for WebSocket transmission.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      recoverable: this.recoverable,
      nodeId: this.nodeId,
      details: this.details,
    };
  }
}

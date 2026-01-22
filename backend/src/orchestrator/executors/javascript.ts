/**
 * JavaScript execution node executor.
 * Runs user-provided JavaScript in a sandboxed VM context.
 */

import vm from 'node:vm';
import {
  NodeExecutor,
  ExecutionResult,
  ValidationResult,
  ExecutorContext,
  ExecutorEmitter,
} from './types.js';
import { WorkflowNode, JavaScriptNodeConfig, InputSelection } from '../../workflows/types.js';

type LogEntry = { level: 'log' | 'error' | 'warn'; args: unknown[] };

function formatLogValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatLog(level: LogEntry['level'], args: unknown[]): string {
  const prefix = level === 'error' ? '[console.error]' : level === 'warn' ? '[console.warn]' : '[console.log]';
  const message = args.map(formatLogValue).join(' ');
  return `${prefix} ${message}`.trim();
}

function parsePath(path: string): string[] {
  return path.split('.').filter(Boolean);
}

function getNestedValue(obj: unknown, path: string[]): unknown {
  let current = obj;
  for (const part of path) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;

    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, indexStr] = arrayMatch;
      const index = parseInt(indexStr, 10);
      const value = (current as Record<string, unknown>)[key];
      if (!Array.isArray(value)) return undefined;
      current = value[index];
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }
  return current;
}

function setNestedValue(target: Record<string, unknown>, path: string[], value: unknown): void {
  let current: Record<string, unknown> = target;
  path.forEach((part, index) => {
    const isLast = index === path.length - 1;
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);

    if (arrayMatch) {
      const [, key, indexStr] = arrayMatch;
      const arrayIndex = parseInt(indexStr, 10);
      if (!Array.isArray(current[key])) {
        current[key] = [];
      }
      const list = current[key] as unknown[];

      if (isLast) {
        list[arrayIndex] = value;
        return;
      }

      if (!list[arrayIndex] || typeof list[arrayIndex] !== 'object') {
        list[arrayIndex] = {};
      }
      current = list[arrayIndex] as Record<string, unknown>;
    } else {
      if (isLast) {
        current[part] = value;
        return;
      }
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }
  });
}

function normalizeNodeInput(output: unknown, transcript?: unknown): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  if (output && typeof output === 'object' && !Array.isArray(output)) {
    Object.assign(normalized, output as Record<string, unknown>);
  }

  if (!('result' in normalized)) {
    normalized.result = output;
  }

  // Add 'prompt' as an alias for 'result' when output is a string (from input nodes)
  if (!('prompt' in normalized) && typeof output === 'string') {
    normalized.prompt = output;
  }

  if (transcript !== undefined && !('transcript' in normalized)) {
    normalized.transcript = transcript;
  }

  return normalized;
}

function pickFields(
  base: Record<string, unknown>,
  fields: string[]
): Record<string, unknown> {
  const selected: Record<string, unknown> = {};

  for (const field of fields) {
    const trimmed = field.trim();
    if (!trimmed) continue;

    const value = getNestedValue(base, parsePath(trimmed));
    if (value === undefined) continue;
    setNestedValue(selected, parsePath(trimmed), value);
  }

  return selected;
}

function resolveInputSelections(
  node: WorkflowNode,
  context: ExecutorContext,
  mappings?: InputSelection[]
): InputSelection[] {
  if (mappings && mappings.length > 0) {
    return mappings;
  }

  // Use all ancestors (transitive predecessors) so JavaScript nodes can reference
  // any upstream node output, not just immediate predecessors
  return context.getAllAncestorIds(node.id).map((nodeId) => ({
    nodeId,
    nodeName: context.getNodeName(nodeId) || nodeId,
    fields: [],
  }));
}

function buildInputs(
  node: WorkflowNode,
  context: ExecutorContext,
  mappings?: InputSelection[]
): Record<string, unknown> {
  const selections = resolveInputSelections(node, context, mappings);
  const inputs: Record<string, unknown> = {};

  for (const selection of selections) {
    const nodeId = selection.nodeId || context.nodeNameToId.get(selection.nodeName);
    if (!nodeId) continue;

    const nodeName = selection.nodeName || context.getNodeName(nodeId) || nodeId;
    const output = context.getNodeOutput(nodeId);
    const transcript = context.getVariable(`node.${nodeId}.transcript`);
    const base = normalizeNodeInput(output, transcript);

    const fields = selection.fields || [];
    inputs[nodeName] = fields.length === 0 ? base : pickFields(base, fields);
  }

  return inputs;
}

function createTimeoutPromise(timeoutMs: number) {
  let timeoutId: NodeJS.Timeout | null = null;
  const promise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Execution timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return {
    promise,
    cancel: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    },
  };
}

function createAbortPromise(signal: AbortSignal) {
  let listener: (() => void) | null = null;
  const promise = new Promise<never>((_resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('Execution interrupted'));
      return;
    }
    listener = () => reject(new Error('Execution interrupted'));
    signal.addEventListener('abort', listener, { once: true });
  });

  return {
    promise,
    cancel: () => {
      if (listener) {
        signal.removeEventListener('abort', listener);
      }
    },
  };
}

async function executeJavaScript(
  code: string,
  inputs: Record<string, unknown>,
  timeout: number,
  nodeId: string,
  emit: ExecutorEmitter,
  abortSignal: AbortSignal
): Promise<{ result?: unknown; error?: string; logs: LogEntry[] }> {
  const logs: LogEntry[] = [];

  const emitLog = (level: LogEntry['level']) => (...args: unknown[]) => {
    logs.push({ level, args });
    emit.emit('event', {
      type: 'node-output',
      nodeId,
      event: {
        type: 'text-delta',
        content: `${formatLog(level, args)}\n`,
      },
    });
  };

  const context = vm.createContext(
    {
      inputs: Object.freeze({ ...inputs }),
      console: {
        log: emitLog('log'),
        error: emitLog('error'),
        warn: emitLog('warn'),
      },
      JSON,
      Math,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Promise,
      Function: undefined,
      eval: undefined,
      process: undefined,
      require: undefined,
      fetch: undefined,
    },
    {
      codeGeneration: { strings: false, wasm: false },
    }
  );

  const wrappedCode = `(async () => { ${code} })()`;
  let script: vm.Script;

  try {
    script = new vm.Script(wrappedCode);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      logs,
    };
  }

  const timeoutGuard = createTimeoutPromise(timeout);
  const abortGuard = createAbortPromise(abortSignal);

  try {
    const resultPromise = Promise.resolve(script.runInContext(context, { timeout }));
    const result = await Promise.race([resultPromise, timeoutGuard.promise, abortGuard.promise]);
    return { result, logs };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      logs,
    };
  } finally {
    timeoutGuard.cancel();
    abortGuard.cancel();
  }
}

export const javascriptExecutor: NodeExecutor = {
  nodeType: 'javascript',

  validate(node: WorkflowNode): ValidationResult | null {
    const config = node.data as JavaScriptNodeConfig;

    if (!config.code || config.code.trim() === '') {
      return { valid: false, error: 'Code is required' };
    }

    try {
      new vm.Script(`(async () => { ${config.code} })()`);
    } catch (error) {
      return {
        valid: false,
        error: `Syntax error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    return null;
  },

  async execute(
    node: WorkflowNode,
    context: ExecutorContext,
    emit: ExecutorEmitter
  ): Promise<ExecutionResult> {
    const config = node.data as JavaScriptNodeConfig;
    const timeout = config.timeout ?? 5000;
    const inputs = buildInputs(node, context, config.inputMappings);
    const inputNames = Object.keys(inputs);

    emit.emit('event', {
      type: 'node-output',
      nodeId: node.id,
      event: {
        type: 'thinking',
        content: `Executing JavaScript with inputs: ${inputNames.length ? inputNames.join(', ') : 'none'}`,
      },
    });

    const startedAt = Date.now();
    const { result, error, logs } = await executeJavaScript(
      config.code,
      inputs,
      timeout,
      node.id,
      emit,
      context.abortSignal
    );
    const durationMs = Date.now() - startedAt;

    if (error) {
      emit.emit('event', {
        type: 'node-output',
        nodeId: node.id,
        event: {
          type: 'error',
          message: error,
        },
      });

      throw new Error(error);
    }

    return {
      output: result,
      metadata: { success: true, durationMs, logs },
    };
  },
};

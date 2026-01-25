/**
 * Bash execution node executor.
 * Runs user-provided bash scripts with streaming output.
 */

import { spawn, ChildProcess } from 'node:child_process';
import {
  NodeExecutor,
  ExecutionResult,
  ValidationResult,
  ExecutorContext,
  ExecutorEmitter,
} from './types.js';
import { WorkflowNode, BashNodeConfig } from '../../workflows/types.js';

export const bashExecutor: NodeExecutor = {
  nodeType: 'bash',

  validate(node: WorkflowNode): ValidationResult | null {
    const config = node.data as BashNodeConfig;

    if (!config.script || config.script.trim() === '') {
      return { valid: false, error: 'Script is required' };
    }

    return null;
  },

  async execute(
    node: WorkflowNode,
    context: ExecutorContext,
    emit: ExecutorEmitter
  ): Promise<ExecutionResult> {
    const config = node.data as BashNodeConfig;
    const timeout = config.timeout;
    const workingDir = context.getWorkingDirectory(config.workingDirectory);

    // Interpolate references in the script
    const script = context.interpolate(config.script);

    emit.emit('event', {
      type: 'node-output',
      nodeId: node.id,
      event: {
        type: 'thinking',
        content: `Executing bash script in ${workingDir}`,
      },
    });

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let proc: ChildProcess | null = null;

      const cleanup = () => {
        if (proc && !proc.killed) {
          proc.kill('SIGTERM');
        }
      };

      // Only set timeout if configured
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      if (timeout !== undefined && timeout > 0) {
        timeoutId = setTimeout(() => {
          timedOut = true;
          cleanup();
          reject(new Error(`Bash execution timed out after ${timeout}ms`));
        }, timeout);
      }

      // Handle abort signal
      const abortHandler = () => {
        cleanup();
        clearTimeout(timeoutId);
        reject(new Error('Execution interrupted'));
      };
      context.abortSignal.addEventListener('abort', abortHandler, { once: true });

      proc = spawn('bash', ['-c', script], {
        cwd: workingDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      proc.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        emit.emit('event', {
          type: 'node-output',
          nodeId: node.id,
          event: { type: 'text-delta', content: text },
        });
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        emit.emit('event', {
          type: 'node-output',
          nodeId: node.id,
          event: { type: 'text-delta', content: `[stderr] ${text}` },
        });
      });

      proc.on('close', (exitCode: number | null) => {
        clearTimeout(timeoutId);
        context.abortSignal.removeEventListener('abort', abortHandler);

        if (timedOut || context.abortSignal.aborted) {
          return;
        }

        const code = exitCode ?? 0;

        // Emit completion info
        emit.emit('event', {
          type: 'node-output',
          nodeId: node.id,
          event: {
            type: 'thinking',
            content: `Process exited with code ${code}`,
          },
        });

        resolve({
          output: {
            stdout,
            stderr,
            exitCode: code,
            result: stdout.trim(),
          },
        });
      });

      proc.on('error', (error: Error) => {
        clearTimeout(timeoutId);
        context.abortSignal.removeEventListener('abort', abortHandler);
        reject(error);
      });
    });
  },
};

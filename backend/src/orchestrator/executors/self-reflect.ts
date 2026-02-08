/**
 * Self-reflection node executor.
 * Uses an AI agent to analyze workflow context and propose structured evolutions.
 */

import path from 'path';
import {
  NodeExecutor,
  ExecutionResult,
  ExecutorContext,
  ExecutorEmitter,
  ValidationResult,
} from './types.js';
import {
  WorkflowNode,
  Workflow,
  ApprovalResponse,
  ClaudeNodeConfig,
  CodexNodeConfig,
  SelfReflectNodeConfig,
  WorkflowSnapshot,
} from '../../workflows/types.js';
import { ClaudeAgent } from '../../agents/claude.js';
import { CodexAgent } from '../../agents/codex.js';
import { executeAgentNode, ExecutableAgent } from './agent-shared.js';
import { getWorkflow } from '../../workflows/storage.js';
import { loadAllSchemas } from '../../schemas/index.js';
import {
  appendEvolutionHistory,
  applyEvolution,
  createEvolutionSnapshot,
} from '../evolution-applier.js';
import { validateEvolution } from '../evolution-validator.js';
import type { EvolutionMode, EvolutionScope, WorkflowEvolution } from '../evolution-types.js';
import { ExecutionError, ErrorCodes } from '../errors.js';

const pendingEvolutionApprovals = new Map<
  string,
  {
    resolve: (response: ApprovalResponse) => void;
    reject: (error: Error) => void;
  }
>();

function getEvolutionKey(executionId: string, nodeId: string): string {
  return `${executionId}:${nodeId}`;
}

export function submitEvolutionApproval(
  executionId: string,
  nodeId: string,
  response: ApprovalResponse
): boolean {
  const key = getEvolutionKey(executionId, nodeId);
  const pending = pendingEvolutionApprovals.get(key);
  if (!pending) return false;

  pending.resolve(response);
  pendingEvolutionApprovals.delete(key);
  return true;
}

export function cancelEvolutionApproval(executionId: string, nodeId: string): boolean {
  const key = getEvolutionKey(executionId, nodeId);
  const pending = pendingEvolutionApprovals.get(key);
  if (!pending) return false;

  pending.reject(new Error('Evolution approval cancelled'));
  pendingEvolutionApprovals.delete(key);
  return true;
}

export function cancelAllEvolutionApprovals(executionId: string): void {
  for (const [key, pending] of pendingEvolutionApprovals.entries()) {
    if (key.startsWith(`${executionId}:`)) {
      pending.reject(new Error('Execution interrupted'));
      pendingEvolutionApprovals.delete(key);
    }
  }
}

const WORKFLOW_EVOLUTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reasoning', 'mutations', 'expectedImpact', 'riskAssessment'],
  properties: {
    reasoning: { type: 'string' },
    expectedImpact: { type: 'string' },
    riskAssessment: { type: 'string' },
    rollbackPlan: { type: 'string' },
    mutations: {
      type: 'array',
      items: {
        oneOf: [
          {
            type: 'object',
            additionalProperties: false,
            required: ['op', 'nodeId', 'path', 'value'],
            properties: {
              op: { const: 'update-node-config' },
              nodeId: { type: 'string' },
              path: { type: 'string' },
              value: {},
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['op', 'nodeId', 'field', 'newValue'],
            properties: {
              op: { const: 'update-prompt' },
              nodeId: { type: 'string' },
              field: { type: 'string' },
              newValue: { type: 'string' },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['op', 'nodeId', 'newModel'],
            properties: {
              op: { const: 'update-model' },
              nodeId: { type: 'string' },
              newModel: { type: 'string' },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['op', 'node'],
            properties: {
              op: { const: 'add-node' },
              node: {
                type: 'object',
                additionalProperties: true,
                required: ['id', 'type', 'position', 'data'],
                properties: {
                  id: { type: 'string' },
                  type: { type: 'string' },
                  position: {
                    type: 'object',
                    required: ['x', 'y'],
                    properties: {
                      x: { type: 'number' },
                      y: { type: 'number' },
                    },
                  },
                  data: { type: 'object' },
                },
              },
              connectFrom: { type: 'string' },
              connectTo: { type: 'string' },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['op', 'nodeId'],
            properties: {
              op: { const: 'remove-node' },
              nodeId: { type: 'string' },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['op', 'edge'],
            properties: {
              op: { const: 'add-edge' },
              edge: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'source', 'target'],
                properties: {
                  id: { type: 'string' },
                  source: { type: 'string' },
                  target: { type: 'string' },
                  sourceHandle: { type: 'string' },
                  targetHandle: { type: 'string' },
                  edgeType: { type: 'string' },
                },
              },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['op', 'edgeId'],
            properties: {
              op: { const: 'remove-edge' },
              edgeId: { type: 'string' },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['op', 'field', 'value'],
            properties: {
              op: { const: 'update-workflow-setting' },
              field: { type: 'string' },
              value: {},
            },
          },
        ],
      },
    },
  },
};

const CLAUDE_MODELS = new Set(['opus', 'sonnet', 'haiku']);
const CODEX_MODELS = new Set([
  'gpt-5.2-codex',
  'gpt-5.2',
  'gpt-5.1-codex-max',
  'gpt-5.1-codex-mini',
]);

type ClaudeModel = 'opus' | 'sonnet' | 'haiku';
type CodexModel = 'gpt-5.2-codex' | 'gpt-5.2' | 'gpt-5.1-codex-max' | 'gpt-5.1-codex-mini';

function resolveClaudeModel(model?: string): ClaudeModel {
  return (model && CLAUDE_MODELS.has(model) ? model : 'sonnet') as ClaudeModel;
}

function resolveCodexModel(model?: string): CodexModel {
  return (model && CODEX_MODELS.has(model) ? model : 'gpt-5.2-codex') as CodexModel;
}

function buildWorkflowPayload(workflow: Workflow): Record<string, unknown> {
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    workingDirectory: workflow.workingDirectory,
    nodes: workflow.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      data: node.data,
    })),
    edges: workflow.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      edgeType: edge.edgeType,
    })),
  };
}

function extractEvolution(result: ExecutionResult): WorkflowEvolution {
  if (result.structuredOutput?.parsedJson && typeof result.structuredOutput.parsedJson === 'object') {
    return result.structuredOutput.parsedJson as WorkflowEvolution;
  }

  if (result.output && typeof result.output === 'object' && 'mutations' in result.output) {
    return result.output as WorkflowEvolution;
  }

  if (typeof result.output === 'string') {
    try {
      return JSON.parse(result.output) as WorkflowEvolution;
    } catch {
      // fall through
    }
  }

  if (
    result.output &&
    typeof result.output === 'object' &&
    typeof (result.output as { result?: unknown }).result === 'string'
  ) {
    try {
      return JSON.parse((result.output as { result: string }).result) as WorkflowEvolution;
    } catch {
      // fall through
    }
  }

  throw new ExecutionError({
    code: ErrorCodes.EVOLUTION_VALIDATION_FAILED,
    message: 'Unable to parse workflow evolution from agent output',
    recoverable: false,
  });
}

async function runReflectionAgent(
  node: WorkflowNode,
  context: ExecutorContext,
  emit: ExecutorEmitter,
  agentType: string,
  config: SelfReflectNodeConfig,
  prompt: string,
  systemPrompt: string
): Promise<ExecutionResult> {
  const outputConfig = {
    format: 'json' as const,
    schema: JSON.stringify(WORKFLOW_EVOLUTION_SCHEMA),
    filePath: path.join(context.getOutputDirectory(), `${node.id}.evolution.json`),
  };

  if (agentType === 'codex-agent') {
    const agentConfig: CodexNodeConfig = {
      type: 'codex-agent',
      name: config.name,
      userQuery: prompt,
      model: resolveCodexModel(config.model),
      baseInstructions: systemPrompt,
      approvalPolicy: 'never',
      sandbox: 'workspace-write',
      reasoningEffort: 'medium',
      workingDirectory: config.workingDirectory,
      outputConfig,
      conversationMode: 'fresh',
    };

    return executeAgentNode<CodexNodeConfig, null>(node, context, emit, {
      nodeType: 'SelfReflectCodex',
      getConfig: () => agentConfig,
      buildMCPConfig: async () => null,
      createAgent: (cfg): ExecutableAgent => new CodexAgent(cfg),
      interpolateConfig: (cfg) => cfg,
    });
  }

  const agentConfig: ClaudeNodeConfig = {
    type: 'claude-agent',
    name: config.name,
    userQuery: prompt,
    model: resolveClaudeModel(config.model),
    systemPrompt,
    workingDirectory: config.workingDirectory,
    outputConfig,
    conversationMode: 'fresh',
  };

  return executeAgentNode<ClaudeNodeConfig, null>(node, context, emit, {
    nodeType: 'SelfReflectClaude',
    getConfig: () => agentConfig,
    buildMCPConfig: async () => null,
    createAgent: (cfg): ExecutableAgent => new ClaudeAgent(cfg),
    interpolateConfig: (cfg) => cfg,
  });
}

export const selfReflectExecutor: NodeExecutor = {
  nodeType: 'self-reflect',

  validate(node: WorkflowNode): ValidationResult | null {
    const config = node.data as SelfReflectNodeConfig;
    if (!config.reflectionGoal || config.reflectionGoal.trim() === '') {
      return { valid: false, error: 'Reflection goal is required' };
    }
    if (config.maxMutations !== undefined && config.maxMutations <= 0) {
      return { valid: false, error: 'Max mutations must be greater than zero' };
    }
    if (!config.scope || config.scope.length === 0) {
      return { valid: false, error: 'At least one scope must be selected' };
    }
    return null;
  },

  async execute(
    node: WorkflowNode,
    context: ExecutorContext,
    emit: ExecutorEmitter
  ): Promise<ExecutionResult> {
    const config = node.data as SelfReflectNodeConfig;
    const executionId = context.executionContext.executionId;

    const workflow = getWorkflow(context.executionContext.workflowId);
    if (!workflow) {
      throw new ExecutionError({
        code: ErrorCodes.EVOLUTION_APPLY_FAILED,
        message: 'Workflow not found for self-reflection',
        recoverable: false,
        nodeId: node.id,
      });
    }

    const reflectionGoal = context.interpolate(config.reflectionGoal || '');
    const extraSystemPrompt = config.systemPrompt
      ? context.interpolate(config.systemPrompt)
      : '';
    const scope = (config.scope && config.scope.length > 0
      ? config.scope
      : ['prompts', 'models', 'tools', 'nodes', 'edges', 'parameters']) as EvolutionScope[];
    const evolutionMode = (config.evolutionMode || 'suggest') as EvolutionMode;

    const ancestorIds = context.getAllAncestorIds(node.id);
    const executionNodes = ancestorIds
      .map((ancestorId) => {
        const definition = context.nodes.find((n) => n.id === ancestorId);
        const state = context.nodeStates.get(ancestorId);
        const record: Record<string, unknown> = {
          nodeId: ancestorId,
          name: definition?.data.name,
          type: definition?.type,
          status: state?.status,
          error: state?.error,
          output: context.getNodeOutput(ancestorId),
        };

        if (config.includeTranscripts) {
          record.transcript = context.getVariable(`node.${ancestorId}.transcript`);
        }

        return record;
      })
      .filter((item) => item.nodeId !== undefined);

    const promptPayload = {
      workflow: buildWorkflowPayload(workflow),
      execution: {
        input: context.getWorkflowInput(),
        nodes: executionNodes,
      },
      reflectionGoal,
      scope,
      maxMutations: config.maxMutations ?? 10,
      evolutionMode,
      selfReflectNodeId: node.id,
      availableSchemas: loadAllSchemas(),
    };

    const baseSystemPrompt = [
      'You are a workflow self-reflection agent.',
      'Analyze the workflow configuration and execution logs provided.',
      'Return only valid JSON that matches the WorkflowEvolution schema.',
      'Do not include markdown or extra text.',
      'Do not modify the self-reflect node itself or its direct connections.',
    ].join('\n');

    const systemPrompt = extraSystemPrompt
      ? `${baseSystemPrompt}\n\nAdditional Instructions:\n${extraSystemPrompt}`
      : baseSystemPrompt;

    const prompt = [
      'Reflection task: produce a WorkflowEvolution JSON payload.',
      `Goal: ${reflectionGoal}`,
      `Allowed scope: ${scope.join(', ')}`,
      `Max mutations: ${config.maxMutations ?? 10}`,
      '',
      `WorkflowEvolution JSON schema:\n${JSON.stringify(WORKFLOW_EVOLUTION_SCHEMA, null, 2)}`,
      '',
      'Context payload:',
      JSON.stringify(promptPayload, null, 2),
    ].join('\n');

    const agentType = config.agentType || 'claude-agent';
    const agentResult = await runReflectionAgent(
      node,
      context,
      emit,
      agentType,
      config,
      prompt,
      systemPrompt
    );

    const evolution = extractEvolution(agentResult);
    const validation = validateEvolution(workflow, evolution, {
      maxMutations: config.maxMutations ?? 10,
      scope,
      selfNodeId: node.id,
    });

    const beforeSnapshot = createEvolutionSnapshot(workflow);
    const validationErrors = validation.errors;
    let applied = false;
    let afterSnapshot: WorkflowSnapshot | undefined;
    let approvalResponse: ApprovalResponse | undefined;

    const emitEvolutionEvent = (override?: Partial<{
      applied: boolean;
      approvalRequested: boolean;
      approvalResponse?: ApprovalResponse;
      afterSnapshot?: WorkflowSnapshot;
    }>) => {
      emit.emit('event', {
        type: 'node-evolution',
        nodeId: node.id,
        nodeName: config.name,
        mode: evolutionMode,
        evolution: validation.sanitizedEvolution,
        applied: override?.applied ?? applied,
        validationErrors,
        beforeSnapshot,
        afterSnapshot: override?.afterSnapshot ?? afterSnapshot,
        approvalRequested: override?.approvalRequested,
        approvalResponse: override?.approvalResponse,
      });
    };

    if (!validation.valid) {
      emitEvolutionEvent({ applied: false });
      return {
        output: {
          evolution: validation.sanitizedEvolution,
          applied: false,
          validationErrors,
          beforeSnapshot,
        },
        structuredOutput: agentResult.structuredOutput,
      };
    }

    if (evolutionMode === 'dry-run') {
      emitEvolutionEvent({ applied: false });
      return {
        output: {
          evolution: validation.sanitizedEvolution,
          applied: false,
          validationErrors,
          beforeSnapshot,
        },
        structuredOutput: agentResult.structuredOutput,
      };
    }

    if (evolutionMode === 'suggest') {
      emitEvolutionEvent({ applied: false, approvalRequested: true });

      approvalResponse = await new Promise<ApprovalResponse>((resolve, reject) => {
        const key = getEvolutionKey(executionId, node.id);
        pendingEvolutionApprovals.set(key, { resolve, reject });

        context.abortSignal.addEventListener('abort', () => {
          const pending = pendingEvolutionApprovals.get(key);
          if (pending) {
            pendingEvolutionApprovals.delete(key);
            reject(new Error('Execution interrupted'));
          }
        });
      });

      if (!approvalResponse.respondedAt) {
        approvalResponse.respondedAt = new Date().toISOString();
      }

      if (!approvalResponse.approved) {
        emitEvolutionEvent({
          applied: false,
          approvalRequested: false,
          approvalResponse,
        });
        return {
          output: {
            evolution: validation.sanitizedEvolution,
            applied: false,
            validationErrors,
            beforeSnapshot,
            approvalResponse,
          },
          structuredOutput: agentResult.structuredOutput,
        };
      }
    }

    let updated: Workflow;
    try {
      updated = await applyEvolution(workflow, validation.sanitizedEvolution);
    } catch (error) {
      throw new ExecutionError({
        code: ErrorCodes.EVOLUTION_APPLY_FAILED,
        message: error instanceof Error ? error.message : 'Failed to apply evolution',
        recoverable: false,
        nodeId: node.id,
      });
    }
    applied = true;
    afterSnapshot = createEvolutionSnapshot(updated);

    try {
      await appendEvolutionHistory({
        timestamp: new Date().toISOString(),
        workflowId: updated.id,
        executionId,
        nodeId: node.id,
        mode: evolutionMode,
        evolution: validation.sanitizedEvolution,
        applied: true,
        beforeSnapshot,
        afterSnapshot,
      });
    } catch (error) {
      console.error('[SelfReflectExecutor] Failed to record evolution history:', error);
    }

    emitEvolutionEvent({
      applied: true,
      approvalRequested: false,
      approvalResponse,
      afterSnapshot,
    });

    return {
      output: {
        evolution: validation.sanitizedEvolution,
        applied,
        validationErrors,
        beforeSnapshot,
        afterSnapshot,
        approvalResponse,
      },
      structuredOutput: agentResult.structuredOutput,
    };
  },
};

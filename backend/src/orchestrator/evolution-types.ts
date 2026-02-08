import type { WorkflowEdge, WorkflowNode } from '../workflows/types.js';

export type EvolutionScope =
  | 'prompts'
  | 'models'
  | 'tools'
  | 'nodes'
  | 'edges'
  | 'parameters';

export type EvolutionMode = 'suggest' | 'auto-apply' | 'dry-run';

export type MutationOp =
  | { op: 'update-node-config'; nodeId: string; path: string; value: unknown }
  | { op: 'update-prompt'; nodeId: string; field: string; newValue: string }
  | { op: 'update-model'; nodeId: string; newModel: string }
  | { op: 'add-node'; node: WorkflowNode; connectFrom?: string; connectTo?: string }
  | { op: 'remove-node'; nodeId: string }
  | { op: 'add-edge'; edge: WorkflowEdge }
  | { op: 'remove-edge'; edgeId: string }
  | { op: 'update-workflow-setting'; field: string; value: unknown };

export interface WorkflowEvolution {
  reasoning: string;
  mutations: MutationOp[];
  expectedImpact: string;
  riskAssessment: string;
  rollbackPlan?: string;
}

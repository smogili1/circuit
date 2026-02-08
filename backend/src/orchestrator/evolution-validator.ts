import type { Workflow, WorkflowNode, WorkflowEdge } from '../workflows/types.js';
import type { PropertyDefinition, PropertyDefinitions } from '../schemas/define.js';
import { schemas } from '../schemas/nodes/index.js';
import type { EvolutionScope, MutationOp, WorkflowEvolution } from './evolution-types.js';

export interface EvolutionValidationOptions {
  maxMutations?: number;
  scope?: EvolutionScope[];
  selfNodeId?: string;
}

export interface EvolutionValidationResult {
  valid: boolean;
  errors: string[];
  sanitizedEvolution: WorkflowEvolution;
}

const SAFE_PATH_BLACKLIST = new Set(['__proto__', 'prototype', 'constructor']);

function sanitizeEvolution(raw: unknown): WorkflowEvolution {
  const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const mutations = Array.isArray(data.mutations)
    ? (data.mutations.filter((item) => item && typeof item === 'object') as MutationOp[])
    : [];

  return {
    reasoning: typeof data.reasoning === 'string' ? data.reasoning : '',
    expectedImpact: typeof data.expectedImpact === 'string' ? data.expectedImpact : '',
    riskAssessment: typeof data.riskAssessment === 'string' ? data.riskAssessment : '',
    rollbackPlan: typeof data.rollbackPlan === 'string' ? data.rollbackPlan : undefined,
    mutations,
  };
}

function isSafePathSegment(segment: string): boolean {
  return !SAFE_PATH_BLACKLIST.has(segment);
}

function isNumericSegment(segment: string): boolean {
  return /^[0-9]+$/.test(segment);
}

function resolvePropertyDefinition(
  properties: PropertyDefinitions,
  pathSegments: string[]
): PropertyDefinition | null {
  let currentProps: PropertyDefinitions | null = properties;
  let currentDef: PropertyDefinition | null = null;
  let index = 0;

  while (currentProps && index < pathSegments.length) {
    const segment = pathSegments[index];
    if (!isSafePathSegment(segment)) {
      return null;
    }

    if (currentDef?.type === 'array' && isNumericSegment(segment)) {
      currentProps = currentDef.items;
      index += 1;
      continue;
    }

    const def: any = currentProps[segment as keyof typeof currentProps];
    if (!def) {
      return null;
    }

    currentDef = def;
    index += 1;

    if (index >= pathSegments.length) {
      return currentDef;
    }

    if (currentDef && currentDef.type === 'group') {
      currentProps = currentDef.properties;
      continue;
    }

    if (currentDef && currentDef.type === 'array') {
      currentProps = (currentDef as any).items;
      continue;
    }

    return null;
  }

  return currentDef;
}

function validateValueType(def: PropertyDefinition, value: unknown): string | null {
  if (value === null || value === undefined) {
    return def.required ? 'Value is required' : null;
  }

  switch (def.type) {
    case 'string':
    case 'textarea':
    case 'code':
    case 'reference':
    case 'schemaBuilder':
      return typeof value === 'string' ? null : 'Expected a string value';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        ? null
        : 'Expected a finite number value';
    case 'boolean':
      return typeof value === 'boolean' ? null : 'Expected a boolean value';
    case 'select':
      if (typeof value !== 'string') return 'Expected a string value';
      if (def.options && !def.options.some((opt) => opt.value === value)) {
        return 'Value is not one of the allowed options';
      }
      return null;
    case 'multiselect':
      if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
        return 'Expected an array of strings';
      }
      if (def.options && value.some((item) => !def.options.includes(item))) {
        return 'One or more values are not allowed options';
      }
      return null;
    case 'inputSelector':
      if (!Array.isArray(value)) return 'Expected an array of input selections';
      for (const item of value) {
        if (!item || typeof item !== 'object') return 'Invalid input selection item';
        const selection = item as Record<string, unknown>;
        if (typeof selection.nodeId !== 'string' || typeof selection.nodeName !== 'string') {
          return 'Input selection must include nodeId and nodeName';
        }
        if (!Array.isArray(selection.fields)) {
          return 'Input selection must include fields array';
        }
      }
      return null;
    case 'mcp-server-selector':
      if (!Array.isArray(value)) return 'Expected an array of MCP server configs';
      for (const item of value) {
        if (!item || typeof item !== 'object') return 'Invalid MCP server config';
        const config = item as Record<string, unknown>;
        if (typeof config.serverId !== 'string') return 'MCP server config must include serverId';
      }
      return null;
    case 'conditionRules':
      if (!Array.isArray(value)) return 'Expected an array of condition rules';
      return null;
    case 'group':
      if (typeof value !== 'object' || Array.isArray(value)) {
        return 'Expected an object value';
      }
      return null;
    case 'array':
      if (!Array.isArray(value)) {
        return 'Expected an array value';
      }
      return null;
    default:
      return null;
  }
}

function validateGroupProperties(
  value: Record<string, unknown>,
  properties: PropertyDefinitions,
  path: string,
  errors: string[]
): void {
  for (const key of Object.keys(value)) {
    if (!properties[key]) {
      errors.push(`Unknown property ${path}.${key}`);
    }
  }

  for (const [key, def] of Object.entries(properties)) {
    const nextValue = value[key];
    if (def.required && (nextValue === undefined || nextValue === null)) {
      errors.push(`Missing required property ${path}.${key}`);
      continue;
    }

    if (nextValue === undefined) {
      continue;
    }

    const error = validateValueType(def, nextValue);
    if (error) {
      errors.push(`Invalid value for ${path}.${key}: ${error}`);
    }

    if (def.type === 'group' && typeof nextValue === 'object' && nextValue !== null) {
      validateGroupProperties(nextValue as Record<string, unknown>, def.properties, `${path}.${key}`, errors);
    }

    if (def.type === 'array' && Array.isArray(nextValue)) {
      for (let index = 0; index < nextValue.length; index += 1) {
        const item = nextValue[index];
        if (!item || typeof item !== 'object') {
          errors.push(`Invalid array item at ${path}.${key}[${index}]`);
          continue;
        }
        validateGroupProperties(
          item as Record<string, unknown>,
          def.items,
          `${path}.${key}[${index}]`,
          errors
        );
      }
    }
  }
}

function validateNodeData(node: WorkflowNode, errors: string[], prefix: string): void {
  const schema = schemas[node.type];
  if (!schema) {
    errors.push(`${prefix} Unknown node type: ${node.type}`);
    return;
  }

  if (node.data.type !== node.type) {
    errors.push(`${prefix} Node data type does not match node type`);
  }

  if (!node.data || typeof node.data !== 'object') {
    errors.push(`${prefix} Node data must be an object`);
    return;
  }

  const data = node.data as Record<string, unknown>;

  for (const key of Object.keys(data)) {
    if (key === 'type') continue;
    if (!(schema.properties as any)[key]) {
      errors.push(`${prefix} Unknown config property: ${key}`);
    }
  }

  for (const [key, def] of Object.entries(schema.properties)) {
    const value = data[key];
    if (def.required && (value === undefined || value === null)) {
      errors.push(`${prefix} Missing required property: ${key}`);
      continue;
    }

    if (value === undefined) {
      continue;
    }

    const error = validateValueType(def, value);
    if (error) {
      errors.push(`${prefix} Invalid value for ${key}: ${error}`);
    }

    if (def.type === 'group' && typeof value === 'object' && value !== null) {
      validateGroupProperties(value as Record<string, unknown>, def.properties, `${prefix}${key}`, errors);
    }

    if (def.type === 'array' && Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const item = value[index];
        if (!item || typeof item !== 'object') {
          errors.push(`${prefix} Invalid array item at ${key}[${index}]`);
          continue;
        }
        validateGroupProperties(
          item as Record<string, unknown>,
          def.items,
          `${prefix}${key}[${index}]`,
          errors
        );
      }
    }
  }
}

function buildEdgeKey(edge: WorkflowEdge): string {
  return [
    edge.source,
    edge.target,
    edge.sourceHandle || '',
    edge.targetHandle || '',
    edge.edgeType || '',
  ].join('|');
}

function hasCycle(nodeIds: string[], edges: WorkflowEdge[]): boolean {
  const adjacency = new Map<string, string[]>();
  for (const nodeId of nodeIds) {
    adjacency.set(nodeId, []);
  }

  for (const edge of edges) {
    if (!adjacency.has(edge.source) || !adjacency.has(edge.target)) {
      continue;
    }
    adjacency.get(edge.source)!.push(edge.target);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;

    visiting.add(nodeId);
    for (const neighbor of adjacency.get(nodeId) || []) {
      if (visit(neighbor)) return true;
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };

  for (const nodeId of nodeIds) {
    if (visit(nodeId)) return true;
  }

  return false;
}

function getMutationScope(op: MutationOp): EvolutionScope {
  switch (op.op) {
    case 'update-prompt':
      return 'prompts';
    case 'update-model':
      return 'models';
    case 'add-node':
    case 'remove-node':
      return 'nodes';
    case 'add-edge':
    case 'remove-edge':
      return 'edges';
    case 'update-workflow-setting':
      return 'parameters';
    case 'update-node-config': {
      const path = op.path.split('.');
      const root = path[0];
      if (root === 'userQuery' || root === 'systemPrompt' || root === 'baseInstructions') {
        return 'prompts';
      }
      if (root === 'model' || root === 'reasoningEffort') {
        return 'models';
      }
      if (root === 'tools' || root === 'mcpServers') {
        return 'tools';
      }
      return 'parameters';
    }
    default:
      return 'parameters';
  }
}

export function validateEvolution(
  workflow: Workflow,
  evolution: WorkflowEvolution,
  options: EvolutionValidationOptions = {}
): EvolutionValidationResult {
  const errors: string[] = [];
  const sanitized = sanitizeEvolution(evolution);
  const maxMutations = options.maxMutations ?? sanitized.mutations.length;
  const allowedScopes = new Set(
    options.scope ?? ['prompts', 'models', 'tools', 'nodes', 'edges', 'parameters']
  );
  const selfNodeId = options.selfNodeId;

  if (sanitized.mutations.length > maxMutations) {
    errors.push(`Mutation count exceeds maxMutations (${maxMutations})`);
  }

  const workingNodes = new Map<string, WorkflowNode>(
    workflow.nodes.map((node) => [node.id, node])
  );
  const workingEdges = new Map<string, WorkflowEdge>(
    workflow.edges.map((edge) => [edge.id, edge])
  );
  const edgeKeys = new Set<string>(
    workflow.edges.map((edge) => buildEdgeKey(edge))
  );
  const nodeNames = new Set<string>(workflow.nodes.map((node) => node.data.name));

  const selfPredecessors = new Set<string>();
  const selfSuccessors = new Set<string>();
  if (selfNodeId) {
    for (const edge of workflow.edges) {
      if (edge.target === selfNodeId) selfPredecessors.add(edge.source);
      if (edge.source === selfNodeId) selfSuccessors.add(edge.target);
    }
  }

  const validateNodePosition = (node: WorkflowNode, prefix: string) => {
    if (
      !node.position ||
      typeof node.position.x !== 'number' ||
      typeof node.position.y !== 'number' ||
      !Number.isFinite(node.position.x) ||
      !Number.isFinite(node.position.y)
    ) {
      errors.push(`${prefix} Node position must include numeric x/y values`);
    }
  };

  sanitized.mutations.forEach((mutation, index) => {
    const prefix = `Mutation ${index + 1}:`;

    if (!mutation || typeof mutation !== 'object' || !('op' in mutation)) {
      errors.push(`${prefix} Invalid mutation object`);
      return;
    }

    const scope = getMutationScope(mutation);
    if (!allowedScopes.has(scope)) {
      errors.push(`${prefix} Mutation scope '${scope}' is not allowed`);
      return;
    }

    switch (mutation.op) {
      case 'update-node-config': {
        if (typeof mutation.nodeId !== 'string' || typeof mutation.path !== 'string') {
          errors.push(`${prefix} Invalid update-node-config payload`);
          return;
        }
        const node = workingNodes.get(mutation.nodeId);
        if (!node) {
          errors.push(`${prefix} Node ${mutation.nodeId} does not exist`);
          return;
        }
        if (selfNodeId && mutation.nodeId === selfNodeId) {
          errors.push(`${prefix} Cannot modify the self-reflect node`);
          return;
        }
        const pathSegments = mutation.path.split('.');
        if (pathSegments[0] === 'type') {
          errors.push(`${prefix} Cannot modify node type`);
          return;
        }
        if (pathSegments.some((segment) => !isSafePathSegment(segment))) {
          errors.push(`${prefix} Invalid config path`);
          return;
        }
        const schema = schemas[node.type];
        if (!schema) {
          errors.push(`${prefix} Unknown node type ${node.type}`);
          return;
        }
        const def = resolvePropertyDefinition(schema.properties, pathSegments);
        if (!def) {
          errors.push(`${prefix} Config path does not exist in schema`);
          return;
        }
        const typeError = validateValueType(def, mutation.value);
        if (typeError) {
          errors.push(`${prefix} ${typeError}`);
          return;
        }
        if (pathSegments[0] === 'name' && typeof mutation.value === 'string') {
          if (node.data.name !== mutation.value && nodeNames.has(mutation.value)) {
            errors.push(`${prefix} Node name must be unique`);
            return;
          }
          nodeNames.delete(node.data.name);
          nodeNames.add(mutation.value);
          (node.data as { name?: string }).name = mutation.value;
        }
        return;
      }
      case 'update-prompt': {
        if (typeof mutation.nodeId !== 'string' || typeof mutation.field !== 'string') {
          errors.push(`${prefix} Invalid update-prompt payload`);
          return;
        }
        const node = workingNodes.get(mutation.nodeId);
        if (!node) {
          errors.push(`${prefix} Node ${mutation.nodeId} does not exist`);
          return;
        }
        if (selfNodeId && mutation.nodeId === selfNodeId) {
          errors.push(`${prefix} Cannot modify the self-reflect node`);
          return;
        }
        const schema = schemas[node.type];
        if (!schema) {
          errors.push(`${prefix} Unknown node type ${node.type}`);
          return;
        }
        const def = resolvePropertyDefinition(schema.properties, mutation.field.split('.'));
        if (!def) {
          errors.push(`${prefix} Prompt field does not exist in schema`);
          return;
        }
        const typeError = validateValueType(def, mutation.newValue);
        if (typeError) {
          errors.push(`${prefix} ${typeError}`);
          return;
        }
        return;
      }
      case 'update-model': {
        if (typeof mutation.nodeId !== 'string' || typeof mutation.newModel !== 'string') {
          errors.push(`${prefix} Invalid update-model payload`);
          return;
        }
        const node = workingNodes.get(mutation.nodeId);
        if (!node) {
          errors.push(`${prefix} Node ${mutation.nodeId} does not exist`);
          return;
        }
        if (selfNodeId && mutation.nodeId === selfNodeId) {
          errors.push(`${prefix} Cannot modify the self-reflect node`);
          return;
        }
        const schema = schemas[node.type];
        if (!schema || !(schema.properties as any).model) {
          errors.push(`${prefix} Node does not support model updates`);
          return;
        }
        const typeError = validateValueType((schema.properties as any).model, mutation.newModel);
        if (typeError) {
          errors.push(`${prefix} ${typeError}`);
          return;
        }
        return;
      }
      case 'add-node': {
        const node = mutation.node;
        if (!node || typeof node.id !== 'string') {
          errors.push(`${prefix} Invalid node payload`);
          return;
        }
        if (workingNodes.has(node.id)) {
          errors.push(`${prefix} Node ID ${node.id} already exists`);
          return;
        }
        if (selfNodeId && node.id === selfNodeId) {
          errors.push(`${prefix} Cannot add a node with the self-reflect node ID`);
          return;
        }
        if (node.data?.name && nodeNames.has(node.data.name)) {
          errors.push(`${prefix} Node name must be unique`);
          return;
        }
        const schema = schemas[node.type];
        if (!schema) {
          errors.push(`${prefix} Unknown node type ${node.type}`);
          return;
        }
        const errorCount = errors.length;
        validateNodePosition(node, prefix);
        validateNodeData(node, errors, `${prefix} `);
        if (errors.length > errorCount) {
          return;
        }
        if (mutation.connectFrom && selfNodeId && mutation.connectFrom === selfNodeId) {
          errors.push(`${prefix} Cannot connect from the self-reflect node`);
          return;
        }
        if (mutation.connectTo && selfNodeId && mutation.connectTo === selfNodeId) {
          errors.push(`${prefix} Cannot connect to the self-reflect node`);
          return;
        }
        if (mutation.connectFrom && !workingNodes.has(mutation.connectFrom)) {
          errors.push(`${prefix} connectFrom node does not exist`);
          return;
        }
        if (mutation.connectTo && !workingNodes.has(mutation.connectTo)) {
          errors.push(`${prefix} connectTo node does not exist`);
          return;
        }

        workingNodes.set(node.id, node);
        nodeNames.add(node.data.name);

        const newEdges: WorkflowEdge[] = [];
        if (mutation.connectFrom) {
          newEdges.push({
            id: `edge-${mutation.connectFrom}-${node.id}`,
            source: mutation.connectFrom,
            target: node.id,
          });
        }
        if (mutation.connectTo) {
          newEdges.push({
            id: `edge-${node.id}-${mutation.connectTo}`,
            source: node.id,
            target: mutation.connectTo,
          });
        }

        for (const edge of newEdges) {
          if (workingEdges.has(edge.id)) {
            errors.push(`${prefix} Edge ID ${edge.id} already exists`);
            return;
          }
          const key = buildEdgeKey(edge);
          if (edgeKeys.has(key)) {
            errors.push(`${prefix} Duplicate edge connection`);
            return;
          }
        }

        for (const edge of newEdges) {
          workingEdges.set(edge.id, edge);
          edgeKeys.add(buildEdgeKey(edge));
        }

        if (newEdges.length > 0) {
          const nodeIds = Array.from(workingNodes.keys());
          const edges = Array.from(workingEdges.values());
          if (hasCycle(nodeIds, edges)) {
            errors.push(`${prefix} Added edges introduce a cycle`);
          }
        }
        return;
      }
      case 'remove-node': {
        if (typeof mutation.nodeId !== 'string') {
          errors.push(`${prefix} Invalid remove-node payload`);
          return;
        }
        const node = workingNodes.get(mutation.nodeId);
        if (!node) {
          errors.push(`${prefix} Node ${mutation.nodeId} does not exist`);
          return;
        }
        if (selfNodeId && mutation.nodeId === selfNodeId) {
          errors.push(`${prefix} Cannot remove the self-reflect node`);
          return;
        }
        if (selfNodeId && (selfPredecessors.has(mutation.nodeId) || selfSuccessors.has(mutation.nodeId))) {
          errors.push(`${prefix} Cannot remove a node connected to the self-reflect node`);
          return;
        }
        if (node.type === 'input' || node.type === 'output') {
          errors.push(`${prefix} Cannot remove input/output nodes`);
          return;
        }
        if (schemas[node.type]?.meta.deletable === false) {
          errors.push(`${prefix} Node type is not deletable`);
          return;
        }
        workingNodes.delete(mutation.nodeId);
        nodeNames.delete(node.data.name);
        for (const [edgeId, edge] of workingEdges.entries()) {
          if (edge.source === mutation.nodeId || edge.target === mutation.nodeId) {
            workingEdges.delete(edgeId);
            edgeKeys.delete(buildEdgeKey(edge));
          }
        }
        return;
      }
      case 'add-edge': {
        const edge = mutation.edge;
        if (!edge || typeof edge.id !== 'string' || typeof edge.source !== 'string' || typeof edge.target !== 'string') {
          errors.push(`${prefix} Invalid edge payload`);
          return;
        }
        if (workingEdges.has(edge.id)) {
          errors.push(`${prefix} Edge ID ${edge.id} already exists`);
          return;
        }
        if (!workingNodes.has(edge.source) || !workingNodes.has(edge.target)) {
          errors.push(`${prefix} Edge source/target must exist`);
          return;
        }
        if (selfNodeId && (edge.source === selfNodeId || edge.target === selfNodeId)) {
          errors.push(`${prefix} Cannot modify edges attached to the self-reflect node`);
          return;
        }
        const key = buildEdgeKey(edge);
        if (edgeKeys.has(key)) {
          errors.push(`${prefix} Duplicate edge connection`);
          return;
        }
        const nodeIds = Array.from(workingNodes.keys());
        const edges = Array.from(workingEdges.values()).concat(edge);
        if (hasCycle(nodeIds, edges)) {
          errors.push(`${prefix} Added edge introduces a cycle`);
          return;
        }
        workingEdges.set(edge.id, edge);
        edgeKeys.add(key);
        return;
      }
      case 'remove-edge': {
        if (typeof mutation.edgeId !== 'string') {
          errors.push(`${prefix} Invalid remove-edge payload`);
          return;
        }
        const edge = workingEdges.get(mutation.edgeId);
        if (!edge) {
          errors.push(`${prefix} Edge ${mutation.edgeId} does not exist`);
          return;
        }
        if (selfNodeId && (edge.source === selfNodeId || edge.target === selfNodeId)) {
          errors.push(`${prefix} Cannot modify edges attached to the self-reflect node`);
          return;
        }
        workingEdges.delete(mutation.edgeId);
        edgeKeys.delete(buildEdgeKey(edge));
        return;
      }
      case 'update-workflow-setting': {
        if (typeof mutation.field !== 'string') {
          errors.push(`${prefix} Invalid workflow setting payload`);
          return;
        }
        if (!['name', 'description', 'workingDirectory'].includes(mutation.field)) {
          errors.push(`${prefix} Invalid workflow setting field`);
          return;
        }
        if (typeof mutation.value !== 'string') {
          errors.push(`${prefix} Workflow setting must be a string`);
          return;
        }
        return;
      }
      default: {
        const op = (mutation as MutationOp).op;
        errors.push(`${prefix} Unknown mutation op: ${op}`);
        return;
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    sanitizedEvolution: sanitized,
  };
}

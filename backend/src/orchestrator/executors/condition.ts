/**
 * Condition node executor.
 * Evaluates conditions and determines which downstream path to take.
 */

import {
  NodeExecutor,
  ExecutionResult,
  ValidationResult,
  ExecutorContext,
  ExecutorEmitter,
} from './types.js';
import {
  WorkflowNode,
  ConditionNodeConfig,
  ConditionOperator,
  ConditionRule,
  ConditionJoiner,
} from '../../workflows/types.js';
import { ExecutionError, ErrorCodes } from '../errors.js';

// Operators that don't require a compare value
const UNARY_OPERATORS: ConditionOperator[] = ['is_empty', 'is_not_empty'];
const DEFAULT_JOINER: ConditionJoiner = 'and';
const VALID_JOINERS: ConditionJoiner[] = ['and', 'or'];

type ConditionEvaluationDetail = {
  inputReference: string;
  operator: ConditionOperator;
  compareValue?: string;
  inputValue: unknown;
  result: boolean;
  joiner?: ConditionJoiner;
};

/**
 * Check if a value is considered "empty"
 */
function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Evaluate a condition based on operator
 */
function evaluateCondition(
  inputValue: unknown,
  operator: ConditionOperator,
  compareValue: string | undefined
): boolean {
  const inputString = String(inputValue ?? '');
  const inputNumber = Number(inputValue);

  switch (operator) {
    case 'equals':
      // Try numeric comparison first, fall back to string
      if (!isNaN(inputNumber) && !isNaN(Number(compareValue))) {
        return inputNumber === Number(compareValue);
      }
      return inputString === compareValue;

    case 'not_equals':
      if (!isNaN(inputNumber) && !isNaN(Number(compareValue))) {
        return inputNumber !== Number(compareValue);
      }
      return inputString !== compareValue;

    case 'contains':
      return inputString.includes(compareValue || '');

    case 'not_contains':
      return !inputString.includes(compareValue || '');

    case 'greater_than':
      return inputNumber > Number(compareValue);

    case 'less_than':
      return inputNumber < Number(compareValue);

    case 'greater_than_or_equals':
      return inputNumber >= Number(compareValue);

    case 'less_than_or_equals':
      return inputNumber <= Number(compareValue);

    case 'is_empty':
      return isEmpty(inputValue);

    case 'is_not_empty':
      return !isEmpty(inputValue);

    case 'regex':
      try {
        return new RegExp(compareValue || '').test(inputString);
      } catch {
        return false;
      }

    default:
      return false;
  }
}

function normalizeConditions(config: ConditionNodeConfig): ConditionRule[] {
  if (Array.isArray(config.conditions) && config.conditions.length > 0) {
    return config.conditions;
  }

  if (config.inputReference || config.operator || config.compareValue) {
    return [
      {
        inputReference: config.inputReference || '',
        operator: config.operator as ConditionOperator,
        compareValue: config.compareValue,
      },
    ];
  }

  return [];
}

function normalizeJoiner(joiner: ConditionJoiner | undefined): ConditionJoiner {
  return joiner === 'or' ? 'or' : DEFAULT_JOINER;
}

/**
 * Executor for condition nodes.
 * Evaluates the condition and returns which output handle should be active.
 */
export const conditionExecutor: NodeExecutor = {
  nodeType: 'condition',

  validate(node: WorkflowNode): ValidationResult | null {
    const config = node.data as ConditionNodeConfig;
    const conditions = normalizeConditions(config);

    if (conditions.length === 0) {
      return {
        valid: false,
        error: 'At least one condition is required',
      };
    }

    const validOperators: ConditionOperator[] = [
      'equals',
      'not_equals',
      'contains',
      'not_contains',
      'greater_than',
      'less_than',
      'greater_than_or_equals',
      'less_than_or_equals',
      'is_empty',
      'is_not_empty',
      'regex',
    ];

    for (let index = 0; index < conditions.length; index++) {
      const condition = conditions[index];
      const label = `Condition ${index + 1}`;

      if (!condition.inputReference) {
        return {
          valid: false,
          error: `${label}: input reference is required`,
        };
      }

      if (!condition.operator) {
        return {
          valid: false,
          error: `${label}: operator is required`,
        };
      }

      if (!validOperators.includes(condition.operator)) {
        return {
          valid: false,
          error: `${label}: invalid operator ${condition.operator}. Must be one of: ${validOperators.join(', ')}`,
        };
      }

      // Check if compare value is required
      if (!UNARY_OPERATORS.includes(condition.operator) && !condition.compareValue) {
        return {
          valid: false,
          error: `${label}: compare value is required for operator ${condition.operator}`,
        };
      }

      if (index > 0 && condition.joiner && !VALID_JOINERS.includes(condition.joiner)) {
        return {
          valid: false,
          error: `${label}: joiner must be one of: ${VALID_JOINERS.join(', ')}`,
        };
      }
    }

    return null;
  },

  async execute(
    node: WorkflowNode,
    context: ExecutorContext,
    emit: ExecutorEmitter
  ): Promise<ExecutionResult> {
    const config = node.data as ConditionNodeConfig;
    const conditions = normalizeConditions(config);

    if (conditions.length === 0) {
      throw new ExecutionError({
        code: ErrorCodes.INVALID_CONDITION_TYPE,
        message: 'No conditions configured for condition node',
        recoverable: false,
        nodeId: node.id,
      });
    }

    try {
      const details: ConditionEvaluationDetail[] = conditions.map((condition, index) => {
        // Use resolveReference for direct references to preserve actual values (null, objects, etc.)
        // Fall back to interpolate for complex strings with embedded references
        const isDirectReference = /^\{\{[^}]+\}\}$/.test(condition.inputReference.trim());
        const inputValue = isDirectReference
          ? context.resolveReference(condition.inputReference.trim())
          : context.interpolate(condition.inputReference);
        const compareValue = condition.compareValue
          ? context.interpolate(condition.compareValue)
          : undefined;

        return {
          inputReference: condition.inputReference,
          operator: condition.operator,
          compareValue,
          inputValue: typeof inputValue === 'string' ? inputValue.slice(0, 100) : inputValue,
          result: evaluateCondition(inputValue, condition.operator, compareValue),
          joiner: index > 0 ? normalizeJoiner(condition.joiner) : undefined,
        };
      });

      let groupResult = details[0].result;
      const groups: boolean[] = [];

      for (let index = 1; index < details.length; index++) {
        const joiner = normalizeJoiner(details[index].joiner);
        if (joiner === 'and') {
          groupResult = groupResult && details[index].result;
        } else {
          groups.push(groupResult);
          groupResult = details[index].result;
        }
      }

      groups.push(groupResult);
      const result = groups.some(Boolean);

      const metadata: Record<string, unknown> = {
        conditions: details,
        result,
      };

      if (details.length === 1) {
        metadata.operator = details[0].operator;
        metadata.inputReference = details[0].inputReference;
        metadata.inputValue = details[0].inputValue;
        metadata.compareValue = details[0].compareValue;
      }

      return {
        output: result,
        metadata,
      };
    } catch (e) {
      throw new ExecutionError({
        code: ErrorCodes.CONDITION_EVALUATION_FAILED,
        message: `Failed to evaluate condition: ${e instanceof Error ? e.message : String(e)}`,
        recoverable: false,
        nodeId: node.id,
        details: e,
      });
    }
  },

  /**
   * Determine which output handle is active based on the condition result.
   */
  getOutputHandle(result: ExecutionResult, node: WorkflowNode): string | null {
    return result.output ? 'true' : 'false';
  },
};

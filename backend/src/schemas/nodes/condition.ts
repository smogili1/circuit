// Condition Node Schema
// Branches workflow based on comparing a reference value with an operator

import { defineSchema, InferNodeConfig } from '../define';

// Condition operators - used by the conditions array
export const CONDITION_OPERATORS = [
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
] as const;

export type ConditionOperator = typeof CONDITION_OPERATORS[number];
export type ConditionJoiner = 'and' | 'or';

export interface ConditionRule {
  id?: string;
  inputReference: string;
  operator: ConditionOperator;
  compareValue?: string;
  joiner?: ConditionJoiner;
}

export const conditionSchema = defineSchema({
  meta: {
    type: 'condition' as const,
    displayName: 'Condition',
    description: 'Conditional branching based on comparing values',
    icon: 'GitBranch',
    color: '#f59e0b',
    borderColor: '#d97706',
    category: 'flow',
  },
  properties: {
    name: {
      type: 'string',
      displayName: 'Name',
      default: 'Condition',
      required: true as const,
    },
    conditions: {
      type: 'conditionRules',
      displayName: 'Conditions',
      description: 'Multiple condition rules combined with AND/OR logic',
    },
    // Legacy single-condition fields (backward compatibility) - hidden from UI
    inputReference: {
      type: 'reference',
      displayName: 'Input Reference',
      placeholder: '{{NodeName.field}}',
      hidden: true,
    },
    operator: {
      type: 'select',
      displayName: 'Operator',
      default: 'equals',
      hidden: true,
      options: [
        { value: 'equals', label: 'Equals' },
        { value: 'not_equals', label: 'Not Equals' },
        { value: 'contains', label: 'Contains' },
        { value: 'not_contains', label: 'Not Contains' },
        { value: 'greater_than', label: 'Greater Than' },
        { value: 'less_than', label: 'Less Than' },
        { value: 'greater_than_or_equals', label: 'Greater Than or Equals' },
        { value: 'less_than_or_equals', label: 'Less Than or Equals' },
        { value: 'is_empty', label: 'Is Empty' },
        { value: 'is_not_empty', label: 'Is Not Empty' },
        { value: 'regex', label: 'Regex Match' },
      ] as const,
    },
    compareValue: {
      type: 'string',
      displayName: 'Compare Value',
      placeholder: 'Value to compare against',
      hidden: true,
    },
  },
  inputs: {
    value: {
      type: 'any',
      displayName: 'Value',
      description: 'The value to evaluate (from inputReference)',
      required: true,
    },
  },
  outputs: {
    matched: {
      type: 'boolean',
      displayName: 'Matched',
      description: 'Whether the condition matched',
    },
    value: {
      type: 'any',
      displayName: 'Value',
      description: 'The original input value (passed through)',
    },
  },
  handles: {
    source: [
      { id: 'true', label: 'True', position: 0.3 },
      { id: 'false', label: 'False', position: 0.7 },
    ],
  },
  execution: {
    mode: 'evaluate',
  },
});

// The actual runtime config type with proper conditions typing
export interface ConditionNodeConfig {
  type: 'condition';
  name: string;
  conditions?: ConditionRule[];
  // Legacy fields
  inputReference?: string;
  operator?: ConditionOperator;
  compareValue?: string;
}

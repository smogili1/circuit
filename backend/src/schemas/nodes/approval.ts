// Approval Node Schema
// Pauses workflow for user approval or rejection with feedback

import { defineSchema, InputSelection } from '../define';

export interface ApprovalInputSelection extends InputSelection {}

export const approvalSchema = defineSchema({
  meta: {
    type: 'approval' as const,
    displayName: 'User Approval',
    description: 'Pause workflow for user review and approval',
    icon: 'UserCheck',
    color: '#8b5cf6',
    borderColor: '#7c3aed',
    category: 'flow',
  },
  properties: {
    name: {
      type: 'string',
      displayName: 'Name',
      default: 'Review',
      required: true as const,
    },
    promptMessage: {
      type: 'textarea',
      displayName: 'Prompt Message',
      placeholder: 'Review the output and approve or reject',
      description: 'Message shown to the user when requesting approval',
      supportsReferences: true,
      required: true as const,
    },
    inputSelections: {
      type: 'inputSelector',
      displayName: 'Display Inputs',
      description: 'Select which upstream outputs to show the user',
      required: true as const,
    },
    feedbackPrompt: {
      type: 'string',
      displayName: 'Rejection Feedback Prompt',
      default: 'What should be changed?',
      placeholder: 'Prompt for rejection feedback',
      description: 'Text shown when user rejects, prompting for feedback',
    },
    timeoutMinutes: {
      type: 'number',
      displayName: 'Timeout (minutes)',
      placeholder: 'Leave empty for no timeout',
      description: 'Auto-action after this duration (optional)',
    },
    timeoutAction: {
      type: 'select',
      displayName: 'On Timeout',
      default: 'reject',
      options: [
        { value: 'approve', label: 'Auto-approve' },
        { value: 'reject', label: 'Auto-reject' },
        { value: 'fail', label: 'Fail workflow' },
      ] as const,
      showWhen: { field: 'timeoutMinutes', notEmpty: true },
    },
  },
  inputs: {
    data: {
      type: 'any',
      displayName: 'Input Data',
      description: 'Data from upstream nodes to display for review',
      required: true,
    },
  },
  outputs: {
    approved: {
      type: 'boolean',
      displayName: 'Approved',
      description: 'Whether the user approved',
    },
    feedback: {
      type: 'string',
      displayName: 'Feedback',
      description: 'User\'s rejection feedback (empty if approved)',
    },
    respondedAt: {
      type: 'string',
      displayName: 'Response Time',
      description: 'When the user responded (ISO timestamp)',
    },
    displayedData: {
      type: 'object',
      displayName: 'Displayed Data',
      description: 'The data that was shown to the user',
    },
  },
  handles: {
    source: [
      { id: 'approved', label: 'Approved', position: 0.3, color: '#22c55e' },
      { id: 'rejected', label: 'Rejected', position: 0.7, color: '#ef4444', dashed: true },
    ],
  },
  execution: {
    mode: 'approval',
    waitForUser: true,
  },
});

export interface ApprovalNodeConfig {
  type: 'approval';
  name: string;
  promptMessage: string;
  inputSelections: ApprovalInputSelection[];
  feedbackPrompt?: string;
  timeoutMinutes?: number;
  timeoutAction?: 'approve' | 'reject' | 'fail';
}

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NodePalette } from './NodePalette';
import { useSchemaStore } from '../../stores/schemaStore';

const mockSchemas = {
  input: {
    meta: {
      type: 'input',
      displayName: 'Input',
      description: 'Starting point for user prompts',
      icon: 'ArrowRightCircle',
      color: '#3b82f6',
      borderColor: '#2563eb',
      category: 'flow',
    },
    properties: {},
    inputs: [],
    outputs: {},
  },
  'claude-agent': {
    meta: {
      type: 'claude-agent',
      displayName: 'Claude Agent',
      description: 'Claude Code SDK agent',
      icon: 'Sparkles',
      color: '#d48a5f',
      borderColor: '#c77347',
      category: 'agents',
    },
    properties: {},
    inputs: {},
    outputs: {},
  },
  'codex-agent': {
    meta: {
      type: 'codex-agent',
      displayName: 'Codex Agent',
      description: 'OpenAI Codex SDK agent',
      icon: 'Code2',
      color: '#f87171',
      borderColor: '#dc2626',
      category: 'agents',
    },
    properties: {},
    inputs: {},
    outputs: {},
  },
  javascript: {
    meta: {
      type: 'javascript',
      displayName: 'JavaScript',
      description: 'Execute custom JavaScript code',
      icon: 'Code',
      color: '#f7df1e',
      borderColor: '#c9b515',
      category: 'flow',
    },
    properties: {},
    inputs: {},
    outputs: {},
  },
  condition: {
    meta: {
      type: 'condition',
      displayName: 'Condition',
      description: 'Branch based on output',
      icon: 'GitBranch',
      color: '#f59e0b',
      borderColor: '#d97706',
      category: 'flow',
    },
    properties: {},
    inputs: {},
    outputs: {},
  },
  merge: {
    meta: {
      type: 'merge',
      displayName: 'Merge',
      description: 'Combine multiple inputs',
      icon: 'Merge',
      color: '#10b981',
      borderColor: '#059669',
      category: 'flow',
    },
    properties: {},
    inputs: {},
    outputs: {},
  },
  output: {
    meta: {
      type: 'output',
      displayName: 'Output',
      description: 'Final result collection',
      icon: 'CheckCircle2',
      color: '#22c55e',
      borderColor: '#16a34a',
      category: 'flow',
    },
    properties: {},
    inputs: {},
    outputs: {},
  },
};

describe('NodePalette', () => {
  beforeEach(() => {
    useSchemaStore.setState({
      schemas: mockSchemas,
      loading: false,
      error: null,
      initialized: true,
    });
  });

  it('should render all node types', () => {
    render(<NodePalette />);

    expect(screen.getByText('Input')).toBeInTheDocument();
    expect(screen.getByText('Claude Agent')).toBeInTheDocument();
    expect(screen.getByText('Codex Agent')).toBeInTheDocument();
    expect(screen.getByText('JavaScript')).toBeInTheDocument();
    expect(screen.getByText('Condition')).toBeInTheDocument();
    expect(screen.getByText('Merge')).toBeInTheDocument();
    expect(screen.getByText('Output')).toBeInTheDocument();
  });

  it('should render descriptions for each node type', () => {
    render(<NodePalette />);

    expect(screen.getByText('Starting point for user prompts')).toBeInTheDocument();
    expect(screen.getByText('Claude Code SDK agent')).toBeInTheDocument();
    expect(screen.getByText('OpenAI Codex SDK agent')).toBeInTheDocument();
    expect(screen.getByText('Execute custom JavaScript code')).toBeInTheDocument();
    expect(screen.getByText('Branch based on output')).toBeInTheDocument();
    expect(screen.getByText('Combine multiple inputs')).toBeInTheDocument();
    expect(screen.getByText('Final result collection')).toBeInTheDocument();
  });

  it('should have draggable nodes', () => {
    render(<NodePalette />);

    const nodes = screen.getAllByRole('generic').filter((el) =>
      el.getAttribute('draggable') === 'true'
    );

    expect(nodes.length).toBe(7);
  });

  it('should set correct data transfer on drag start', () => {
    render(<NodePalette />);

    const inputNode = screen.getByText('Input').closest('[draggable="true"]');
    expect(inputNode).toBeInTheDocument();

    const mockSetData = vi.fn();
    const mockDataTransfer = {
      setData: mockSetData,
      effectAllowed: '',
    };

    fireEvent.dragStart(inputNode!, {
      dataTransfer: mockDataTransfer,
    });

    expect(mockSetData).toHaveBeenCalledWith(
      'application/reactflow',
      'input'
    );
  });
});

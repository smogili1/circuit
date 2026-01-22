import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApprovalModal } from './ApprovalModal';
import { ApprovalRequest, ApprovalResponse } from '../../types/workflow';

describe('ApprovalModal', () => {
  const mockOnSubmit = vi.fn();

  const createMockApproval = (overrides: Partial<ApprovalRequest> = {}): ApprovalRequest => ({
    nodeId: 'approval-1',
    nodeName: 'Review Output',
    promptMessage: 'Please review the generated content',
    displayData: {
      Agent: {
        result: 'Generated content from the agent',
      },
    },
    ...overrides,
  });

  beforeEach(() => {
    mockOnSubmit.mockClear();
  });

  describe('rendering', () => {
    it('should render the modal with approval request details', () => {
      const approval = createMockApproval();
      render(<ApprovalModal approval={approval} onSubmit={mockOnSubmit} />);

      expect(screen.getByText('Approval Required')).toBeInTheDocument();
      expect(screen.getByText('Review Output')).toBeInTheDocument();
      expect(screen.getByText('Please review the generated content')).toBeInTheDocument();
    });

    it('should display the prompt message', () => {
      const approval = createMockApproval({
        promptMessage: 'Custom prompt for review',
      });
      render(<ApprovalModal approval={approval} onSubmit={mockOnSubmit} />);

      expect(screen.getByText('Custom prompt for review')).toBeInTheDocument();
    });

    it('should display data from upstream nodes', () => {
      const approval = createMockApproval({
        displayData: {
          Agent: { result: 'Agent output text' },
          OtherNode: { summary: 'Summary data' },
        },
      });
      render(<ApprovalModal approval={approval} onSubmit={mockOnSubmit} />);

      expect(screen.getByText('Data to Review')).toBeInTheDocument();
      expect(screen.getByText('Agent')).toBeInTheDocument();
      // Data is rendered as JSON
      expect(screen.getByText(/"result": "Agent output text"/)).toBeInTheDocument();
      expect(screen.getByText('OtherNode')).toBeInTheDocument();
      expect(screen.getByText(/"summary": "Summary data"/)).toBeInTheDocument();
    });

    it('should not show data section when displayData is empty', () => {
      const approval = createMockApproval({
        displayData: {},
      });
      render(<ApprovalModal approval={approval} onSubmit={mockOnSubmit} />);

      expect(screen.queryByText('Data to Review')).not.toBeInTheDocument();
    });

    it('should show approve and reject buttons initially', () => {
      const approval = createMockApproval();
      render(<ApprovalModal approval={approval} onSubmit={mockOnSubmit} />);

      expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument();
    });

    it('should display timeout remaining when timeoutAt is set', () => {
      const futureTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      const approval = createMockApproval({
        timeoutAt: futureTime,
      });
      render(<ApprovalModal approval={approval} onSubmit={mockOnSubmit} />);

      expect(screen.getByText(/remaining/i)).toBeInTheDocument();
    });
  });

  describe('approval flow', () => {
    it('should call onSubmit with approved=true when Approve is clicked', async () => {
      const approval = createMockApproval();
      render(<ApprovalModal approval={approval} onSubmit={mockOnSubmit} />);

      const approveButton = screen.getByRole('button', { name: /approve/i });
      fireEvent.click(approveButton);

      expect(mockOnSubmit).toHaveBeenCalledTimes(1);
      expect(mockOnSubmit).toHaveBeenCalledWith(
        'approval-1',
        expect.objectContaining({
          approved: true,
          respondedAt: expect.any(String),
        })
      );
    });

    it('should not include feedback when approving', async () => {
      const approval = createMockApproval();
      render(<ApprovalModal approval={approval} onSubmit={mockOnSubmit} />);

      fireEvent.click(screen.getByRole('button', { name: /approve/i }));

      const response = mockOnSubmit.mock.calls[0][1] as ApprovalResponse;
      expect(response.feedback).toBeUndefined();
    });
  });

  describe('rejection flow', () => {
    it('should show feedback input when Reject is clicked', async () => {
      const approval = createMockApproval();
      render(<ApprovalModal approval={approval} onSubmit={mockOnSubmit} />);

      // Click reject button
      fireEvent.click(screen.getByRole('button', { name: /^reject$/i }));

      // Feedback textarea should appear
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/describe what should be changed/i)).toBeInTheDocument();
      });
    });

    it('should show custom feedback prompt if provided', async () => {
      const approval = createMockApproval({
        feedbackPrompt: 'What specific changes are needed?',
      });
      render(<ApprovalModal approval={approval} onSubmit={mockOnSubmit} />);

      fireEvent.click(screen.getByRole('button', { name: /^reject$/i }));

      await waitFor(() => {
        expect(screen.getByText('What specific changes are needed?')).toBeInTheDocument();
      });
    });

    it('should disable submit button when feedback is empty', async () => {
      const approval = createMockApproval();
      render(<ApprovalModal approval={approval} onSubmit={mockOnSubmit} />);

      fireEvent.click(screen.getByRole('button', { name: /^reject$/i }));

      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /submit rejection/i });
        expect(submitButton).toBeDisabled();
      });
    });

    it('should enable submit button when feedback is provided', async () => {
      const user = userEvent.setup();
      const approval = createMockApproval();
      render(<ApprovalModal approval={approval} onSubmit={mockOnSubmit} />);

      fireEvent.click(screen.getByRole('button', { name: /^reject$/i }));

      const textarea = await screen.findByPlaceholderText(/describe what should be changed/i);
      await user.type(textarea, 'Please add more detail');

      const submitButton = screen.getByRole('button', { name: /submit rejection/i });
      expect(submitButton).not.toBeDisabled();
    });

    it('should call onSubmit with feedback when rejection is submitted', async () => {
      const user = userEvent.setup();
      const approval = createMockApproval();
      render(<ApprovalModal approval={approval} onSubmit={mockOnSubmit} />);

      // Enter rejection mode
      fireEvent.click(screen.getByRole('button', { name: /^reject$/i }));

      // Type feedback
      const textarea = await screen.findByPlaceholderText(/describe what should be changed/i);
      await user.type(textarea, 'Needs more examples');

      // Submit rejection
      fireEvent.click(screen.getByRole('button', { name: /submit rejection/i }));

      expect(mockOnSubmit).toHaveBeenCalledWith(
        'approval-1',
        expect.objectContaining({
          approved: false,
          feedback: 'Needs more examples',
          respondedAt: expect.any(String),
        })
      );
    });

    it('should allow canceling rejection to return to initial state', async () => {
      const approval = createMockApproval();
      render(<ApprovalModal approval={approval} onSubmit={mockOnSubmit} />);

      // Enter rejection mode
      fireEvent.click(screen.getByRole('button', { name: /^reject$/i }));

      // Verify we're in rejection mode
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });

      // Cancel
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      // Should return to initial state
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^reject$/i })).toBeInTheDocument();
      });
    });

    it('should clear feedback text when canceling rejection', async () => {
      const user = userEvent.setup();
      const approval = createMockApproval();
      render(<ApprovalModal approval={approval} onSubmit={mockOnSubmit} />);

      // Enter rejection mode and type feedback
      fireEvent.click(screen.getByRole('button', { name: /^reject$/i }));
      const textarea = await screen.findByPlaceholderText(/describe what should be changed/i);
      await user.type(textarea, 'Some feedback');

      // Cancel
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      // Re-enter rejection mode
      fireEvent.click(screen.getByRole('button', { name: /^reject$/i }));

      // Textarea should be empty
      const newTextarea = await screen.findByPlaceholderText(/describe what should be changed/i);
      expect(newTextarea).toHaveValue('');
    });
  });

  describe('data display', () => {
    it('should format string data directly', () => {
      const approval = createMockApproval({
        displayData: {
          Agent: 'Simple string output',
        },
      });
      render(<ApprovalModal approval={approval} onSubmit={mockOnSubmit} />);

      expect(screen.getByText('Simple string output')).toBeInTheDocument();
    });

    it('should format object data as JSON', () => {
      const approval = createMockApproval({
        displayData: {
          Agent: { score: 85, status: 'complete' },
        },
      });
      render(<ApprovalModal approval={approval} onSubmit={mockOnSubmit} />);

      // Should show JSON-formatted output
      expect(screen.getByText(/"score": 85/)).toBeInTheDocument();
      expect(screen.getByText(/"status": "complete"/)).toBeInTheDocument();
    });

    it('should handle nested object data', () => {
      const approval = createMockApproval({
        displayData: {
          Agent: {
            result: {
              summary: 'Brief summary',
              details: {
                point1: 'First point',
                point2: 'Second point',
              },
            },
          },
        },
      });
      render(<ApprovalModal approval={approval} onSubmit={mockOnSubmit} />);

      expect(screen.getByText(/Brief summary/)).toBeInTheDocument();
    });

    it('should display multiple upstream node outputs', () => {
      const approval = createMockApproval({
        displayData: {
          Researcher: { findings: 'Research findings' },
          Writer: { draft: 'Written draft' },
          Reviewer: { comments: 'Review comments' },
        },
      });
      render(<ApprovalModal approval={approval} onSubmit={mockOnSubmit} />);

      expect(screen.getByText('Researcher')).toBeInTheDocument();
      expect(screen.getByText('Writer')).toBeInTheDocument();
      expect(screen.getByText('Reviewer')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have proper modal structure', () => {
      const approval = createMockApproval();
      render(<ApprovalModal approval={approval} onSubmit={mockOnSubmit} />);

      // Modal should be visible
      expect(screen.getByText('Approval Required')).toBeVisible();
    });

    it('should focus on textarea when entering rejection mode', async () => {
      const approval = createMockApproval();
      render(<ApprovalModal approval={approval} onSubmit={mockOnSubmit} />);

      fireEvent.click(screen.getByRole('button', { name: /^reject$/i }));

      await waitFor(() => {
        const textarea = screen.getByPlaceholderText(/describe what should be changed/i);
        expect(textarea).toHaveFocus();
      });
    });
  });
});

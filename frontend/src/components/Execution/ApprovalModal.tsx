import { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react';
import { ApprovalRequest, ApprovalResponse } from '../../types/workflow';
import { DataRenderer } from './DataRenderer';

interface ApprovalModalProps {
  approval: ApprovalRequest;
  onSubmit: (nodeId: string, response: ApprovalResponse) => void;
}

export function ApprovalModal({ approval, onSubmit }: ApprovalModalProps) {
  const [feedback, setFeedback] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  // Lock body scroll when modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const handleApprove = () => {
    onSubmit(approval.nodeId, {
      approved: true,
      respondedAt: new Date().toISOString(),
    });
  };

  const handleReject = () => {
    if (!feedback.trim()) return;
    onSubmit(approval.nodeId, {
      approved: false,
      feedback: feedback.trim(),
      respondedAt: new Date().toISOString(),
    });
  };

  const timeRemaining = approval.timeoutAt
    ? Math.max(0, new Date(approval.timeoutAt).getTime() - Date.now())
    : null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-purple-600 px-6 py-4 flex items-center gap-3">
          <AlertCircle className="text-white" size={24} />
          <div>
            <h2 className="text-lg font-semibold text-white">
              Approval Required
            </h2>
            <p className="text-purple-200 text-sm">{approval.nodeName}</p>
          </div>
          {timeRemaining !== null && (
            <div className="ml-auto flex items-center gap-2 text-purple-200">
              <Clock size={16} />
              <span className="text-sm">
                {Math.ceil(timeRemaining / 60000)}m remaining
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Prompt Message */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
              {approval.promptMessage}
            </p>
          </div>

          {/* Display Data from upstream nodes */}
          {approval.displayData && Object.keys(approval.displayData).length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Data to Review
              </h3>
              <div className="max-h-96 overflow-y-auto space-y-3">
                {Object.entries(approval.displayData).map(([key, value]) => (
                  <DataRenderer
                    key={key}
                    data={value}
                    label={key}
                    defaultExpanded={Object.keys(approval.displayData!).length === 1}
                    maxPreviewLength={80}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Rejection feedback input */}
          {isRejecting && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {approval.feedbackPrompt || 'Please provide feedback for rejection:'}
              </label>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={3}
                placeholder="Describe what should be changed..."
                className="w-full px-3 py-2 border rounded-lg text-sm
                  dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100
                  focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                autoFocus
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700 flex justify-end gap-3">
          {!isRejecting ? (
            <>
              <button
                onClick={() => setIsRejecting(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium
                  text-red-600 bg-red-50 hover:bg-red-100 rounded-lg
                  dark:bg-red-900/30 dark:hover:bg-red-900/50"
              >
                <XCircle size={18} />
                Reject
              </button>
              <button
                onClick={handleApprove}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium
                  text-white bg-green-600 hover:bg-green-700 rounded-lg"
              >
                <CheckCircle2 size={18} />
                Approve
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  setIsRejecting(false);
                  setFeedback('');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300
                  hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={!feedback.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium
                  text-white bg-red-600 hover:bg-red-700 rounded-lg
                  disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <XCircle size={18} />
                Submit Rejection
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

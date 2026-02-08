import { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Sparkles, AlertCircle } from 'lucide-react';
import { EvolutionRequest, EvolutionResponse } from '../../types/workflow';
import { EvolutionDiffViewer } from './EvolutionDiffViewer';
import { DataRenderer } from '../Execution/DataRenderer';

interface EvolutionApprovalPanelProps {
  evolution: EvolutionRequest;
  onSubmit: (nodeId: string, response: EvolutionResponse) => void;
}

export function EvolutionApprovalPanel({ evolution, onSubmit }: EvolutionApprovalPanelProps) {
  const [feedback, setFeedback] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'diff'>('overview');

  // Lock body scroll when modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const handleApprove = () => {
    onSubmit(evolution.nodeId, {
      approved: true,
      respondedAt: new Date().toISOString(),
    });
  };

  const handleReject = () => {
    if (!feedback.trim()) return;
    onSubmit(evolution.nodeId, {
      approved: false,
      feedback: feedback.trim(),
      respondedAt: new Date().toISOString(),
    });
  };

  const hasValidationErrors = evolution.validationErrors.length > 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4 flex items-center gap-3">
          <Sparkles className="text-white" size={24} />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-white">
              Workflow Evolution Proposal
            </h2>
            <p className="text-purple-200 text-sm">{evolution.nodeName}</p>
          </div>
          {hasValidationErrors && (
            <div className="flex items-center gap-2 bg-red-500/20 px-3 py-1.5 rounded-lg">
              <AlertTriangle className="text-red-200" size={18} />
              <span className="text-red-200 text-sm font-medium">
                {evolution.validationErrors.length} validation error{evolution.validationErrors.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'overview'
                ? 'border-b-2 border-purple-600 text-purple-600 dark:text-purple-400 bg-white dark:bg-gray-800'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('diff')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'diff'
                ? 'border-b-2 border-purple-600 text-purple-600 dark:text-purple-400 bg-white dark:bg-gray-800'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            Changes ({evolution.evolution.mutations.length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' ? (
            <div className="space-y-4">
              {/* Validation Errors */}
              {hasValidationErrors && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-red-800 dark:text-red-200 font-semibold mb-2">
                    <AlertCircle size={18} />
                    Validation Errors
                  </div>
                  <ul className="space-y-1 text-sm text-red-700 dark:text-red-300">
                    {evolution.validationErrors.map((error, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <span className="text-red-500 mt-0.5">•</span>
                        <span>{error}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Reasoning */}
              <div>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
                  Reasoning
                </h3>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                  {evolution.evolution.reasoning}
                </div>
              </div>

              {/* Expected Impact */}
              <div>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
                  Expected Impact
                </h3>
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm text-blue-800 dark:text-blue-200">
                  {evolution.evolution.expectedImpact}
                </div>
              </div>

              {/* Risk Assessment */}
              <div>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
                  Risk Assessment
                </h3>
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-sm text-amber-800 dark:text-amber-200">
                  {evolution.evolution.riskAssessment}
                </div>
              </div>

              {/* Rollback Plan */}
              {evolution.evolution.rollbackPlan && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
                    Rollback Plan
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-sm text-gray-700 dark:text-gray-300">
                    {evolution.evolution.rollbackPlan}
                  </div>
                </div>
              )}

              {/* Summary Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3">
                  <div className="text-xs text-purple-600 dark:text-purple-400 font-medium">
                    Total Mutations
                  </div>
                  <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                    {evolution.evolution.mutations.length}
                  </div>
                </div>
                <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-3">
                  <div className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                    Affected Nodes
                  </div>
                  <div className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">
                    {new Set(
                      evolution.evolution.mutations
                        .filter((m): m is Extract<typeof m, { nodeId: string }> => 'nodeId' in m)
                        .map(m => m.nodeId)
                    ).size}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <EvolutionDiffViewer
              beforeWorkflow={evolution.beforeSnapshot}
              afterWorkflow={evolution.afterPreview}
              mutations={evolution.evolution.mutations}
            />
          )}

          {/* Rejection feedback input */}
          {isRejecting && (
            <div className="mt-4 space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Please provide feedback on why you're rejecting this evolution:
              </label>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={3}
                placeholder="Describe what should be changed or why this evolution is not appropriate..."
                className="w-full px-3 py-2 border rounded-lg text-sm
                  dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100
                  focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                autoFocus
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 flex justify-end gap-3 border-t border-gray-200 dark:border-gray-700">
          {!isRejecting ? (
            <>
              <button
                onClick={() => setIsRejecting(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium
                  text-red-600 bg-red-50 hover:bg-red-100 rounded-lg
                  dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-400"
              >
                <XCircle size={18} />
                Reject Evolution
              </button>
              <button
                onClick={handleApprove}
                disabled={hasValidationErrors}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium
                  text-white bg-gradient-to-r from-purple-600 to-indigo-600
                  hover:from-purple-700 hover:to-indigo-700 rounded-lg
                  disabled:opacity-50 disabled:cursor-not-allowed"
                title={hasValidationErrors ? 'Cannot approve due to validation errors' : ''}
              >
                <CheckCircle2 size={18} />
                Approve & Apply
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
                  hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
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

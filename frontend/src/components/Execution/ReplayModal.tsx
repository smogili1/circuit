import { useState, useEffect } from 'react';
import { X, RotateCcw, Loader2, AlertCircle } from 'lucide-react';
import { ReplayInfo } from '../../types/workflow';
import { ReplayValidationBanner } from './ReplayValidationBanner';
import { ReplayNodeSelector } from './ReplayNodeSelector';

interface ReplayModalProps {
  workflowId: string;
  executionId: string;
  originalInput: string;
  onClose: () => void;
  onReplay: (fromNodeId: string) => void;
}

export function ReplayModal({
  workflowId,
  executionId,
  originalInput,
  onClose,
  onReplay,
}: ReplayModalProps) {
  const [replayInfo, setReplayInfo] = useState<ReplayInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Lock body scroll when modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Fetch replay info
  useEffect(() => {
    const fetchReplayInfo = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/workflows/${workflowId}/executions/${executionId}/replay-info`
        );
        if (!response.ok) {
          throw new Error(`Failed to fetch replay info: ${response.statusText}`);
        }
        const data = (await response.json()) as ReplayInfo;
        setReplayInfo(data);

        // Auto-select the first replayable checkpoint if available
        const firstReplayable = data.checkpoints.find(c => c.replayable);
        if (firstReplayable) {
          setSelectedNodeId(firstReplayable.nodeId);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load replay information');
      } finally {
        setIsLoading(false);
      }
    };

    fetchReplayInfo();
  }, [workflowId, executionId]);

  const handleReplay = () => {
    if (!selectedNodeId) return;
    onReplay(selectedNodeId);
    onClose();
  };

  const canReplay = selectedNodeId && !replayInfo?.isReplayBlocked;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-blue-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <RotateCcw className="text-white" size={24} />
            <div>
              <h2 className="text-lg font-semibold text-white">
                Retry from Node
              </h2>
              <p className="text-blue-200 text-sm">
                Replay workflow from a specific checkpoint
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-blue-700 rounded-lg p-2 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-blue-600" size={32} />
              <span className="ml-3 text-gray-600 dark:text-gray-400">
                Loading replay information...
              </span>
            </div>
          ) : error ? (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="text-red-600 dark:text-red-400 flex-shrink-0" size={20} />
                <div>
                  <h3 className="text-sm font-semibold text-red-800 dark:text-red-300 mb-1">
                    Error Loading Replay Information
                  </h3>
                  <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                </div>
              </div>
            </div>
          ) : replayInfo ? (
            <>
              {/* Validation Banner */}
              <ReplayValidationBanner
                errors={replayInfo.errors}
                warnings={replayInfo.warnings}
              />

              {/* Node Selector */}
              {!replayInfo.isReplayBlocked && (
                <ReplayNodeSelector
                  checkpoints={replayInfo.checkpoints}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={setSelectedNodeId}
                />
              )}

              {/* Original Input Preview */}
              {!replayInfo.isReplayBlocked && selectedNodeId && originalInput && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Original Input
                  </h3>
                  <div className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm font-mono text-gray-700 dark:text-gray-300 max-h-32 overflow-y-auto">
                    {originalInput}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Replay will use the original input. Any node configuration changes will be applied.
                  </p>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300
              hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleReplay}
            disabled={!canReplay || isLoading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium
              text-white bg-blue-600 hover:bg-blue-700 rounded-lg
              disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RotateCcw size={18} />
            Start Replay
          </button>
        </div>
      </div>
    </div>
  );
}

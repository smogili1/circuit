import { useState, useEffect } from 'react';
import { X, RotateCcw, AlertTriangle, CheckCircle2, Play, RefreshCw, Loader2 } from 'lucide-react';
import { ReplayValidationResult } from '../../types/workflow';

interface ReplayModalProps {
  nodeName: string;
  nodeId: string;
  workflowId: string;
  executionId: string;
  originalInput: string;
  onFetchPreview: (workflowId: string, executionId: string, fromNodeId: string) => Promise<ReplayValidationResult | null>;
  onConfirm: (input?: string) => void;
  onCancel: () => void;
}

export function ReplayModal({
  nodeName,
  nodeId,
  workflowId,
  executionId,
  originalInput,
  onFetchPreview,
  onConfirm,
  onCancel,
}: ReplayModalProps) {
  const [preview, setPreview] = useState<ReplayValidationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [useOriginalInput, setUseOriginalInput] = useState(true);
  const [customInput, setCustomInput] = useState(originalInput);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    onFetchPreview(workflowId, executionId, nodeId).then((result) => {
      if (!cancelled) {
        setPreview(result);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [workflowId, executionId, nodeId, onFetchPreview]);

  const handleConfirm = () => {
    const input = useOriginalInput ? undefined : customInput;
    onConfirm(input);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <RotateCcw size={20} className="text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Replay Execution</h2>
              <p className="text-sm text-gray-400">From node: {nodeName}</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="animate-spin text-blue-500" />
              <span className="ml-2 text-gray-400">Loading preview...</span>
            </div>
          ) : preview ? (
            <>
              {/* Validation Status */}
              {!preview.valid && (
                <div className="p-3 bg-red-950/50 border border-red-500/30 rounded-lg">
                  <div className="flex items-center gap-2 text-red-400 font-medium mb-2">
                    <AlertTriangle size={16} />
                    Cannot Replay
                  </div>
                  <ul className="text-sm text-red-300 space-y-1">
                    {preview.errors.map((error, idx) => (
                      <li key={idx}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Warnings */}
              {preview.warnings.length > 0 && (
                <div className="p-3 bg-yellow-950/50 border border-yellow-500/30 rounded-lg">
                  <div className="flex items-center gap-2 text-yellow-400 font-medium mb-2">
                    <AlertTriangle size={16} />
                    Warnings
                  </div>
                  <ul className="text-sm text-yellow-300 space-y-1">
                    {preview.warnings.map((warning, idx) => (
                      <li key={idx}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Affected Nodes */}
              {preview.valid && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-300">Execution Plan</h3>

                  {preview.affectedNodes.reused.length > 0 && (
                    <div className="p-3 bg-gray-800/50 border border-gray-700 rounded-lg">
                      <div className="flex items-center gap-2 text-green-400 text-sm font-medium mb-2">
                        <CheckCircle2 size={14} />
                        Reusing outputs from {preview.affectedNodes.reused.length} node(s)
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {preview.affectedNodes.reused.map((nodeId) => (
                          <span
                            key={nodeId}
                            className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded"
                          >
                            {nodeId.slice(0, 12)}...
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {preview.affectedNodes.reExecuted.length > 0 && (
                    <div className="p-3 bg-gray-800/50 border border-gray-700 rounded-lg">
                      <div className="flex items-center gap-2 text-blue-400 text-sm font-medium mb-2">
                        <RefreshCw size={14} />
                        Re-executing {preview.affectedNodes.reExecuted.length} node(s)
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {preview.affectedNodes.reExecuted.map((nodeId) => (
                          <span
                            key={nodeId}
                            className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded"
                          >
                            {nodeId.slice(0, 12)}...
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {preview.affectedNodes.new.length > 0 && (
                    <div className="p-3 bg-gray-800/50 border border-gray-700 rounded-lg">
                      <div className="flex items-center gap-2 text-purple-400 text-sm font-medium mb-2">
                        <Play size={14} />
                        New nodes to execute: {preview.affectedNodes.new.length}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {preview.affectedNodes.new.map((nodeId) => (
                          <span
                            key={nodeId}
                            className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded"
                          >
                            {nodeId.slice(0, 12)}...
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Input Options */}
              {preview.valid && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-300">Input</h3>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="inputOption"
                        checked={useOriginalInput}
                        onChange={() => setUseOriginalInput(true)}
                        className="text-blue-500 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-300">Use original input</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="inputOption"
                        checked={!useOriginalInput}
                        onChange={() => setUseOriginalInput(false)}
                        className="text-blue-500 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-300">Provide new input</span>
                    </label>
                  </div>

                  {!useOriginalInput && (
                    <textarea
                      value={customInput}
                      onChange={(e) => setCustomInput(e.target.value)}
                      rows={3}
                      placeholder="Enter new input..."
                      className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="p-3 bg-red-950/50 border border-red-500/30 rounded-lg">
              <div className="flex items-center gap-2 text-red-400">
                <AlertTriangle size={16} />
                Failed to load replay preview
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-700">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || !preview?.valid}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RotateCcw size={16} />
            Replay
          </button>
        </div>
      </div>
    </div>
  );
}

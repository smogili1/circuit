import { AlertTriangle, X, Link2Off, CircleOff, MousePointerClick, Copy } from 'lucide-react';

export interface ValidationError {
  code: string;
  message: string;
  nodeId?: string;
}

interface ValidationErrorModalProps {
  errors: ValidationError[];
  onClose: () => void;
  onHighlightNode?: (nodeId: string) => void;
}

const errorIcons: Record<string, React.ElementType> = {
  INPUT_NOT_CONNECTED: Link2Off,
  OUTPUT_NOT_CONNECTED: Link2Off,
  OUTPUT_NOT_REACHABLE: Link2Off,
  ORPHANED_NODE: CircleOff,
  DUPLICATE_NAME: Copy,
};

export function ValidationErrorModal({
  errors,
  onClose,
  onHighlightNode,
}: ValidationErrorModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-red-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-white" size={24} />
            <div>
              <h2 className="text-lg font-semibold text-white">
                Workflow Validation Failed
              </h2>
              <p className="text-red-200 text-sm">
                Fix the following issues before running
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1"
          >
            <X size={20} />
          </button>
        </div>

        {/* Error List */}
        <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
          {errors.map((error, index) => {
            const Icon = errorIcons[error.code] || AlertTriangle;
            return (
              <div
                key={index}
                className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20
                  rounded-lg border border-red-200 dark:border-red-800"
              >
                <Icon
                  className="text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0"
                  size={18}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-gray-800 dark:text-gray-200 text-sm">
                    {error.message}
                  </p>
                  {error.nodeId && onHighlightNode && (
                    <button
                      onClick={() => {
                        onHighlightNode(error.nodeId!);
                        onClose();
                      }}
                      className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400
                        hover:underline mt-1"
                    >
                      <MousePointerClick size={12} />
                      Show node on canvas
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-white
              bg-blue-600 hover:bg-blue-700 rounded-lg"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

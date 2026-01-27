import { AlertTriangle, XCircle, Info } from 'lucide-react';
import { ReplayError, ReplayWarning } from '../../types/workflow';

interface ReplayValidationBannerProps {
  errors: ReplayError[];
  warnings: ReplayWarning[];
}

export function ReplayValidationBanner({ errors, warnings }: ReplayValidationBannerProps) {
  if (errors.length === 0 && warnings.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {/* Blocking Errors */}
      {errors.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <XCircle className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" size={20} />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-red-800 dark:text-red-300 mb-2">
                Replay Blocked
              </h3>
              <ul className="space-y-1 text-sm text-red-700 dark:text-red-400">
                {errors.map((error, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="select-none">•</span>
                    <span>
                      {error.message}
                      {error.nodeId && (
                        <span className="ml-1 text-xs text-red-600 dark:text-red-500">
                          (Node: {error.nodeId})
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" size={20} />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-yellow-800 dark:text-yellow-300 mb-2">
                Warnings
              </h3>
              <ul className="space-y-1 text-sm text-yellow-700 dark:text-yellow-400">
                {warnings.map((warning, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="select-none">•</span>
                    <span>
                      {warning.message}
                      {warning.nodeId && (
                        <span className="ml-1 text-xs text-yellow-600 dark:text-yellow-500">
                          (Node: {warning.nodeId})
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex items-start gap-2 text-xs text-yellow-600 dark:text-yellow-500">
                <Info size={14} className="flex-shrink-0 mt-0.5" />
                <span>You can proceed with replay, but results may differ from the original execution.</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

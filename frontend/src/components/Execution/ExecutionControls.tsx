import { Play, Square, RefreshCw } from 'lucide-react';

interface ExecutionControlsProps {
  input: string;
  onInputChange: (value: string) => void;
  isRunning: boolean;
  disabled: boolean;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
}

export function ExecutionControls({
  input,
  onInputChange,
  isRunning,
  disabled,
  onStart,
  onStop,
  onReset,
}: ExecutionControlsProps) {
  return (
    <div className="p-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Input Prompt
      </label>
      <textarea
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        rows={3}
        placeholder="Enter your task description..."
        disabled={isRunning}
        className="w-full px-3 py-2 text-sm border rounded-md resize-none
          dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100
          disabled:opacity-50 disabled:cursor-not-allowed
          focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <div className="flex gap-2 mt-3">
        {!isRunning ? (
          <button
            onClick={onStart}
            disabled={disabled || !input.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white
              bg-blue-600 hover:bg-blue-700 rounded-md
              disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Play size={16} />
            Run Workflow
          </button>
        ) : (
          <button
            onClick={onStop}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white
              bg-red-600 hover:bg-red-700 rounded-md transition-colors"
          >
            <Square size={16} />
            Stop
          </button>
        )}
        <button
          onClick={onReset}
          disabled={isRunning}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium
            text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800
            hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md
            disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw size={16} />
          Reset
        </button>
      </div>
    </div>
  );
}

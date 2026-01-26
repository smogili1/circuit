import { useState } from 'react';
import { ChevronDown, ChevronRight, Wrench, CheckCircle, AlertCircle, Loader2, ListTodo, Circle, CheckCircle2, Play } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { AgentEvent, AgentTodoItem } from '../../types/workflow';

// Grouped event type for tool calls with their results
export interface GroupedEvent {
  event: AgentEvent;
  result?: AgentEvent;  // tool-result paired with tool-use
}

interface EventItemProps {
  event: AgentEvent;
  result?: AgentEvent;  // Optional paired result for tool-use events
  index?: number;
}

// Helper to format JSON input for preview
function formatInputPreview(input: Record<string, unknown>): string {
  const keys = Object.keys(input);
  if (keys.length === 0) return '';

  // Show first key-value pair as preview
  const firstKey = keys[0];
  const firstValue = input[firstKey];
  let preview = '';

  if (typeof firstValue === 'string') {
    preview = firstValue.length > 50 ? firstValue.slice(0, 50) + '...' : firstValue;
  } else {
    preview = JSON.stringify(firstValue).slice(0, 50);
    if (JSON.stringify(firstValue).length > 50) preview += '...';
  }

  return `${firstKey}: ${preview}`;
}

// Helper to get a clean tool name from result name (which is tool_use_id)
function getCleanResultLabel(name: string): string {
  // If it looks like a tool_use_id (starts with "toolu_"), just show "Result"
  if (name.startsWith('toolu_')) {
    return 'Result';
  }
  return `Result: ${name}`;
}

function formatEventValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || value === undefined) {
    return '';
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function EventItem({ event, result }: EventItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isResultExpanded, setIsResultExpanded] = useState(false);

  switch (event.type) {
    case 'text-delta':
      const textContent = formatEventValue(event.content);
      return (
        <span className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
          {textContent}
        </span>
      );

    case 'tool-use':
      const inputPreview = formatInputPreview(event.input);
      const hasResult = result && result.type === 'tool-result';
      const toolResult = hasResult ? result as { type: 'tool-result'; name: string; result: string } : null;
      const toolResultText = toolResult ? formatEventValue(toolResult.result) : '';
      const resultPreviewTool = toolResultText.length > 150
        ? toolResultText.slice(0, 150) + '...'
        : toolResultText;

      return (
        <div className="my-3 rounded-lg border border-blue-300 dark:border-blue-500/40 bg-blue-50 dark:bg-blue-950/40 overflow-hidden">
          {/* Tool Call Header */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
          >
            {isExpanded ? (
              <ChevronDown size={14} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
            ) : (
              <ChevronRight size={14} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
            )}
            <Wrench size={14} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <span className="font-semibold text-blue-700 dark:text-blue-300 text-sm">
              {event.name}
            </span>
            {!isExpanded && inputPreview && (
              <span className="text-xs text-blue-500/60 dark:text-blue-400/60 truncate ml-2 flex-1">
                {inputPreview}
              </span>
            )}
            {/* Status indicator */}
            {hasResult ? (
              <CheckCircle size={14} className="text-green-600 dark:text-green-400 flex-shrink-0 ml-auto" />
            ) : (
              <Loader2 size={14} className="text-blue-600 dark:text-blue-400 flex-shrink-0 ml-auto animate-spin" />
            )}
          </button>

          {/* Expanded Input */}
          {isExpanded && (
            <div className="px-3 pb-3 border-t border-blue-200 dark:border-blue-500/20 bg-blue-100/50 dark:bg-blue-950/30">
              <pre className="mt-2 text-xs text-blue-800 dark:text-blue-200 overflow-x-auto whitespace-pre-wrap font-mono p-3 rounded bg-white/50 dark:bg-black/30 max-h-64 overflow-y-auto">
                {JSON.stringify(event.input, null, 2)}
              </pre>
            </div>
          )}

          {/* Result Section - shown inline */}
          {toolResult && (
            <div className="border-t border-green-200 dark:border-green-500/30 bg-green-50 dark:bg-green-950/30">
              <button
                onClick={() => setIsResultExpanded(!isResultExpanded)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-green-100 dark:hover:bg-green-900/20 transition-colors"
              >
                {isResultExpanded ? (
                  <ChevronDown size={12} className="text-green-600 dark:text-green-400 flex-shrink-0" />
                ) : (
                  <ChevronRight size={12} className="text-green-600 dark:text-green-400 flex-shrink-0" />
                )}
                <CheckCircle size={12} className="text-green-600 dark:text-green-400 flex-shrink-0" />
                <span className="font-medium text-green-700 dark:text-green-300 text-xs">Result</span>
              </button>
              <div className="px-3 pb-3">
                {isResultExpanded ? (
                  <pre className="text-xs text-green-800 dark:text-green-200 overflow-x-auto whitespace-pre-wrap font-mono p-3 rounded bg-white/50 dark:bg-black/30 max-h-96 overflow-y-auto">
                    {toolResultText}
                  </pre>
                ) : (
                  <p className="text-xs text-green-700/80 dark:text-green-300/80 whitespace-pre-wrap line-clamp-3">
                    {resultPreviewTool}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      );

    case 'tool-result':
      const standaloneResultText = formatEventValue(event.result);
      // Standalone tool-result (when not paired with tool-use)
      const standaloneResultPreview = standaloneResultText.length > 150
        ? standaloneResultText.slice(0, 150) + '...'
        : standaloneResultText;
      const cleanLabel = getCleanResultLabel(event.name);

      return (
        <div className="my-3 rounded-lg border border-green-300 dark:border-green-500/40 bg-green-50 dark:bg-green-950/40 overflow-hidden">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
          >
            {isExpanded ? (
              <ChevronDown size={14} className="text-green-600 dark:text-green-400 flex-shrink-0" />
            ) : (
              <ChevronRight size={14} className="text-green-600 dark:text-green-400 flex-shrink-0" />
            )}
            <CheckCircle size={14} className="text-green-600 dark:text-green-400 flex-shrink-0" />
            <span className="font-semibold text-green-700 dark:text-green-300 text-sm">
              {cleanLabel}
            </span>
          </button>
          <div className="px-3 pb-3 border-t border-green-200 dark:border-green-500/20 bg-green-100/50 dark:bg-green-950/30">
            {isExpanded ? (
              <pre className="mt-2 text-xs text-green-800 dark:text-green-200 overflow-x-auto whitespace-pre-wrap font-mono p-3 rounded bg-white/50 dark:bg-black/30 max-h-96 overflow-y-auto">
                {standaloneResultText}
              </pre>
            ) : (
              <p className="mt-2 text-xs text-green-700/80 dark:text-green-300/80 whitespace-pre-wrap line-clamp-3">
                {standaloneResultPreview}
              </p>
            )}
          </div>
        </div>
      );

    case 'thinking':
      const thinkingText = formatEventValue(event.content);
      return (
        <span className="text-gray-500 dark:text-gray-400 italic prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown>{thinkingText}</ReactMarkdown>
        </span>
      );

    case 'todo-list': {
      const items = event.items as AgentTodoItem[];
      const completedCount = items.filter((t) => t.completed).length;
      const totalCount = items.length;
      const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

      return (
        <div className="my-3 rounded-lg border border-violet-300 dark:border-violet-500/40 bg-violet-50 dark:bg-violet-950/40 overflow-hidden">
          {/* Header with progress */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-violet-200 dark:border-violet-500/20">
            <ListTodo size={14} className="text-violet-600 dark:text-violet-400 flex-shrink-0" />
            <span className="font-semibold text-violet-700 dark:text-violet-300 text-sm">Agent Tasks</span>
            <span className="text-xs text-violet-500 dark:text-violet-400/70 ml-auto">
              {completedCount}/{totalCount}
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-1 bg-violet-100 dark:bg-violet-950">
            <div
              className="h-full bg-violet-500 transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Task list */}
          <div className="px-3 py-2 space-y-1.5">
            {items.map((item, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-2 text-sm ${
                  item.completed ? 'text-violet-500/60 dark:text-violet-400/60' : 'text-violet-800 dark:text-violet-200'
                }`}
              >
                {item.completed ? (
                  <CheckCircle2 size={14} className="text-violet-600 dark:text-violet-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <Circle size={14} className="text-violet-400 dark:text-violet-500/50 flex-shrink-0 mt-0.5" />
                )}
                <span className={item.completed ? 'line-through' : ''}>
                  {item.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'complete':
      const completeText = formatEventValue(event.result);
      const completePreview = completeText.length > 200
        ? completeText.slice(0, 200) + '...'
        : completeText;
      return (
        <div className="my-3 p-4 rounded-lg border border-green-300 dark:border-green-500/40 bg-green-50 dark:bg-green-950/40">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-300 mb-2">
            <CheckCircle size={16} />
            <span className="font-semibold">Completed</span>
          </div>
          <p className="text-sm text-green-800/90 dark:text-green-200/90 whitespace-pre-wrap leading-relaxed">
            {completePreview}
          </p>
        </div>
      );

    case 'error':
      return (
        <div className="my-3 p-4 rounded-lg border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-950/40">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-300 mb-2">
            <AlertCircle size={16} />
            <span className="font-semibold">Error</span>
          </div>
          <p className="text-sm text-red-800 dark:text-red-200 whitespace-pre-wrap">
            {event.message}
          </p>
        </div>
      );

    case 'run-start':
      return (
        <div className="my-4 flex items-center gap-3">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-cyan-400/50 dark:via-cyan-500/50 to-transparent" />
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-100 dark:bg-cyan-950/60 border border-cyan-300 dark:border-cyan-500/40">
            <Play size={12} className="text-cyan-600 dark:text-cyan-400" />
            <span className="text-xs font-medium text-cyan-700 dark:text-cyan-300">
              {event.nodeName} (Run #{event.runCount})
            </span>
          </div>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-cyan-400/50 dark:via-cyan-500/50 to-transparent" />
        </div>
      );

    default:
      return null;
  }
}

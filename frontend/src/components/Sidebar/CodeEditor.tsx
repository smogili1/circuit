import { useState, useRef, useMemo, useCallback } from 'react';
import { useWorkflowStore } from '../../stores/workflowStore';
import { findUpstreamNodes, getNodeOutputFields } from '../../config/nodeSchemaLoader';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  nodeId?: string;
}

interface Suggestion {
  label: string;
  insertText: string;
  detail?: string;
}

function getFallbackFields(nodeType: string): string[] {
  switch (nodeType) {
    case 'claude-agent':
    case 'codex-agent':
      return ['result', 'transcript', 'structuredOutput'];
    case 'input':
      return ['result', 'prompt'];
    case 'condition':
      return ['result', 'matched'];
    case 'merge':
      return ['result'];
    case 'javascript':
      return ['result'];
    default:
      return ['result'];
  }
}

function uniq(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function CodeEditor({
  value,
  onChange,
  placeholder,
  rows = 10,
  nodeId,
}: CodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [triggerPosition, setTriggerPosition] = useState<{ start: number; end: number } | null>(null);

  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);

  const upstreamNodes = useMemo(() => {
    if (!nodeId) return [];
    const upstreamIds = findUpstreamNodes(nodeId, edges);
    return nodes.filter((node) => upstreamIds.has(node.id));
  }, [edges, nodes, nodeId]);

  const getFieldsForNode = useCallback((nodeName: string): string[] => {
    const node = upstreamNodes.find((n) => n.data.config.name === nodeName);
    if (!node) return [];
    const nodeType = node.data.config.type;
    const schemaFields = Object.keys(getNodeOutputFields(nodeType, node.data.config));
    const fallbackFields = getFallbackFields(nodeType);
    return uniq([...schemaFields, ...fallbackFields]);
  }, [upstreamNodes]);

  const computeSuggestions = useCallback((text: string, cursorPos: number): { suggestions: Suggestion[]; start: number; end: number } | null => {
    // Find the word being typed at cursor
    const beforeCursor = text.slice(0, cursorPos);

    // Match patterns like "inputs." or "inputs.NodeName." or partial "inputs.Node"
    const inputsMatch = beforeCursor.match(/inputs\.(\w*)$/);
    const inputsFieldMatch = beforeCursor.match(/inputs\.(\w+)\.(\w*)$/);

    if (inputsFieldMatch) {
      // User typed "inputs.NodeName." - suggest fields
      const [, nodeName, partial] = inputsFieldMatch;
      const fields = getFieldsForNode(nodeName);
      const filtered = fields.filter((f) => f.toLowerCase().startsWith(partial.toLowerCase()));

      if (filtered.length === 0) return null;

      const start = cursorPos - partial.length;
      return {
        suggestions: filtered.map((field) => ({
          label: field,
          insertText: field,
          detail: `${nodeName}.${field}`,
        })),
        start,
        end: cursorPos,
      };
    }

    if (inputsMatch) {
      // User typed "inputs." - suggest node names
      const [, partial] = inputsMatch;
      const nodeNames = upstreamNodes.map((n) => n.data.config.name);
      const filtered = nodeNames.filter((name) => name.toLowerCase().startsWith(partial.toLowerCase()));

      if (filtered.length === 0) return null;

      const start = cursorPos - partial.length;
      return {
        suggestions: filtered.map((name) => {
          const node = upstreamNodes.find((n) => n.data.config.name === name);
          return {
            label: name,
            insertText: name,
            detail: node ? `(${node.data.config.type})` : undefined,
          };
        }),
        start,
        end: cursorPos,
      };
    }

    return null;
  }, [upstreamNodes, getFieldsForNode]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart;
    onChange(newValue);

    const result = computeSuggestions(newValue, cursorPos);
    if (result) {
      setSuggestions(result.suggestions);
      setTriggerPosition({ start: result.start, end: result.end });
      setSelectedIndex(0);
    } else {
      setSuggestions([]);
      setTriggerPosition(null);
    }
  }, [onChange, computeSuggestions]);

  const applySuggestion = useCallback((suggestion: Suggestion) => {
    if (!triggerPosition || !textareaRef.current) return;

    const before = value.slice(0, triggerPosition.start);
    const after = value.slice(triggerPosition.end);
    const newValue = before + suggestion.insertText + after;
    const newCursorPos = triggerPosition.start + suggestion.insertText.length;

    onChange(newValue);
    setSuggestions([]);
    setTriggerPosition(null);

    // Restore focus and cursor position
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    });
  }, [value, onChange, triggerPosition]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % suggestions.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        break;
      case 'Tab':
      case 'Enter':
        if (suggestions[selectedIndex]) {
          e.preventDefault();
          applySuggestion(suggestions[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setSuggestions([]);
        setTriggerPosition(null);
        break;
    }
  }, [suggestions, selectedIndex, applySuggestion]);

  // Close suggestions on blur (with delay to allow click)
  const handleBlur = useCallback(() => {
    setTimeout(() => {
      setSuggestions([]);
      setTriggerPosition(null);
    }, 150);
  }, []);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={placeholder}
        rows={rows}
        spellCheck={false}
        className="w-full px-3 py-2 text-sm border rounded-md font-mono leading-relaxed dark:bg-gray-900 dark:border-gray-700 resize-y min-h-[180px]"
      />
      {suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-64 max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg">
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.label}
              type="button"
              className={`w-full px-3 py-1.5 text-left text-sm font-mono flex items-center justify-between ${
                index === selectedIndex
                  ? 'bg-blue-500 text-white'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                applySuggestion(suggestion);
              }}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span>{suggestion.label}</span>
              {suggestion.detail && (
                <span className={`text-xs ${index === selectedIndex ? 'text-blue-100' : 'text-gray-400'}`}>
                  {suggestion.detail}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

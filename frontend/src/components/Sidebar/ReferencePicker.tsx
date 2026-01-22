import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Link2, Search } from 'lucide-react';
import { useWorkflowStore } from '../../stores/workflowStore';
import { getAvailableReferences, AvailableReference } from '../../config/nodeSchemaLoader';

interface ReferencePickerProps {
  currentNodeId: string;
  onSelect: (reference: string) => void;
  buttonClassName?: string;
}

/**
 * Reference Picker - allows users to select references from upstream nodes
 * Similar to N8N/Zapier variable pickers
 */
export function ReferencePicker({
  currentNodeId,
  onSelect,
  buttonClassName = '',
}: ReferencePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);

  // Get available references from upstream nodes
  // Use config.type as the canonical node type (n.type can be undefined in some cases)
  const references = getAvailableReferences(
    currentNodeId,
    nodes.map(n => ({
      id: n.id,
      type: n.data.config.type || n.type || '',
      data: { config: { ...n.data.config } as { name: string } & Record<string, unknown> },
    })),
    edges.map(e => ({ source: e.source, target: e.target }))
  );

  // Filter references based on search
  const filteredReferences = references.filter(ref =>
    ref.nodeName.toLowerCase().includes(search.toLowerCase()) ||
    ref.field.toLowerCase().includes(search.toLowerCase())
  );

  // Group references by node
  const groupedReferences = filteredReferences.reduce((acc, ref) => {
    if (!acc[ref.nodeName]) {
      acc[ref.nodeName] = [];
    }
    acc[ref.nodeName].push(ref);
    return acc;
  }, {} as Record<string, AvailableReference[]>);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (reference: string) => {
    onSelect(reference);
    setIsOpen(false);
    setSearch('');
  };

  if (references.length === 0) {
    return null; // No upstream nodes to reference
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:text-blue-700
          hover:bg-blue-50 rounded transition-colors ${buttonClassName}`}
        title="Insert reference from upstream node"
      >
        <Link2 size={12} />
        <span>Add Reference</span>
        <ChevronDown size={12} className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-white dark:bg-gray-800
          rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-gray-200 dark:border-gray-700">
            <div className="relative">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search nodes and fields..."
                className="w-full pl-7 pr-2 py-1.5 text-sm bg-gray-50 dark:bg-gray-900
                  border border-gray-200 dark:border-gray-600 rounded focus:outline-none
                  focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
          </div>

          {/* Reference List */}
          <div className="max-h-64 overflow-y-auto">
            {Object.keys(groupedReferences).length === 0 ? (
              <div className="p-4 text-sm text-gray-500 text-center">
                No matching references found
              </div>
            ) : (
              Object.entries(groupedReferences).map(([nodeName, refs]) => (
                <div key={nodeName}>
                  {/* Node Header */}
                  <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-900 text-xs font-medium
                    text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    {nodeName}
                  </div>
                  {/* Fields */}
                  {refs.map((ref) => (
                    <button
                      key={ref.reference}
                      onClick={() => handleSelect(ref.reference)}
                      className="w-full px-3 py-2 text-left hover:bg-blue-50 dark:hover:bg-blue-900/20
                        border-b border-gray-100 dark:border-gray-700 last:border-b-0 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                          {ref.field}
                        </span>
                        <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700
                          text-gray-500 dark:text-gray-400 rounded">
                          {ref.fieldDef.type}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {ref.fieldDef.description}
                      </div>
                      <code className="text-[10px] text-blue-500 mt-1 block">
                        {ref.reference}
                      </code>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border-t border-gray-200
            dark:border-gray-700 text-[10px] text-gray-400">
            Click to insert • References resolve at runtime
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Textarea with reference picker support
 */
interface ReferenceTextareaProps {
  value: string;
  onChange: (value: string) => void;
  currentNodeId: string;
  placeholder?: string;
  rows?: number;
  className?: string;
}

export function ReferenceTextarea({
  value,
  onChange,
  currentNodeId,
  placeholder,
  rows = 3,
  className = '',
}: ReferenceTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleReferenceSelect = (reference: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      onChange(value + reference);
      return;
    }

    // Insert at cursor position
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newValue = value.substring(0, start) + reference + value.substring(end);
    onChange(newValue);

    // Move cursor after inserted reference
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + reference.length, start + reference.length);
    }, 0);
  };

  return (
    <div className="space-y-1">
      <div className="flex justify-end">
        <ReferencePicker
          currentNodeId={currentNodeId}
          onSelect={handleReferenceSelect}
        />
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={`w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border
          border-gray-300 dark:border-gray-600 rounded-md focus:outline-none
          focus:ring-2 focus:ring-blue-500 font-mono ${className}`}
      />
      {/* Highlight references in the value */}
      {value.includes('{{') && (
        <div className="text-[10px] text-blue-500">
          Contains references that will be resolved at runtime
        </div>
      )}
    </div>
  );
}

/**
 * Input with reference picker support
 */
interface ReferenceInputProps {
  value: string;
  onChange: (value: string) => void;
  currentNodeId: string;
  placeholder?: string;
  className?: string;
}

export function ReferenceInput({
  value,
  onChange,
  currentNodeId,
  placeholder,
  className = '',
}: ReferenceInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleReferenceSelect = (reference: string) => {
    const input = inputRef.current;
    if (!input) {
      onChange(value + reference);
      return;
    }

    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const newValue = value.substring(0, start) + reference + value.substring(end);
    onChange(newValue);

    setTimeout(() => {
      input.focus();
      input.setSelectionRange(start + reference.length, start + reference.length);
    }, 0);
  };

  return (
    <div className="flex items-center gap-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-900 border
          border-gray-300 dark:border-gray-600 rounded-md focus:outline-none
          focus:ring-2 focus:ring-blue-500 ${className}`}
      />
      <ReferencePicker
        currentNodeId={currentNodeId}
        onSelect={handleReferenceSelect}
        buttonClassName="shrink-0"
      />
    </div>
  );
}

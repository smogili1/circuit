import { useState } from 'react';
import { ChevronDown, ChevronRight, FileText, Code, List, Braces, Type } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { CodeBlock } from './CodeBlock';

interface DataRendererProps {
  data: unknown;
  label?: string;
  defaultExpanded?: boolean;
  maxPreviewLength?: number;
}

type DataType = 'markdown' | 'code' | 'array' | 'object' | 'primitive' | 'empty';

interface DetectedData {
  type: DataType;
  language?: string;
  content: unknown;
}

// Detect if a string looks like markdown content
function isMarkdownContent(str: string): boolean {
  const markdownPatterns = [
    /^#{1,6}\s+/m,           // Headers
    /\*\*[^*]+\*\*/,         // Bold
    /\*[^*]+\*/,             // Italic
    /\[.+\]\(.+\)/,          // Links
    /^[-*+]\s+/m,            // Unordered lists
    /^\d+\.\s+/m,            // Ordered lists
    /^>\s+/m,                // Blockquotes
    /```[\s\S]*```/,         // Code blocks
    /`[^`]+`/,               // Inline code
  ];

  let matchCount = 0;
  for (const pattern of markdownPatterns) {
    if (pattern.test(str)) matchCount++;
    if (matchCount >= 2) return true;
  }

  // Also consider it markdown if it has multiple paragraphs with reasonable length
  const paragraphs = str.split(/\n\n+/).filter(p => p.trim().length > 20);
  if (paragraphs.length >= 2 && matchCount >= 1) return true;

  return false;
}

// Detect if a string looks like code
function isCodeContent(str: string): { isCode: boolean; language?: string } {
  const trimmed = str.trim();

  // JSON detection
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed);
      return { isCode: true, language: 'json' };
    } catch {
      // Not valid JSON
    }
  }

  // Check for code-like patterns
  const codePatterns = [
    { pattern: /^(const|let|var|function|class|import|export)\s/m, language: 'javascript' },
    { pattern: /^(def|class|import|from|async def)\s/m, language: 'python' },
    { pattern: /^<[a-zA-Z][\s\S]*<\/[a-zA-Z]/m, language: 'html' },
    { pattern: /^(SELECT|INSERT|UPDATE|DELETE|CREATE)\s/im, language: 'sql' },
    { pattern: /^(npm|yarn|git|cd|ls|mkdir)\s/m, language: 'bash' },
    { pattern: /^\$\s/m, language: 'bash' },
  ];

  for (const { pattern, language } of codePatterns) {
    if (pattern.test(trimmed)) {
      return { isCode: true, language };
    }
  }

  // Check for high density of code-like characters
  const codeChars = (trimmed.match(/[{}[\]();=<>]/g) || []).length;
  const ratio = codeChars / trimmed.length;
  if (ratio > 0.05 && trimmed.includes('\n')) {
    return { isCode: true, language: 'text' };
  }

  return { isCode: false };
}

// Detect the type of data and how to render it
function detectDataType(data: unknown): DetectedData {
  if (data === null || data === undefined || data === '') {
    return { type: 'empty', content: data };
  }

  if (Array.isArray(data)) {
    return { type: 'array', content: data };
  }

  if (typeof data === 'object') {
    return { type: 'object', content: data };
  }

  if (typeof data === 'string') {
    const trimmed = data.trim();

    // Check for code first (including JSON)
    const codeCheck = isCodeContent(trimmed);
    if (codeCheck.isCode) {
      return { type: 'code', language: codeCheck.language, content: data };
    }

    // Check for markdown
    if (isMarkdownContent(trimmed)) {
      return { type: 'markdown', content: data };
    }

    // Plain text
    return { type: 'primitive', content: data };
  }

  // Numbers, booleans
  return { type: 'primitive', content: data };
}

// Get a preview string for collapsed content
function getPreview(data: unknown, maxLength: number = 100): string {
  if (data === null) return 'null';
  if (data === undefined) return 'undefined';
  if (data === '') return '(empty)';

  if (typeof data === 'string') {
    const oneLine = data.replace(/\n/g, ' ').trim();
    return oneLine.length > maxLength ? oneLine.slice(0, maxLength) + '...' : oneLine;
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return String(data);
  }

  if (Array.isArray(data)) {
    return `Array (${data.length} items)`;
  }

  if (typeof data === 'object') {
    const keys = Object.keys(data);
    return `Object (${keys.length} ${keys.length === 1 ? 'key' : 'keys'})`;
  }

  return String(data);
}

// Get icon for data type
function getTypeIcon(type: DataType) {
  switch (type) {
    case 'markdown':
      return <FileText size={14} className="text-blue-400" />;
    case 'code':
      return <Code size={14} className="text-green-400" />;
    case 'array':
      return <List size={14} className="text-purple-400" />;
    case 'object':
      return <Braces size={14} className="text-orange-400" />;
    default:
      return <Type size={14} className="text-gray-400" />;
  }
}

// Determine if content should be collapsible
function shouldBeCollapsible(data: unknown): boolean {
  if (typeof data === 'string') {
    return data.length > 200 || data.includes('\n');
  }
  if (Array.isArray(data)) {
    return data.length > 0;
  }
  if (typeof data === 'object' && data !== null) {
    return Object.keys(data).length > 0;
  }
  return false;
}

export function DataRenderer({
  data,
  label,
  defaultExpanded = false,
  maxPreviewLength = 100,
}: DataRendererProps) {
  const detected = detectDataType(data);
  const isCollapsible = shouldBeCollapsible(data);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // For empty content
  if (detected.type === 'empty') {
    return (
      <div className="text-gray-500 italic text-sm">
        {data === null ? 'null' : data === undefined ? 'undefined' : '(empty)'}
      </div>
    );
  }

  // For simple primitives that don't need collapsing
  if (detected.type === 'primitive' && !isCollapsible) {
    return (
      <div className="text-sm text-gray-800 dark:text-gray-200">
        {String(data)}
      </div>
    );
  }

  const preview = getPreview(data, maxPreviewLength);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
      {/* Header - always visible */}
      {isCollapsible && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left
            bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600
            transition-colors"
        >
          {isExpanded ? (
            <ChevronDown size={14} className="text-gray-500 flex-shrink-0" />
          ) : (
            <ChevronRight size={14} className="text-gray-500 flex-shrink-0" />
          )}
          {getTypeIcon(detected.type)}
          {label && (
            <span className="font-medium text-sm text-gray-700 dark:text-gray-300">
              {label}
            </span>
          )}
          {!isExpanded && (
            <span className="text-xs text-gray-500 dark:text-gray-400 truncate ml-2 flex-1">
              {preview}
            </span>
          )}
        </button>
      )}

      {/* Content - shown when expanded or not collapsible */}
      {(isExpanded || !isCollapsible) && (
        <div className="p-3 bg-white dark:bg-gray-800">
          <RenderContent detected={detected} />
        </div>
      )}
    </div>
  );
}

// Internal component to render content based on detected type
function RenderContent({ detected }: { detected: DetectedData }) {
  switch (detected.type) {
    case 'markdown':
      return (
        <div className="prose prose-sm dark:prose-invert max-w-none
          prose-headings:mt-3 prose-headings:mb-2
          prose-p:my-2 prose-li:my-0.5
          prose-code:bg-gray-100 dark:prose-code:bg-gray-700 prose-code:px-1 prose-code:rounded
          prose-pre:bg-gray-100 dark:prose-pre:bg-gray-900 prose-pre:p-3">
          <ReactMarkdown>{String(detected.content)}</ReactMarkdown>
        </div>
      );

    case 'code':
      return (
        <CodeBlock
          code={String(detected.content)}
          language={detected.language}
          maxHeight="20rem"
        />
      );

    case 'array':
      return <ArrayRenderer items={detected.content as unknown[]} />;

    case 'object':
      return <ObjectRenderer obj={detected.content as Record<string, unknown>} />;

    case 'primitive':
    default:
      return (
        <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono">
          {String(detected.content)}
        </pre>
      );
  }
}

// Render an array with smart handling of items
function ArrayRenderer({ items }: { items: unknown[] }) {
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  if (items.length === 0) {
    return <div className="text-gray-500 italic text-sm">Empty array</div>;
  }

  // Check if all items are simple primitives
  const allPrimitives = items.every(
    (item) => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
  );

  if (allPrimitives && items.length <= 10) {
    // Render as a simple list
    return (
      <ul className="space-y-1">
        {items.map((item, index) => (
          <li
            key={index}
            className="flex items-start gap-2 text-sm text-gray-800 dark:text-gray-200"
          >
            <span className="text-gray-400 font-mono text-xs mt-0.5">{index}:</span>
            <span>{String(item)}</span>
          </li>
        ))}
      </ul>
    );
  }

  // Render as collapsible items for complex arrays
  return (
    <div className="space-y-2">
      {items.map((item, index) => {
        const isExpanded = expandedItems.has(index);
        const detected = detectDataType(item);
        const isComplex = detected.type === 'object' || detected.type === 'array';

        if (!isComplex) {
          return (
            <div
              key={index}
              className="flex items-start gap-2 text-sm text-gray-800 dark:text-gray-200 py-1 border-b border-gray-100 dark:border-gray-700 last:border-0"
            >
              <span className="text-gray-400 font-mono text-xs mt-0.5 min-w-[2rem]">
                [{index}]
              </span>
              <RenderContent detected={detected} />
            </div>
          );
        }

        return (
          <div
            key={index}
            className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden"
          >
            <button
              onClick={() => {
                const newSet = new Set(expandedItems);
                if (isExpanded) {
                  newSet.delete(index);
                } else {
                  newSet.add(index);
                }
                setExpandedItems(newSet);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left
                bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600"
            >
              {isExpanded ? (
                <ChevronDown size={12} className="text-gray-500" />
              ) : (
                <ChevronRight size={12} className="text-gray-500" />
              )}
              <span className="text-gray-400 font-mono text-xs">[{index}]</span>
              {getTypeIcon(detected.type)}
              {!isExpanded && (
                <span className="text-xs text-gray-500 truncate">
                  {getPreview(item, 60)}
                </span>
              )}
            </button>
            {isExpanded && (
              <div className="p-3 bg-white dark:bg-gray-800">
                <RenderContent detected={detected} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Render an object with smart handling of values
function ObjectRenderer({ obj }: { obj: Record<string, unknown> }) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const entries = Object.entries(obj);

  if (entries.length === 0) {
    return <div className="text-gray-500 italic text-sm">Empty object</div>;
  }

  return (
    <div className="space-y-2">
      {entries.map(([key, value]) => {
        const detected = detectDataType(value);
        const isComplex = shouldBeCollapsible(value);
        const isExpanded = expandedKeys.has(key);

        if (!isComplex) {
          return (
            <div
              key={key}
              className="flex items-start gap-2 py-1 border-b border-gray-100 dark:border-gray-700 last:border-0"
            >
              <span className="font-medium text-sm text-purple-600 dark:text-purple-400 min-w-[6rem] flex-shrink-0">
                {key}:
              </span>
              <span className="text-sm text-gray-800 dark:text-gray-200">
                {String(value)}
              </span>
            </div>
          );
        }

        return (
          <div
            key={key}
            className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden"
          >
            <button
              onClick={() => {
                const newSet = new Set(expandedKeys);
                if (isExpanded) {
                  newSet.delete(key);
                } else {
                  newSet.add(key);
                }
                setExpandedKeys(newSet);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left
                bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600"
            >
              {isExpanded ? (
                <ChevronDown size={12} className="text-gray-500" />
              ) : (
                <ChevronRight size={12} className="text-gray-500" />
              )}
              <span className="font-medium text-sm text-purple-600 dark:text-purple-400">
                {key}
              </span>
              {getTypeIcon(detected.type)}
              {!isExpanded && (
                <span className="text-xs text-gray-500 truncate ml-2">
                  {getPreview(value, 60)}
                </span>
              )}
            </button>
            {isExpanded && (
              <div className="p-3 bg-white dark:bg-gray-800">
                <RenderContent detected={detected} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

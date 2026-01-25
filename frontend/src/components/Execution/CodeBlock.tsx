import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  language?: string;
  maxHeight?: string;
}

// Simple language detection based on content patterns
function detectLanguage(code: string): string {
  const trimmed = code.trim();

  // JSON detection
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Not valid JSON, continue detection
    }
  }

  // JavaScript/TypeScript patterns
  if (/^(const|let|var|function|class|import|export)\s/.test(trimmed) ||
      /=>\s*[{(]/.test(trimmed) ||
      /async\s+(function|\()/.test(trimmed)) {
    return 'javascript';
  }

  // Python patterns
  if (/^(def|class|import|from|if __name__|async def)\s/.test(trimmed) ||
      /:\s*$/.test(trimmed.split('\n')[0])) {
    return 'python';
  }

  // HTML/XML patterns
  if (/^<[a-zA-Z]/.test(trimmed) && /<\/[a-zA-Z]/.test(trimmed)) {
    return 'html';
  }

  // Bash/Shell patterns
  if (/^(#!\/bin\/(bash|sh)|npm |yarn |git |cd |ls |mkdir |rm )/.test(trimmed) ||
      /^\$\s/.test(trimmed)) {
    return 'bash';
  }

  // SQL patterns
  if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s/i.test(trimmed)) {
    return 'sql';
  }

  return 'text';
}

// Simple syntax highlighting using regex patterns
function highlightCode(code: string, language: string): JSX.Element[] {
  const lines = code.split('\n');

  return lines.map((line, lineIndex) => {
    let highlighted: (string | JSX.Element)[] = [line];

    if (language === 'json') {
      highlighted = highlightJSON(line, lineIndex);
    } else if (language === 'javascript' || language === 'typescript') {
      highlighted = highlightJS(line, lineIndex);
    } else if (language === 'python') {
      highlighted = highlightPython(line, lineIndex);
    } else if (language === 'bash') {
      highlighted = highlightBash(line, lineIndex);
    }

    return (
      <div key={lineIndex} className="leading-relaxed">
        {highlighted}
      </div>
    );
  });
}

function highlightJSON(line: string, lineIndex: number): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = [];
  let keyIndex = 0;

  // Simple approach: just highlight the line character by character based on context
  let inString = false;
  let isKey = false;
  let buffer = '';

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"' && line[i - 1] !== '\\') {
      if (!inString) {
        // Push any buffered content
        if (buffer) {
          parts.push(buffer);
          buffer = '';
        }
        inString = true;
        isKey = line.substring(i).match(/^"[^"]*"\s*:/) !== null;
      } else {
        buffer += char;
        parts.push(
          <span key={`${lineIndex}-${keyIndex++}`} className={isKey ? 'text-purple-400' : 'text-green-400'}>
            {buffer}
          </span>
        );
        buffer = '';
        inString = false;
        continue;
      }
    }

    if (inString) {
      buffer += char;
    } else {
      // Check for numbers, booleans, null
      const restOfLine = line.substring(i);
      const numberMatch = restOfLine.match(/^-?\d+\.?\d*/);
      const boolMatch = restOfLine.match(/^(true|false|null)/);

      if (numberMatch && (i === 0 || /[\s:,\[]/.test(line[i - 1]))) {
        if (buffer) {
          parts.push(buffer);
          buffer = '';
        }
        parts.push(
          <span key={`${lineIndex}-${keyIndex++}`} className="text-blue-400">
            {numberMatch[0]}
          </span>
        );
        i += numberMatch[0].length - 1;
      } else if (boolMatch) {
        if (buffer) {
          parts.push(buffer);
          buffer = '';
        }
        parts.push(
          <span key={`${lineIndex}-${keyIndex++}`} className="text-orange-400">
            {boolMatch[0]}
          </span>
        );
        i += boolMatch[0].length - 1;
      } else {
        buffer += char;
      }
    }
  }

  if (buffer) {
    parts.push(buffer);
  }

  return parts.length > 0 ? parts : [line];
}

function highlightJS(line: string, lineIndex: number): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = [];
  let keyIndex = 0;

  const keywords = /\b(const|let|var|function|return|if|else|for|while|class|extends|import|export|from|async|await|new|this|try|catch|throw|typeof|instanceof)\b/g;
  const strings = /(["'`])(?:(?!\1)[^\\]|\\.)*?\1/g;
  const comments = /(\/\/.*$|\/\*[\s\S]*?\*\/)/g;
  const numbers = /\b(\d+\.?\d*)\b/g;

  // Simple split and highlight approach
  const matches: { start: number; end: number; text: string; className: string }[] = [];

  // Find all matches
  let match;

  // Comments first (highest priority)
  comments.lastIndex = 0;
  while ((match = comments.exec(line)) !== null) {
    matches.push({ start: match.index, end: match.index + match[0].length, text: match[0], className: 'text-gray-500' });
  }

  // Strings
  strings.lastIndex = 0;
  while ((match = strings.exec(line)) !== null) {
    matches.push({ start: match.index, end: match.index + match[0].length, text: match[0], className: 'text-green-400' });
  }

  // Keywords
  keywords.lastIndex = 0;
  while ((match = keywords.exec(line)) !== null) {
    matches.push({ start: match.index, end: match.index + match[0].length, text: match[0], className: 'text-purple-400' });
  }

  // Numbers
  numbers.lastIndex = 0;
  while ((match = numbers.exec(line)) !== null) {
    matches.push({ start: match.index, end: match.index + match[0].length, text: match[0], className: 'text-blue-400' });
  }

  // Sort by start position and filter overlapping (prefer earlier matches)
  matches.sort((a, b) => a.start - b.start);
  const filteredMatches: typeof matches = [];
  let lastEnd = 0;

  for (const m of matches) {
    if (m.start >= lastEnd) {
      filteredMatches.push(m);
      lastEnd = m.end;
    }
  }

  // Build parts
  let lastIndex = 0;
  for (const m of filteredMatches) {
    if (m.start > lastIndex) {
      parts.push(line.substring(lastIndex, m.start));
    }
    parts.push(
      <span key={`${lineIndex}-${keyIndex++}`} className={m.className}>
        {m.text}
      </span>
    );
    lastIndex = m.end;
  }

  if (lastIndex < line.length) {
    parts.push(line.substring(lastIndex));
  }

  return parts.length > 0 ? parts : [line];
}

function highlightPython(line: string, lineIndex: number): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = [];
  let keyIndex = 0;

  const keywords = /\b(def|class|if|elif|else|for|while|return|import|from|as|try|except|finally|with|lambda|and|or|not|in|is|None|True|False|async|await|raise|pass|break|continue|yield)\b/g;
  const strings = /(["']{3}[\s\S]*?["']{3}|["'](?:(?!\1)[^\\]|\\.)*?["'])/g;
  const comments = /(#.*$)/g;
  const numbers = /\b(\d+\.?\d*)\b/g;
  const decorators = /(@\w+)/g;

  let lastIndex = 0;
  const matches: { start: number; end: number; text: string; className: string }[] = [];

  let match;

  // Comments first
  comments.lastIndex = 0;
  while ((match = comments.exec(line)) !== null) {
    matches.push({ start: match.index, end: match.index + match[0].length, text: match[0], className: 'text-gray-500' });
  }

  // Strings
  strings.lastIndex = 0;
  while ((match = strings.exec(line)) !== null) {
    matches.push({ start: match.index, end: match.index + match[0].length, text: match[0], className: 'text-green-400' });
  }

  // Decorators
  decorators.lastIndex = 0;
  while ((match = decorators.exec(line)) !== null) {
    matches.push({ start: match.index, end: match.index + match[0].length, text: match[0], className: 'text-yellow-400' });
  }

  // Keywords
  keywords.lastIndex = 0;
  while ((match = keywords.exec(line)) !== null) {
    matches.push({ start: match.index, end: match.index + match[0].length, text: match[0], className: 'text-purple-400' });
  }

  // Numbers
  numbers.lastIndex = 0;
  while ((match = numbers.exec(line)) !== null) {
    matches.push({ start: match.index, end: match.index + match[0].length, text: match[0], className: 'text-blue-400' });
  }

  // Sort and filter
  matches.sort((a, b) => a.start - b.start);
  const filteredMatches: typeof matches = [];
  let lastEnd = 0;

  for (const m of matches) {
    if (m.start >= lastEnd) {
      filteredMatches.push(m);
      lastEnd = m.end;
    }
  }

  // Build parts
  lastIndex = 0;
  for (const m of filteredMatches) {
    if (m.start > lastIndex) {
      parts.push(line.substring(lastIndex, m.start));
    }
    parts.push(
      <span key={`${lineIndex}-${keyIndex++}`} className={m.className}>
        {m.text}
      </span>
    );
    lastIndex = m.end;
  }

  if (lastIndex < line.length) {
    parts.push(line.substring(lastIndex));
  }

  return parts.length > 0 ? parts : [line];
}

function highlightBash(line: string, lineIndex: number): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = [];
  let keyIndex = 0;

  const commands = /^(\s*)(\$|#!\/bin\/\w+|\b(?:npm|yarn|git|cd|ls|mkdir|rm|cp|mv|cat|echo|grep|find|chmod|chown|sudo|apt|brew|pip|python|node)\b)/g;
  const flags = /(\s)(--?[\w-]+)/g;
  const strings = /(["'])(?:(?!\1)[^\\]|\\.)*?\1/g;
  const comments = /(#.*$)/g;
  const variables = /(\$\w+|\$\{[^}]+\})/g;

  let lastIndex = 0;
  const matches: { start: number; end: number; text: string; className: string }[] = [];

  let match;

  // Comments
  comments.lastIndex = 0;
  while ((match = comments.exec(line)) !== null) {
    if (!line.substring(0, match.index).includes('#!')) { // Don't match shebang
      matches.push({ start: match.index, end: match.index + match[0].length, text: match[0], className: 'text-gray-500' });
    }
  }

  // Strings
  strings.lastIndex = 0;
  while ((match = strings.exec(line)) !== null) {
    matches.push({ start: match.index, end: match.index + match[0].length, text: match[0], className: 'text-green-400' });
  }

  // Variables
  variables.lastIndex = 0;
  while ((match = variables.exec(line)) !== null) {
    matches.push({ start: match.index, end: match.index + match[0].length, text: match[0], className: 'text-cyan-400' });
  }

  // Commands
  commands.lastIndex = 0;
  while ((match = commands.exec(line)) !== null) {
    const cmdStart = match.index + (match[1] || '').length;
    matches.push({ start: cmdStart, end: cmdStart + match[2].length, text: match[2], className: 'text-purple-400' });
  }

  // Flags
  flags.lastIndex = 0;
  while ((match = flags.exec(line)) !== null) {
    const flagStart = match.index + match[1].length;
    matches.push({ start: flagStart, end: flagStart + match[2].length, text: match[2], className: 'text-yellow-400' });
  }

  // Sort and filter
  matches.sort((a, b) => a.start - b.start);
  const filteredMatches: typeof matches = [];
  let lastEnd = 0;

  for (const m of matches) {
    if (m.start >= lastEnd) {
      filteredMatches.push(m);
      lastEnd = m.end;
    }
  }

  // Build parts
  lastIndex = 0;
  for (const m of filteredMatches) {
    if (m.start > lastIndex) {
      parts.push(line.substring(lastIndex, m.start));
    }
    parts.push(
      <span key={`${lineIndex}-${keyIndex++}`} className={m.className}>
        {m.text}
      </span>
    );
    lastIndex = m.end;
  }

  if (lastIndex < line.length) {
    parts.push(line.substring(lastIndex));
  }

  return parts.length > 0 ? parts : [line];
}

export function CodeBlock({ code, language, maxHeight = '16rem' }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const detectedLanguage = language || detectLanguage(code);
  const highlighted = highlightCode(code, detectedLanguage);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="relative group rounded-lg overflow-hidden border border-gray-700 bg-gray-900">
      {/* Language badge and copy button */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800 border-b border-gray-700">
        <span className="text-xs font-medium text-gray-400 uppercase">
          {detectedLanguage}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-gray-200
            hover:bg-gray-700 rounded transition-colors"
          title="Copy to clipboard"
        >
          {copied ? (
            <>
              <Check size={12} className="text-green-400" />
              <span className="text-green-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code content */}
      <pre
        className="overflow-auto p-3 text-sm font-mono text-gray-200"
        style={{ maxHeight }}
      >
        <code>{highlighted}</code>
      </pre>
    </div>
  );
}

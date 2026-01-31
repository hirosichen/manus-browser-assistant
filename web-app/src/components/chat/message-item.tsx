'use client';

import dynamic from 'next/dynamic';
import { UIMessage } from 'ai';
import { cn, formatTime } from '@/lib/utils';
import { ExtractedDataDisplay } from './extracted-data-display';

// Dynamic import for react-markdown to reduce initial bundle size
const ReactMarkdown = dynamic(
  () => import('react-markdown').then((mod) => mod.default),
  {
    loading: () => (
      <span className="animate-pulse text-[var(--muted)]">Loading...</span>
    ),
  }
);

// Import remark-gfm dynamically as well - used as a prop to ReactMarkdown
import remarkGfm from 'remark-gfm';

interface MessageItemProps {
  message: UIMessage;
  isStreaming?: boolean;
}

const toolIcons: Record<string, string> = {
  navigate: '🌐',
  screenshot: '📸',
  click: '👆',
  type: '⌨️',
  scroll: '📜',
  extract: '📄',
  extractData: '📊',
  wait: '⏳',
};

const toolLabels: Record<string, string> = {
  navigate: 'Navigate',
  screenshot: 'Screenshot',
  click: 'Click',
  type: 'Type',
  scroll: 'Scroll',
  extract: 'Extract',
  extractData: 'Structured Data',
  wait: 'Wait',
};

function ToolCallDisplay({ part }: { part: ToolPart }) {
  const icon = toolIcons[part.toolName] || '⚡';
  const label = toolLabels[part.toolName] || part.toolName;
  const isComplete = part.state === 'output-available' || part.output !== undefined;
  const isPending = !isComplete;

  // For extractData, show row count instead of full JSON input
  const getInputDisplay = () => {
    if (!part.input || typeof part.input !== 'object') return null;

    if (part.toolName === 'extractData') {
      const input = part.input as Record<string, unknown>;
      if (Array.isArray(input.data)) {
        const rowCount = input.data.length;
        const source = input.source as string | undefined;
        return `${rowCount} rows${source ? ` from ${source}` : ''}`;
      }
      return null;
    }

    // For other tools, show truncated JSON
    const keys = Object.keys(part.input as object);
    if (keys.length > 0) {
      return JSON.stringify(part.input);
    }
    return null;
  };

  const inputDisplay = getInputDisplay();

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
        'bg-[var(--background)] border border-[var(--card-border)]',
        isPending && 'animate-pulse-glow',
        isComplete && 'border-[var(--success)]/30 bg-[var(--success)]/5'
      )}
    >
      <span className="text-base">{icon}</span>
      <span className="font-medium text-[var(--foreground)]">{label}</span>

      {inputDisplay && (
        <span className="text-[var(--muted)] text-xs font-mono truncate max-w-[200px]">
          {inputDisplay}
        </span>
      )}

      {isPending && (
        <span className="ml-auto flex items-center gap-1 text-[var(--warning)]">
          <span className="w-1.5 h-1.5 bg-[var(--warning)] rounded-full animate-pulse" />
          <span className="text-xs">Running</span>
        </span>
      )}

      {isComplete && (
        <span className="ml-auto flex items-center gap-1 text-[var(--success)]">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-xs">Done</span>
        </span>
      )}
    </div>
  );
}

// Helper to extract text content from message parts
// Optimized: single loop instead of filter+map+join
function getTextContent(message: UIMessage): string {
  if (!message.parts) return '';

  let result = '';
  for (const part of message.parts) {
    if (part.type === 'text' && 'text' in part) {
      result += (part as { type: 'text'; text: string }).text;
    }
  }
  return result;
}

interface ToolPart {
  type: string; // 'tool-extract', 'tool-navigate', etc.
  toolName: string; // Extracted from type
  input: unknown;
  state?: string;
  output?: unknown;
  toolCallId: string;
}

// Helper to get tool parts from message
function getToolParts(message: UIMessage): ToolPart[] {
  if (!message.parts) return [];

  const toolParts = message.parts
    .filter((part) => part.type.startsWith('tool-'))
    .map((part) => {
      const rawPart = part as unknown as {
        type: string;
        toolCallId: string;
        input?: unknown;
        state?: string;
        output?: unknown;
      };

      // Extract tool name from type (e.g., 'tool-extract' -> 'extract')
      const toolName = rawPart.type.replace(/^tool-/, '');

      return {
        type: rawPart.type,
        toolName,
        toolCallId: rawPart.toolCallId,
        input: rawPart.input,
        state: rawPart.state,
        output: rawPart.output,
      } as ToolPart;
    });

  return toolParts;
}

// Helper to extract data from tool output
function getExtractedData(output: unknown, input?: unknown): unknown {
  if (!output) return null;

  // If output is an object with a data property, use that
  if (typeof output === 'object' && output !== null) {
    const obj = output as Record<string, unknown>;
    if ('data' in obj) return obj.data;
    if ('result' in obj) return obj.result;
    if ('content' in obj) return obj.content;
    if ('text' in obj) return obj.text;
    // Return the whole object if no specific data field
    return output;
  }

  // String or primitive output
  return output;
}

// Helper to get data from extractData tool input (the LLM sends data in the input)
function getExtractDataInput(input: unknown): unknown {
  if (!input) return null;

  if (typeof input === 'object' && input !== null) {
    const obj = input as Record<string, unknown>;
    if ('data' in obj && Array.isArray(obj.data)) {
      return obj.data;
    }
  }

  return null;
}

// Helper to get validation info from extractData tool output
interface ValidationInfo {
  isValid: boolean;
  issues: Array<{
    type: string;
    message: string;
    severity: 'error' | 'warning';
  }>;
}

function getValidationInfo(output: unknown): ValidationInfo | undefined {
  if (!output || typeof output !== 'object') return undefined;

  const obj = output as Record<string, unknown>;
  if ('validation' in obj && typeof obj.validation === 'object' && obj.validation !== null) {
    const validation = obj.validation as Record<string, unknown>;
    if ('isValid' in validation && 'issues' in validation) {
      return {
        isValid: validation.isValid as boolean,
        issues: validation.issues as ValidationInfo['issues'],
      };
    }
  }

  return undefined;
}

export function MessageItem({ message, isStreaming }: MessageItemProps) {
  const isUser = message.role === 'user';
  const textContent = getTextContent(message);
  const toolParts = getToolParts(message);
  const hasToolCalls = toolParts.length > 0;

  return (
    <div
      className={cn(
        'flex gap-3 animate-slide-up',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
          isUser
            ? 'bg-gradient-to-br from-[var(--accent)] to-[var(--accent-secondary)]'
            : 'bg-[var(--card)] border border-[var(--card-border)]'
        )}
      >
        {isUser ? (
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        ) : (
          <span className="text-sm" aria-hidden="true">🤖</span>
        )}
      </div>

      {/* Message Content */}
      <div className={cn('flex flex-col gap-2 max-w-[80%]', isUser && 'items-end')}>
        {/* Text content */}
        {textContent && (
          <div
            className={cn(
              'px-4 py-3 rounded-2xl text-sm leading-relaxed',
              isUser
                ? 'bg-gradient-to-r from-[var(--accent)] to-[var(--accent-secondary)] text-white rounded-tr-md'
                : 'bg-[var(--card)] border border-[var(--card-border)] text-[var(--foreground)] rounded-tl-md prose prose-sm prose-invert max-w-none'
            )}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap">{textContent}</p>
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // Custom bold
                  strong: ({ children }) => (
                    <strong className="font-semibold text-[var(--foreground)]">{children}</strong>
                  ),
                  // Custom lists
                  ul: ({ children }) => (
                    <ul className="list-disc list-inside my-2 space-y-1">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal list-inside my-2 space-y-1">{children}</ol>
                  ),
                  // Custom list item
                  li: ({ children }) => (
                    <li className="text-[var(--foreground)]">{children}</li>
                  ),
                  // Custom code
                  code: ({ className, children }) => {
                    const isInline = !className;
                    return isInline ? (
                      <code className="bg-[var(--card-border)] px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>
                    ) : (
                      <code className={cn("block bg-black/30 p-3 rounded-lg overflow-x-auto text-xs font-mono", className)}>
                        {children}
                      </code>
                    );
                  },
                  // Custom pre for code blocks
                  pre: ({ children }) => (
                    <pre className="bg-black/30 p-3 rounded-lg overflow-x-auto my-2">{children}</pre>
                  ),
                  // Custom links
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer"
                       className="text-[var(--accent)] hover:underline">
                      {children}
                    </a>
                  ),
                  // Custom paragraphs
                  p: ({ children }) => (
                    <p className="my-1 first:mt-0 last:mb-0">{children}</p>
                  ),
                  // Custom headings
                  h1: ({ children }) => (
                    <h1 className="text-lg font-bold mt-3 mb-2 first:mt-0">{children}</h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-base font-bold mt-3 mb-2 first:mt-0">{children}</h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-sm font-bold mt-2 mb-1 first:mt-0">{children}</h3>
                  ),
                  // Custom blockquote
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-2 border-[var(--accent)] pl-3 my-2 text-[var(--muted)] italic">
                      {children}
                    </blockquote>
                  ),
                  // Custom table
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-2">
                      <table className="min-w-full border-collapse">{children}</table>
                    </div>
                  ),
                  th: ({ children }) => (
                    <th className="border border-[var(--card-border)] px-2 py-1 bg-[var(--background)] font-semibold text-left">{children}</th>
                  ),
                  td: ({ children }) => (
                    <td className="border border-[var(--card-border)] px-2 py-1">{children}</td>
                  ),
                }}
              >
                {textContent}
              </ReactMarkdown>
            )}
            {isStreaming && !hasToolCalls && (
              <span className="inline-block w-1.5 h-4 bg-current ml-1 animate-typing" />
            )}
          </div>
        )}

        {/* Tool calls */}
        {hasToolCalls && (
          <div className="flex flex-col gap-1.5 w-full">
            {toolParts.map((part) => {
              const isComplete = part.state === 'output-available' || part.output !== undefined;
              const isExtractTool = part.toolName === 'extract';
              const isExtractDataTool = part.toolName === 'extractData';
              const isDataTool = isExtractTool || isExtractDataTool;

              // For extractData tool, the structured data is in the input (sent by LLM)
              // For extract tool, the data is in the output (returned by browser)
              let displayData: unknown = null;
              let validationInfo: ValidationInfo | undefined = undefined;
              if (isDataTool && isComplete) {
                if (isExtractDataTool) {
                  // extractData: LLM sends structured data in input.data
                  displayData = getExtractDataInput(part.input);
                  // Get validation info from output
                  validationInfo = getValidationInfo(part.output);
                } else {
                  // extract: browser returns raw content in output
                  displayData = getExtractedData(part.output);
                }
              }

              return (
                <div key={part.toolCallId}>
                  <ToolCallDisplay part={part} />
                  {isDataTool && isComplete && displayData !== null && (
                    <ExtractedDataDisplay
                      data={displayData}
                      toolName={part.toolName}
                      validation={validationInfo}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Timestamp */}
        <span className="text-[10px] text-[var(--muted)] px-1">
          {formatTime(new Date())}
        </span>
      </div>
    </div>
  );
}

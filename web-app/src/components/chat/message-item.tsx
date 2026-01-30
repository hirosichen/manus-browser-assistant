'use client';

import { UIMessage } from 'ai';
import { cn, formatTime } from '@/lib/utils';

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
  wait: '⏳',
};

const toolLabels: Record<string, string> = {
  navigate: 'Navigate',
  screenshot: 'Screenshot',
  click: 'Click',
  type: 'Type',
  scroll: 'Scroll',
  extract: 'Extract',
  wait: 'Wait',
};

function ToolCallDisplay({ part }: { part: { type: 'tool'; toolName: string; input: unknown; state?: string; output?: unknown } }) {
  const icon = toolIcons[part.toolName] || '⚡';
  const label = toolLabels[part.toolName] || part.toolName;
  const isComplete = part.state === 'output-available' || part.output !== undefined;
  const isPending = !isComplete;

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

      {part.input && typeof part.input === 'object' && Object.keys(part.input as object).length > 0 ? (
        <span className="text-[var(--muted)] text-xs font-mono truncate max-w-[200px]">
          {JSON.stringify(part.input)}
        </span>
      ) : null}

      {isPending && (
        <span className="ml-auto flex items-center gap-1 text-[var(--warning)]">
          <span className="w-1.5 h-1.5 bg-[var(--warning)] rounded-full animate-pulse" />
          <span className="text-xs">Running</span>
        </span>
      )}

      {isComplete && (
        <span className="ml-auto flex items-center gap-1 text-[var(--success)]">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-xs">Done</span>
        </span>
      )}
    </div>
  );
}

// Helper to extract text content from message parts
function getTextContent(message: UIMessage): string {
  if (!message.parts) return '';

  return message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map(part => part.text)
    .join('');
}

interface ToolPart {
  type: 'tool';
  toolName: string;
  input: unknown;
  state?: string;
  output?: unknown;
  toolCallId: string;
}

// Helper to get tool parts from message
function getToolParts(message: UIMessage): ToolPart[] {
  if (!message.parts) return [];

  return message.parts
    .filter((part) => part.type.startsWith('tool-'))
    .map((part) => part as unknown as ToolPart);
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
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        ) : (
          <span className="text-sm">🤖</span>
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
                : 'bg-[var(--card)] border border-[var(--card-border)] text-[var(--foreground)] rounded-tl-md'
            )}
          >
            <p className="whitespace-pre-wrap">{textContent}</p>
            {isStreaming && !hasToolCalls && (
              <span className="inline-block w-1.5 h-4 bg-current ml-1 animate-typing" />
            )}
          </div>
        )}

        {/* Tool calls */}
        {hasToolCalls && (
          <div className="flex flex-col gap-1.5 w-full">
            {toolParts.map((part) => (
              <ToolCallDisplay key={part.toolCallId} part={part} />
            ))}
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

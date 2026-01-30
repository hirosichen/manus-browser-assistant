'use client';

import { useRef, useEffect } from 'react';
import { UIMessage } from 'ai';
import { MessageItem } from './message-item';

interface MessageListProps {
  messages: UIMessage[];
  isLoading?: boolean;
}

export function MessageList({ messages, isLoading }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--accent)]/20 to-[var(--accent-secondary)]/20 flex items-center justify-center mb-4">
          <span className="text-3xl">🤖</span>
        </div>
        <h2 className="text-xl font-semibold gradient-text mb-2">
          Manus Browser Assistant
        </h2>
        <p className="text-[var(--muted)] text-sm max-w-md">
          I can help you navigate, search, and interact with web pages.
          Try asking me to search for something or navigate to a website.
        </p>

        <div className="mt-8 flex flex-wrap gap-2 justify-center max-w-lg">
          {[
            'Search for Nike Air Max prices',
            'Go to amazon.com',
            'Take a screenshot',
            'Find product reviews',
          ].map((suggestion) => (
            <button
              key={suggestion}
              className="px-3 py-1.5 text-xs rounded-full bg-[var(--card)] border border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--accent)]/50 transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
      {messages.map((message, index) => (
        <MessageItem
          key={message.id}
          message={message}
          isStreaming={isLoading && index === messages.length - 1 && message.role === 'assistant'}
        />
      ))}

      {isLoading && messages[messages.length - 1]?.role === 'user' && (
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--card)] border border-[var(--card-border)] flex items-center justify-center flex-shrink-0">
            <span className="text-sm">🤖</span>
          </div>
          <div className="px-4 py-3 rounded-2xl rounded-tl-md bg-[var(--card)] border border-[var(--card-border)]">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-[var(--accent)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-[var(--accent)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-[var(--accent)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

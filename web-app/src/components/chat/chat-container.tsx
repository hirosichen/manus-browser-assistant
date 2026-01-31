'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useCallback, useMemo, useState, useRef } from 'react';
import { MessageList } from './message-list';
import { ChatInput } from './chat-input';
import { BrowserPreview } from './browser-preview';
import { TokenUsageDisplay } from './token-usage';
import { useExtension } from '@/hooks/use-extension';
import type { TokenUsage } from '@/lib/token-cost';

// Token optimization: Preprocess HTML and limit content size
const MAX_CONTENT_CHARS = 6000; // ~1500 tokens - balance between speed and quality

// Strip only truly useless HTML elements (conservative approach)
const preprocessHtml = (html: string): string => {
  // Only remove elements that NEVER contain useful product data
  let cleaned = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '') // Remove comments
    // Remove data attributes and event handlers to reduce noise
    .replace(/\s(data-[a-z-]+|on[a-z]+)="[^"]*"/gi, '')
    .replace(/\s(class|id)="[^"]*"/gi, '') // Remove class/id attributes
    .replace(/<[^>]+>/g, ' ') // Strip all HTML tags, keep text
    .replace(/\s+/g, ' ') // Collapse whitespace
    .trim();
  return cleaned;
};

const truncateToolResult = (result: unknown): unknown => {
  if (typeof result === 'string') {
    // Preprocess if it looks like HTML
    let processed = result;
    if (result.includes('<') && result.includes('>')) {
      processed = preprocessHtml(result);
    }
    if (processed.length > MAX_CONTENT_CHARS) {
      return processed.slice(0, MAX_CONTENT_CHARS) + `\n\n[... truncated ...]`;
    }
    return processed;
  }
  if (result && typeof result === 'object') {
    const obj = result as Record<string, unknown>;
    const truncated: Record<string, unknown> = { ...obj };
    for (const key of ['data', 'content', 'html', 'text', 'result']) {
      if (typeof truncated[key] === 'string') {
        let val = truncated[key] as string;
        // Preprocess HTML content
        if (val.includes('<') && val.includes('>')) {
          val = preprocessHtml(val);
        }
        if (val.length > MAX_CONTENT_CHARS) {
          truncated[key] = val.slice(0, MAX_CONTENT_CHARS) + `\n\n[... truncated ...]`;
        } else {
          truncated[key] = val;
        }
      }
    }
    return truncated;
  }
  return result;
};

export function ChatContainer() {
  const extension = useExtension();
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);

  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/chat',
  }), []);

  // Memoized callback for auto-send logic to prevent unnecessary re-renders
  const sendAutomaticallyWhen = useCallback(({ messages }: { messages: Array<{ role: string; parts?: Array<{ type: string; state?: string; output?: unknown }> }> }) => {
    const lastMessage = messages[messages.length - 1];

    if (!lastMessage || lastMessage.role !== 'assistant') {
      return false;
    }

    const parts = lastMessage.parts || [];

    // Tool parts have type like "tool-navigate", "tool-click", etc.
    const toolParts = parts.filter((p) => p.type.startsWith('tool-'));

    if (toolParts.length === 0) {
      return false;
    }

    // Check if all tool calls have output available
    const hasAllResults = toolParts.every((tc) => {
      return tc.state === 'output-available' || tc.output !== undefined;
    });

    // Check if there are pending tool calls (state: "pending" or "running")
    const hasPendingTools = toolParts.some((tc) => {
      return tc.state === 'pending' || tc.state === 'running' || tc.state === 'call';
    });

    // Only auto-send if:
    // 1. All current tool calls have results AND
    // 2. The message ends with a tool result (not a final text response)
    // This prevents infinite loops when AI has finished responding
    const lastPart = parts[parts.length - 1];
    const endsWithToolResult = lastPart && lastPart.type?.startsWith('tool-') && lastPart.state === 'output-available';

    return hasAllResults && !!endsWithToolResult && !hasPendingTools;
  }, []);

  const { messages, sendMessage, status, error, addToolOutput } = useChat({
    transport,
    sendAutomaticallyWhen,
    onToolCall: async ({ toolCall }) => {
      try {
        // Execute tool via extension
        const rawResult = await extension.executeTool(
          toolCall.toolName,
          toolCall.input as Record<string, unknown>
        );

        // Token optimization: Truncate large results (especially from extract tool)
        const result = truncateToolResult(rawResult);

        // Use addToolOutput to add the result (don't await to avoid deadlock)
        addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output: result || { success: false, error: 'No result from tool execution' },
        });
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[ChatContainer] Tool execution error:', err);
        }
        addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output: { success: false, error: err instanceof Error ? err.message : 'Tool execution failed' },
        });
      }
    },
    onFinish: ({ message }) => {
      // Extract usage from message metadata
      const metadata = message.metadata as { usage?: TokenUsage } | undefined;
      if (metadata?.usage) {
        setTokenUsage(metadata.usage);
      }
    },
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  // Handle manual HTML extraction
  const handleExtract = useCallback(async () => {
    const result = await extension.extract();
    if (result.success && result.data) {
      sendMessage({
        text: `I extracted the HTML from the current page:\n\n\`\`\`html\n${(result.data as string).slice(0, 5000)}\n\`\`\`\n\nCan you analyze this page?`,
      });
    }
  }, [extension, sendMessage]);

  // Handle sending a message
  const handleSend = useCallback(
    (message: string) => {
      sendMessage({
        text: message,
      });
    },
    [sendMessage]
  );

  return (
    <div className="flex h-screen bg-[var(--background)]">
      {/* Left panel - Chat */}
      <div className="w-[45%] min-w-[400px] flex flex-col border-r border-[var(--card-border)]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--card-border)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-secondary)] flex items-center justify-center">
              <span className="text-lg">🤖</span>
            </div>
            <div>
              <h1 className="text-sm font-semibold gradient-text">Manus</h1>
              <p className="text-[10px] text-[var(--muted)]">Browser Assistant</p>
            </div>
          </div>

          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium ${
              extension.connected
                ? 'bg-[var(--success)]/10 text-[var(--success)]'
                : 'bg-[var(--error)]/10 text-[var(--error)]'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                extension.connected ? 'bg-[var(--success)] animate-pulse' : 'bg-[var(--error)]'
              }`}
            />
            {extension.connected ? 'Extension Connected' : 'Extension Disconnected'}
          </div>
        </div>

        {/* Messages */}
        <MessageList messages={messages} isLoading={isLoading} onSuggestionClick={handleSend} />

        {/* Token Usage */}
        <TokenUsageDisplay usage={tokenUsage} />

        {/* Input */}
        <ChatInput
          onSend={handleSend}
          onExtract={handleExtract}
          isLoading={isLoading}
          extensionConnected={extension.connected}
        />
      </div>

      {/* Right panel - Browser Preview */}
      <div className="flex-1 p-4">
        <BrowserPreview
          html={extension.html}
          currentUrl={extension.currentUrl}
          currentTitle={extension.currentTitle}
          isExecuting={extension.isExecuting}
          connected={extension.connected}
          livePreviewEnabled={extension.livePreviewEnabled}
          liveScreenshot={extension.liveScreenshot}
          onStartLivePreview={extension.startLivePreview}
          onStopLivePreview={extension.stopLivePreview}
        />
      </div>
    </div>
  );
}

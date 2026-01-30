'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useCallback, useMemo } from 'react';
import { MessageList } from './message-list';
import { ChatInput } from './chat-input';
import { BrowserPreview } from './browser-preview';
import { useExtension } from '@/hooks/use-extension';

export function ChatContainer() {
  const extension = useExtension();

  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/chat',
  }), []);

  const { messages, sendMessage, status, error, addToolOutput } = useChat({
    transport,
    // Automatically continue when all tool results are available
    sendAutomaticallyWhen: ({ messages }) => {
      const lastMessage = messages[messages.length - 1];
      console.log('[sendAutomaticallyWhen] Last message:', lastMessage);

      if (!lastMessage || lastMessage.role !== 'assistant') {
        console.log('[sendAutomaticallyWhen] Not assistant message, returning false');
        return false;
      }

      // Check if all tool calls have results
      const parts = lastMessage.parts || [];

      // Tool parts have type like "tool-navigate", "tool-click", etc.
      const toolParts = parts.filter((p: { type: string }) => p.type.startsWith('tool-'));
      console.log('[sendAutomaticallyWhen] Tool parts:', toolParts);

      if (toolParts.length === 0) {
        return false;
      }

      // Check if all tool calls have output available
      const hasAllResults = toolParts.every((tc: { state?: string; output?: unknown }) =>
        tc.state === 'output-available' || tc.output !== undefined
      );
      console.log('[sendAutomaticallyWhen] Has all results:', hasAllResults);

      return hasAllResults;
    },
    onToolCall: async ({ toolCall }) => {
      console.log('[ChatContainer] Executing tool:', toolCall.toolName, toolCall.input);

      try {
        // Execute tool via extension
        const result = await extension.executeTool(
          toolCall.toolName,
          toolCall.input as Record<string, unknown>
        );

        console.log('[ChatContainer] Tool result:', result);

        // Use addToolOutput to add the result (don't await to avoid deadlock)
        addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output: result || { success: false, error: 'No result from tool execution' },
        });
      } catch (err) {
        console.error('[ChatContainer] Tool execution error:', err);
        addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output: { success: false, error: err instanceof Error ? err.message : 'Tool execution failed' },
        });
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
        <MessageList messages={messages} isLoading={isLoading} />

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

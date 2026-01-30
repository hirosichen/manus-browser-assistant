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

  const { messages, sendMessage, status, addToolResult, error } = useChat({
    transport,
    onToolCall: async ({ toolCall }) => {
      // Execute tool via extension
      const result = await extension.executeTool(
        toolCall.toolName,
        toolCall.input as Record<string, unknown>
      );

      // Add the tool result back to the chat
      addToolResult({
        toolCallId: toolCall.toolCallId,
        tool: toolCall.toolName,
        output: result,
      });
    },
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  // Handle manual screenshot request
  const handleScreenshot = useCallback(async () => {
    const result = await extension.takeScreenshot();
    if (result.success && result.screenshot) {
      // For now, just send a text message about the screenshot
      // File attachments require different handling in SDK v6
      sendMessage({
        text: `I took a screenshot of the current page. The screenshot data is: ${result.screenshot.substring(0, 100)}...`,
      });
    }
  }, [extension, sendMessage]);

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
          onScreenshot={handleScreenshot}
          onExtract={handleExtract}
          isLoading={isLoading}
          extensionConnected={extension.connected}
        />
      </div>

      {/* Right panel - Browser Preview */}
      <div className="flex-1 p-4">
        <BrowserPreview
          screenshot={extension.screenshot}
          html={extension.html}
          currentUrl={extension.currentUrl}
          currentTitle={extension.currentTitle}
          isExecuting={extension.isExecuting}
          connected={extension.connected}
        />
      </div>
    </div>
  );
}

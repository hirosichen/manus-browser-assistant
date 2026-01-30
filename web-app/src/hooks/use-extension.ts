'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface ExtensionState {
  connected: boolean;
  currentUrl: string | null;
  currentTitle: string | null;
  screenshot: string | null;
  html: string | null;
  isExecuting: boolean;
  lastError: string | null;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  screenshot?: string;
}

type MessageHandler = (result: ToolResult) => void;

export function useExtension() {
  const [state, setState] = useState<ExtensionState>({
    connected: false,
    currentUrl: null,
    currentTitle: null,
    screenshot: null,
    html: null,
    isExecuting: false,
    lastError: null,
  });

  const pendingCallbacks = useRef<Map<string, MessageHandler>>(new Map());
  const messageIdCounter = useRef(0);

  // Handle messages from extension
  const handleMessage = useCallback((event: MessageEvent) => {
    // Only accept messages from our extension
    if (event.source !== window) return;

    const { type, payload, messageId } = event.data || {};

    if (type === 'EXTENSION_PONG') {
      setState(prev => ({ ...prev, connected: true }));
    } else if (type === 'EXTENSION_DISCONNECTED') {
      setState(prev => ({ ...prev, connected: false }));
    } else if (type === 'TOOL_RESULT') {
      // Handle tool execution result
      const callback = pendingCallbacks.current.get(messageId);
      if (callback) {
        callback(payload);
        pendingCallbacks.current.delete(messageId);
      }

      setState(prev => ({
        ...prev,
        isExecuting: false,
        screenshot: payload.screenshot || prev.screenshot,
        currentUrl: payload.url || prev.currentUrl,
        currentTitle: payload.title || prev.currentTitle,
        html: payload.html || prev.html,
        lastError: payload.error || null,
      }));
    } else if (type === 'PAGE_UPDATE') {
      // Extension notifies of page changes
      setState(prev => ({
        ...prev,
        currentUrl: payload.url || prev.currentUrl,
        currentTitle: payload.title || prev.currentTitle,
        screenshot: payload.screenshot || prev.screenshot,
      }));
    }
  }, []);

  // Set up message listener and ping extension
  useEffect(() => {
    window.addEventListener('message', handleMessage);

    // Ping extension to check connection
    const pingExtension = () => {
      window.postMessage({ type: 'EXTENSION_PING' }, '*');
    };

    pingExtension();
    const interval = setInterval(pingExtension, 5000); // Check every 5 seconds

    return () => {
      window.removeEventListener('message', handleMessage);
      clearInterval(interval);
    };
  }, [handleMessage]);

  // Execute a browser tool
  const executeTool = useCallback((
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolResult> => {
    return new Promise((resolve) => {
      const messageId = `tool_${++messageIdCounter.current}_${Date.now()}`;

      setState(prev => ({ ...prev, isExecuting: true, lastError: null }));

      // Set up callback for this specific message
      pendingCallbacks.current.set(messageId, resolve);

      // Set timeout to prevent hanging
      setTimeout(() => {
        if (pendingCallbacks.current.has(messageId)) {
          pendingCallbacks.current.delete(messageId);
          setState(prev => ({ ...prev, isExecuting: false }));
          resolve({
            success: false,
            error: 'Tool execution timed out. Make sure the extension is connected.',
          });
        }
      }, 30000); // 30 second timeout

      // Send message to extension
      window.postMessage({
        type: 'EXECUTE_TOOL',
        messageId,
        toolName,
        args,
      }, '*');
    });
  }, []);

  // Convenience methods for common tools
  const navigate = useCallback((url: string) => {
    return executeTool('navigate', { url });
  }, [executeTool]);

  const takeScreenshot = useCallback(() => {
    return executeTool('screenshot', {});
  }, [executeTool]);

  const click = useCallback((selector: string) => {
    return executeTool('click', { selector });
  }, [executeTool]);

  const type = useCallback((selector: string, text: string) => {
    return executeTool('type', { selector, text });
  }, [executeTool]);

  const scroll = useCallback((direction: 'up' | 'down', amount: number) => {
    return executeTool('scroll', { direction, amount });
  }, [executeTool]);

  const extract = useCallback((selector?: string, type: 'html' | 'text' = 'text') => {
    return executeTool('extract', { selector, type });
  }, [executeTool]);

  const wait = useCallback((seconds: number) => {
    return executeTool('wait', { seconds });
  }, [executeTool]);

  return {
    ...state,
    executeTool,
    navigate,
    takeScreenshot,
    click,
    type,
    scroll,
    extract,
    wait,
  };
}

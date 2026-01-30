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
  livePreviewEnabled: boolean;
  liveScreenshot: string | null; // For live preview frames
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
    livePreviewEnabled: false,
    liveScreenshot: null,
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
    } else if (type === 'LIVE_FRAME') {
      // Live capture frame received
      setState(prev => ({
        ...prev,
        liveScreenshot: payload.screenshot,
        currentUrl: payload.url || prev.currentUrl,
        currentTitle: payload.title || prev.currentTitle,
      }));
    } else if (type === 'CAPTURE_STARTED') {
      // Live capture auto-started (e.g., after navigation)
      console.log('[useExtension] Capture started:', payload);
      setState(prev => ({
        ...prev,
        livePreviewEnabled: true,
        currentUrl: payload?.url || prev.currentUrl,
      }));
    } else if (type === 'CAPTURE_STOPPED') {
      // Live capture stopped (debugger detached, tab closed, etc.)
      console.log('[useExtension] Capture stopped:', payload?.reason);
      setState(prev => ({
        ...prev,
        livePreviewEnabled: false,
        liveScreenshot: null,
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

  // Start live preview (polling-based screenshots)
  const startLivePreview = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isExecuting: true, lastError: null }));

      const result = await executeTool('startCapture', {});

      if (!result.success) {
        setState(prev => ({
          ...prev,
          isExecuting: false,
          lastError: result.error || 'Failed to start capture',
        }));
        return { success: false, error: result.error };
      }

      setState(prev => ({
        ...prev,
        isExecuting: false,
        livePreviewEnabled: true,
        liveScreenshot: null,
        currentUrl: (result as { url?: string }).url || prev.currentUrl,
        currentTitle: (result as { title?: string }).title || prev.currentTitle,
      }));

      return { success: true };
    } catch (error) {
      console.error('[useExtension] Start live preview error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to start live preview';
      setState(prev => ({
        ...prev,
        isExecuting: false,
        lastError: errorMessage,
        livePreviewEnabled: false,
        liveScreenshot: null,
      }));
      return { success: false, error: errorMessage };
    }
  }, [executeTool]);

  // Auto-start live preview when connected (will fail gracefully if no target tab yet)
  // The extension will also auto-start after the first successful navigation
  const hasAutoStarted = useRef(false);
  useEffect(() => {
    if (state.connected && !state.livePreviewEnabled && !state.isExecuting && !hasAutoStarted.current) {
      hasAutoStarted.current = true;
      startLivePreview().catch(() => {
        // Ignore errors - extension will auto-start after first navigation
        console.log('[useExtension] Initial auto-start failed, will start after navigation');
      });
    }
    // Reset the flag when disconnected so it can auto-start again on reconnect
    if (!state.connected) {
      hasAutoStarted.current = false;
    }
  }, [state.connected, state.livePreviewEnabled, state.isExecuting, startLivePreview]);

  // Stop live preview
  const stopLivePreview = useCallback(async () => {
    try {
      await executeTool('stopCapture', {});

      setState(prev => ({
        ...prev,
        livePreviewEnabled: false,
        liveScreenshot: null,
      }));

      return { success: true };
    } catch (error) {
      console.error('[useExtension] Stop live preview error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to stop live preview' };
    }
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
    startLivePreview,
    stopLivePreview,
  };
}

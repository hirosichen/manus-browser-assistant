// Bridge script for communication between Next.js Web App and Chrome Extension
// This script runs in the context of the localhost:3000 page

(function() {
  'use strict';

  console.log('[Manus Bridge] Initializing...');

  // Listen for messages from the web app
  window.addEventListener('message', async (event) => {
    // Only accept messages from our own window
    if (event.source !== window) return;

    const { type, messageId, toolName, args } = event.data || {};

    // Handle ping from web app
    if (type === 'EXTENSION_PING') {
      console.log('[Manus Bridge] Received ping, sending pong');
      window.postMessage({ type: 'EXTENSION_PONG' }, '*');
      return;
    }

    // Handle tool execution requests
    if (type === 'EXECUTE_TOOL') {
      console.log('[Manus Bridge] Executing tool:', toolName, args);

      try {
        // Send message to background script
        const response = await chrome.runtime.sendMessage({
          action: 'executeTool',
          toolName,
          args,
        });

        console.log('[Manus Bridge] Tool result:', response);

        // Send result back to web app
        window.postMessage({
          type: 'TOOL_RESULT',
          messageId,
          payload: response,
        }, '*');
      } catch (error) {
        console.error('[Manus Bridge] Tool execution error:', error);
        window.postMessage({
          type: 'TOOL_RESULT',
          messageId,
          payload: {
            success: false,
            error: error.message || 'Unknown error occurred',
          },
        }, '*');
      }
    }
  });

  // Listen for updates from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'PAGE_UPDATE') {
      window.postMessage({
        type: 'PAGE_UPDATE',
        payload: request.payload,
      }, '*');
    }
    return true;
  });

  // Notify that the extension is ready
  window.postMessage({ type: 'EXTENSION_PONG' }, '*');
  console.log('[Manus Bridge] Ready');
})();

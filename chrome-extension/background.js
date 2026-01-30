// Background service worker for Manus Browser Assistant
// Handles tool execution for AI-powered browser automation
// Uses Chrome Debugger API for live tab capture

// Store the current active tab for operations
let currentTargetTabId = null;
// Store the web app tab to switch back after operations
let webAppTabId = null;
// Track if debugger is attached
let debuggerAttached = false;
// Track capture interval
let captureIntervalId = null;
// Capture rate in milliseconds
const CAPTURE_RATE = 400;

// Get the active tab that's not the localhost web app
async function getTargetTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });

  // Store the web app tab for switching back later
  for (const tab of tabs) {
    if (tab.url && tab.url.startsWith('http://localhost:3000')) {
      webAppTabId = tab.id;
    }
  }

  // If we have a stored target tab, try to use it
  if (currentTargetTabId) {
    try {
      const tab = await chrome.tabs.get(currentTargetTabId);
      if (tab && !tab.url.startsWith('http://localhost:3000') && !tab.url.startsWith('chrome://')) {
        return tab;
      }
    } catch (e) {
      // Tab no longer exists, will find a new one
      currentTargetTabId = null;
    }
  }

  // Find a tab that's not localhost:3000 (our web app)
  for (const tab of tabs) {
    if (tab.url && !tab.url.startsWith('http://localhost:3000')) {
      currentTargetTabId = tab.id;
      return tab;
    }
  }

  // If active tab is localhost, find another non-localhost tab
  const allTabs = await chrome.tabs.query({ currentWindow: true });
  for (const tab of allTabs) {
    if (tab.url && !tab.url.startsWith('http://localhost:3000') && !tab.url.startsWith('chrome://')) {
      currentTargetTabId = tab.id;
      return tab;
    }
  }

  return null;
}

// Execute tool based on name and arguments
async function executeTool(toolName, args) {
  console.log('[Background] Executing tool:', toolName, args);

  switch (toolName) {
    case 'navigate':
      return await handleNavigate(args);
    case 'screenshot':
      return await handleScreenshot();
    case 'click':
      return await handleClick(args);
    case 'type':
      return await handleType(args);
    case 'scroll':
      return await handleScroll(args);
    case 'extract':
      return await handleExtract(args);
    case 'wait':
      return await handleWait(args);
    case 'startCapture':
      return await handleStartCapture();
    case 'stopCapture':
      return await handleStopCapture();
    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

// Navigate to URL
async function handleNavigate({ url }) {
  try {
    // Ensure URL has protocol
    let targetUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      targetUrl = 'https://' + url;
    }

    // Store current web app tab before any operations
    const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    for (const tab of activeTabs) {
      if (tab.url && tab.url.startsWith('http://localhost:3000')) {
        webAppTabId = tab.id;
      }
    }

    let tab = await getTargetTab();

    if (tab) {
      // Update existing tab (in background)
      tab = await chrome.tabs.update(tab.id, { url: targetUrl, active: false });
    } else {
      // Create new tab in background
      tab = await chrome.tabs.create({ url: targetUrl, active: false });
    }

    currentTargetTabId = tab.id;

    // Wait for page to load
    await waitForTabLoad(tab.id);

    // Get updated tab info
    const updatedTab = await chrome.tabs.get(tab.id);

    // Note: We don't extract full HTML here to avoid token limit issues
    // The live preview shows the page visually, and extract tool can be used if needed

    // Auto-start live capture after navigation if not already running
    if (!debuggerAttached && !captureIntervalId) {
      console.log('[Background] Auto-starting live capture after navigation');
      handleStartCapture().then(result => {
        if (result.success) {
          // Notify web app that live capture has started
          notifyWebApp({
            type: 'CAPTURE_STARTED',
            payload: { tabId: tab.id, url: targetUrl },
          });
        }
      }).catch(e => {
        console.error('[Background] Auto-start capture failed:', e);
      });
    }

    return {
      success: true,
      url: targetUrl,
      title: updatedTab.title,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Capture screenshot
async function handleScreenshot() {
  try {
    const tab = await getTargetTab();
    if (!tab) {
      return { success: false, error: 'No target tab found. Navigate to a page first.' };
    }

    const screenshot = await captureScreenshot(tab.id);

    return {
      success: true,
      screenshot,
      url: tab.url,
      title: tab.title,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Click on element
async function handleClick({ selector }) {
  try {
    const tab = await getTargetTab();
    if (!tab) {
      return { success: false, error: 'No target tab found' };
    }

    if (!selector) {
      return { success: false, error: 'Selector is required for click action' };
    }

    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (sel) => {
        const element = document.querySelector(sel);
        if (!element) {
          return { success: false, error: `Element not found: ${sel}` };
        }
        element.click();
        return { success: true };
      },
      args: [selector],
    });

    if (!result[0]?.result?.success) {
      return result[0]?.result || { success: false, error: 'Click failed' };
    }

    // Wait a moment for any reactions
    await new Promise(resolve => setTimeout(resolve, 500));

    // Skip screenshot if live capture is running (avoids tab switching)
    const screenshot = debuggerAttached ? null : await captureScreenshot(tab.id);

    return {
      success: true,
      screenshot,
      url: tab.url,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Type text into element
async function handleType({ selector, text }) {
  try {
    const tab = await getTargetTab();
    if (!tab) {
      return { success: false, error: 'No target tab found' };
    }

    if (!selector) {
      return { success: false, error: 'Selector is required for type action' };
    }

    // Ensure text is a string (convert undefined/null to empty string)
    const safeText = text ?? '';

    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (sel, txt) => {
        const element = document.querySelector(sel);
        if (!element) {
          return { success: false, error: `Element not found: ${sel}` };
        }

        // Focus the element
        element.focus();

        // Clear existing value if it's an input
        if (element.value !== undefined) {
          element.value = '';
        }

        // Type the text
        element.value = txt;

        // Dispatch input event
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));

        return { success: true };
      },
      args: [selector, safeText],
    });

    if (!result[0]?.result?.success) {
      return result[0]?.result || { success: false, error: 'Type failed' };
    }

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 300));

    // Skip screenshot if live capture is running (avoids tab switching)
    const screenshot = debuggerAttached ? null : await captureScreenshot(tab.id);

    return {
      success: true,
      screenshot,
      url: tab.url,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Scroll the page
async function handleScroll({ direction, amount }) {
  try {
    const tab = await getTargetTab();
    if (!tab) {
      return { success: false, error: 'No target tab found' };
    }

    // Provide defaults for serialization safety
    const safeDirection = direction || 'down';
    const safeAmount = amount ?? 300;

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (dir, amt) => {
        const scrollAmount = dir === 'down' ? amt : -amt;
        window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
      },
      args: [safeDirection, safeAmount],
    });

    // Wait for scroll to complete
    await new Promise(resolve => setTimeout(resolve, 500));

    // Skip screenshot if live capture is running (avoids tab switching)
    const screenshot = debuggerAttached ? null : await captureScreenshot(tab.id);

    return {
      success: true,
      screenshot,
      url: tab.url,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Extract content from page
async function handleExtract({ selector, type = 'text' }) {
  try {
    const tab = await getTargetTab();
    if (!tab) {
      return { success: false, error: 'No target tab found' };
    }

    // Convert undefined to null for serialization (undefined is not serializable in MV3)
    const safeSelector = selector === undefined ? null : selector;
    const safeType = type === undefined ? 'text' : type;

    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (sel, extractType) => {
        let element = sel ? document.querySelector(sel) : document.documentElement;
        if (!element) {
          return { success: false, error: `Element not found: ${sel}` };
        }

        const content = extractType === 'html'
          ? element.outerHTML
          : element.innerText;

        return { success: true, data: content };
      },
      args: [safeSelector, safeType],
    });

    const extractResult = result[0]?.result;
    if (!extractResult?.success) {
      return extractResult || { success: false, error: 'Extract failed' };
    }

    // Limit content size to avoid token limit issues (max ~50KB)
    const MAX_CONTENT_SIZE = 50000;
    let content = extractResult.data;
    let truncated = false;
    if (content && content.length > MAX_CONTENT_SIZE) {
      content = content.substring(0, MAX_CONTENT_SIZE);
      truncated = true;
    }

    return {
      success: true,
      data: content,
      truncated,
      originalLength: extractResult.data?.length || 0,
      url: tab.url,
      title: tab.title,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Wait for specified seconds
async function handleWait({ seconds }) {
  try {
    const safeSeconds = seconds ?? 1;
    await new Promise(resolve => setTimeout(resolve, safeSeconds * 1000));

    // Skip screenshot if live capture is running (avoids tab switching)
    const tab = await getTargetTab();
    let screenshot = null;
    if (tab && !debuggerAttached) {
      screenshot = await captureScreenshot(tab.id);
    }

    return {
      success: true,
      screenshot,
      message: `Waited ${safeSeconds} seconds`,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Start live capture using Chrome Debugger API
async function handleStartCapture() {
  try {
    // Stop any existing capture first
    if (debuggerAttached || captureIntervalId) {
      await handleStopCapture();
    }

    // First, ensure we have the web app tab
    const tabs = await chrome.tabs.query({ url: 'http://localhost:3000/*' });
    if (tabs.length === 0) {
      return { success: false, error: 'Web app tab not found' };
    }
    webAppTabId = tabs[0].id;

    // Get the target tab to capture
    const targetTab = await getTargetTab();
    if (!targetTab) {
      return { success: false, error: 'No target tab found. Navigate to a page first.' };
    }

    console.log('[Background] Starting debugger capture for tab:', targetTab.id, targetTab.url);

    // Attach debugger to target tab
    try {
      await chrome.debugger.attach({ tabId: targetTab.id }, '1.3');
      debuggerAttached = true;
      currentTargetTabId = targetTab.id;
      console.log('[Background] Debugger attached successfully');
    } catch (attachError) {
      console.error('[Background] Debugger attach error:', attachError);
      // Check if DevTools is open
      if (attachError.message && attachError.message.includes('Another debugger')) {
        return {
          success: false,
          error: 'Cannot attach debugger: DevTools may be open on the target tab. Please close DevTools and try again.',
        };
      }
      return { success: false, error: attachError.message };
    }

    // Start periodic screenshot capture
    captureIntervalId = setInterval(async () => {
      if (!debuggerAttached || !currentTargetTabId) {
        console.log('[Background] Capture stopped: debugger not attached');
        handleStopCapture();
        return;
      }

      try {
        const result = await chrome.debugger.sendCommand(
          { tabId: currentTargetTabId },
          'Page.captureScreenshot',
          { format: 'jpeg', quality: 70 }
        );

        // Send screenshot to web app
        notifyWebApp({
          type: 'LIVE_FRAME',
          payload: {
            screenshot: 'data:image/jpeg;base64,' + result.data,
            timestamp: Date.now(),
          },
        });
      } catch (captureError) {
        console.error('[Background] Capture error:', captureError);
        // If capture fails, stop the interval
        handleStopCapture();
        notifyWebApp({
          type: 'CAPTURE_STOPPED',
          payload: { reason: captureError.message },
        });
      }
    }, CAPTURE_RATE);

    return {
      success: true,
      tabId: targetTab.id,
      url: targetTab.url,
      title: targetTab.title,
      mode: 'debugger',
    };
  } catch (error) {
    console.error('[Background] Start capture error:', error);
    return { success: false, error: error.message };
  }
}

// Stop live capture
async function handleStopCapture() {
  try {
    // Stop capture interval
    if (captureIntervalId) {
      clearInterval(captureIntervalId);
      captureIntervalId = null;
      console.log('[Background] Capture interval cleared');
    }

    // Detach debugger
    if (debuggerAttached && currentTargetTabId) {
      try {
        await chrome.debugger.detach({ tabId: currentTargetTabId });
        console.log('[Background] Debugger detached');
      } catch (e) {
        // Ignore errors if already detached
        console.log('[Background] Debugger detach error (may already be detached):', e.message);
      }
      debuggerAttached = false;
    }

    console.log('[Background] Live capture stopped');

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Listen for debugger detach events (e.g., user closes tab or DevTools opens)
chrome.debugger.onDetach.addListener((source, reason) => {
  if (source.tabId === currentTargetTabId) {
    console.log('[Background] Debugger detached externally:', reason);
    debuggerAttached = false;

    // Stop capture interval
    if (captureIntervalId) {
      clearInterval(captureIntervalId);
      captureIntervalId = null;
    }

    // Notify web app that capture has stopped
    notifyWebApp({
      type: 'CAPTURE_STOPPED',
      payload: { reason },
    });
  }
});

// Helper: Capture screenshot of a tab (for non-live operations)
async function captureScreenshot(tabId) {
  try {
    // Make sure the tab is focused
    await chrome.tabs.update(tabId, { active: true });

    // Small delay to ensure tab is visible
    await new Promise(resolve => setTimeout(resolve, 150));

    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png',
      quality: 90,
    });

    // Switch back to web app tab if we have it
    if (webAppTabId) {
      try {
        await chrome.tabs.update(webAppTabId, { active: true });
      } catch (e) {
        // Web app tab might have been closed, ignore
      }
    }

    return dataUrl;
  } catch (error) {
    console.error('[Background] Screenshot error:', error);
    // Try to switch back to web app even on error
    if (webAppTabId) {
      try {
        await chrome.tabs.update(webAppTabId, { active: true });
      } catch (e) {
        // Ignore
      }
    }
    return null;
  }
}

// Helper: Wait for tab to finish loading
function waitForTabLoad(tabId, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const checkTab = async () => {
      try {
        const tab = await chrome.tabs.get(tabId);

        if (tab.status === 'complete') {
          resolve(tab);
          return;
        }

        if (Date.now() - startTime > timeout) {
          resolve(tab); // Resolve anyway after timeout
          return;
        }

        setTimeout(checkTab, 100);
      } catch (error) {
        reject(error);
      }
    };

    checkTab();
  });
}

// Listen for messages from bridge.js and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'executeTool') {
    executeTool(request.toolName, request.args)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  }
});

// Track tab updates to notify the web app
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === currentTargetTabId && changeInfo.status === 'complete') {
    // Notify any listening bridge scripts
    notifyWebApp({
      type: 'PAGE_UPDATE',
      payload: {
        url: tab.url,
        title: tab.title,
      },
    });
  }
});

// Handle tab removal - clean up if target tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === currentTargetTabId) {
    console.log('[Background] Target tab closed, stopping capture');
    handleStopCapture();
    currentTargetTabId = null;
  }
});

// Helper to notify web app via bridge
async function notifyWebApp(message) {
  try {
    const tabs = await chrome.tabs.query({ url: 'http://localhost:3000/*' });
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {
        // Ignore errors if bridge isn't ready
      });
    }
  } catch (error) {
    // Ignore errors
  }
}

console.log('[Manus Background] Service worker loaded (Debugger API mode)');

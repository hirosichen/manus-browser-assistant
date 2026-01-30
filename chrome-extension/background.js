// Background service worker for Manus Browser Assistant
// Handles tool execution for AI-powered browser automation

// API key should be configured via extension options or environment
// For security, do not hardcode API keys
const ANTHROPIC_API_KEY = "";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

// Store the current active tab for operations
let currentTargetTabId = null;

// Get the active tab that's not the localhost web app
async function getTargetTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });

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

    let tab = await getTargetTab();

    if (tab) {
      // Update existing tab
      tab = await chrome.tabs.update(tab.id, { url: targetUrl });
    } else {
      // Create new tab
      tab = await chrome.tabs.create({ url: targetUrl });
    }

    currentTargetTabId = tab.id;

    // Wait for page to load
    await waitForTabLoad(tab.id);

    // Take a screenshot after navigation
    const screenshot = await captureScreenshot(tab.id);

    return {
      success: true,
      url: targetUrl,
      title: tab.title,
      screenshot,
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

    // Take screenshot after click
    const screenshot = await captureScreenshot(tab.id);

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

    // Take screenshot after typing
    const screenshot = await captureScreenshot(tab.id);

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

    // Take screenshot after scroll
    const screenshot = await captureScreenshot(tab.id);

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

    return {
      success: true,
      data: extractResult.data,
      html: type === 'html' ? extractResult.data : null,
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

    // Take screenshot after wait
    const tab = await getTargetTab();
    let screenshot = null;
    if (tab) {
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

// Helper: Capture screenshot of a tab
async function captureScreenshot(tabId) {
  try {
    // Make sure the tab is focused
    await chrome.tabs.update(tabId, { active: true });

    // Small delay to ensure tab is visible
    await new Promise(resolve => setTimeout(resolve, 100));

    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png',
      quality: 90,
    });

    return dataUrl;
  } catch (error) {
    console.error('[Background] Screenshot error:', error);
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

  // Legacy: Handle product analysis from popup
  if (request.action === 'analyzeProduct') {
    analyzeProduct(request.productData)
      .then(response => sendResponse({ success: true, analysis: response }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// Legacy: Product analysis function
async function analyzeProduct(productData) {
  const prompt = buildAnalysisPrompt(productData);

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `API request failed: ${response.status}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

function buildAnalysisPrompt(productData) {
  return `Analyze this product from Dick's Sporting Goods and provide insights:

Product Information:
- Title: ${productData.title || 'N/A'}
- Current Price: ${productData.price || 'N/A'}
- Original Price: ${productData.originalPrice || 'N/A'}
- Colors Available: ${productData.colors?.map(c => c.name).join(', ') || 'N/A'}
- Sizes: ${productData.sizes?.map(s => `${s.size}${s.available ? '' : ' (Out of Stock)'}`).join(', ') || 'N/A'}
- Rating: ${productData.rating || 'N/A'}
- Review Count: ${productData.reviewCount || 'N/A'}
- Availability: ${productData.availability || 'N/A'}

Description:
${productData.description || 'N/A'}

Please provide:
1. **Product Summary** - A brief overview of the product
2. **Value Assessment** - Is this a good deal? Consider the price and any discounts
3. **Size Recommendation** - Any tips for sizing based on available sizes
4. **Similar Alternatives** - What other products might be worth considering
5. **Key Features** - Highlight the main selling points

Keep the response concise and helpful for a shopper.`;
}

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

console.log('[Manus Background] Service worker loaded');

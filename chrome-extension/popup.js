// Manus Browser Assistant - Popup Script
// Handles UI interactions and communication with content/background scripts

(function() {
  'use strict';

  // State
  let currentProductData = null;
  let currentView = 'formatted';

  // DOM Elements
  const elements = {
    statusBadge: document.getElementById('statusBadge'),
    openAppBtn: document.getElementById('openAppBtn'),
    screenshotBtn: document.getElementById('screenshotBtn'),
    connectionBar: document.getElementById('connectionBar'),
    connectionText: document.getElementById('connectionText'),
    extractBtn: document.getElementById('extractBtn'),
    analyzeBtn: document.getElementById('analyzeBtn'),
    resultsContainer: document.getElementById('resultsContainer'),
    productCard: document.getElementById('productCard'),
    productTitle: document.getElementById('productTitle'),
    currentPrice: document.getElementById('currentPrice'),
    originalPrice: document.getElementById('originalPrice'),
    colorsSection: document.getElementById('colorsSection'),
    colorsList: document.getElementById('colorsList'),
    colorsCount: document.getElementById('colorsCount'),
    sizesSection: document.getElementById('sizesSection'),
    sizesList: document.getElementById('sizesList'),
    sizesCount: document.getElementById('sizesCount'),
    skuValue: document.getElementById('skuValue'),
    ratingValue: document.getElementById('ratingValue'),
    reviewsValue: document.getElementById('reviewsValue'),
    stockValue: document.getElementById('stockValue'),
    metaGrid: document.getElementById('metaGrid'),
    analysisCard: document.getElementById('analysisCard'),
    analysisContent: document.getElementById('analysisContent'),
    jsonView: document.getElementById('jsonView'),
    jsonContent: document.getElementById('jsonContent'),
    copyBtn: document.getElementById('copyBtn'),
    exportBtn: document.getElementById('exportBtn'),
    emptyState: document.getElementById('emptyState'),
    errorState: document.getElementById('errorState'),
    errorText: document.getElementById('errorText'),
    retryBtn: document.getElementById('retryBtn'),
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toastMessage')
  };

  // Initialize
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    await checkCurrentTab();
    setupEventListeners();
  }

  async function checkCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (tab && tab.url) {
        const isDicksSite = tab.url.includes('dickssportinggoods.com');
        const isProductPage = tab.url.includes('/p/');

        if (isDicksSite && isProductPage) {
          updateStatus('active', 'Product Page');
          updateConnection('✓ Ready to extract from product page');
          elements.extractBtn.disabled = false;
        } else if (isDicksSite) {
          updateStatus('ready', 'Dick\'s Site');
          updateConnection('Navigate to a product page to extract');
          elements.extractBtn.disabled = true;
        } else {
          updateStatus('inactive', 'Other Site');
          updateConnection('Visit dickssportinggoods.com');
          elements.extractBtn.disabled = true;
        }
      }
    } catch (error) {
      console.error('Error checking tab:', error);
      updateStatus('error', 'Error');
      updateConnection('Could not detect page');
    }
  }

  function setupEventListeners() {
    // Open Web App button
    elements.openAppBtn.addEventListener('click', handleOpenApp);

    // Screenshot button
    elements.screenshotBtn.addEventListener('click', handleScreenshot);

    // Extract button
    elements.extractBtn.addEventListener('click', handleExtract);

    // Analyze button
    elements.analyzeBtn.addEventListener('click', handleAnalyze);

    // Section toggles
    document.querySelectorAll('.section-toggle').forEach(toggle => {
      toggle.addEventListener('click', handleSectionToggle);
    });

    // View toggles
    document.querySelectorAll('.toggle-btn').forEach(btn => {
      btn.addEventListener('click', handleViewToggle);
    });

    // Copy button
    elements.copyBtn.addEventListener('click', handleCopy);

    // Export button
    elements.exportBtn.addEventListener('click', handleExport);

    // Retry button
    elements.retryBtn.addEventListener('click', handleExtract);
  }

  function updateStatus(state, text) {
    elements.statusBadge.className = 'status-badge ' + state;
    elements.statusBadge.querySelector('.status-text').textContent = text;
  }

  function updateConnection(text) {
    elements.connectionText.textContent = text;
  }

  async function handleOpenApp() {
    // Check if web app is already open
    const tabs = await chrome.tabs.query({ url: 'http://localhost:3000/*' });

    if (tabs.length > 0) {
      // Focus existing tab
      await chrome.tabs.update(tabs[0].id, { active: true });
      await chrome.windows.update(tabs[0].windowId, { focused: true });
      showToast('Web App already open');
    } else {
      // Open new tab
      await chrome.tabs.create({ url: 'http://localhost:3000' });
      showToast('Opening Web App...');
    }
  }

  async function handleScreenshot() {
    setButtonLoading(elements.screenshotBtn, true);

    try {
      const result = await chrome.runtime.sendMessage({
        action: 'executeTool',
        toolName: 'screenshot',
        args: {}
      });

      if (result && result.success) {
        showToast('Screenshot captured!');
        // Could display preview here in future
      } else {
        throw new Error(result?.error || 'Failed to capture screenshot');
      }
    } catch (error) {
      console.error('Screenshot error:', error);
      showToast('Screenshot failed: ' + error.message);
    } finally {
      setButtonLoading(elements.screenshotBtn, false);
    }
  }

  async function handleExtract() {
    setButtonLoading(elements.extractBtn, true);
    hideError();

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      // Ensure content script is injected
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      }).catch(() => {
        // Script may already be injected, ignore error
      });

      // Small delay to ensure script is ready
      await new Promise(resolve => setTimeout(resolve, 100));

      // Send message to content script
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractProduct' });

      if (response && response.success) {
        currentProductData = response.data;
        displayProductData(response.data);
        updateStatus('success', 'Extracted');
        elements.analyzeBtn.disabled = false;
        showToast('Product data extracted successfully');
      } else {
        throw new Error(response?.error || 'Failed to extract product data');
      }
    } catch (error) {
      console.error('Extraction error:', error);
      showError(error.message || 'Could not extract product data. Make sure you\'re on a product page.');
      updateStatus('error', 'Error');
    } finally {
      setButtonLoading(elements.extractBtn, false);
    }
  }

  async function handleAnalyze() {
    if (!currentProductData) {
      showToast('Please extract product data first');
      return;
    }

    setButtonLoading(elements.analyzeBtn, true);

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'analyzeProduct',
        productData: currentProductData
      });

      if (response && response.success) {
        displayAnalysis(response.analysis);
        showToast('AI analysis complete');
      } else {
        throw new Error(response?.error || 'Failed to analyze product');
      }
    } catch (error) {
      console.error('Analysis error:', error);
      showToast('Analysis failed: ' + error.message);
    } finally {
      setButtonLoading(elements.analyzeBtn, false);
    }
  }

  function displayProductData(data) {
    // Hide empty state, show results
    elements.emptyState.classList.add('hidden');
    elements.resultsContainer.classList.add('visible');

    // Title
    elements.productTitle.textContent = data.title || 'Unknown Product';

    // Prices
    elements.currentPrice.textContent = data.price || '—';
    if (data.originalPrice && data.originalPrice !== data.price) {
      elements.originalPrice.textContent = data.originalPrice;
      elements.originalPrice.style.display = 'inline';
    } else {
      elements.originalPrice.style.display = 'none';
    }

    // Colors
    if (data.colors && data.colors.length > 0) {
      elements.colorsSection.style.display = 'block';
      elements.colorsCount.textContent = data.colors.length;
      elements.colorsList.innerHTML = `
        <div class="color-chips">
          ${data.colors.map(c => `
            <span class="color-chip ${c.selected ? 'selected' : ''}">${c.name}</span>
          `).join('')}
        </div>
      `;
    } else {
      elements.colorsSection.style.display = 'none';
    }

    // Sizes
    if (data.sizes && data.sizes.length > 0) {
      elements.sizesSection.style.display = 'block';
      elements.sizesCount.textContent = data.sizes.length;
      const availableCount = data.sizes.filter(s => s.available).length;
      elements.sizesCount.textContent = `${availableCount}/${data.sizes.length}`;
      elements.sizesList.innerHTML = `
        <div class="size-grid">
          ${data.sizes.map(s => `
            <span class="size-chip ${s.available ? 'available' : 'unavailable'} ${s.selected ? 'selected' : ''}">${s.size}</span>
          `).join('')}
        </div>
      `;
    } else {
      elements.sizesSection.style.display = 'none';
    }

    // Meta info
    elements.skuValue.textContent = data.sku || '—';
    elements.ratingValue.textContent = data.rating ? `${data.rating}/5` : '—';
    elements.reviewsValue.textContent = data.reviewCount ? data.reviewCount.toLocaleString() : '—';
    elements.stockValue.textContent = data.availability || '—';

    // JSON view
    elements.jsonContent.textContent = JSON.stringify(data, null, 2);

    // Scroll to results
    elements.resultsContainer.scrollIntoView({ behavior: 'smooth' });
  }

  function displayAnalysis(analysisText) {
    elements.analysisCard.classList.remove('hidden');

    // Convert markdown-like formatting to HTML
    let html = analysisText
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');

    html = '<p>' + html + '</p>';

    elements.analysisContent.innerHTML = html;
  }

  function handleSectionToggle(e) {
    const toggle = e.currentTarget;
    const targetId = toggle.getAttribute('data-target');
    const content = document.getElementById(targetId);

    toggle.classList.toggle('expanded');
    content.classList.toggle('visible');
  }

  function handleViewToggle(e) {
    const btn = e.currentTarget;
    const view = btn.getAttribute('data-view');

    if (view === currentView) return;

    // Update button states
    document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Toggle views
    if (view === 'json') {
      elements.productCard.style.display = 'none';
      elements.analysisCard.style.display = 'none';
      elements.jsonView.classList.remove('hidden');
    } else {
      elements.productCard.style.display = 'block';
      if (elements.analysisContent.innerHTML) {
        elements.analysisCard.classList.remove('hidden');
      }
      elements.jsonView.classList.add('hidden');
    }

    currentView = view;
  }

  async function handleCopy() {
    if (!currentProductData) {
      showToast('No data to copy');
      return;
    }

    try {
      await navigator.clipboard.writeText(JSON.stringify(currentProductData, null, 2));
      showToast('JSON copied to clipboard');
    } catch (error) {
      showToast('Failed to copy');
    }
  }

  function handleExport() {
    if (!currentProductData) {
      showToast('No data to export');
      return;
    }

    const blob = new Blob([JSON.stringify(currentProductData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const filename = `product-${currentProductData.sku || Date.now()}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
    showToast(`Exported as ${filename}`);
  }

  function setButtonLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
      btn.classList.add('loading');
      btn.disabled = true;
    } else {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }

  function showError(message) {
    elements.emptyState.classList.add('hidden');
    elements.resultsContainer.classList.remove('visible');
    elements.errorState.classList.remove('hidden');
    elements.errorText.textContent = message;
  }

  function hideError() {
    elements.errorState.classList.add('hidden');
  }

  function showToast(message) {
    elements.toastMessage.textContent = message;
    elements.toast.classList.remove('hidden');
    elements.toast.classList.add('visible');

    setTimeout(() => {
      elements.toast.classList.remove('visible');
      setTimeout(() => {
        elements.toast.classList.add('hidden');
      }, 300);
    }, 2500);
  }
})();

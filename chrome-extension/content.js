// Content script for extracting product information from Dick's Sporting Goods

(function() {
  'use strict';

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractProduct') {
      const productData = extractProductData();
      sendResponse(productData);
    }
    return true; // Keep the message channel open for async response
  });

  function extractProductData() {
    try {
      const data = {
        title: extractTitle(),
        price: extractPrice(),
        originalPrice: extractOriginalPrice(),
        colors: extractColors(),
        sizes: extractSizes(),
        description: extractDescription(),
        images: extractImages(),
        sku: extractSKU(),
        rating: extractRating(),
        reviewCount: extractReviewCount(),
        availability: extractAvailability(),
        url: window.location.href,
        extractedAt: new Date().toISOString()
      };

      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  function extractTitle() {
    // Try multiple selectors for product title
    const selectors = [
      '[data-testid="product-title"]',
      'h1.product-title',
      'h1[class*="ProductTitle"]',
      '.pdp-product-title h1',
      'h1'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim()) {
        return element.textContent.trim();
      }
    }
    return null;
  }

  function extractPrice() {
    // Try multiple selectors for current price
    const selectors = [
      '[data-testid="product-price"]',
      '[class*="ProductPrice"] [class*="sale"]',
      '[class*="ProductPrice"] [class*="current"]',
      '.product-price .sale-price',
      '.product-price .current-price',
      '[class*="price"]'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        const priceText = element.textContent.trim();
        const priceMatch = priceText.match(/\$[\d,]+\.?\d*/);
        if (priceMatch) {
          return priceMatch[0];
        }
      }
    }

    // Fallback: search for any price pattern on the page
    const priceElements = document.querySelectorAll('[class*="price"], [class*="Price"]');
    for (const el of priceElements) {
      const text = el.textContent.trim();
      const match = text.match(/\$[\d,]+\.?\d*/);
      if (match) {
        return match[0];
      }
    }

    return null;
  }

  function extractOriginalPrice() {
    const selectors = [
      '[class*="ProductPrice"] [class*="original"]',
      '[class*="ProductPrice"] [class*="was"]',
      '.product-price .original-price',
      '[class*="strikethrough"]',
      'del',
      's'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        const priceText = element.textContent.trim();
        const priceMatch = priceText.match(/\$[\d,]+\.?\d*/);
        if (priceMatch) {
          return priceMatch[0];
        }
      }
    }
    return null;
  }

  function extractColors() {
    const colors = [];

    // Try to find color swatches
    const colorSelectors = [
      '[data-testid="color-swatch"]',
      '[class*="ColorSwatch"]',
      '[class*="color-swatch"]',
      '[aria-label*="color"]',
      '[class*="colorOption"]'
    ];

    for (const selector of colorSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        elements.forEach(el => {
          const colorName = el.getAttribute('aria-label') ||
                           el.getAttribute('title') ||
                           el.getAttribute('data-color') ||
                           el.textContent.trim();
          if (colorName && !colors.includes(colorName)) {
            const isSelected = el.classList.contains('selected') ||
                              el.getAttribute('aria-checked') === 'true' ||
                              el.hasAttribute('data-selected');
            colors.push({
              name: colorName.replace(/^color:?\s*/i, '').trim(),
              selected: isSelected
            });
          }
        });
        if (colors.length > 0) break;
      }
    }

    // Also try to extract from URL or data attributes
    const urlParams = new URLSearchParams(window.location.search);
    const urlColor = urlParams.get('color');
    if (urlColor && colors.length === 0) {
      colors.push({ name: urlColor, selected: true });
    }

    return colors;
  }

  function extractSizes() {
    const sizes = [];

    // Try to find size options
    const sizeSelectors = [
      '[data-testid="size-option"]',
      '[class*="SizeSelector"] button',
      '[class*="size-selector"] button',
      '[aria-label*="size"]',
      '[class*="sizeOption"]',
      '[class*="SizeButton"]'
    ];

    for (const selector of sizeSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        elements.forEach(el => {
          const sizeText = el.textContent.trim();
          if (sizeText) {
            const isDisabled = el.disabled ||
                              el.classList.contains('disabled') ||
                              el.classList.contains('out-of-stock') ||
                              el.getAttribute('aria-disabled') === 'true';
            const isSelected = el.classList.contains('selected') ||
                              el.getAttribute('aria-checked') === 'true' ||
                              el.getAttribute('aria-pressed') === 'true';
            sizes.push({
              size: sizeText,
              available: !isDisabled,
              selected: isSelected
            });
          }
        });
        if (sizes.length > 0) break;
      }
    }

    return sizes;
  }

  function extractDescription() {
    const descSelectors = [
      '[data-testid="product-description"]',
      '[class*="ProductDescription"]',
      '.product-description',
      '[class*="product-details"]',
      '#product-description',
      '[itemprop="description"]'
    ];

    for (const selector of descSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim()) {
        // Clean up the description text
        let text = element.textContent.trim();
        // Remove excessive whitespace
        text = text.replace(/\s+/g, ' ');
        return text;
      }
    }

    // Try to get description from meta tag
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      return metaDesc.getAttribute('content');
    }

    return null;
  }

  function extractImages() {
    const images = [];
    const seen = new Set();

    // Try to find product images
    const imageSelectors = [
      '[data-testid="product-image"] img',
      '[class*="ProductImage"] img',
      '.product-image img',
      '[class*="gallery"] img',
      '[class*="carousel"] img',
      '[class*="pdp"] img[src*="product"]'
    ];

    for (const selector of imageSelectors) {
      const elements = document.querySelectorAll(selector);
      elements.forEach(img => {
        const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
        if (src && !seen.has(src) && !src.includes('placeholder')) {
          seen.add(src);
          images.push({
            url: src,
            alt: img.alt || ''
          });
        }
      });
    }

    // Also look for high-res images in srcset
    document.querySelectorAll('img[srcset]').forEach(img => {
      const srcset = img.getAttribute('srcset');
      if (srcset) {
        const sources = srcset.split(',').map(s => s.trim().split(' ')[0]);
        sources.forEach(src => {
          if (src && !seen.has(src) && src.includes('product')) {
            seen.add(src);
            images.push({ url: src, alt: img.alt || '' });
          }
        });
      }
    });

    return images;
  }

  function extractSKU() {
    // Try to find SKU/product ID
    const skuSelectors = [
      '[data-testid="product-sku"]',
      '[class*="sku"]',
      '[class*="product-id"]',
      '[itemprop="sku"]'
    ];

    for (const selector of skuSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim()) {
        return element.textContent.trim().replace(/^(SKU|Item|Product\s*#?):\s*/i, '');
      }
    }

    // Try to extract from URL
    const urlMatch = window.location.pathname.match(/\/([a-zA-Z0-9]+)(?:\?|$)/);
    if (urlMatch) {
      return urlMatch[1];
    }

    // Try to find in data attributes
    const productEl = document.querySelector('[data-product-id], [data-sku]');
    if (productEl) {
      return productEl.getAttribute('data-product-id') || productEl.getAttribute('data-sku');
    }

    return null;
  }

  function extractRating() {
    const ratingSelectors = [
      '[data-testid="product-rating"]',
      '[class*="rating"]',
      '[class*="Rating"]',
      '[itemprop="ratingValue"]'
    ];

    for (const selector of ratingSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const ratingText = element.textContent.trim();
        const ratingMatch = ratingText.match(/[\d.]+/);
        if (ratingMatch) {
          return parseFloat(ratingMatch[0]);
        }
        // Check for aria-label
        const ariaLabel = element.getAttribute('aria-label');
        if (ariaLabel) {
          const match = ariaLabel.match(/[\d.]+/);
          if (match) {
            return parseFloat(match[0]);
          }
        }
      }
    }
    return null;
  }

  function extractReviewCount() {
    const reviewSelectors = [
      '[data-testid="review-count"]',
      '[class*="reviewCount"]',
      '[class*="review-count"]',
      '[itemprop="reviewCount"]'
    ];

    for (const selector of reviewSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const text = element.textContent.trim();
        const match = text.match(/[\d,]+/);
        if (match) {
          return parseInt(match[0].replace(',', ''), 10);
        }
      }
    }
    return null;
  }

  function extractAvailability() {
    const availSelectors = [
      '[data-testid="availability"]',
      '[class*="availability"]',
      '[class*="stock"]',
      '[itemprop="availability"]'
    ];

    for (const selector of availSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const text = element.textContent.trim().toLowerCase();
        if (text.includes('in stock') || text.includes('available')) {
          return 'In Stock';
        } else if (text.includes('out of stock') || text.includes('unavailable')) {
          return 'Out of Stock';
        } else if (text.includes('limited')) {
          return 'Limited Stock';
        }
        return text;
      }
    }

    // Check for add to cart button as availability indicator
    const addToCart = document.querySelector('[data-testid="add-to-cart"], button[class*="add-to-cart"], button[class*="AddToCart"]');
    if (addToCart) {
      return addToCart.disabled ? 'Out of Stock' : 'In Stock';
    }

    return null;
  }

  console.log('Product Scraper content script loaded');
})();

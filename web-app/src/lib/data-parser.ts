/**
 * Data parsing utilities for extracted content
 *
 * Priority order:
 * 1. JSON array of objects (from extractData tool) - direct conversion to table
 * 2. JSON string that can be parsed to array - parse and convert
 * 3. HTML tables - regex extraction
 * 4. HTML products/articles - pattern matching
 * 5. CSV/TSV - delimiter detection
 * 6. Raw text fallback
 */

export interface ParsedData {
  type: 'table' | 'text';
  headers?: string[];
  rows?: string[][];
  text?: string;
}

/**
 * Parse extracted data and detect its structure
 * Prioritizes JSON arrays from LLM's extractData tool
 */
export function parseExtractedData(data: unknown): ParsedData {
  if (!data) {
    return { type: 'text', text: '' };
  }

  // Priority 1: Already an array of objects (from extractData tool)
  if (Array.isArray(data) && data.length > 0) {
    if (typeof data[0] === 'object' && data[0] !== null) {
      return parseArrayOfObjects(data as Record<string, unknown>[]);
    }
    // Array of primitives
    return {
      type: 'table',
      headers: ['Value'],
      rows: data.map(item => [String(item)]),
    };
  }

  // Priority 2: String that might be JSON
  if (typeof data === 'string') {
    const trimmed = data.trim();

    // Try to parse as JSON array first (LLM might return stringified JSON)
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (typeof parsed[0] === 'object' && parsed[0] !== null) {
            return parseArrayOfObjects(parsed as Record<string, unknown>[]);
          }
          return {
            type: 'table',
            headers: ['Value'],
            rows: parsed.map(item => [String(item)]),
          };
        }
      } catch {
        // Not valid JSON, continue to other parsers
      }
    }

    // Try HTML table
    if (trimmed.includes('<table') || trimmed.includes('<TABLE')) {
      const parsed = parseHtmlTable(trimmed);
      if (parsed.type === 'table' && parsed.rows && parsed.rows.length > 0) {
        return parsed;
      }
    }

    // Try to extract product/article elements from HTML
    if (trimmed.includes('<article') || trimmed.includes('<div')) {
      const parsed = parseHtmlProducts(trimmed);
      if (parsed.type === 'table' && parsed.rows && parsed.rows.length > 0) {
        return parsed;
      }
    }

    // Try CSV/TSV detection
    const delimitedResult = parseDelimitedText(trimmed);
    if (delimitedResult.type === 'table' && delimitedResult.rows && delimitedResult.rows.length > 1) {
      return delimitedResult;
    }

    // Fallback to raw text
    return { type: 'text', text: trimmed };
  }

  // Single object - convert to key-value table
  if (typeof data === 'object' && data !== null) {
    return parseObject(data as Record<string, unknown>);
  }

  // Fallback
  return { type: 'text', text: String(data) };
}

/**
 * Parse an array of objects into table format
 */
function parseArrayOfObjects(data: Record<string, unknown>[]): ParsedData {
  if (data.length === 0) {
    return { type: 'text', text: '' };
  }

  // Collect all unique keys from all objects
  const headersSet = new Set<string>();
  data.forEach(obj => {
    Object.keys(obj).forEach(key => headersSet.add(key));
  });
  const headers = Array.from(headersSet);

  // Build rows
  const rows = data.map(obj =>
    headers.map(header => {
      const value = obj[header];
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    })
  );

  return { type: 'table', headers, rows };
}

/**
 * Parse a single object into key-value table format
 */
function parseObject(data: Record<string, unknown>): ParsedData {
  const entries = Object.entries(data);
  if (entries.length === 0) {
    return { type: 'text', text: '{}' };
  }

  return {
    type: 'table',
    headers: ['Property', 'Value'],
    rows: entries.map(([key, value]) => {
      if (value === null || value === undefined) return [key, ''];
      if (typeof value === 'object') return [key, JSON.stringify(value)];
      return [key, String(value)];
    }),
  };
}

/**
 * Parse HTML with product/article elements into structured data
 * Handles common e-commerce patterns like <article class="product_pod">
 */
export function parseHtmlProducts(html: string): ParsedData {
  const products: Record<string, string>[] = [];

  // Pattern 1: article.product_pod (books.toscrape.com style)
  const articleRegex = /<article[^>]*class="[^"]*product[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  let articleMatch;

  while ((articleMatch = articleRegex.exec(html)) !== null) {
    const content = articleMatch[1];
    const product: Record<string, string> = {};

    // Extract title from h3 > a or title attribute
    const titleMatch = content.match(/title="([^"]+)"/i) ||
                       content.match(/<h[1-6][^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i) ||
                       content.match(/<h[1-6][^>]*>([^<]+)<\/h[1-6]>/i);
    if (titleMatch) {
      product['Title'] = stripHtml(titleMatch[1]).trim();
    }

    // Extract price
    const priceMatch = content.match(/class="[^"]*price[^"]*"[^>]*>([^<]+)</i) ||
                       content.match(/\$[\d,.]+|\£[\d,.]+|€[\d,.]+|[\d,.]+\s*(?:USD|EUR|GBP)/i);
    if (priceMatch) {
      product['Price'] = stripHtml(priceMatch[1] || priceMatch[0]).trim();
    }

    // Extract rating
    const ratingMatch = content.match(/class="[^"]*star-rating\s+(\w+)[^"]*"/i) ||
                        content.match(/rating[^>]*>([^<]+)</i);
    if (ratingMatch) {
      product['Rating'] = ratingMatch[1].trim();
    }

    // Extract availability/stock
    const stockMatch = content.match(/class="[^"]*availability[^"]*"[^>]*>[\s\S]*?<i[^>]*><\/i>\s*([^<]+)</i) ||
                       content.match(/class="[^"]*stock[^"]*"[^>]*>([^<]+)</i) ||
                       content.match(/(in stock|out of stock|available|unavailable)/i);
    if (stockMatch) {
      product['Stock'] = stripHtml(stockMatch[1]).trim();
    }

    // Extract image URL
    const imgMatch = content.match(/<img[^>]*src="([^"]+)"/i);
    if (imgMatch) {
      product['Image'] = imgMatch[1].trim();
    }

    // Only add if we found at least title or price
    if (product['Title'] || product['Price']) {
      products.push(product);
    }
  }

  // Pattern 2: div.product or li.product (common e-commerce pattern)
  if (products.length === 0) {
    const divRegex = /<(?:div|li)[^>]*class="[^"]*product[^"]*"[^>]*>([\s\S]*?)<\/(?:div|li)>/gi;
    let divMatch;

    while ((divMatch = divRegex.exec(html)) !== null) {
      const content = divMatch[1];
      const product: Record<string, string> = {};

      // Extract title
      const titleMatch = content.match(/<(?:h[1-6]|a|span)[^>]*class="[^"]*(?:title|name|product-name)[^"]*"[^>]*>([^<]+)</i) ||
                         content.match(/<a[^>]*>([^<]{5,})<\/a>/i);
      if (titleMatch) {
        product['Title'] = stripHtml(titleMatch[1]).trim();
      }

      // Extract price
      const priceMatch = content.match(/class="[^"]*price[^"]*"[^>]*>([^<]+)</i) ||
                         content.match(/\$[\d,.]+|\£[\d,.]+|€[\d,.]+/);
      if (priceMatch) {
        product['Price'] = stripHtml(priceMatch[1] || priceMatch[0]).trim();
      }

      if (product['Title'] || product['Price']) {
        products.push(product);
      }
    }
  }

  if (products.length === 0) {
    return { type: 'text', text: html };
  }

  // Convert to table format
  const headersSet = new Set<string>();
  products.forEach(p => Object.keys(p).forEach(k => headersSet.add(k)));
  const headers = Array.from(headersSet);

  const rows = products.map(product =>
    headers.map(h => product[h] || '')
  );

  return { type: 'table', headers, rows };
}

/**
 * Parse HTML table string into structured data
 */
export function parseHtmlTable(html: string): ParsedData {
  // Simple regex-based parser for HTML tables
  const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) {
    return { type: 'text', text: html };
  }

  const tableContent = tableMatch[1];

  // Extract headers from th elements
  const headers: string[] = [];
  const thRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
  let thMatch;
  while ((thMatch = thRegex.exec(tableContent)) !== null) {
    headers.push(stripHtml(thMatch[1]).trim());
  }

  // Extract rows
  const rows: string[][] = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRegex.exec(tableContent)) !== null) {
    const rowContent = trMatch[1];
    const cells: string[] = [];
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdMatch;
    while ((tdMatch = tdRegex.exec(rowContent)) !== null) {
      cells.push(stripHtml(tdMatch[1]).trim());
    }
    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  // If no headers found but we have rows, use first row as headers
  if (headers.length === 0 && rows.length > 0) {
    const firstRow = rows.shift()!;
    return {
      type: 'table',
      headers: firstRow,
      rows,
    };
  }

  if (rows.length === 0) {
    return { type: 'text', text: html };
  }

  return { type: 'table', headers, rows };
}

/**
 * Parse CSV or TSV text into structured data
 */
export function parseDelimitedText(text: string): ParsedData {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) {
    return { type: 'text', text };
  }

  // Detect delimiter (comma, tab, semicolon, pipe)
  const delimiters = ['\t', ',', ';', '|'];
  let bestDelimiter = ',';
  let maxConsistency = 0;

  for (const delimiter of delimiters) {
    const counts = lines.map(line => countDelimiter(line, delimiter));
    const firstCount = counts[0];
    if (firstCount === 0) continue;

    // Check consistency
    const consistent = counts.filter(c => c === firstCount).length;
    if (consistent > maxConsistency && firstCount >= 1) {
      maxConsistency = consistent;
      bestDelimiter = delimiter;
    }
  }

  // Parse with detected delimiter
  const firstLineCount = countDelimiter(lines[0], bestDelimiter);
  if (firstLineCount === 0) {
    return { type: 'text', text };
  }

  const parsedRows = lines.map(line => parseCsvLine(line, bestDelimiter));

  // Verify consistency
  const columnCount = parsedRows[0].length;
  const consistentRows = parsedRows.filter(row => row.length === columnCount);
  if (consistentRows.length < lines.length * 0.8) {
    return { type: 'text', text };
  }

  // First row as headers
  const headers = consistentRows.shift()!;
  return {
    type: 'table',
    headers,
    rows: consistentRows,
  };
}

/**
 * Count occurrences of a delimiter in a line (considering quoted strings)
 */
function countDelimiter(line: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      count++;
    }
  }
  return count;
}

/**
 * Parse a single CSV line respecting quoted fields
 */
function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());

  return result;
}

/**
 * Strip HTML tags from a string
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

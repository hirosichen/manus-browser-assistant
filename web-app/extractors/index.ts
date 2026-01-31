/**
 * Extractors Index
 * Auto-generated - do not edit manually
 *
 * This file serves as the entry point for all generated extractors.
 * New extractors are added here when created via the generateExtractor tool.
 */

// Placeholder type for extractor modules
export interface ExtractorModule {
  config: {
    name: string;
    urlPattern: RegExp;
    selectors: {
      container: string;
      [key: string]: string;
    };
  };
  extract: (page: unknown) => Promise<Record<string, string>[]>;
  matches: (url: string) => boolean;
  validate: (data: Record<string, string>[]) => { valid: boolean; issues: string[] };
}

// Registry of available extractors
// Add imports here as extractors are generated
export const extractors: Record<string, ExtractorModule> = {
  // Example:
  // 'books-toscrape': require('./books-toscrape'),
};

/**
 * Get an extractor by name
 */
export function getExtractor(name: string): ExtractorModule | undefined {
  return extractors[name];
}

/**
 * Find an extractor that matches a URL
 */
export function findExtractorForUrl(url: string): ExtractorModule | undefined {
  return Object.values(extractors).find(extractor => extractor.matches(url));
}

/**
 * List all available extractor names
 */
export function listExtractors(): string[] {
  return Object.keys(extractors);
}

/**
 * Check if an extractor exists
 */
export function hasExtractor(name: string): boolean {
  return name in extractors;
}

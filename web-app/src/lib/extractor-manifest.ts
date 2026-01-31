/**
 * Extractor Manifest Management
 *
 * Manages the manifest.json file that tracks all available extractors.
 * This allows the LLM to discover and reuse existing extractors.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

const MANIFEST_PATH = './extractors/manifest.json';

export interface ExtractorEntry {
  name: string;
  urlPattern: string;
  fields: string[];
  createdAt: string;
}

export interface ExtractorManifest {
  extractors: ExtractorEntry[];
}

/**
 * Load the extractor manifest from disk
 * Returns an empty manifest if the file doesn't exist
 */
export async function loadManifest(): Promise<ExtractorManifest> {
  try {
    const content = await fs.readFile(MANIFEST_PATH, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { extractors: [] };
  }
}

/**
 * Save the extractor manifest to disk
 */
export async function saveManifest(manifest: ExtractorManifest): Promise<void> {
  // Ensure the directory exists
  const dir = path.dirname(MANIFEST_PATH);
  await fs.mkdir(dir, { recursive: true });

  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8');
}

/**
 * Add a new extractor entry to the manifest
 * Will not add duplicates (checks by name)
 */
export async function addExtractorToManifest(entry: ExtractorEntry): Promise<void> {
  const manifest = await loadManifest();

  // Check if extractor already exists
  const existingIndex = manifest.extractors.findIndex(e => e.name === entry.name);

  if (existingIndex >= 0) {
    // Update existing entry
    manifest.extractors[existingIndex] = entry;
  } else {
    // Add new entry
    manifest.extractors.push(entry);
  }

  await saveManifest(manifest);
}

/**
 * Find an extractor that matches a URL
 */
export function findExtractorByUrl(
  manifest: ExtractorManifest,
  url: string
): ExtractorEntry | undefined {
  return manifest.extractors.find(e => url.includes(e.urlPattern));
}

/**
 * Get an extractor by name
 */
export function getExtractorByName(
  manifest: ExtractorManifest,
  name: string
): ExtractorEntry | undefined {
  return manifest.extractors.find(e => e.name === name);
}

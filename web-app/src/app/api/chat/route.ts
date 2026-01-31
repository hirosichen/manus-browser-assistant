import { anthropic } from '@ai-sdk/anthropic';
import { streamText, tool, convertToModelMessages, stepCountIs } from 'ai';
import { z } from 'zod';
import { validateExtraction, formatValidationMessage } from '@/lib/extraction-validator';
import { generateExtractorCode, slugify } from '@/lib/extractor-generator';
import { loadManifest, addExtractorToManifest, findExtractorByUrl, getExtractorByName } from '@/lib/extractor-manifest';
import * as fs from 'fs/promises';

export const maxDuration = 120;

export async function POST(req: Request) {
  const { messages } = await req.json();

  // Convert UI messages (with 'parts') to model messages (with 'content')
  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    // Limit to 4 steps to prevent runaway loops
    stopWhen: stepCountIs(4),
    system: `You are Manus, a fast browser assistant. Be CONCISE. Minimize tool calls.

RULES:
- User sees LIVE PREVIEW - no screenshots needed
- Short responses only

=== EXTRACTION WORKFLOW ===

**ALWAYS CHECK FOR EXISTING EXTRACTORS FIRST:**

1. CHECK EXISTING:
   - Call extractors({action: 'find', url: currentUrl})
   - If match found → Use existing extractor's field names
   - If no match → Continue to manual extraction

2. UNDERSTAND USER REQUEST:
   - Identify expected columns (e.g., "title and price" → ["title", "price"])
   - Identify expected row count (e.g., "3 books" → 3)

3. EXTRACT DATA:
   - Call extract({selector: "body", type: "text"}) - ALWAYS use "body" selector
   - Parse the content

4. VALIDATE AND REPORT:
   - Call extractData() with:
     * data: the extracted rows as array of objects
     * expectedColumns: columns user asked for (e.g., ["title", "price"])
     * expectedMinRows: minimum rows if specified (e.g., 3)
     * source: optional description of source

5. HANDLE VALIDATION RESULT:
   - If success: confirm to user
   - If issues with severity "error": inform user, ask if they want to retry
   - If issues with severity "warning": show data with warnings

6. GENERATE EXTRACTOR (only if new):
   - If validation passed AND no existing extractor found
   - Call generateExtractor() to save for future use
   - Skip if extractor already exists for this URL pattern

Example flow:
User: "Extract books from books.toscrape.com"
→ extractors({action: 'find', url: 'books.toscrape.com'})
→ Found! Fields: [title, price]
→ extract({selector: 'body'})
→ extractData({data: [...], expectedColumns: ['title', 'price']})
→ Done (no need to generate, already exists)

VIOLATIONS (NEVER DO THESE):
- Calling extract() twice with different selectors
- Saying "let me try again" or "let me try a different selector"
- Complaining that data is incomplete or selectors don't match
- Calling generateExtractor when an extractor already exists for the URL

If extract returns little/no data, still call extractData with what you have and explain to the user.`,
    messages: modelMessages,
    tools: {
      navigate: tool({
        description: 'Navigate to URL',
        inputSchema: z.object({
          url: z.string(),
        }),
      }),
      click: tool({
        description: 'Click element',
        inputSchema: z.object({
          selector: z.string(),
        }),
      }),
      type: tool({
        description: 'Type into input',
        inputSchema: z.object({
          selector: z.string(),
          text: z.string(),
        }),
      }),
      scroll: tool({
        description: 'Scroll page',
        inputSchema: z.object({
          direction: z.enum(['up', 'down']),
          amount: z.number(),
        }),
      }),
      extract: tool({
        description: 'Extract content. Use specific CSS selector. Content auto-truncated to save tokens.',
        inputSchema: z.object({
          selector: z.string().describe('CSS selector - be specific'),
          type: z.enum(['html', 'text']).default('text'),
        }),
      }),
      extractData: tool({
        description: 'Report and validate extracted data. Include expectedColumns and expectedMinRows for validation.',
        inputSchema: z.object({
          data: z.array(z.record(z.string(), z.string())),
          expectedColumns: z.array(z.string()).optional()
            .describe('Columns user asked for, e.g., ["title", "price"]'),
          expectedMinRows: z.number().optional()
            .describe('Minimum rows user requested'),
          source: z.string().optional(),
        }),
        outputSchema: z.object({
          success: z.boolean(),
          rowCount: z.number(),
          validRowCount: z.number(),
          validation: z.object({
            isValid: z.boolean(),
            issues: z.array(z.object({
              type: z.string(),
              message: z.string(),
              severity: z.enum(['error', 'warning']),
            })),
          }),
          message: z.string(),
        }),
        execute: async ({ data, expectedColumns, expectedMinRows }) => {
          // Validate the extraction
          const validation = validateExtraction({
            data,
            expectedColumns,
            expectedMinRows,
          });

          return {
            success: validation.isValid,
            rowCount: data.length,
            validRowCount: validation.validRows,
            validation: {
              isValid: validation.isValid,
              issues: validation.issues.map(i => ({
                type: i.type,
                message: i.message,
                severity: i.severity,
              })),
            },
            message: formatValidationMessage(validation),
          };
        },
      }),
      wait: tool({
        description: 'Wait seconds',
        inputSchema: z.object({
          seconds: z.number().min(0.1).max(5),
        }),
      }),
      extractors: tool({
        description: 'Manage extractors: list all, find matching URL, or get extractor details',
        inputSchema: z.object({
          action: z.enum(['list', 'find', 'get']),
          url: z.string().optional().describe('URL to match (for find action)'),
          name: z.string().optional().describe('Extractor name (for get action)'),
        }),
        outputSchema: z.object({
          extractors: z.array(z.object({
            name: z.string(),
            urlPattern: z.string(),
            fields: z.array(z.string()),
          })).optional(),
          matched: z.object({
            name: z.string(),
            urlPattern: z.string(),
            fields: z.array(z.string()),
          }).nullable().optional(),
          message: z.string(),
        }),
        execute: async ({ action, url, name }) => {
          const manifest = await loadManifest();

          switch (action) {
            case 'list':
              return {
                extractors: manifest.extractors.map(e => ({
                  name: e.name,
                  urlPattern: e.urlPattern,
                  fields: e.fields,
                })),
                message: `Found ${manifest.extractors.length} extractor(s)`,
              };
            case 'find':
              if (!url) {
                return { message: 'URL is required for find action', matched: null };
              }
              const matchedByUrl = findExtractorByUrl(manifest, url);
              return {
                matched: matchedByUrl ? {
                  name: matchedByUrl.name,
                  urlPattern: matchedByUrl.urlPattern,
                  fields: matchedByUrl.fields,
                } : null,
                message: matchedByUrl
                  ? `Found extractor: ${matchedByUrl.name} with fields: ${matchedByUrl.fields.join(', ')}`
                  : 'No matching extractor found',
              };
            case 'get':
              if (!name) {
                return { message: 'Name is required for get action', matched: null };
              }
              const matchedByName = getExtractorByName(manifest, name);
              return {
                matched: matchedByName ? {
                  name: matchedByName.name,
                  urlPattern: matchedByName.urlPattern,
                  fields: matchedByName.fields,
                } : null,
                message: matchedByName
                  ? `Extractor details for ${name}`
                  : 'Extractor not found',
              };
            default:
              return { message: 'Invalid action' };
          }
        },
      }),
      generateExtractor: tool({
        description: 'Generate reusable extractor code after successful validation. Only call after extractData validation passes.',
        inputSchema: z.object({
          name: z.string().describe('Human-readable name for the extractor, e.g., "Books to Scrape"'),
          urlPattern: z.string().describe('URL pattern or domain to match, e.g., "books.toscrape.com"'),
          selectors: z.object({
            container: z.string().describe('CSS selector for the container element'),
            fields: z.record(z.string(), z.string()).describe('Field name to CSS selector mapping'),
          }),
          dataTypes: z.record(z.string(), z.enum(['string', 'number', 'boolean'])).optional()
            .describe('Optional type hints for fields'),
        }),
        outputSchema: z.object({
          success: z.boolean(),
          filename: z.string().optional(),
          filepath: z.string().optional(),
          message: z.string(),
        }),
        execute: async ({ name, urlPattern, selectors, dataTypes }) => {
          try {
            const code = generateExtractorCode({
              name,
              urlPattern,
              selectors,
              dataTypes,
            });

            const extractorName = slugify(name);
            const filename = `${extractorName}.ts`;
            const filepath = `./extractors/${filename}`;

            // Write the extractor file
            await fs.writeFile(filepath, code, 'utf-8');

            // Update the manifest
            await addExtractorToManifest({
              name: extractorName,
              urlPattern,
              fields: Object.keys(selectors.fields),
              createdAt: new Date().toISOString().split('T')[0],
            });

            return {
              success: true,
              filename,
              filepath,
              message: `Extractor saved to ${filepath} and registered in manifest`,
            };
          } catch (error) {
            return {
              success: false,
              filename: undefined,
              filepath: undefined,
              message: `Failed to generate extractor: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
          }
        },
      }),
    },
  });

  return result.toUIMessageStreamResponse({
    messageMetadata: ({ part }) => {
      // Only extract usage on finish event
      if (part.type === 'finish' && 'totalUsage' in part) {
        const totalUsage = part.totalUsage as { inputTokens?: number; outputTokens?: number; totalTokens?: number };
        return {
          usage: {
            inputTokens: totalUsage.inputTokens ?? 0,
            outputTokens: totalUsage.outputTokens ?? 0,
            totalTokens: totalUsage.totalTokens ?? 0,
          },
        };
      }
      return undefined;
    },
  });
}

import { anthropic } from '@ai-sdk/anthropic';
import { streamText, tool, convertToModelMessages, stepCountIs } from 'ai';
import { z } from 'zod';

export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages } = await req.json();

  // Convert UI messages (with 'parts') to model messages (with 'content')
  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    // Allow up to 10 consecutive tool calls before stopping
    stopWhen: stepCountIs(10),
    system: `You are Manus, an AI browser assistant that can help users navigate and interact with web pages.

You have access to browser control tools that allow you to:
- Navigate to URLs
- Click on elements
- Type text into inputs
- Scroll the page
- Extract content from pages
- Wait for pages to load

IMPORTANT: A live preview is continuously streaming the browser state to the user interface. You do NOT need to take screenshots after each action - the user can already see the current page state in real-time through the live preview.

When a user asks you to do something on the web:
1. Think about what steps are needed
2. Use the appropriate tools to accomplish the task
3. The live preview will automatically show the result of your actions
4. Continue until the task is complete

Always explain what you're doing and why. Be helpful and efficient.

If a tool execution fails, explain the error and try an alternative approach.`,
    messages: modelMessages,
    tools: {
      navigate: tool({
        description: 'Navigate the browser to a specific URL',
        inputSchema: z.object({
          url: z.string().describe('The URL to navigate to'),
        }),
      }),
      click: tool({
        description: 'Click on an element on the page',
        inputSchema: z.object({
          selector: z.string().describe('CSS selector of the element to click'),
        }),
      }),
      type: tool({
        description: 'Type text into an input field',
        inputSchema: z.object({
          selector: z.string().describe('CSS selector of the input field'),
          text: z.string().describe('Text to type'),
        }),
      }),
      scroll: tool({
        description: 'Scroll the page in a direction',
        inputSchema: z.object({
          direction: z.enum(['up', 'down']).describe('Direction to scroll'),
          amount: z.number().describe('Amount to scroll in pixels'),
        }),
      }),
      extract: tool({
        description: 'Extract HTML content or text from the page',
        inputSchema: z.object({
          selector: z.string().optional().describe('CSS selector to extract from (optional, extracts whole page if not provided)'),
          type: z.enum(['html', 'text']).default('text').describe('Type of content to extract'),
        }),
      }),
      wait: tool({
        description: 'Wait for a specified number of seconds',
        inputSchema: z.object({
          seconds: z.number().min(0.1).max(10).describe('Number of seconds to wait'),
        }),
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}

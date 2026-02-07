import { z } from 'zod';
import type { Tool } from '../types.js';

const WebFetchInput = z.object({
  url: z.string().url().describe('URL to fetch'),
  maxLength: z.number().optional().describe('Max response length in chars (default: 10000)'),
});

type WebFetchInput = z.infer<typeof WebFetchInput>;

export const webFetchTool: Tool<WebFetchInput, string> = {
  name: 'web_fetch',
  description: 'Fetch content from a URL',
  parameters: WebFetchInput,
  requiredPermission: 'web',
  async execute(input, _ctx) {
    const response = await fetch(input.url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    let text = await response.text();
    const maxLen = input.maxLength ?? 10000;
    if (text.length > maxLen) {
      text = `${text.slice(0, maxLen)}\n\n[Truncated at ${maxLen} chars]`;
    }

    return text;
  },
};

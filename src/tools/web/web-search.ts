import { z } from 'zod'
import type { Tool } from '../types.js'

const WebSearchInput = z.object({
    query: z.string().describe('Search query'),
    maxResults: z.number().optional().describe('Max results (default: 5)'),
})

type WebSearchInput = z.infer<typeof WebSearchInput>

// Placeholder: In production this would use a search API
export const webSearchTool: Tool<WebSearchInput, string> = {
    name: 'web_search',
    description: 'Search the web for information',
    parameters: WebSearchInput,
    requiredPermission: 'web',
    async execute(input, _ctx) {
        // TODO: Integrate with a search provider (SearXNG, Brave, etc.)
        return `[Web search placeholder] Query: "${input.query}" — Integration pending`
    },
}

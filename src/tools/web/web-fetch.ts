import { gfm } from '@truto/turndown-plugin-gfm'
import TurndownService from 'turndown'
import { z } from 'zod'
import type { Tool } from '../types.js'

const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
})
turndown.use(gfm)
turndown.remove(['script', 'style', 'nav', 'footer', 'header', 'aside', 'iframe', 'noscript'])

const cache = new Map<string, { content: string; timestamp: number }>()
const CACHE_TTL = 15 * 60 * 1000
const MAX_CACHE_SIZE = 100

function getCached(url: string): string | null {
    const entry = cache.get(url)
    if (!entry) return null
    if (Date.now() - entry.timestamp > CACHE_TTL) {
        cache.delete(url)
        return null
    }
    return entry.content
}

function setCache(url: string, content: string): void {
    const now = Date.now()
    // Evict expired entries when at capacity
    if (cache.size >= MAX_CACHE_SIZE) {
        for (const [key, entry] of cache) {
            if (now - entry.timestamp > CACHE_TTL) cache.delete(key)
        }
    }
    // If still at capacity, remove oldest entry
    if (cache.size >= MAX_CACHE_SIZE) {
        const oldest = cache.keys().next().value
        if (oldest) cache.delete(oldest)
    }
    cache.set(url, { content, timestamp: now })
}

const WebFetchInput = z.object({
    url: z.string().url().describe('URL to fetch'),
    maxLength: z.number().optional().describe('Max response length in chars (default: 50000)'),
    raw: z.boolean().optional().describe('Return raw HTML without markdown conversion (default: false)'),
})

type WebFetchInput = z.infer<typeof WebFetchInput>

export const webFetchTool: Tool<WebFetchInput, string> = {
    name: 'web_fetch',
    description: 'Fetch content from a URL and convert HTML to Markdown for efficient processing',
    parameters: WebFetchInput,
    requiredPermission: 'web',
    async execute(input, _ctx) {
        const cached = getCached(input.url)
        if (cached) return cached

        const response = await fetch(input.url, {
            headers: { 'User-Agent': 'ValarMindCode/1.0 (Research Agent)' },
            signal: AbortSignal.timeout(15000),
        })

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const contentType = response.headers.get('content-type') ?? ''
        let text = await response.text()

        if (!input.raw && contentType.includes('text/html')) {
            text = turndown.turndown(text)
        }

        const maxLen = input.maxLength ?? 50000
        if (text.length > maxLen) {
            text = `${text.slice(0, maxLen)}\n\n[Content truncated at ${maxLen} chars]`
        }

        setCache(input.url, text)

        return text
    },
}

/** Exported for testing */
export { cache, CACHE_TTL, MAX_CACHE_SIZE }

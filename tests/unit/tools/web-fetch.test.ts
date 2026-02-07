import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { webFetchTool, cache } from '../../../src/tools/web/web-fetch.js'
import type { ToolContext } from '../../../src/tools/types.js'

const dummyCtx: ToolContext = {
    fs: {} as never,
    cwd: '/test',
    agentType: 'research',
}

// Save original fetch
const originalFetch = globalThis.fetch

function mockFetch(body: string, contentType = 'text/html', status = 200) {
    globalThis.fetch = mock(async () => ({
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : 'Not Found',
        headers: new Headers({ 'content-type': contentType }),
        text: async () => body,
    })) as any
}

describe('webFetchTool', () => {
    beforeEach(() => {
        cache.clear()
        globalThis.fetch = originalFetch
    })

    it('converts HTML to Markdown', async () => {
        mockFetch('<html><body><h1>Hello</h1><p>World</p></body></html>')
        const result = await webFetchTool.execute({ url: 'https://example.com' }, dummyCtx)
        expect(result).toContain('# Hello')
        expect(result).toContain('World')
    })

    it('removes script and style tags', async () => {
        mockFetch('<html><head><style>body{}</style></head><body><script>alert(1)</script><p>Content</p></body></html>')
        const result = await webFetchTool.execute({ url: 'https://example.com/safe' }, dummyCtx)
        expect(result).not.toContain('alert')
        expect(result).not.toContain('body{}')
        expect(result).toContain('Content')
    })

    it('truncates long content', async () => {
        const longContent = '<html><body><p>' + 'a'.repeat(200) + '</p></body></html>'
        mockFetch(longContent)
        const result = await webFetchTool.execute({ url: 'https://example.com/long', maxLength: 50 }, dummyCtx)
        expect(result.length).toBeLessThanOrEqual(100) // 50 chars + truncation message
        expect(result).toContain('[Content truncated at 50 chars]')
    })

    it('returns raw HTML when raw=true', async () => {
        const html = '<html><body><h1>Title</h1></body></html>'
        mockFetch(html)
        const result = await webFetchTool.execute({ url: 'https://example.com/raw', raw: true }, dummyCtx)
        expect(result).toContain('<h1>Title</h1>')
    })

    it('does not convert non-HTML content', async () => {
        const jsonContent = '{"key": "value"}'
        mockFetch(jsonContent, 'application/json')
        const result = await webFetchTool.execute({ url: 'https://example.com/api' }, dummyCtx)
        expect(result).toBe(jsonContent)
    })

    it('uses cache for repeated requests', async () => {
        mockFetch('<html><body><p>Cached</p></body></html>')
        const url = 'https://example.com/cached'

        const result1 = await webFetchTool.execute({ url }, dummyCtx)
        const result2 = await webFetchTool.execute({ url }, dummyCtx)

        expect(result1).toBe(result2)
        // fetch should only be called once
        expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    })

    it('throws on HTTP errors', async () => {
        mockFetch('Not Found', 'text/html', 404)
        await expect(
            webFetchTool.execute({ url: 'https://example.com/404' }, dummyCtx)
        ).rejects.toThrow('HTTP 404')
    })

    it('converts lists to markdown', async () => {
        mockFetch('<html><body><ul><li>Item 1</li><li>Item 2</li></ul></body></html>')
        const result = await webFetchTool.execute({ url: 'https://example.com/list' }, dummyCtx)
        expect(result).toMatch(/-\s+Item 1/)
        expect(result).toMatch(/-\s+Item 2/)
    })
})

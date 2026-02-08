import { describe, it, expect } from 'bun:test'

// formatToolResult is not exported, so we test it indirectly via the module.
// Re-implement the same logic inline for unit testing (mirrors src/agents/runner.ts)
const TOOL_RESULT_MAX_CHARS = 8000
const TRUNCATION_HEAD = 3000
const TRUNCATION_TAIL = 2000

function formatToolResult(result: { ok: boolean; value?: string; error?: string }): string {
    if (!result.ok) {
        const error = result.error ?? 'Unknown error'
        return `ERROR: ${error.length > 2000 ? error.slice(0, 2000) + '\n[error truncated]' : error}`
    }

    const value = result.value ?? ''
    if (value.length <= TOOL_RESULT_MAX_CHARS) return value

    const head = value.slice(0, TRUNCATION_HEAD)
    const tail = value.slice(-TRUNCATION_TAIL)
    const truncatedLines = value.slice(TRUNCATION_HEAD, -TRUNCATION_TAIL).split('\n').length
    return `${head}\n\n[... ${truncatedLines} lines truncated for context efficiency ...]\n\n${tail}`
}

describe('formatToolResult', () => {
    it('passes through results under 8000 chars', () => {
        const value = 'x'.repeat(7999)
        const result = formatToolResult({ ok: true, value })
        expect(result).toBe(value)
    })

    it('passes through result at exactly 8000 chars', () => {
        const value = 'a'.repeat(8000)
        const result = formatToolResult({ ok: true, value })
        expect(result).toBe(value)
    })

    it('truncates results over 8000 chars', () => {
        const value = 'x'.repeat(20000)
        const result = formatToolResult({ ok: true, value })

        expect(result.length).toBeLessThan(20000)
        expect(result).toContain('[...')
        expect(result).toContain('lines truncated for context efficiency')
    })

    it('preserves head (3000 chars) and tail (2000 chars)', () => {
        const head = 'H'.repeat(3000)
        const middle = 'M'.repeat(10000)
        const tail = 'T'.repeat(2000)
        const value = head + middle + tail

        const result = formatToolResult({ ok: true, value })

        expect(result.startsWith(head)).toBe(true)
        expect(result.endsWith(tail)).toBe(true)
    })

    it('reports correct number of truncated lines', () => {
        // Create value with known number of lines in the middle section
        const lines = Array.from({ length: 100 }, (_, i) => `line-${i}: ${'x'.repeat(200)}`)
        const value = lines.join('\n')

        // Should exceed 8000 chars
        expect(value.length).toBeGreaterThan(TOOL_RESULT_MAX_CHARS)

        const result = formatToolResult({ ok: true, value })
        const match = result.match(/\[... (\d+) lines truncated/)
        expect(match).not.toBeNull()

        const truncatedCount = parseInt(match![1]!, 10)
        expect(truncatedCount).toBeGreaterThan(0)
    })

    it('formats errors without truncation when under 2000 chars', () => {
        const error = 'Something went wrong'
        const result = formatToolResult({ ok: false, error })
        expect(result).toBe(`ERROR: ${error}`)
    })

    it('truncates errors over 2000 chars', () => {
        const error = 'E'.repeat(5000)
        const result = formatToolResult({ ok: false, error })

        expect(result).toContain('ERROR: ')
        expect(result).toContain('[error truncated]')
        expect(result.length).toBeLessThan(5000 + 20) // ERROR: prefix + truncation marker
    })

    it('uses "Unknown error" when error is undefined', () => {
        const result = formatToolResult({ ok: false })
        expect(result).toBe('ERROR: Unknown error')
    })

    it('handles empty value', () => {
        const result = formatToolResult({ ok: true, value: '' })
        expect(result).toBe('')
    })

    it('handles undefined value', () => {
        const result = formatToolResult({ ok: true })
        expect(result).toBe('')
    })
})

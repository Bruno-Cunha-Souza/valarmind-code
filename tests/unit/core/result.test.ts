import { describe, it, expect } from 'bun:test'
import { ok, err, type Result } from '../../../src/core/result.js'

describe('Result', () => {
    it('ok creates success result', () => {
        const result = ok(42)
        expect(result.ok).toBe(true)
        if (result.ok) expect(result.value).toBe(42)
    })

    it('err creates failure result', () => {
        const result = err('something failed')
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.error).toBe('something failed')
    })

    it('works with type narrowing', () => {
        const result: Result<number> = ok(10)
        if (result.ok) {
            const value: number = result.value
            expect(value).toBe(10)
        }
    })
})

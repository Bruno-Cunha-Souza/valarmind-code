import { describe, it, expect, mock } from 'bun:test'
import { withRetry, CircuitBreaker } from '../../../src/llm/retry.js'
import { TransientError, PermanentError } from '../../../src/core/errors.js'

describe('withRetry', () => {
    it('returns on first success', async () => {
        const fn = mock(() => Promise.resolve('ok'))
        const result = await withRetry(fn, { maxRetries: 3, baseDelay: 10, maxDelay: 100 })
        expect(result).toBe('ok')
        expect(fn.mock.calls.length).toBe(1)
    })

    it('retries on transient error', async () => {
        let callCount = 0
        const fn = mock(() => {
            callCount++
            if (callCount === 1) return Promise.reject(new TransientError('timeout'))
            return Promise.resolve('recovered')
        })

        const result = await withRetry(fn, { maxRetries: 3, baseDelay: 10, maxDelay: 100 })
        expect(result).toBe('recovered')
        expect(fn.mock.calls.length).toBe(2)
    })

    it('throws immediately on permanent error', async () => {
        const fn = mock(() => Promise.reject(new PermanentError('invalid key')))
        await expect(withRetry(fn, { maxRetries: 3, baseDelay: 10, maxDelay: 100 })).rejects.toThrow('invalid key')
        expect(fn.mock.calls.length).toBe(1)
    })

    it('throws after max retries', async () => {
        const fn = mock(() => Promise.reject(new TransientError('timeout')))
        await expect(withRetry(fn, { maxRetries: 2, baseDelay: 10, maxDelay: 100 })).rejects.toThrow('timeout')
        expect(fn.mock.calls.length).toBe(3) // initial + 2 retries
    })
})

describe('CircuitBreaker', () => {
    it('starts in closed state', () => {
        const breaker = new CircuitBreaker()
        expect(breaker.getState()).toBe('closed')
    })

    it('opens after threshold failures', async () => {
        const breaker = new CircuitBreaker(2, 100)
        const fail = () => Promise.reject(new Error('fail'))

        await expect(breaker.execute(fail)).rejects.toThrow()
        await expect(breaker.execute(fail)).rejects.toThrow()
        expect(breaker.getState()).toBe('open')

        await expect(breaker.execute(fail)).rejects.toThrow('Circuit breaker is open')
    })

    it('recovers after cooldown', async () => {
        const breaker = new CircuitBreaker(1, 50)
        await expect(breaker.execute(() => Promise.reject(new Error('x')))).rejects.toThrow()
        expect(breaker.getState()).toBe('open')

        await new Promise((r) => setTimeout(r, 60))
        const result = await breaker.execute(() => Promise.resolve('ok'))
        expect(result).toBe('ok')
        expect(breaker.getState()).toBe('closed')
    })
})

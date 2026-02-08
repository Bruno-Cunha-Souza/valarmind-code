import { describe, it, expect } from 'bun:test'
import { ValarMindError, TransientError, PermanentError, classifyError, classifyHttpError, isAbortError } from '../../../src/core/errors.js'

describe('Error classification', () => {
    it('classifies 429 as transient', () => {
        expect(classifyHttpError(429)).toBe('transient')
    })

    it('classifies 500-504 as transient', () => {
        for (const status of [500, 502, 503, 504]) {
            expect(classifyHttpError(status)).toBe('transient')
        }
    })

    it('classifies 401, 403, 400 as permanent', () => {
        for (const status of [400, 401, 403, 404]) {
            expect(classifyHttpError(status)).toBe('permanent')
        }
    })

    it('classifies TransientError correctly', () => {
        expect(classifyError(new TransientError('timeout'))).toBe('transient')
    })

    it('classifies PermanentError correctly', () => {
        expect(classifyError(new PermanentError('invalid key'))).toBe('permanent')
    })

    it('classifies fetch TypeError as transient', () => {
        expect(classifyError(new TypeError('fetch failed'))).toBe('transient')
    })

    it('classifies unknown error as permanent', () => {
        expect(classifyError(new Error('unknown'))).toBe('permanent')
    })

    it('classifies object with status', () => {
        expect(classifyError({ status: 429 })).toBe('transient')
        expect(classifyError({ status: 401 })).toBe('permanent')
    })
})

describe('isAbortError', () => {
    it('detects DOMException with name AbortError', () => {
        const err = new DOMException('The operation was aborted', 'AbortError')
        expect(isAbortError(err)).toBe(true)
    })

    it('detects Error with name AbortError', () => {
        const err = new Error('Request was aborted')
        err.name = 'AbortError'
        expect(isAbortError(err)).toBe(true)
    })

    it('returns false for generic Error', () => {
        expect(isAbortError(new Error('some error'))).toBe(false)
    })

    it('returns false for null/undefined', () => {
        expect(isAbortError(null)).toBe(false)
        expect(isAbortError(undefined)).toBe(false)
    })

    it('returns false for non-Error objects', () => {
        expect(isAbortError({ name: 'AbortError' })).toBe(false)
    })
})

describe('ValarMindError', () => {
    it('has correct name and kind', () => {
        const err = new ValarMindError('test', 'transient')
        expect(err.name).toBe('ValarMindError')
        expect(err.kind).toBe('transient')
        expect(err.message).toBe('test')
    })

    it('supports cause', () => {
        const cause = new Error('original')
        const err = new TransientError('wrapped', { cause })
        expect(err.cause).toBe(cause)
    })
})

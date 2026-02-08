import { describe, it, expect } from 'bun:test'
import { getModelSpec, getCompactThreshold, MODEL_SPECS } from '../../../src/llm/model-specs.js'

describe('getModelSpec', () => {
    it('returns correct spec for known models', () => {
        const spec = getModelSpec('anthropic/claude-opus-4.6')
        expect(spec.contextWindow).toBe(200_000)
        expect(spec.maxOutput).toBe(4_096)
    })

    it('returns correct spec for Kimi K2.5', () => {
        const spec = getModelSpec('moonshotai/kimi-k2.5')
        expect(spec.contextWindow).toBe(262_144)
        expect(spec.maxOutput).toBe(8_192)
    })

    it('returns defaults for unknown model', () => {
        const spec = getModelSpec('unknown/model-x')
        expect(spec.contextWindow).toBe(128_000)
        expect(spec.maxOutput).toBe(4_096)
    })

    it('has entries for all expected models', () => {
        const expectedModels = [
            'anthropic/claude-opus-4.6',
            'anthropic/claude-opus-4.5',
            'anthropic/claude-sonnet-4.5',
            'google/gemini-2.5-flash',
            'openai/gpt-5.2-codex',
            'moonshotai/kimi-k2.5',
        ]
        for (const model of expectedModels) {
            expect(MODEL_SPECS[model]).toBeDefined()
        }
    })
})

describe('getCompactThreshold', () => {
    it('returns 75% of context window for known model', () => {
        const threshold = getCompactThreshold('anthropic/claude-opus-4.6')
        expect(threshold).toBe(Math.floor(200_000 * 0.75))
    })

    it('returns 75% of default for unknown model', () => {
        const threshold = getCompactThreshold('unknown/model')
        expect(threshold).toBe(Math.floor(128_000 * 0.75))
    })

    it('computes correctly for Gemini with 1M context', () => {
        const threshold = getCompactThreshold('google/gemini-2.5-flash')
        expect(threshold).toBe(Math.floor(1_000_000 * 0.75))
    })
})

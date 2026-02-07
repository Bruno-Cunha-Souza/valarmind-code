import { describe, it, expect } from 'bun:test'
import { estimateTokens, isWithinBudget } from '../../../src/llm/token-counter.js'

describe('estimateTokens', () => {
    it('estimates tokens from text length', () => {
        const tokens = estimateTokens('Hello world')
        expect(tokens).toBeGreaterThan(0)
        expect(tokens).toBeLessThan(20)
    })

    it('longer text = more tokens', () => {
        const short = estimateTokens('Hi')
        const long = estimateTokens('This is a longer piece of text with more words')
        expect(long).toBeGreaterThan(short)
    })
})

describe('isWithinBudget', () => {
    it('within target and hard cap', () => {
        const result = isWithinBudget(1000, { target: 3000, hardCap: 4800 })
        expect(result.withinTarget).toBe(true)
        expect(result.withinHardCap).toBe(true)
    })

    it('over target but within hard cap', () => {
        const result = isWithinBudget(4000, { target: 3000, hardCap: 4800 })
        expect(result.withinTarget).toBe(false)
        expect(result.withinHardCap).toBe(true)
    })

    it('over hard cap', () => {
        const result = isWithinBudget(5000, { target: 3000, hardCap: 4800 })
        expect(result.withinTarget).toBe(false)
        expect(result.withinHardCap).toBe(false)
    })
})

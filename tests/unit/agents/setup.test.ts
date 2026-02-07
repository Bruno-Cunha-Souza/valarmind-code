import { describe, it, expect } from 'bun:test'
import { createAgentRegistry } from '../../../src/agents/setup.js'

describe('createAgentRegistry', () => {
    const registry = createAgentRegistry()

    it('registers 8 agents', () => {
        expect(registry.getAll()).toHaveLength(8)
    })

    it('has search agent', () => {
        expect(registry.has('search')).toBe(true)
    })

    it('has research agent', () => {
        expect(registry.has('research')).toBe(true)
    })

    it('has code agent', () => {
        expect(registry.has('code')).toBe(true)
    })

    it('has test agent', () => {
        expect(registry.has('test')).toBe(true)
    })

    it('has init agent', () => {
        expect(registry.has('init')).toBe(true)
    })

    it('has review agent', () => {
        expect(registry.has('review')).toBe(true)
    })

    it('has qa agent', () => {
        expect(registry.has('qa')).toBe(true)
    })

    it('has docs agent', () => {
        expect(registry.has('docs')).toBe(true)
    })
})

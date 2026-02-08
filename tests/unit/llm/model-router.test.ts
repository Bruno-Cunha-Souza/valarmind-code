import { describe, it, expect } from 'bun:test'
import { ModelRouter } from '../../../src/llm/model-router.js'

describe('ModelRouter', () => {
    const baseConfig = {
        default: 'openai/gpt-4o',
        costTier: {
            light: 'google/gemini-2.0-flash-001',
            standard: 'anthropic/claude-sonnet-4-20250514',
            heavy: 'anthropic/claude-opus-4-20250514',
        },
    }

    describe('cost tier routing', () => {
        const router = new ModelRouter(baseConfig)

        it('routes search to light tier', () => {
            expect(router.resolve('search')).toBe(baseConfig.costTier.light)
        })

        it('routes research to light tier', () => {
            expect(router.resolve('research')).toBe(baseConfig.costTier.light)
        })

        it('routes qa to light tier', () => {
            expect(router.resolve('qa')).toBe(baseConfig.costTier.light)
        })

        it('routes code to standard tier', () => {
            expect(router.resolve('code')).toBe(baseConfig.costTier.standard)
        })

        it('routes test to standard tier', () => {
            expect(router.resolve('test')).toBe(baseConfig.costTier.standard)
        })

        it('routes docs to standard tier', () => {
            expect(router.resolve('docs')).toBe(baseConfig.costTier.standard)
        })

        it('routes review to standard tier', () => {
            expect(router.resolve('review')).toBe(baseConfig.costTier.standard)
        })

        it('routes init to standard tier', () => {
            expect(router.resolve('init')).toBe(baseConfig.costTier.standard)
        })
    })

    describe('orchestrator handling', () => {
        it('returns default model for orchestrator', () => {
            const router = new ModelRouter(baseConfig)
            expect(router.resolve('orchestrator')).toBe(baseConfig.default)
        })
    })

    describe('agentModels override', () => {
        it('uses agentModels override when specified', () => {
            const router = new ModelRouter({
                ...baseConfig,
                agentModels: { code: 'anthropic/claude-opus-4-20250514' },
            })

            expect(router.resolve('code')).toBe('anthropic/claude-opus-4-20250514')
        })

        it('agentModels override takes priority over costTier', () => {
            const router = new ModelRouter({
                ...baseConfig,
                agentModels: { search: 'custom/model' },
            })

            // search is normally 'light' tier, but agentModels overrides
            expect(router.resolve('search')).toBe('custom/model')
        })

        it('agentModels override works for orchestrator', () => {
            const router = new ModelRouter({
                ...baseConfig,
                agentModels: { orchestrator: 'special/orchestrator-model' },
            })

            expect(router.resolve('orchestrator')).toBe('special/orchestrator-model')
        })
    })

    describe('fallback behavior', () => {
        it('returns default when called without agentType', () => {
            const router = new ModelRouter(baseConfig)
            expect(router.resolve()).toBe(baseConfig.default)
        })

        it('returns default when costTier is not configured', () => {
            const router = new ModelRouter({ default: 'openai/gpt-4o' })
            expect(router.resolve('search')).toBe('openai/gpt-4o')
        })

        it('returns default when agentModels has no entry for agent', () => {
            const router = new ModelRouter({
                default: 'openai/gpt-4o',
                agentModels: { code: 'custom/model' },
            })

            expect(router.resolve('search')).toBe('openai/gpt-4o')
        })
    })
})

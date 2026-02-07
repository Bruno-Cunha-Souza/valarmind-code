import { describe, it, expect } from 'bun:test'
import { ReviewAgent } from '../../../src/agents/review/review-agent.js'
import type { AgentContext } from '../../../src/agents/types.js'

const baseContext: AgentContext = {
    sessionId: 'test-session',
    workingState: {
        schema_version: 1,
        updated_at: new Date().toISOString(),
        goal: '',
        now: '',
        decisions_recent: [],
        tasks_open: [],
        conventions: {},
    },
    projectContext: '',
    conversationHistory: [],
    signal: new AbortController().signal,
}

describe('ReviewAgent', () => {
    const agent = new ReviewAgent()

    it('has correct type', () => {
        expect(agent.type).toBe('review')
    })

    it('has correct allowed tools', () => {
        expect(agent.allowedTools).toEqual(['read_file', 'glob', 'grep', 'git_diff'])
    })

    it('has read-only permissions', () => {
        expect(agent.permissions.read).toBe(true)
        expect(agent.permissions.write).toBe(false)
        expect(agent.permissions.execute).toBe(false)
    })

    it('builds system prompt', () => {
        const prompt = agent.buildSystemPrompt(baseContext)
        expect(prompt).toContain('Review Agent')
        expect(prompt).toContain('overallScore')
    })

    it('includes project context in prompt', () => {
        const ctx = { ...baseContext, projectContext: 'My project uses TypeScript' }
        const prompt = agent.buildSystemPrompt(ctx)
        expect(prompt).toContain('My project uses TypeScript')
    })

    it('includes conventions in prompt', () => {
        const ctx = {
            ...baseContext,
            workingState: {
                ...baseContext.workingState,
                conventions: { language: 'TypeScript', testing: 'bun:test' },
            },
        }
        const prompt = agent.buildSystemPrompt(ctx)
        expect(prompt).toContain('language: TypeScript')
        expect(prompt).toContain('testing: bun:test')
    })

    it('has correct timeout', () => {
        expect(agent.timeout.default).toBe(60)
        expect(agent.timeout.max).toBe(120)
    })
})

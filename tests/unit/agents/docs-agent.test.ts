import { describe, it, expect } from 'bun:test'
import { DocsAgent } from '../../../src/agents/docs/docs-agent.js'
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

describe('DocsAgent', () => {
    const agent = new DocsAgent()

    it('has correct type', () => {
        expect(agent.type).toBe('docs')
    })

    it('has correct allowed tools', () => {
        expect(agent.allowedTools).toEqual(['read_file', 'write_file', 'edit_file', 'glob', 'web_fetch'])
    })

    it('has read + write permissions', () => {
        expect(agent.permissions.read).toBe(true)
        expect(agent.permissions.write).toBe(true)
        expect(agent.permissions.execute).toBe(false)
    })

    it('builds system prompt', () => {
        const prompt = agent.buildSystemPrompt(baseContext)
        expect(prompt).toContain('Docs Agent')
        expect(prompt).toContain('documentation')
    })

    it('includes project context in prompt', () => {
        const ctx = { ...baseContext, projectContext: 'Project docs style: markdown tables' }
        const prompt = agent.buildSystemPrompt(ctx)
        expect(prompt).toContain('markdown tables')
    })

    it('has correct timeout', () => {
        expect(agent.timeout.default).toBe(60)
        expect(agent.timeout.max).toBe(120)
    })
})

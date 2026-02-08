import { describe, it, expect } from 'bun:test'
import { QAAgent } from '../../../src/agents/qa/qa-agent.js'
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

describe('QAAgent', () => {
    const agent = new QAAgent()

    it('has correct type', () => {
        expect(agent.type).toBe('qa')
    })

    it('has correct allowed tools', () => {
        expect(agent.allowedTools).toEqual(['read_file', 'glob', 'grep', 'bash', 'git_diff'])
    })

    it('has read + execute permissions', () => {
        expect(agent.permissions.read).toBe(true)
        expect(agent.permissions.write).toBe(false)
        expect(agent.permissions.execute).toBe(true)
    })

    it('builds system prompt', () => {
        const prompt = agent.buildSystemPrompt(baseContext)
        expect(prompt).toContain('QA Agent')
        expect(prompt).toContain('package.json')
    })

    it('buildSystemPrompt does not include projectContext (injected by runner)', () => {
        const ctx = { ...baseContext, projectContext: 'Custom QA commands: bun run check' }
        const prompt = agent.buildSystemPrompt(ctx)
        expect(prompt).not.toContain('Custom QA commands')
    })

    it('has correct timeout', () => {
        expect(agent.timeout.default).toBe(120)
        expect(agent.timeout.max).toBe(300)
    })
})

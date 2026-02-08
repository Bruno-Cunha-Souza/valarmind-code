import { describe, it, expect } from 'bun:test'
import { createAgentRegistry } from '../../../src/agents/setup.js'
import { ORCHESTRATOR_SYSTEM_PROMPT } from '../../../src/agents/orchestrator/system-prompt.js'
import type { AgentContext } from '../../../src/agents/types.js'
import type { WorkingState } from '../../../src/memory/types.js'

function makeBaseContext(overrides?: Partial<WorkingState>): AgentContext {
    return {
        sessionId: 'test-session',
        workingState: {
            schema_version: 1,
            updated_at: '2025-01-01T00:00:00Z',
            goal: '',
            now: '',
            decisions_recent: [],
            tasks_open: [],
            conventions: {},
            ...overrides,
        },
        projectContext: '',
        conversationHistory: [],
        signal: new AbortController().signal,
    }
}

describe('Prompt Snapshots', () => {
    const registry = createAgentRegistry()
    const baseContext = makeBaseContext()

    const agentTypes = ['search', 'research', 'code', 'test', 'init', 'review', 'qa', 'docs'] as const

    for (const type of agentTypes) {
        it(`${type} agent system prompt matches snapshot`, () => {
            const agent = registry.get(type)
            expect(agent).toBeDefined()
            const prompt = agent!.buildSystemPrompt(baseContext)
            expect(prompt).toMatchSnapshot()
        })
    }

    it('orchestrator system prompt matches snapshot', () => {
        expect(ORCHESTRATOR_SYSTEM_PROMPT).toMatchSnapshot()
    })

    it('code agent appends conventions to prompt', () => {
        const contextWithConventions = makeBaseContext({
            conventions: { language: 'TypeScript', runtime: 'Bun', testing: 'bun:test' },
        })
        const agent = registry.get('code')!
        const prompt = agent.buildSystemPrompt(contextWithConventions)

        expect(prompt).toContain('## Conventions')
        expect(prompt).toContain('- language: TypeScript')
        expect(prompt).toContain('- runtime: Bun')
        expect(prompt).toContain('- testing: bun:test')
        expect(prompt).toMatchSnapshot()
    })

    it('review agent appends conventions to prompt', () => {
        const contextWithConventions = makeBaseContext({
            conventions: { language: 'TypeScript', style: 'functional' },
        })
        const agent = registry.get('review')!
        const prompt = agent.buildSystemPrompt(contextWithConventions)

        expect(prompt).toContain('## Conventions')
        expect(prompt).toContain('- language: TypeScript')
        expect(prompt).toContain('- style: functional')
        expect(prompt).toMatchSnapshot()
    })

    it('code agent without conventions has no Conventions section', () => {
        const agent = registry.get('code')!
        const prompt = agent.buildSystemPrompt(baseContext)
        expect(prompt).not.toContain('## Conventions')
    })

    it('init agent excludes project context', () => {
        const agent = registry.get('init')!
        expect(agent.excludeProjectContext).toBe(true)
    })

    it('non-init agents include project context', () => {
        for (const type of ['search', 'research', 'code', 'test', 'review', 'qa', 'docs'] as const) {
            const agent = registry.get(type)!
            expect(agent.excludeProjectContext).toBe(false)
        }
    })
})

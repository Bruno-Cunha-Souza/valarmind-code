import { describe, it, expect } from 'bun:test'
import { BaseAgent } from '../../../src/agents/base-agent.js'
import { InitAgent } from '../../../src/agents/init/init-agent.js'
import type { AgentContext } from '../../../src/agents/types.js'
import type { AgentType } from '../../../src/core/types.js'

class TestAgent extends BaseAgent {
    readonly type: AgentType = 'search'

    get allowedTools(): string[] {
        return ['glob']
    }

    get systemPrompt(): string {
        return 'You are a test agent.'
    }
}

function makeContext(projectContext: string): AgentContext {
    return {
        sessionId: 'test',
        workingState: {
            schema_version: 1,
            updated_at: '',
            goal: '',
            now: '',
            decisions_recent: [],
            tasks_open: [],
            conventions: {},
        },
        projectContext,
        conversationHistory: [],
        signal: new AbortController().signal,
    }
}

describe('BaseAgent', () => {
    it('buildSystemPrompt returns only systemPrompt (no projectContext)', () => {
        const agent = new TestAgent()
        const context = makeContext('# VALARMIND.md content')

        const result = agent.buildSystemPrompt(context)

        expect(result).toBe('You are a test agent.')
        expect(result).not.toContain('VALARMIND')
    })

    it('excludeProjectContext defaults to false', () => {
        const agent = new TestAgent()
        expect(agent.excludeProjectContext).toBe(false)
    })
})

describe('InitAgent', () => {
    it('excludeProjectContext is true', () => {
        const agent = new InitAgent()
        expect(agent.excludeProjectContext).toBe(true)
    })

    it('buildSystemPrompt returns only systemPrompt (inherited from BaseAgent)', () => {
        const agent = new InitAgent()
        const context = makeContext('# Old VALARMIND.md')

        const result = agent.buildSystemPrompt(context)

        expect(result).not.toContain('Old VALARMIND')
        expect(result).toContain('VALARMIND.md') // from the system prompt template
    })
})

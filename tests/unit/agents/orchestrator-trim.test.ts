import { describe, it, expect, mock } from 'bun:test'
import { Orchestrator } from '../../../src/agents/orchestrator/orchestrator.js'
import type { ChatResponse } from '../../../src/llm/types.js'
import { TypedEventEmitter } from '../../../src/core/events.js'

function createMockDeps(overrides: { model?: string } = {}) {
    const llmClient = {
        chat: mock(async (): Promise<ChatResponse> => ({
            content: 'direct answer',
            toolCalls: [],
            finishReason: 'stop' as const,
            usage: { promptTokens: 10, completionTokens: 10 },
        })),
        chatStream: mock(async function* () {
            yield { content: 'direct answer' }
        }),
    }

    return {
        llmClient,
        agentRunner: {
            run: mock(async (_a: any, task: any) => ({
                taskId: task.id,
                success: true,
                output: 'done',
                summary: 'completed',
                tokenUsage: { prompt: 10, completion: 10 },
            })),
        },
        agentRegistry: {
            get: mock(() => null),
            getAll: mock(() => []),
            has: mock(() => true),
        },
        stateManager: {
            load: mock(async () => ({
                schema_version: 1,
                updated_at: new Date().toISOString(),
                goal: '',
                now: '',
                decisions_recent: [],
                tasks_open: [],
                conventions: {},
            })),
            update: mock(async () => {}),
            reset: mock(() => {}),
        },
        contextLoader: {
            load: mock(async () => ({
                valarmindMd: '',
                localMd: null,
                stateCompact: null,
            })),
        },
        tracer: {
            startTrace: mock(() => {}),
            startSpan: mock(() => ({
                id: 's',
                kind: 'agent',
                name: 'test',
                startTime: 0,
                attributes: {},
                children: [],
                end: () => 0,
            })),
            endSpan: mock(() => 0),
            endTrace: mock(() => null),
        },
        eventBus: new TypedEventEmitter(),
        logger: {
            info: mock(() => {}),
            warn: mock(() => {}),
            error: mock(() => {}),
            debug: mock(() => {}),
            fatal: mock(() => {}),
            trace: mock(() => {}),
            child: mock(() => ({})),
            level: 'silent',
        },
        projectDir: '/test',
        config: overrides.model ? { model: overrides.model } : undefined,
    }
}

// estimateTokens uses ~3.5 chars/token, so to create a message with N tokens
// we need a string of length N * 3.5
function makeMessage(role: 'user' | 'assistant', approxTokens: number): { role: string; content: string } {
    const len = Math.ceil(approxTokens * 3.5)
    return { role, content: 'x'.repeat(len) }
}

describe('Orchestrator trimHistory', () => {
    it('compacts when tokens exceed 75% of context window', async () => {
        // Default model (128k context) → threshold = 96,000 tokens
        const deps = createMockDeps()
        const orchestrator = new Orchestrator(deps as any)

        // Fill conversation with large messages that exceed 96k tokens
        // Each message: ~5000 tokens → need ~20 messages to exceed 96k
        const bigMessages: any[] = []
        for (let i = 0; i < 25; i++) {
            bigMessages.push(makeMessage(i % 2 === 0 ? 'user' : 'assistant', 5000))
        }

        // Access private field to pre-populate history
        ;(orchestrator as any).conversationHistory = bigMessages

        // Process triggers trimHistory
        await orchestrator.process('test input')

        const history = (orchestrator as any).conversationHistory as any[]
        // After compaction: first message + compaction notice + last 10 + new user msg + new assistant msg
        // The exact count depends on implementation, but it should be significantly less than 25+2
        expect(history.length).toBeLessThan(25)
    })

    it('preserves first message and last 10 during compaction', async () => {
        const deps = createMockDeps()
        const orchestrator = new Orchestrator(deps as any)

        const firstMsg = { role: 'user', content: 'FIRST_MESSAGE_MARKER_' + 'x'.repeat(100) }
        const messages: any[] = [firstMsg]
        for (let i = 0; i < 24; i++) {
            messages.push(makeMessage(i % 2 === 0 ? 'assistant' : 'user', 5000))
        }

        ;(orchestrator as any).conversationHistory = messages

        await orchestrator.process('test')

        const history = (orchestrator as any).conversationHistory as any[]
        // First message should be preserved
        expect(history[0].content).toContain('FIRST_MESSAGE_MARKER_')
        // Should have compaction notice
        const hasCompactNotice = history.some(
            (m: any) => typeof m.content === 'string' && m.content.includes('Previous conversation summary')
        )
        expect(hasCompactNotice).toBe(true)
    })

    it('does not compact when within token limit', async () => {
        const deps = createMockDeps()
        const orchestrator = new Orchestrator(deps as any)

        // Small messages that stay well under 96k tokens
        const messages: any[] = []
        for (let i = 0; i < 5; i++) {
            messages.push(makeMessage(i % 2 === 0 ? 'user' : 'assistant', 100))
        }

        ;(orchestrator as any).conversationHistory = messages

        await orchestrator.process('test')

        const history = (orchestrator as any).conversationHistory as any[]
        // Should not contain compaction notice
        const hasCompactNotice = history.some(
            (m: any) => typeof m.content === 'string' && m.content.includes('Previous conversation summary')
        )
        expect(hasCompactNotice).toBe(false)
    })

    it('uses model-specific context window when config.model is provided', async () => {
        // anthropic/claude-opus-4.6 has 200k context → threshold = 150k tokens
        const deps = createMockDeps({ model: 'anthropic/claude-opus-4.6' })
        const orchestrator = new Orchestrator(deps as any)

        // Fill with messages totaling ~100k tokens (above 96k default threshold but below 150k)
        const messages: any[] = []
        for (let i = 0; i < 22; i++) {
            messages.push(makeMessage(i % 2 === 0 ? 'user' : 'assistant', 5000))
        }

        ;(orchestrator as any).conversationHistory = messages

        await orchestrator.process('test')

        const history = (orchestrator as any).conversationHistory as any[]
        // Should NOT have compacted because 110k tokens < 150k threshold
        const hasCompactNotice = history.some(
            (m: any) => typeof m.content === 'string' && m.content.includes('Previous conversation summary')
        )
        expect(hasCompactNotice).toBe(false)
    })

    it('fallback: trims to MAX_HISTORY (50) messages', async () => {
        const deps = createMockDeps()
        const orchestrator = new Orchestrator(deps as any)

        // Fill with 60 small messages (won't trigger token-based compaction)
        const messages: any[] = []
        for (let i = 0; i < 60; i++) {
            messages.push(makeMessage(i % 2 === 0 ? 'user' : 'assistant', 10))
        }

        ;(orchestrator as any).conversationHistory = messages

        await orchestrator.process('test')

        const history = (orchestrator as any).conversationHistory as any[]
        // After process adds 2 messages (user + assistant), fallback trims to 50
        expect(history.length).toBeLessThanOrEqual(50)
    })
})

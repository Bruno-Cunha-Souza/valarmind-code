import { describe, it, expect, mock } from 'bun:test'
import { Orchestrator } from '../../../src/agents/orchestrator/orchestrator.js'
import type { LLMClient, ChatResponse, ChatChunk } from '../../../src/llm/types.js'
import { TypedEventEmitter } from '../../../src/core/events.js'

function createMockDeps(streamChunks: ChatChunk[]) {
    const llmClient: LLMClient = {
        chat: mock(async (): Promise<ChatResponse> => ({
            content: 'direct answer',
            toolCalls: [],
            finishReason: 'stop',
            usage: { promptTokens: 10, completionTokens: 10 },
        })),
        chatStream: mock(async function* () {
            for (const chunk of streamChunks) {
                yield chunk
            }
        }),
    }

    return {
        llmClient,
        agentRunner: { run: mock(async () => ({ taskId: 't1', success: true, output: '', summary: '', tokenUsage: { prompt: 0, completion: 0 } })) },
        agentRegistry: {
            get: mock(() => null),
            getAll: mock(() => []),
            has: mock(() => false),
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
            startSpan: mock(() => ({ id: 's', kind: 'agent', name: 'test', startTime: 0, attributes: {}, children: [], end: () => 0 })),
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
    }
}

describe('Orchestrator.processStream', () => {
    it('yields chunks for direct answers', async () => {
        const deps = createMockDeps([
            { content: 'Hello ' },
            { content: 'world!' },
        ])

        const orchestrator = new Orchestrator(deps as any)
        const chunks: string[] = []

        for await (const chunk of orchestrator.processStream('Hi')) {
            chunks.push(chunk)
        }

        expect(chunks).toEqual(['Hello ', 'world!'])
    })

    it('yields single result for plan-based execution', async () => {
        const planJson = JSON.stringify({
            plan: 'Do something',
            tasks: [{ agent: 'search', description: 'Find stuff' }],
        })

        const deps = createMockDeps([{ content: planJson }])
        deps.agentRegistry.get = mock(() => ({
            type: 'search',
            permissions: { read: true, write: false, execute: false, spawn: false },
            timeout: { default: 30, max: 60 },
            maxTurns: 25,
            allowedTools: ['read_file'],
            buildSystemPrompt: () => 'system',
            formatTask: (d: string) => d,
        }))

        const orchestrator = new Orchestrator(deps as any)
        const chunks: string[] = []

        for await (const chunk of orchestrator.processStream('Do something')) {
            chunks.push(chunk)
        }

        // Should yield the synthesized result
        expect(chunks.length).toBeGreaterThan(0)
    })
})

import { describe, it, expect, mock } from 'bun:test'
import { Orchestrator } from '../../../src/agents/orchestrator/orchestrator.js'
import type { ChatResponse } from '../../../src/llm/types.js'
import { TypedEventEmitter } from '../../../src/core/events.js'

function createMockDeps(opts: {
    agentRunnerFn?: (agent: any, task: any) => Promise<any>
    agentTimeout?: { default: number; max: number }
} = {}) {
    const planJson = JSON.stringify({
        plan: 'Search and code',
        tasks: [
            { agent: 'search', description: 'Find files' },
            { agent: 'code', description: 'Modify code', dependsOn: [0] },
        ],
    })

    return {
        llmClient: {
            chat: mock(async (): Promise<ChatResponse> => ({
                content: planJson,
                toolCalls: [],
                finishReason: 'stop',
                usage: { promptTokens: 10, completionTokens: 10 },
            })),
            chatStream: mock(async function* () {
                yield { content: planJson }
            }),
        },
        agentRunner: {
            run: mock(opts.agentRunnerFn ?? (async (_a: any, task: any) => ({
                taskId: task.id,
                success: true,
                output: 'done',
                summary: 'completed',
                tokenUsage: { prompt: 10, completion: 10 },
            }))),
        },
        agentRegistry: {
            get: mock((type: string) => ({
                type,
                permissions: { read: true, write: type === 'code', execute: false, spawn: false },
                timeout: opts.agentTimeout ?? { default: 60, max: 120 },
                maxTurns: 25,
                allowedTools: [],
                buildSystemPrompt: () => 'system',
                formatTask: (d: string) => d,
            })),
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

describe('Orchestrator retry on timeout', () => {
    it('retries timed-out tasks with extended timeout', async () => {
        let searchCallCount = 0
        const deps = createMockDeps({
            agentRunnerFn: async (_agent: any, task: any) => {
                if (task.type === 'search') {
                    searchCallCount++
                    if (searchCallCount === 1) {
                        // First call: simulate abort/timeout
                        throw new Error('Request was aborted')
                    }
                    // Second call: succeed
                    return {
                        taskId: task.id,
                        success: true,
                        output: 'found files',
                        summary: 'Search completed',
                        tokenUsage: { prompt: 10, completion: 10 },
                    }
                }
                return {
                    taskId: task.id,
                    success: true,
                    output: 'code written',
                    summary: 'Code completed',
                    tokenUsage: { prompt: 10, completion: 10 },
                }
            },
        })

        const orchestrator = new Orchestrator(deps as any)
        const result = await orchestrator.process('Do something')

        // Search should have been called twice (initial + retry)
        expect(searchCallCount).toBe(2)
        // Result should contain both agent results
        expect(result).toContain('Search completed')
        expect(result).toContain('Code completed')
    })

    it('does NOT retry tasks with permanent errors', async () => {
        let searchCallCount = 0
        const deps = createMockDeps({
            agentRunnerFn: async (_agent: any, task: any) => {
                if (task.type === 'search') {
                    searchCallCount++
                    throw new Error('Invalid API key')
                }
                return {
                    taskId: task.id,
                    success: true,
                    output: 'done',
                    summary: 'completed',
                    tokenUsage: { prompt: 10, completion: 10 },
                }
            },
        })

        const orchestrator = new Orchestrator(deps as any)
        const result = await orchestrator.process('Do something')

        // Search should only be called once (no retry — error doesn't contain 'aborted')
        expect(searchCallCount).toBe(1)
        expect(result).toContain('[Failed]')
    })

    it('retries at most once per task', async () => {
        let searchCallCount = 0
        const deps = createMockDeps({
            agentRunnerFn: async (_agent: any, task: any) => {
                if (task.type === 'search') {
                    searchCallCount++
                    throw new Error('Request was aborted')
                }
                return {
                    taskId: task.id,
                    success: true,
                    output: 'done',
                    summary: 'completed',
                    tokenUsage: { prompt: 10, completion: 10 },
                }
            },
        })

        const orchestrator = new Orchestrator(deps as any)
        await orchestrator.process('Do something')

        // Search: 1 initial + 1 retry = 2 max
        expect(searchCallCount).toBe(2)
    })
})

describe('Orchestrator intelligent synthesis', () => {
    it('shows warning when core agents (search/code/test) fail', async () => {
        const deps = createMockDeps({
            agentRunnerFn: async (_agent: any, task: any) => {
                if (task.type === 'search') {
                    // Fail with non-abort error so it won't be retried
                    throw new Error('Internal error')
                }
                return {
                    taskId: task.id,
                    success: true,
                    output: 'done',
                    summary: 'completed',
                    tokenUsage: { prompt: 10, completion: 10 },
                }
            },
        })

        const orchestrator = new Orchestrator(deps as any)
        const result = await orchestrator.process('Do something')

        expect(result).toContain('Aviso')
        expect(result).toContain('search')
        expect(result).toContain('incompletos')
    })

    it('does NOT show warning when only non-core agents fail', async () => {
        // Use a plan with only non-core agents
        const planJson = JSON.stringify({
            plan: 'Research and docs',
            tasks: [
                { agent: 'research', description: 'Look up docs' },
                { agent: 'docs', description: 'Update docs', dependsOn: [0] },
            ],
        })

        const deps = createMockDeps({
            agentRunnerFn: async (_agent: any, task: any) => {
                if (task.type === 'research') {
                    throw new Error('Network error')
                }
                return {
                    taskId: task.id,
                    success: true,
                    output: 'done',
                    summary: 'completed',
                    tokenUsage: { prompt: 10, completion: 10 },
                }
            },
        })

        // Override the LLM response to use the non-core plan
        deps.llmClient.chat = mock(async (): Promise<ChatResponse> => ({
            content: planJson,
            toolCalls: [],
            finishReason: 'stop',
            usage: { promptTokens: 10, completionTokens: 10 },
        }))

        const orchestrator = new Orchestrator(deps as any)
        const result = await orchestrator.process('Do something')

        expect(result).not.toContain('Aviso')
        expect(result).toContain('[Failed]')
    })

    it('shows success count in results', async () => {
        const deps = createMockDeps()
        const orchestrator = new Orchestrator(deps as any)
        const result = await orchestrator.process('Do something')

        expect(result).toContain('2/2 tasks completed')
    })
})

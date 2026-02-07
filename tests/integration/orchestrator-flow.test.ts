import { describe, it, expect, mock } from 'bun:test'
import { Orchestrator } from '../../src/agents/orchestrator/orchestrator.js'
import type { LLMClient, ChatResponse } from '../../src/llm/types.js'
import type { AgentResult } from '../../src/agents/types.js'
import { TypedEventEmitter } from '../../src/core/events.js'

function createMockLLMClient(responsesByIndex: string[]): LLMClient {
    let idx = 0
    return {
        chat: mock(async (): Promise<ChatResponse> => ({
            content: responsesByIndex[idx++] ?? '',
            toolCalls: [],
            finishReason: 'stop',
            usage: { promptTokens: 10, completionTokens: 10 },
        })),
        chatStream: mock(async function* () {
            yield { content: responsesByIndex[idx++] ?? '' }
        }),
    }
}

function createMockAgentRunner() {
    return {
        run: mock(async (_agent: any, task: any): Promise<AgentResult> => ({
            taskId: task.id,
            success: true,
            output: `${task.type} output`,
            filesModified: task.type === 'code' ? ['src/a.ts', 'src/b.ts', 'src/c.ts'] : undefined,
            summary: `${task.type} completed`,
            tokenUsage: { prompt: 50, completion: 30 },
        })),
    }
}

function createMockRegistry() {
    const agents = new Map<string, any>()
    for (const type of ['search', 'research', 'code', 'test', 'init', 'review', 'qa', 'docs']) {
        agents.set(type, {
            type,
            permissions: { read: true, write: type === 'code' || type === 'docs', execute: type === 'qa' || type === 'test', spawn: false },
            timeout: { default: 60, max: 120 },
            maxTurns: 25,
            allowedTools: [],
            buildSystemPrompt: () => `system for ${type}`,
            formatTask: (d: string) => d,
        })
    }
    return {
        get: mock((type: string) => agents.get(type)),
        getAll: mock(() => [...agents.values()]),
        has: mock((type: string) => agents.has(type)),
    }
}

function createBaseDeps(llmResponses: string[]) {
    return {
        llmClient: createMockLLMClient(llmResponses),
        agentRunner: createMockAgentRunner(),
        agentRegistry: createMockRegistry(),
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

describe('Orchestrator Flow (Integration)', () => {
    it('direct answers bypass delegation', async () => {
        const deps = createBaseDeps(['This is a direct answer.'])
        const orchestrator = new Orchestrator(deps as any)

        const result = await orchestrator.process('What is TypeScript?')
        expect(result).toBe('This is a direct answer.')
        expect(deps.agentRunner.run).not.toHaveBeenCalled()
    })

    it('plan with search + code executes correctly', async () => {
        const plan = JSON.stringify({
            plan: 'Search then code',
            tasks: [
                { agent: 'search', description: 'Find relevant files' },
                { agent: 'code', description: 'Implement changes', dependsOn: [0] },
            ],
        })

        const deps = createBaseDeps([plan])
        const orchestrator = new Orchestrator(deps as any)

        const result = await orchestrator.process('Add a new feature')
        expect(result).toContain('Search then code')
        expect(result).toContain('search completed')
        expect(result).toContain('code completed')

        const runCalls = (deps.agentRunner.run as any).mock.calls
        expect(runCalls.length).toBeGreaterThanOrEqual(2)
    })

    it('quality gates trigger review for multi-file code changes', async () => {
        const plan = JSON.stringify({
            plan: 'Code task',
            tasks: [{ agent: 'code', description: 'Modify multiple files' }],
        })

        // Override agent runner to return review-approved output
        const runner = {
            run: mock(async (_agent: any, task: any): Promise<AgentResult> => {
                if (task.type === 'code') {
                    return {
                        taskId: task.id,
                        success: true,
                        output: 'done',
                        filesModified: ['a.ts', 'b.ts', 'c.ts'],
                        summary: 'code done',
                        tokenUsage: { prompt: 50, completion: 30 },
                    }
                }
                if (task.type === 'review') {
                    return {
                        taskId: task.id,
                        success: true,
                        output: JSON.stringify({
                            filesReviewed: ['a.ts', 'b.ts', 'c.ts'],
                            issues: [],
                            overallScore: 9,
                            approved: true,
                            summary: 'All good',
                        }),
                        summary: 'review done',
                        tokenUsage: { prompt: 50, completion: 30 },
                    }
                }
                if (task.type === 'qa') {
                    return {
                        taskId: task.id,
                        success: true,
                        output: JSON.stringify({
                            checks: [{ name: 'build', command: 'bun run build', passed: true, output: 'ok' }],
                            passed: true,
                            blockers: [],
                            warnings: [],
                        }),
                        summary: 'qa done',
                        tokenUsage: { prompt: 50, completion: 30 },
                    }
                }
                return {
                    taskId: task.id,
                    success: true,
                    output: 'done',
                    summary: `${task.type} done`,
                    tokenUsage: { prompt: 50, completion: 30 },
                }
            }),
        }

        const deps = createBaseDeps([plan])
        deps.agentRunner = runner as any

        const orchestrator = new Orchestrator(deps as any)
        const result = await orchestrator.process('Modify 3 files')

        const calls = (runner.run as any).mock.calls
        const agentTypes = calls.map((c: any) => c[0].type)
        expect(agentTypes).toContain('code')
        expect(agentTypes).toContain('review')
        expect(agentTypes).toContain('qa')
    })

    it('auto-fix loop works: not approved → fix → approved', async () => {
        const plan = JSON.stringify({
            plan: 'Code task',
            tasks: [{ agent: 'code', description: 'Risky auth change' }],
        })

        let reviewCount = 0
        const runner = {
            run: mock(async (_agent: any, task: any): Promise<AgentResult> => {
                if (task.type === 'review') {
                    reviewCount++
                    return {
                        taskId: task.id,
                        success: true,
                        output: JSON.stringify({
                            filesReviewed: ['auth.ts'],
                            issues: reviewCount === 1 ? [{ file: 'auth.ts', severity: 'major', category: 'security', message: 'Missing validation' }] : [],
                            overallScore: reviewCount === 1 ? 4 : 9,
                            approved: reviewCount > 1,
                            summary: reviewCount === 1 ? 'Issues found' : 'Fixed',
                        }),
                        summary: 'review',
                        tokenUsage: { prompt: 10, completion: 10 },
                    }
                }
                return {
                    taskId: task.id,
                    success: true,
                    output: 'done',
                    filesModified: ['auth.ts'],
                    summary: 'done',
                    tokenUsage: { prompt: 10, completion: 10 },
                }
            }),
        }

        const deps = createBaseDeps([plan])
        deps.agentRunner = runner as any

        const orchestrator = new Orchestrator(deps as any)
        await orchestrator.process('Modify auth')

        // review called twice: first not approved, fix, second approved
        expect(reviewCount).toBe(2)
    })

    it('QA runs after review approval', async () => {
        const plan = JSON.stringify({
            plan: 'Code task',
            tasks: [{ agent: 'code', description: 'Modify files' }],
        })

        const calledTypes: string[] = []
        const runner = {
            run: mock(async (_agent: any, task: any): Promise<AgentResult> => {
                calledTypes.push(task.type)
                if (task.type === 'review') {
                    return {
                        taskId: task.id,
                        success: true,
                        output: JSON.stringify({
                            filesReviewed: ['a.ts', 'b.ts', 'c.ts'],
                            issues: [],
                            overallScore: 9,
                            approved: true,
                            summary: 'ok',
                        }),
                        summary: 'ok',
                        tokenUsage: { prompt: 10, completion: 10 },
                    }
                }
                if (task.type === 'qa') {
                    return {
                        taskId: task.id,
                        success: true,
                        output: JSON.stringify({ checks: [], passed: true, blockers: [], warnings: [] }),
                        summary: 'ok',
                        tokenUsage: { prompt: 10, completion: 10 },
                    }
                }
                return {
                    taskId: task.id,
                    success: true,
                    output: 'done',
                    filesModified: ['a.ts', 'b.ts', 'c.ts'],
                    summary: 'done',
                    tokenUsage: { prompt: 10, completion: 10 },
                }
            }),
        }

        const deps = createBaseDeps([plan])
        deps.agentRunner = runner as any

        const orchestrator = new Orchestrator(deps as any)
        await orchestrator.process('Modify 3 files')

        const reviewIdx = calledTypes.indexOf('review')
        const qaIdx = calledTypes.indexOf('qa')
        expect(reviewIdx).not.toBe(-1)
        expect(qaIdx).not.toBe(-1)
        expect(qaIdx).toBeGreaterThan(reviewIdx)
    })
})

import { describe, it, expect, mock } from 'bun:test'
import { Orchestrator } from '../../src/agents/orchestrator/orchestrator.js'
import type { ChatResponse, LLMClient } from '../../src/llm/types.js'
import type { AgentResult } from '../../src/agents/types.js'
import { TypedEventEmitter } from '../../src/core/events.js'

function createMockLLMClient(response: string): LLMClient {
    return {
        chat: mock(async (): Promise<ChatResponse> => ({
            content: response,
            toolCalls: [],
            finishReason: 'stop',
            usage: { promptTokens: 10, completionTokens: 10 },
        })),
        chatStream: mock(async function* () {
            yield { content: response }
        }),
    }
}

function createTrajectoryRunner(trajectory: string[]) {
    return {
        run: mock(async (_agent: any, task: any): Promise<AgentResult> => {
            trajectory.push(task.type)

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
                    tokenUsage: { prompt: 10, completion: 10 },
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
                    tokenUsage: { prompt: 10, completion: 10 },
                }
            }

            return {
                taskId: task.id,
                success: true,
                output: `${task.type} output`,
                filesModified: task.type === 'code' ? ['a.ts', 'b.ts', 'c.ts'] : undefined,
                summary: `${task.type} done`,
                tokenUsage: { prompt: 10, completion: 10 },
            }
        }),
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

function createBaseDeps(llmResponse: string, trajectory: string[]) {
    return {
        llmClient: createMockLLMClient(llmResponse),
        agentRunner: createTrajectoryRunner(trajectory),
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

describe('Orchestrator Trajectory', () => {
    it('search → code: dependsOn resolves correctly', async () => {
        const trajectory: string[] = []
        const plan = JSON.stringify({
            plan: 'Search then code',
            tasks: [
                { agent: 'search', description: 'Find files' },
                { agent: 'code', description: 'Implement', dependsOn: [0] },
            ],
        })

        const deps = createBaseDeps(plan, trajectory)
        const orchestrator = new Orchestrator(deps as any)
        await orchestrator.process('Add feature')

        // search must come before code
        const searchIdx = trajectory.indexOf('search')
        const codeIdx = trajectory.indexOf('code')
        expect(searchIdx).not.toBe(-1)
        expect(codeIdx).not.toBe(-1)
        expect(searchIdx).toBeLessThan(codeIdx)
    })

    it('[search, search] → code: parallel tasks before dependent', async () => {
        const trajectory: string[] = []
        const plan = JSON.stringify({
            plan: 'Two searches then code',
            tasks: [
                { agent: 'search', description: 'Find files A' },
                { agent: 'search', description: 'Find files B' },
                { agent: 'code', description: 'Implement', dependsOn: [0, 1] },
            ],
        })

        const deps = createBaseDeps(plan, trajectory)
        const orchestrator = new Orchestrator(deps as any)
        await orchestrator.process('Complex feature')

        // Both searches must come before code
        const searchIndices = trajectory
            .map((t, i) => (t === 'search' ? i : -1))
            .filter((i) => i >= 0)
        const codeIdx = trajectory.indexOf('code')

        expect(searchIndices.length).toBe(2)
        expect(codeIdx).not.toBe(-1)
        for (const si of searchIndices) {
            expect(si).toBeLessThan(codeIdx)
        }
    })

    it('quality gates: code → review → qa for multi-file changes', async () => {
        const trajectory: string[] = []
        const plan = JSON.stringify({
            plan: 'Code task',
            tasks: [{ agent: 'code', description: 'Modify multiple files' }],
        })

        const deps = createBaseDeps(plan, trajectory)
        const orchestrator = new Orchestrator(deps as any)
        await orchestrator.process('Modify 3 files')

        expect(trajectory).toContain('code')
        expect(trajectory).toContain('review')
        expect(trajectory).toContain('qa')

        const codeIdx = trajectory.indexOf('code')
        const reviewIdx = trajectory.indexOf('review')
        const qaIdx = trajectory.indexOf('qa')
        expect(codeIdx).toBeLessThan(reviewIdx)
        expect(reviewIdx).toBeLessThan(qaIdx)
    })

    it('auto-fix loop: code → review(fail) → code(fix) → review(pass) → qa', async () => {
        const trajectory: string[] = []
        let reviewCount = 0

        const runner = {
            run: mock(async (_agent: any, task: any): Promise<AgentResult> => {
                trajectory.push(task.type)

                if (task.type === 'review') {
                    reviewCount++
                    return {
                        taskId: task.id,
                        success: true,
                        output: JSON.stringify({
                            filesReviewed: ['a.ts', 'b.ts', 'c.ts'],
                            issues: reviewCount === 1
                                ? [{ file: 'a.ts', severity: 'major', category: 'security', message: 'Missing validation' }]
                                : [],
                            overallScore: reviewCount === 1 ? 4 : 9,
                            approved: reviewCount > 1,
                            summary: reviewCount === 1 ? 'Issues found' : 'All good',
                        }),
                        summary: 'review',
                        tokenUsage: { prompt: 10, completion: 10 },
                    }
                }

                if (task.type === 'qa') {
                    return {
                        taskId: task.id,
                        success: true,
                        output: JSON.stringify({ checks: [], passed: true, blockers: [], warnings: [] }),
                        summary: 'qa',
                        tokenUsage: { prompt: 10, completion: 10 },
                    }
                }

                return {
                    taskId: task.id,
                    success: true,
                    output: 'done',
                    filesModified: ['a.ts', 'b.ts', 'c.ts'],
                    summary: `${task.type} done`,
                    tokenUsage: { prompt: 10, completion: 10 },
                }
            }),
        }

        const plan = JSON.stringify({
            plan: 'Fix auth',
            tasks: [{ agent: 'code', description: 'Modify auth files' }],
        })

        const deps = createBaseDeps(plan, trajectory)
        deps.agentRunner = runner as any

        const orchestrator = new Orchestrator(deps as any)
        await orchestrator.process('Modify auth')

        // Expected: code → review(fail) → code(fix) → review(pass) → qa
        expect(trajectory).toEqual(['code', 'review', 'code', 'review', 'qa'])
        expect(reviewCount).toBe(2)
    })

    it('task failure does not block independent tasks', async () => {
        const trajectory: string[] = []

        const runner = {
            run: mock(async (_agent: any, task: any): Promise<AgentResult> => {
                trajectory.push(task.type)

                if (task.description === 'Failing search') {
                    return {
                        taskId: task.id,
                        success: false,
                        output: null,
                        summary: 'search failed',
                        tokenUsage: { prompt: 10, completion: 10 },
                    }
                }

                return {
                    taskId: task.id,
                    success: true,
                    output: `${task.type} output`,
                    summary: `${task.type} done`,
                    tokenUsage: { prompt: 10, completion: 10 },
                }
            }),
        }

        const plan = JSON.stringify({
            plan: 'Independent tasks',
            tasks: [
                { agent: 'search', description: 'Failing search' },
                { agent: 'docs', description: 'Write docs' },
            ],
        })

        const deps = createBaseDeps(plan, trajectory)
        deps.agentRunner = runner as any

        const orchestrator = new Orchestrator(deps as any)
        const result = await orchestrator.process('Do stuff')

        // Both tasks should have been attempted
        expect(trajectory).toContain('search')
        expect(trajectory).toContain('docs')
    })

    it('search → code → test: three-step dependency chain', async () => {
        const trajectory: string[] = []
        const plan = JSON.stringify({
            plan: 'Full flow',
            tasks: [
                { agent: 'search', description: 'Find files' },
                { agent: 'code', description: 'Implement', dependsOn: [0] },
                { agent: 'test', description: 'Run tests', dependsOn: [1] },
            ],
        })

        // Override runner to not trigger quality gates (fewer files)
        const runner = {
            run: mock(async (_agent: any, task: any): Promise<AgentResult> => {
                trajectory.push(task.type)
                return {
                    taskId: task.id,
                    success: true,
                    output: `${task.type} output`,
                    filesModified: task.type === 'code' ? ['a.ts'] : undefined,
                    summary: `${task.type} done`,
                    tokenUsage: { prompt: 10, completion: 10 },
                }
            }),
        }

        const deps = createBaseDeps(plan, trajectory)
        deps.agentRunner = runner as any
        const orchestrator = new Orchestrator(deps as any)
        await orchestrator.process('Implement and test')

        expect(trajectory).toEqual(['search', 'code', 'test'])
    })

    it('no quality gates for single-file non-risky changes', async () => {
        const trajectory: string[] = []

        const runner = {
            run: mock(async (_agent: any, task: any): Promise<AgentResult> => {
                trajectory.push(task.type)
                return {
                    taskId: task.id,
                    success: true,
                    output: 'done',
                    filesModified: task.type === 'code' ? ['utils.ts'] : undefined,
                    summary: `${task.type} done`,
                    tokenUsage: { prompt: 10, completion: 10 },
                }
            }),
        }

        const plan = JSON.stringify({
            plan: 'Simple fix',
            tasks: [{ agent: 'code', description: 'Fix typo in utils' }],
        })

        const deps = createBaseDeps(plan, trajectory)
        deps.agentRunner = runner as any
        const orchestrator = new Orchestrator(deps as any)
        await orchestrator.process('Fix typo')

        // Only code, no review or qa
        expect(trajectory).toEqual(['code'])
    })
})

import { describe, it, expect, mock, beforeEach } from 'bun:test'
import { Orchestrator } from '../../../src/agents/orchestrator/orchestrator.js'
import type { AgentResult, AgentContext } from '../../../src/agents/types.js'
import type { LLMClient, ChatResponse } from '../../../src/llm/types.js'
import { TypedEventEmitter } from '../../../src/core/events.js'

function createMockLLMClient(responses: string[]): LLMClient {
    let callIndex = 0
    return {
        chat: mock(async (): Promise<ChatResponse> => {
            const content = responses[callIndex++] ?? ''
            return {
                content,
                toolCalls: [],
                finishReason: 'stop',
                usage: { promptTokens: 10, completionTokens: 10 },
            }
        }),
        chatStream: mock(async function* () {
            yield { content: responses[callIndex++] ?? '' }
        }),
    }
}

function createMockAgentRunner(results: Record<string, Partial<AgentResult>>) {
    return {
        run: mock(async (_agent: unknown, task: { type: string; id: string }): Promise<AgentResult> => {
            const base = results[task.type] ?? {}
            return {
                success: true,
                output: '{}',
                summary: `${task.type} completed`,
                tokenUsage: { prompt: 10, completion: 10 },
                ...base,
                taskId: task.id, // Must match the real task ID for quality gates
            }
        }),
    }
}

function createMockAgentRegistry() {
    const agents = new Map<string, { type: string; permissions: object; timeout: object; maxTurns: number; allowedTools: string[]; buildSystemPrompt: () => string; formatTask: (d: string) => string }>()

    for (const type of ['search', 'research', 'code', 'test', 'init', 'review', 'qa', 'docs']) {
        agents.set(type, {
            type,
            permissions: { read: true, write: type === 'code', execute: type === 'qa' || type === 'test', spawn: false },
            timeout: { default: 60, max: 120 },
            maxTurns: 25,
            allowedTools: [],
            buildSystemPrompt: () => `system prompt for ${type}`,
            formatTask: (d: string) => d,
        })
    }

    return {
        get: mock((type: string) => agents.get(type)),
        getAll: mock(() => [...agents.values()]),
        has: mock((type: string) => agents.has(type)),
    }
}

function createMockStateManager() {
    return {
        load: mock(async () => ({
            schema_version: 1,
            updated_at: new Date().toISOString(),
            goal: '',
            now: '',
            decisions_recent: [],
            tasks_open: [],
            conventions: {},
        })),
        save: mock(async () => {}),
        update: mock(async () => {}),
        reset: mock(() => {}),
    }
}

function createMockContextLoader() {
    return {
        load: mock(async () => ({
            valarmindMd: '',
            localMd: null,
            stateCompact: null,
        })),
    }
}

function createMockTracer() {
    return {
        startTrace: mock(() => {}),
        startSpan: mock(() => ({ id: 'span-1', kind: 'agent', name: 'test', startTime: Date.now(), attributes: {}, children: [], end: () => 0 })),
        endSpan: mock(() => 0),
        endTrace: mock(() => null),
    }
}

function createMockLogger() {
    return {
        info: mock(() => {}),
        warn: mock(() => {}),
        error: mock(() => {}),
        debug: mock(() => {}),
        fatal: mock(() => {}),
        trace: mock(() => {}),
        child: mock(() => createMockLogger()),
        level: 'info',
    }
}

describe('Orchestrator Quality Gates', () => {
    it('triggers review for multi-file code changes', async () => {
        const reviewOutput = JSON.stringify({
            filesReviewed: ['a.ts', 'b.ts', 'c.ts'],
            issues: [],
            overallScore: 9,
            approved: true,
            summary: 'Looks good',
        })

        const codeResult: AgentResult = {
            taskId: 'task-1',
            success: true,
            output: 'Code written',
            filesModified: ['a.ts', 'b.ts', 'c.ts'],
            summary: 'Modified 3 files',
            tokenUsage: { prompt: 10, completion: 10 },
        }

        const plan = JSON.stringify({
            plan: 'search then code',
            tasks: [
                { agent: 'search', description: 'Find files' },
                { agent: 'code', description: 'Modify code', dependsOn: [0] },
            ],
        })

        const llmClient = createMockLLMClient([plan])
        const runner = createMockAgentRunner({
            code: codeResult,
            review: {
                taskId: 'review-1',
                success: true,
                output: reviewOutput,
                summary: 'Review passed',
                tokenUsage: { prompt: 10, completion: 10 },
            },
            qa: {
                taskId: 'qa-1',
                success: true,
                output: JSON.stringify({ checks: [], passed: true, blockers: [], warnings: [] }),
                summary: 'QA passed',
                tokenUsage: { prompt: 10, completion: 10 },
            },
        })

        const orchestrator = new Orchestrator({
            llmClient: llmClient as unknown as LLMClient,
            agentRunner: runner as any,
            agentRegistry: createMockAgentRegistry() as any,
            stateManager: createMockStateManager() as any,
            contextLoader: createMockContextLoader() as any,
            tracer: createMockTracer() as any,
            eventBus: new TypedEventEmitter(),
            logger: createMockLogger() as any,
            projectDir: '/test',
        })

        const result = await orchestrator.process('Modify code across files')
        expect(runner.run).toHaveBeenCalled()
        // Should have called: search + code + review + qa = at least review called
        const calls = (runner.run as any).mock.calls
        const agentTypes = calls.map((c: any) => c[0].type)
        expect(agentTypes).toContain('review')
    })

    it('skips review for single-file changes', async () => {
        const codeResult: AgentResult = {
            taskId: 'task-1',
            success: true,
            output: 'Code written',
            filesModified: ['single.ts'],
            summary: 'Modified 1 file',
            tokenUsage: { prompt: 10, completion: 10 },
        }

        const plan = JSON.stringify({
            plan: 'code task',
            tasks: [{ agent: 'code', description: 'Simple change' }],
        })

        const llmClient = createMockLLMClient([plan])
        const runner = createMockAgentRunner({ code: codeResult })

        const orchestrator = new Orchestrator({
            llmClient: llmClient as unknown as LLMClient,
            agentRunner: runner as any,
            agentRegistry: createMockAgentRegistry() as any,
            stateManager: createMockStateManager() as any,
            contextLoader: createMockContextLoader() as any,
            tracer: createMockTracer() as any,
            eventBus: new TypedEventEmitter(),
            logger: createMockLogger() as any,
            projectDir: '/test',
        })

        await orchestrator.process('Small change')
        const calls = (runner.run as any).mock.calls
        const agentTypes = calls.map((c: any) => c[0].type)
        expect(agentTypes).not.toContain('review')
    })

    it('runs auto-fix loop when review not approved', async () => {
        const notApproved = JSON.stringify({
            filesReviewed: ['a.ts', 'b.ts', 'c.ts'],
            issues: [{ file: 'a.ts', severity: 'major', category: 'correctness', message: 'Bug found' }],
            overallScore: 4,
            approved: false,
            summary: 'Issues found',
        })
        const approved = JSON.stringify({
            filesReviewed: ['a.ts', 'b.ts', 'c.ts'],
            issues: [],
            overallScore: 9,
            approved: true,
            summary: 'Fixed',
        })

        let reviewCallCount = 0
        const runner = {
            run: mock(async (_agent: any, task: any) => {
                if (task.type === 'review') {
                    reviewCallCount++
                    return {
                        taskId: task.id,
                        success: true,
                        output: reviewCallCount === 1 ? notApproved : approved,
                        summary: 'review',
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

        const plan = JSON.stringify({
            plan: 'code task',
            tasks: [{ agent: 'code', description: 'Modify 3 files' }],
        })

        const orchestrator = new Orchestrator({
            llmClient: createMockLLMClient([plan]) as unknown as LLMClient,
            agentRunner: runner as any,
            agentRegistry: createMockAgentRegistry() as any,
            stateManager: createMockStateManager() as any,
            contextLoader: createMockContextLoader() as any,
            tracer: createMockTracer() as any,
            eventBus: new TypedEventEmitter(),
            logger: createMockLogger() as any,
            projectDir: '/test',
        })

        await orchestrator.process('Fix stuff in 3 files')
        // Should have: code, review (not approved), code (fix), review (approved), qa
        expect(reviewCallCount).toBe(2)
    })
})

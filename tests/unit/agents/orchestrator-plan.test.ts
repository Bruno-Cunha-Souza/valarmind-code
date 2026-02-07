import { describe, it, expect, mock } from 'bun:test'
import { Orchestrator } from '../../../src/agents/orchestrator/orchestrator.js'
import type { LLMClient, ChatResponse } from '../../../src/llm/types.js'
import { TypedEventEmitter } from '../../../src/core/events.js'

function createMockDeps(llmResponse: string) {
    const llmClient: LLMClient = {
        chat: mock(async (): Promise<ChatResponse> => ({
            content: llmResponse,
            toolCalls: [],
            finishReason: 'stop',
            usage: { promptTokens: 10, completionTokens: 10 },
        })),
        chatStream: mock(async function* () {
            yield { content: llmResponse }
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
            get: mock((type: string) => ({
                type,
                permissions: { read: true, write: type === 'code', execute: false, spawn: false },
                timeout: { default: 60, max: 120 },
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

describe('Orchestrator Plan Mode', () => {
    const planJson = JSON.stringify({
        plan: 'Search then code',
        tasks: [
            { agent: 'search', description: 'Find files' },
            { agent: 'code', description: 'Modify code', dependsOn: [0] },
        ],
    })

    it('createPlan returns a plan without executing', async () => {
        const deps = createMockDeps(planJson)
        const orchestrator = new Orchestrator(deps as any)

        const plan = await orchestrator.createPlan('Do something')
        expect(plan).not.toBeNull()
        expect(plan!.plan).toBe('Search then code')
        expect(plan!.tasks).toHaveLength(2)

        // Agent runner should NOT have been called
        expect(deps.agentRunner.run).not.toHaveBeenCalled()
    })

    it('getPendingPlan returns the pending plan', async () => {
        const deps = createMockDeps(planJson)
        const orchestrator = new Orchestrator(deps as any)

        expect(orchestrator.getPendingPlan()).toBeNull()

        await orchestrator.createPlan('Do something')
        const pending = orchestrator.getPendingPlan()
        expect(pending).not.toBeNull()
        expect(pending!.plan).toBe('Search then code')
    })

    it('executePendingPlan executes the plan', async () => {
        const deps = createMockDeps(planJson)
        const orchestrator = new Orchestrator(deps as any)

        await orchestrator.createPlan('Do something')
        const result = await orchestrator.executePendingPlan()

        expect(result).not.toBeNull()
        expect(result).toContain('Search then code')
        expect(deps.agentRunner.run).toHaveBeenCalled()

        // Plan should be cleared
        expect(orchestrator.getPendingPlan()).toBeNull()
    })

    it('executePendingPlan returns null when no plan', async () => {
        const deps = createMockDeps(planJson)
        const orchestrator = new Orchestrator(deps as any)

        const result = await orchestrator.executePendingPlan()
        expect(result).toBeNull()
    })

    it('rejectPendingPlan clears the plan', async () => {
        const deps = createMockDeps(planJson)
        const orchestrator = new Orchestrator(deps as any)

        await orchestrator.createPlan('Do something')
        expect(orchestrator.rejectPendingPlan()).toBe(true)
        expect(orchestrator.getPendingPlan()).toBeNull()
    })

    it('rejectPendingPlan returns false when no plan', () => {
        const deps = createMockDeps(planJson)
        const orchestrator = new Orchestrator(deps as any)
        expect(orchestrator.rejectPendingPlan()).toBe(false)
    })

    it('updatePlanTask modifies task in pending plan', async () => {
        const deps = createMockDeps(planJson)
        const orchestrator = new Orchestrator(deps as any)

        await orchestrator.createPlan('Do something')
        const updated = orchestrator.updatePlanTask(0, { description: 'Updated search task' })
        expect(updated).toBe(true)

        const plan = orchestrator.getPendingPlan()
        expect(plan!.tasks[0]!.description).toBe('Updated search task')
    })

    it('updatePlanTask returns false for invalid index', async () => {
        const deps = createMockDeps(planJson)
        const orchestrator = new Orchestrator(deps as any)

        await orchestrator.createPlan('Do something')
        expect(orchestrator.updatePlanTask(99, { description: 'nope' })).toBe(false)
        expect(orchestrator.updatePlanTask(-1, { description: 'nope' })).toBe(false)
    })

    it('updatePlanTask returns false for invalid agent type', async () => {
        const deps = createMockDeps(planJson)
        deps.agentRegistry.has = mock((type: string) => ['search', 'code', 'research', 'test', 'init', 'review', 'qa', 'docs'].includes(type))
        const orchestrator = new Orchestrator(deps as any)

        await orchestrator.createPlan('Do something')
        expect(orchestrator.updatePlanTask(0, { agent: 'nonexistent' })).toBe(false)
        // Valid agent should work
        expect(orchestrator.updatePlanTask(0, { agent: 'code' })).toBe(true)
    })

    it('process clears pending plan', async () => {
        const deps = createMockDeps('Just a direct answer')
        const orchestrator = new Orchestrator(deps as any)

        // Manually set a plan
        await orchestrator.createPlan('something')
        // Now process normally — should clear the pending plan
        await orchestrator.process('Another question')
        expect(orchestrator.getPendingPlan()).toBeNull()
    })

    it('clearHistory also clears pending plan', async () => {
        const deps = createMockDeps(planJson)
        const orchestrator = new Orchestrator(deps as any)

        await orchestrator.createPlan('Do something')
        orchestrator.clearHistory()
        expect(orchestrator.getPendingPlan()).toBeNull()
    })
})

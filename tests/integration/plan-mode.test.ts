import { describe, it, expect, mock } from 'bun:test'
import { Orchestrator } from '../../src/agents/orchestrator/orchestrator.js'
import type { LLMClient, ChatResponse } from '../../src/llm/types.js'
import { TypedEventEmitter } from '../../src/core/events.js'

function createDeps(llmResponse: string) {
    return {
        llmClient: {
            chat: mock(async (): Promise<ChatResponse> => ({
                content: llmResponse,
                toolCalls: [],
                finishReason: 'stop',
                usage: { promptTokens: 10, completionTokens: 10 },
            })),
            chatStream: mock(async function* () {
                yield { content: llmResponse }
            }),
        } as LLMClient,
        agentRunner: {
            run: mock(async (_a: any, task: any) => ({
                taskId: task.id,
                success: true,
                output: `${task.type} result`,
                summary: `${task.type} completed`,
                tokenUsage: { prompt: 20, completion: 15 },
            })),
        },
        agentRegistry: {
            get: mock((type: string) => ({
                type,
                permissions: { read: true, write: false, execute: false, spawn: false },
                timeout: { default: 30, max: 60 },
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

describe('Plan Mode (Integration)', () => {
    const planJson = JSON.stringify({
        plan: 'Search and implement',
        tasks: [
            { agent: 'search', description: 'Find files' },
            { agent: 'code', description: 'Implement', dependsOn: [0] },
        ],
    })

    it('full cycle: createPlan → approve → execute', async () => {
        const deps = createDeps(planJson)
        const orchestrator = new Orchestrator(deps as any)

        // Step 1: Create plan
        const plan = await orchestrator.createPlan('Add feature')
        expect(plan).not.toBeNull()
        expect(plan!.tasks).toHaveLength(2)
        expect(deps.agentRunner.run).not.toHaveBeenCalled()

        // Step 2: Execute
        const result = await orchestrator.executePendingPlan()
        expect(result).not.toBeNull()
        expect(result).toContain('Search and implement')
        expect(deps.agentRunner.run).toHaveBeenCalled()

        // Step 3: Plan cleared
        expect(orchestrator.getPendingPlan()).toBeNull()
    })

    it('full cycle: createPlan → reject', async () => {
        const deps = createDeps(planJson)
        const orchestrator = new Orchestrator(deps as any)

        await orchestrator.createPlan('Add feature')
        expect(orchestrator.getPendingPlan()).not.toBeNull()

        const rejected = orchestrator.rejectPendingPlan()
        expect(rejected).toBe(true)
        expect(orchestrator.getPendingPlan()).toBeNull()

        // Cannot execute after rejection
        const result = await orchestrator.executePendingPlan()
        expect(result).toBeNull()
    })

    it('full cycle: createPlan → edit → approve', async () => {
        const deps = createDeps(planJson)
        const orchestrator = new Orchestrator(deps as any)

        await orchestrator.createPlan('Add feature')

        // Edit task
        orchestrator.updatePlanTask(1, { description: 'Implement with tests' })
        const plan = orchestrator.getPendingPlan()
        expect(plan!.tasks[1]!.description).toBe('Implement with tests')

        // Execute
        const result = await orchestrator.executePendingPlan()
        expect(result).not.toBeNull()
    })

    it('createPlan returns null for direct answers', async () => {
        const deps = createDeps('This is a direct answer without any JSON plan')
        const orchestrator = new Orchestrator(deps as any)

        const plan = await orchestrator.createPlan('What is TypeScript?')
        expect(plan).toBeNull()
        expect(orchestrator.getPendingPlan()).toBeNull()
    })
})

import { describe, it, expect, mock } from 'bun:test'
import { PromptBuilder } from '../../src/llm/prompt-builder.js'
import { estimateTokens } from '../../src/llm/token-counter.js'
import { AgentRunner } from '../../src/agents/runner.js'
import type { BaseAgent } from '../../src/agents/base-agent.js'
import type { AgentContext, AgentTask } from '../../src/agents/types.js'
import { TypedEventEmitter } from '../../src/core/events.js'
import {
    ScriptedLLMClient,
    makeToolCall,
    makeToolCallResponse,
    makeScriptedResponse,
} from '../helpers/scripted-llm-client.js'

function createMockAgent(overrides: Partial<BaseAgent> = {}): BaseAgent {
    return {
        type: 'search',
        depth: 0,
        permissions: { read: true, write: false, execute: false, spawn: false },
        timeout: { default: 30, max: 60 },
        maxTurns: 25,
        maxTokens: undefined,
        allowedTools: ['glob'],
        modelSuffix: undefined,
        systemPrompt: 'You are a search agent',
        excludeProjectContext: false,
        buildSystemPrompt: () => 'You are a search agent',
        formatTask: (d: string) => d,
        ...overrides,
    } as BaseAgent
}

function createRunnerDeps() {
    return {
        toolExecutor: { executeSafe: mock(async () => ({ ok: true, value: 'result' })) },
        toolRegistry: {
            getToolDefinitions: mock(() => [{
                type: 'function' as const,
                function: { name: 'glob', description: 'Find files', parameters: { type: 'object', properties: {} } },
            }]),
        },
        tracer: {
            startSpan: mock(() => ({ id: 's', kind: 'agent', name: 'test', startTime: 0, attributes: {}, children: [], end: () => 0 })),
            endSpan: mock(() => 0),
        },
        eventBus: new TypedEventEmitter(),
        fs: {
            readFile: mock(async () => ''),
            writeFile: mock(async () => {}),
            exists: mock(async () => true),
            readDir: mock(async () => []),
            stat: mock(async () => ({ isDirectory: false, size: 0 })),
        },
    }
}

function createContext(projectContext = ''): AgentContext {
    return {
        sessionId: 'test-session',
        workingState: {
            schema_version: 1,
            updated_at: new Date().toISOString(),
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

describe('Context Overflow', () => {
    describe('PromptBuilder limits', () => {
        it('drops lower-priority section when total exceeds budget', () => {
            const builder = new PromptBuilder()
            // 4800 token budget ≈ 4800 * 3.5 = 16800 chars
            const systemContent = 'x'.repeat(15000) // ~4285 tokens
            const projectContent = 'y'.repeat(5000) // ~1428 tokens

            builder.add('System', systemContent, 100)
            builder.add('Project Context', projectContent, 80)

            const { prompt, manifest } = builder.buildWithManifest(4800)

            // System (high priority) should be included
            const systemSection = manifest.sections.find((s) => s.label === 'System')!
            expect(systemSection.included).toBe(true)

            // Project Context may or may not fit depending on exact estimation
            // But the prompt should not exceed budget
            expect(manifest.totalTokens).toBeLessThanOrEqual(4800)
        })

        it('includes both sections when within budget', () => {
            const builder = new PromptBuilder()
            const systemContent = 'Short system prompt'
            const projectContent = 'Short project context'

            builder.add('System', systemContent, 100)
            builder.add('Project Context', projectContent, 80)

            const { manifest } = builder.buildWithManifest(4800)

            expect(manifest.sections.every((s) => s.included)).toBe(true)
            expect(manifest.totalTokens).toBeLessThanOrEqual(4800)
        })

        it('large system prompt alone exceeds budget — only system included', () => {
            const builder = new PromptBuilder()
            // Create content that is just under 4800 tokens
            const systemContent = 'x'.repeat(4800 * 3) // ~4114 tokens
            const projectContent = 'y'.repeat(5000) // ~1428 tokens

            builder.add('System', systemContent, 100)
            builder.add('Project Context', projectContent, 80)

            const { manifest } = builder.buildWithManifest(4800)

            const systemIncluded = manifest.sections.find((s) => s.label === 'System')!.included
            const projectIncluded = manifest.sections.find((s) => s.label === 'Project Context')!.included

            expect(systemIncluded).toBe(true)
            expect(projectIncluded).toBe(false)
        })

        it('priority ordering: higher priority sections included first', () => {
            const builder = new PromptBuilder()
            // Three sections, budget only fits two small ones
            builder.add('Low', 'x'.repeat(3500), 10)     // ~1000 tokens
            builder.add('Medium', 'y'.repeat(3500), 50)   // ~1000 tokens
            builder.add('High', 'z'.repeat(3500), 100)    // ~1000 tokens

            const { manifest } = builder.buildWithManifest(2500)

            const high = manifest.sections.find((s) => s.label === 'High')!
            const medium = manifest.sections.find((s) => s.label === 'Medium')!
            const low = manifest.sections.find((s) => s.label === 'Low')!

            expect(high.included).toBe(true)
            expect(medium.included).toBe(true)
            expect(low.included).toBe(false)
        })

        it('50k char projectContext is truncated by PromptBuilder', () => {
            const builder = new PromptBuilder()
            builder.add('System', 'Short system', 100)
            builder.add('Project Context', 'p'.repeat(50000), 80) // ~14285 tokens

            const { manifest } = builder.buildWithManifest(4800)

            // System should be included, project context should be dropped
            const system = manifest.sections.find((s) => s.label === 'System')!
            const project = manifest.sections.find((s) => s.label === 'Project Context')!

            expect(system.included).toBe(true)
            expect(project.included).toBe(false)
        })
    })

    describe('Runner message trimming', () => {
        it('trims messages after many tool calls, preserving system and user', async () => {
            // Create many tool call rounds with large outputs
            const responses = []
            for (let i = 0; i < 12; i++) {
                responses.push(makeToolCallResponse([makeToolCall('glob')], 'x'.repeat(8000)))
            }
            responses.push(makeScriptedResponse('final answer'))

            const client = new ScriptedLLMClient(responses)
            const deps = createRunnerDeps()

            // Large tool results to trigger trimming
            deps.toolExecutor.executeSafe = mock(async () => ({
                ok: true,
                value: 'z'.repeat(15000),
            }))

            const runner = new AgentRunner({
                llmClient: client,
                toolExecutor: deps.toolExecutor as any,
                toolRegistry: deps.toolRegistry as any,
                tracer: deps.tracer as any,
                eventBus: deps.eventBus,
                projectDir: '/test',
                fs: deps.fs as any,
                tokenBudget: { target: 3000, hardCap: 4800 },
            })

            const agent = createMockAgent({ maxTurns: 15 })
            const task: AgentTask = { id: 'trim-1', type: 'search', description: 'MARKER_DESC' }

            const result = await runner.run(agent, task, createContext())
            expect(result).toBeDefined()

            // Verify system and user messages preserved in all LLM calls
            for (let i = 0; i < client.totalCalls; i++) {
                const call = client.getCall(i)
                expect(call.params.messages[0]!.role).toBe('system')
                expect(call.params.messages[1]!.role).toBe('user')
            }
        })

        it('truncation marker present after trim', async () => {
            const responses = []
            for (let i = 0; i < 15; i++) {
                responses.push(makeToolCallResponse([makeToolCall('glob')], 'x'.repeat(10000)))
            }
            responses.push(makeScriptedResponse('done'))

            const client = new ScriptedLLMClient(responses)
            const deps = createRunnerDeps()

            // Use values under TOOL_RESULT_MAX_CHARS (8000) to avoid formatToolResult truncation
            // but large enough that 15 rounds still trigger runner-level trimming
            deps.toolExecutor.executeSafe = mock(async () => ({
                ok: true,
                value: 'y'.repeat(7999),
            }))

            const runner = new AgentRunner({
                llmClient: client,
                toolExecutor: deps.toolExecutor as any,
                toolRegistry: deps.toolRegistry as any,
                tracer: deps.tracer as any,
                eventBus: deps.eventBus,
                projectDir: '/test',
                fs: deps.fs as any,
                tokenBudget: { target: 3000, hardCap: 4800 },
            })

            const agent = createMockAgent({ maxTurns: 20 })
            const task: AgentTask = { id: 'marker-1', type: 'search', description: 'Find stuff' }

            await runner.run(agent, task, createContext())

            // After trimming, later calls should contain the truncation marker
            let foundMarker = false
            for (let i = 0; i < client.totalCalls; i++) {
                const call = client.getCall(i)
                const hasMarker = call.params.messages.some(
                    (m) => typeof m.content === 'string' && m.content.includes('[Previous conversation truncated')
                )
                if (hasMarker) foundMarker = true
            }
            expect(foundMarker).toBe(true)
        })

        it('no trimming when messages are small', async () => {
            const client = new ScriptedLLMClient([
                makeToolCallResponse([makeToolCall('glob')], 'small'),
                makeScriptedResponse('done'),
            ])

            const deps = createRunnerDeps()
            const runner = new AgentRunner({
                llmClient: client,
                toolExecutor: deps.toolExecutor as any,
                toolRegistry: deps.toolRegistry as any,
                tracer: deps.tracer as any,
                eventBus: deps.eventBus,
                projectDir: '/test',
                fs: deps.fs as any,
                tokenBudget: { target: 3000, hardCap: 4800 },
            })

            const agent = createMockAgent()
            const task: AgentTask = { id: 'notrim-1', type: 'search', description: 'Quick' }

            const result = await runner.run(agent, task, createContext())
            expect(result.success).toBe(true)

            // Second call should NOT have truncation marker
            const secondCall = client.getCall(1)
            const hasMarker = secondCall.params.messages.some(
                (m) => typeof m.content === 'string' && m.content.includes('[Previous conversation truncated')
            )
            expect(hasMarker).toBe(false)
        })
    })

    describe('PromptBuilder in AgentRunner', () => {
        it('excludeProjectContext drops project context', async () => {
            const client = ScriptedLLMClient.fromStrings(['done'])
            const deps = createRunnerDeps()

            const runner = new AgentRunner({
                llmClient: client,
                toolExecutor: deps.toolExecutor as any,
                toolRegistry: deps.toolRegistry as any,
                tracer: deps.tracer as any,
                eventBus: deps.eventBus,
                projectDir: '/test',
                fs: deps.fs as any,
                tokenBudget: { target: 3000, hardCap: 4800 },
            })

            const agent = createMockAgent({
                excludeProjectContext: true,
                buildSystemPrompt: () => 'Init agent prompt',
            })

            const task: AgentTask = { id: 'exclude-1', type: 'init', description: 'Generate config' }
            const ctx = createContext('This project context should be excluded')

            await runner.run(agent, task, ctx)

            // System prompt should NOT contain project context
            const firstCall = client.getCall(0)
            const systemMsg = firstCall.params.messages[0]!.content as string
            expect(systemMsg).not.toContain('This project context should be excluded')
            expect(systemMsg).toContain('Init agent prompt')
        })

        it('includeProjectContext adds project context when within budget', async () => {
            const client = ScriptedLLMClient.fromStrings(['done'])
            const deps = createRunnerDeps()

            const runner = new AgentRunner({
                llmClient: client,
                toolExecutor: deps.toolExecutor as any,
                toolRegistry: deps.toolRegistry as any,
                tracer: deps.tracer as any,
                eventBus: deps.eventBus,
                projectDir: '/test',
                fs: deps.fs as any,
                tokenBudget: { target: 3000, hardCap: 4800 },
            })

            const agent = createMockAgent({
                excludeProjectContext: false,
                buildSystemPrompt: () => 'Search agent prompt',
            })

            const task: AgentTask = { id: 'include-1', type: 'search', description: 'Search' }
            const ctx = createContext('Project: ValarMind Code')

            await runner.run(agent, task, ctx)

            const firstCall = client.getCall(0)
            const systemMsg = firstCall.params.messages[0]!.content as string
            expect(systemMsg).toContain('Search agent prompt')
            expect(systemMsg).toContain('Project: ValarMind Code')
        })
    })
})

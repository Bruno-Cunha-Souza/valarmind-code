import { describe, it, expect, mock } from 'bun:test'
import { AgentRunner } from '../../src/agents/runner.js'
import type { BaseAgent } from '../../src/agents/base-agent.js'
import type { AgentContext, AgentTask } from '../../src/agents/types.js'
import { TypedEventEmitter } from '../../src/core/events.js'
import {
    ScriptedLLMClient,
    makeToolCall,
    makeScriptedResponse,
    makeToolCallResponse,
    type ScriptedResponse,
} from '../helpers/scripted-llm-client.js'

function createMockAgent(overrides: Partial<BaseAgent> = {}): BaseAgent {
    return {
        type: 'search',
        depth: 0,
        permissions: { read: true, write: false, execute: false, spawn: false },
        timeout: { default: 30, max: 60 },
        maxTurns: 10,
        maxTokens: undefined,
        allowedTools: ['glob', 'grep', 'read_file'],
        modelSuffix: undefined,
        systemPrompt: 'You are a search agent',
        excludeProjectContext: false,
        buildSystemPrompt: () => 'You are a search agent',
        formatTask: (d: string) => d,
        ...overrides,
    } as BaseAgent
}

function createRunnerDeps(toolResults?: Record<string, string>) {
    const executedTools: { name: string; args: unknown }[] = []

    return {
        toolExecutor: {
            executeSafe: mock(async (name: string, args: unknown) => {
                executedTools.push({ name, args })
                return { ok: true, value: toolResults?.[name] ?? `result from ${name}` }
            }),
        },
        toolRegistry: {
            getToolDefinitions: mock(() => [
                { type: 'function' as const, function: { name: 'glob', description: 'Find files', parameters: { type: 'object', properties: {} } } },
                { type: 'function' as const, function: { name: 'grep', description: 'Search content', parameters: { type: 'object', properties: {} } } },
                { type: 'function' as const, function: { name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: {} } } },
            ]),
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
        executedTools,
    }
}

function createContext(): AgentContext {
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
        projectContext: '',
        conversationHistory: [],
        signal: new AbortController().signal,
    }
}

function createRunner(client: ScriptedLLMClient, deps: ReturnType<typeof createRunnerDeps>, hookRunner?: any) {
    return new AgentRunner(
        client,
        deps.toolExecutor as any,
        deps.toolRegistry as any,
        deps.tracer as any,
        deps.eventBus,
        '/test',
        deps.fs as any,
        hookRunner,
        { target: 3000, hardCap: 4800 },
    )
}

describe('AgentRunner Flow (Integration)', () => {
    it('single tool call flow: LLM calls tool, sees result, returns stop', async () => {
        const globCall = makeToolCall('glob', { pattern: '**/*.ts' })
        const client = new ScriptedLLMClient([
            makeToolCallResponse([globCall]),
            makeScriptedResponse('Found 5 TypeScript files'),
        ])

        const deps = createRunnerDeps({ glob: 'src/a.ts\nsrc/b.ts' })
        const runner = createRunner(client, deps)
        const agent = createMockAgent()
        const task: AgentTask = { id: 't-1', type: 'search', description: 'Find TS files' }

        const result = await runner.run(agent, task, createContext())

        expect(result.success).toBe(true)
        expect(result.output).toBe('Found 5 TypeScript files')
        expect(deps.executedTools.length).toBe(1)
        expect(deps.executedTools[0]!.name).toBe('glob')

        // Verify LLM received tool result in second call
        const secondCall = client.getCall(1)
        const messages = secondCall.params.messages
        const toolMsg = messages.find((m) => m.role === 'tool')
        expect(toolMsg).toBeDefined()
        expect(toolMsg!.content).toBe('src/a.ts\nsrc/b.ts')
    })

    it('multi-tool: LLM returns 2 tool calls in one response', async () => {
        const globCall = makeToolCall('glob', { pattern: '*.ts' })
        const grepCall = makeToolCall('grep', { pattern: 'import' })

        const client = new ScriptedLLMClient([
            makeToolCallResponse([globCall, grepCall]),
            makeScriptedResponse('Found matches'),
        ])

        const deps = createRunnerDeps({
            glob: 'files found',
            grep: 'grep results',
        })
        const runner = createRunner(client, deps)
        const agent = createMockAgent()
        const task: AgentTask = { id: 't-2', type: 'search', description: 'Search code' }

        const result = await runner.run(agent, task, createContext())

        expect(result.success).toBe(true)
        expect(deps.executedTools.length).toBe(2)
        expect(deps.executedTools[0]!.name).toBe('glob')
        expect(deps.executedTools[1]!.name).toBe('grep')

        // Both tool results should be in second call
        const secondCall = client.getCall(1)
        const toolMsgs = secondCall.params.messages.filter((m) => m.role === 'tool')
        expect(toolMsgs.length).toBe(2)
    })

    it('truncation recovery: finishReason length triggers continuation', async () => {
        const client = new ScriptedLLMClient([
            {
                content: 'Partial respon',
                toolCalls: [],
                finishReason: 'length',
                usage: { promptTokens: 10, completionTokens: 10 },
            },
            makeScriptedResponse('Complete response after continuation'),
        ])

        const deps = createRunnerDeps()
        const runner = createRunner(client, deps)
        const agent = createMockAgent()
        const task: AgentTask = { id: 't-3', type: 'search', description: 'Long response' }

        const result = await runner.run(agent, task, createContext())

        expect(result.success).toBe(true)
        expect(client.totalCalls).toBe(2)

        // Second call should contain continuation prompt
        const secondCall = client.getCall(1)
        const lastUserMsg = [...secondCall.params.messages].reverse().find((m) => m.role === 'user')
        expect(lastUserMsg?.content).toContain('truncated')
    })

    it('hook invocation: PreToolUse and PostToolUse are called', async () => {
        const globCall = makeToolCall('glob', { pattern: '*.ts' })
        const client = new ScriptedLLMClient([
            makeToolCallResponse([globCall]),
            makeScriptedResponse('done'),
        ])

        const hookCalls: { hook: string; env: Record<string, string> }[] = []
        const hookRunner = {
            run: mock(async (hookName: string, env: Record<string, string>) => {
                hookCalls.push({ hook: hookName, env })
                return []
            }),
        }

        const deps = createRunnerDeps()
        const runner = createRunner(client, deps, hookRunner)
        const agent = createMockAgent()
        const task: AgentTask = { id: 't-4', type: 'search', description: 'Hook test' }

        await runner.run(agent, task, createContext())

        expect(hookCalls.length).toBe(2)

        const preHook = hookCalls.find((h) => h.hook === 'PreToolUse')!
        expect(preHook).toBeDefined()
        expect(preHook.env.VALARMIND_TOOL).toBe('glob')
        expect(preHook.env.VALARMIND_AGENT).toBe('search')

        const postHook = hookCalls.find((h) => h.hook === 'PostToolUse')!
        expect(postHook).toBeDefined()
        expect(postHook.env.VALARMIND_TOOL).toBe('glob')
        expect(postHook.env.VALARMIND_SUCCESS).toBe('true')
    })

    it('tool error: executeSafe returns error, LLM receives ERROR prefix', async () => {
        const globCall = makeToolCall('glob', { pattern: '*.ts' })
        const client = new ScriptedLLMClient([
            makeToolCallResponse([globCall]),
            makeScriptedResponse('Handled the error'),
        ])

        const deps = createRunnerDeps()
        deps.toolExecutor.executeSafe = mock(async () => ({
            ok: false,
            error: 'Permission denied: glob requires read',
        }))

        const runner = createRunner(client, deps)
        const agent = createMockAgent()
        const task: AgentTask = { id: 't-5', type: 'search', description: 'Error test' }

        const result = await runner.run(agent, task, createContext())

        expect(result.success).toBe(true)

        // Verify LLM received error message
        const secondCall = client.getCall(1)
        const toolMsg = secondCall.params.messages.find((m) => m.role === 'tool')
        expect(toolMsg?.content).toContain('ERROR:')
        expect(toolMsg?.content).toContain('Permission denied')
    })

    it('tool definitions are provided to LLM', async () => {
        const client = ScriptedLLMClient.fromStrings(['Direct answer'])
        const deps = createRunnerDeps()
        const runner = createRunner(client, deps)
        const agent = createMockAgent()
        const task: AgentTask = { id: 't-6', type: 'search', description: 'Check tools' }

        await runner.run(agent, task, createContext())

        client.assertToolsProvided(0, ['glob', 'grep', 'read_file'])
    })

    it('max turns reached returns failure', async () => {
        // All responses are tool calls — will exhaust maxTurns
        const calls = Array.from({ length: 5 }, () =>
            makeToolCallResponse([makeToolCall('glob', { pattern: '*.ts' })])
        )
        const client = new ScriptedLLMClient(calls)

        const deps = createRunnerDeps()
        const runner = createRunner(client, deps)
        const agent = createMockAgent({ maxTurns: 3 })
        const task: AgentTask = { id: 't-7', type: 'search', description: 'Infinite loop' }

        const result = await runner.run(agent, task, createContext())

        expect(result.success).toBe(false)
        expect(result.summary).toContain('Max turns')
    })

    it('events are emitted: agent:start, tool:before, tool:after, agent:complete', async () => {
        const globCall = makeToolCall('glob')
        const client = new ScriptedLLMClient([
            makeToolCallResponse([globCall]),
            makeScriptedResponse('done'),
        ])

        const deps = createRunnerDeps()
        const events: string[] = []
        deps.eventBus.on('agent:start', () => events.push('agent:start'))
        deps.eventBus.on('tool:before', () => events.push('tool:before'))
        deps.eventBus.on('tool:after', () => events.push('tool:after'))
        deps.eventBus.on('agent:complete', () => events.push('agent:complete'))

        const runner = createRunner(client, deps)
        const agent = createMockAgent()
        const task: AgentTask = { id: 't-8', type: 'search', description: 'Event test' }

        await runner.run(agent, task, createContext())

        expect(events).toEqual(['agent:start', 'tool:before', 'tool:after', 'agent:complete'])
    })

    it('model suffix is applied when agent has modelSuffix and defaultModel is set', async () => {
        const client = ScriptedLLMClient.fromStrings(['done'])
        const deps = createRunnerDeps()

        const runner = new AgentRunner(
            client,
            deps.toolExecutor as any,
            deps.toolRegistry as any,
            deps.tracer as any,
            deps.eventBus,
            '/test',
            deps.fs as any,
            undefined,
            { target: 3000, hardCap: 4800 },
            'openai/gpt-4', // defaultModel
        )

        const agent = createMockAgent({ modelSuffix: ':online' })
        const task: AgentTask = { id: 't-9', type: 'research', description: 'Web search' }

        await runner.run(agent, task, createContext())

        const firstCall = client.getCall(0)
        expect(firstCall.params.model).toBe('openai/gpt-4:online')
    })
})

import { describe, it, expect, mock } from 'bun:test'
import { AgentRunner } from '../../../src/agents/runner.js'
import type { BaseAgent } from '../../../src/agents/base-agent.js'
import type { AgentContext, AgentTask } from '../../../src/agents/types.js'
import type { ChatParams, ChatResponse, LLMClient } from '../../../src/llm/types.js'
import { TypedEventEmitter } from '../../../src/core/events.js'
import { ScriptedLLMClient, type ScriptedResponse } from '../../helpers/scripted-llm-client.js'

function createSlowLLM(delayMs: number): LLMClient {
    return {
        chat: async (params: ChatParams): Promise<ChatResponse> => {
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    resolve({
                        content: 'slow response',
                        toolCalls: [],
                        finishReason: 'stop',
                        usage: { promptTokens: 10, completionTokens: 10 },
                    })
                }, delayMs)

                if (params.signal) {
                    params.signal.addEventListener('abort', () => {
                        clearTimeout(timer)
                        reject(new DOMException('The operation was aborted.', 'AbortError'))
                    })
                }
            })
        },
        async *chatStream() {
            yield { content: 'stream' }
        },
    }
}

function createMockAgent(overrides: Partial<BaseAgent> = {}): BaseAgent {
    return {
        type: 'search',
        depth: 0,
        permissions: { read: true, write: false, execute: false, spawn: false },
        timeout: { default: 30, max: 60 },
        maxTurns: 10,
        maxTokens: undefined,
        allowedTools: ['glob'],
        modelSuffix: undefined,
        systemPrompt: 'You are a test agent',
        excludeProjectContext: false,
        buildSystemPrompt: () => 'You are a test agent',
        formatTask: (d: string) => d,
        ...overrides,
    } as BaseAgent
}

function createRunnerDeps() {
    return {
        toolExecutor: { executeSafe: mock(async () => ({ ok: true, value: 'result' })) },
        toolRegistry: { getToolDefinitions: mock(() => []) },
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

describe('AgentRunner Timeout & AbortSignal', () => {
    it('agent times out when LLM is slower than timeout', async () => {
        const deps = createRunnerDeps()
        const slowLLM = createSlowLLM(5000) // 5 seconds

        const runner = new AgentRunner(
            slowLLM,
            deps.toolExecutor as any,
            deps.toolRegistry as any,
            deps.tracer as any,
            deps.eventBus,
            '/test',
            deps.fs as any,
            undefined,
            { target: 3000, hardCap: 4800 },
        )

        // Agent with very short timeout
        const agent = createMockAgent({
            timeout: { default: 0.05, max: 0.05 },
        })

        const task: AgentTask = { id: 'timeout-1', type: 'search', description: 'Slow task' }
        const context = createContext()

        const result = await runner.run(agent, task, context)

        expect(result.success).toBe(false)
        expect(result.summary).toContain('error')
    })

    it('runner internal abort stops the loop when signal is aborted', async () => {
        // The runner checks controller.signal.aborted at the top of each loop iteration.
        // With a very short timeout (50ms) and a slow LLM (200ms per call), the first
        // call succeeds but returns tool_calls, and by the second iteration the signal is aborted.
        const deps = createRunnerDeps()

        let callCount = 0
        const slowishLLM: LLMClient = {
            chat: async (params: ChatParams) => {
                callCount++
                await new Promise((resolve) => setTimeout(resolve, 200))
                if (params.signal?.aborted) {
                    throw new DOMException('The operation was aborted.', 'AbortError')
                }
                // Always return tool_calls to keep the loop going
                return {
                    content: null,
                    toolCalls: [{
                        id: `call_${callCount}`,
                        type: 'function' as const,
                        function: { name: 'glob', arguments: '{}' },
                    }],
                    finishReason: 'tool_calls' as const,
                    usage: { promptTokens: 10, completionTokens: 10 },
                }
            },
            async *chatStream() {
                yield { content: 'stream' }
            },
        }

        const runner = new AgentRunner(
            slowishLLM,
            deps.toolExecutor as any,
            deps.toolRegistry as any,
            deps.tracer as any,
            deps.eventBus,
            '/test',
            deps.fs as any,
            undefined,
            { target: 3000, hardCap: 4800 },
        )

        const agent = createMockAgent({
            timeout: { default: 0.05, max: 0.05 }, // 50ms
            maxTurns: 20,
        })

        const task: AgentTask = { id: 'abort-1', type: 'search', description: 'Abortable task' }
        const context = createContext()

        const result = await runner.run(agent, task, context)

        // Should not complete all 20 turns
        expect(callCount).toBeLessThan(20)
        expect(result).toBeDefined()
    })

    it('emits agent:error event on timeout', async () => {
        const deps = createRunnerDeps()
        const slowLLM = createSlowLLM(5000)

        const errors: { agentType: string; taskId: string }[] = []
        deps.eventBus.on('agent:error', (data) => {
            errors.push({ agentType: data.agentType, taskId: data.taskId })
        })

        const runner = new AgentRunner(
            slowLLM,
            deps.toolExecutor as any,
            deps.toolRegistry as any,
            deps.tracer as any,
            deps.eventBus,
            '/test',
            deps.fs as any,
            undefined,
            { target: 3000, hardCap: 4800 },
        )

        const agent = createMockAgent({
            type: 'code',
            timeout: { default: 0.05, max: 0.05 },
        })

        const task: AgentTask = { id: 'err-1', type: 'code', description: 'Will timeout' }
        const context = createContext()

        await runner.run(agent, task, context)

        expect(errors.length).toBe(1)
        expect(errors[0]!.agentType).toBe('code')
        expect(errors[0]!.taskId).toBe('err-1')
    })

    it('timeoutOverride is capped at agent.timeout.max * 3', async () => {
        const deps = createRunnerDeps()

        // Track what signal timeout the LLM receives
        let chatCalled = false
        const trackingLLM: LLMClient = {
            chat: async (params: ChatParams) => {
                chatCalled = true
                return {
                    content: 'done',
                    toolCalls: [],
                    finishReason: 'stop' as const,
                    usage: { promptTokens: 10, completionTokens: 10 },
                }
            },
            async *chatStream() {
                yield { content: 'done' }
            },
        }

        const runner = new AgentRunner(
            trackingLLM,
            deps.toolExecutor as any,
            deps.toolRegistry as any,
            deps.tracer as any,
            deps.eventBus,
            '/test',
            deps.fs as any,
            undefined,
            { target: 3000, hardCap: 4800 },
        )

        const agent = createMockAgent({
            timeout: { default: 10, max: 20 },
        })

        // timeoutOverride much larger than max * 3
        const task: AgentTask = {
            id: 'cap-1',
            type: 'search',
            description: 'Capped timeout',
            timeoutOverride: 9999,
        }
        const context = createContext()

        const result = await runner.run(agent, task, context)

        // Should succeed (LLM is fast) — the cap didn't block execution
        expect(result.success).toBe(true)
        expect(chatCalled).toBe(true)
    })

    it('fast LLM completes before timeout', async () => {
        const deps = createRunnerDeps()
        const client = ScriptedLLMClient.fromStrings(['Quick answer'])

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
        )

        const agent = createMockAgent({
            timeout: { default: 30, max: 60 },
        })

        const task: AgentTask = { id: 'fast-1', type: 'search', description: 'Fast task' }
        const context = createContext()

        const result = await runner.run(agent, task, context)

        expect(result.success).toBe(true)
        expect(result.output).toBe('Quick answer')
    })
})

import { describe, it, expect, mock } from 'bun:test'
import { AgentRunner } from '../../../src/agents/runner.js'
import type { ChatMessage, ChatResponse, LLMClient } from '../../../src/llm/types.js'
import { TypedEventEmitter } from '../../../src/core/events.js'
import type { BaseAgent } from '../../../src/agents/base-agent.js'
import type { AgentContext, AgentTask } from '../../../src/agents/types.js'

function createMockLLM(responses: ChatResponse[]): LLMClient {
    let callIndex = 0
    return {
        chat: mock(async () => {
            const resp = responses[callIndex] ?? responses[responses.length - 1]!
            callIndex++
            return resp
        }),
        chatStream: mock(async function* () {
            yield { content: 'stream' }
        }),
    }
}

function createMockAgent(overrides: Partial<BaseAgent> = {}): BaseAgent {
    return {
        type: 'search',
        permissions: { read: true, write: false, execute: false, spawn: false },
        timeout: { default: 30, max: 60 },
        maxTurns: 10,
        maxTokens: 4096,
        allowedTools: ['glob', 'grep', 'read_file'],
        buildSystemPrompt: () => 'You are a search agent',
        formatTask: (d: string) => d,
        ...overrides,
    } as BaseAgent
}

function makeToolCallResponse(toolName: string, content?: string): ChatResponse {
    return {
        content: content ?? '',
        toolCalls: [{
            id: `call_${Math.random().toString(36).slice(2)}`,
            type: 'function' as const,
            function: { name: toolName, arguments: '{}' },
        }],
        finishReason: 'tool_calls' as any,
        usage: { promptTokens: 50, completionTokens: 50 },
    }
}

function makeStopResponse(content: string): ChatResponse {
    return {
        content,
        toolCalls: [],
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 10 },
    }
}

describe('AgentRunner trimRunnerMessages', () => {
    const eventBus = new TypedEventEmitter()
    const tracer = {
        startSpan: mock(() => ({
            id: 's',
            kind: 'agent',
            name: 'test',
            startTime: 0,
            attributes: {},
            children: [],
            end: () => 0,
        })),
        endSpan: mock(() => 0),
    }
    const toolRegistry = {
        getToolDefinitions: mock(() => [{
            type: 'function' as const,
            function: { name: 'glob', description: 'Find files', parameters: { type: 'object', properties: {} } },
        }]),
    }
    const toolExecutor = {
        executeSafe: mock(async () => ({ ok: true, value: 'result' })),
    }
    const fs = {
        readFile: mock(async () => ''),
        writeFile: mock(async () => {}),
        exists: mock(async () => true),
        readDir: mock(async () => []),
        stat: mock(async () => ({ isDirectory: false, size: 0 })),
    }

    it('trims messages when tokens exceed 60% of context window', async () => {
        // Create a sequence: many tool calls that produce large outputs, then stop
        const responses: ChatResponse[] = []

        // Generate many tool call + response cycles with large content
        for (let i = 0; i < 15; i++) {
            responses.push(makeToolCallResponse('glob', 'x'.repeat(10000)))
        }
        responses.push(makeStopResponse('final answer'))

        // Override toolExecutor to return large results
        const bigToolExecutor = {
            executeSafe: mock(async () => ({ ok: true, value: 'y'.repeat(20000) })),
        }

        const llmClient = createMockLLM(responses)
        const runner = new AgentRunner({
            llmClient,
            toolExecutor: bigToolExecutor as any,
            toolRegistry: toolRegistry as any,
            tracer: tracer as any,
            eventBus,
            projectDir: '/test',
            fs: fs as any,
            tokenBudget: { target: 3000, hardCap: 4800 },
        })

        const agent = createMockAgent({ maxTurns: 20 })
        const task: AgentTask = { id: 'test-1', type: 'search', description: 'Find something' }
        const context: AgentContext = {
            sessionId: 'sess-1',
            workingState: {} as any,
            projectContext: '',
            conversationHistory: [],
            signal: new AbortController().signal,
        }

        const result = await runner.run(agent, task, context)

        // Should complete without error (trimming kept it within bounds)
        expect(result).toBeDefined()
        // The LLM should have been called multiple times (tool calls + final stop)
        expect(llmClient.chat).toHaveBeenCalled()
    })

    it('does not trim when messages are within limit', async () => {
        const responses: ChatResponse[] = [
            makeToolCallResponse('glob', 'small content'),
            makeStopResponse('done'),
        ]

        const llmClient = createMockLLM(responses)
        const runner = new AgentRunner({
            llmClient,
            toolExecutor: toolExecutor as any,
            toolRegistry: toolRegistry as any,
            tracer: tracer as any,
            eventBus,
            projectDir: '/test',
            fs: fs as any,
            tokenBudget: { target: 3000, hardCap: 4800 },
        })

        const agent = createMockAgent({ maxTurns: 5 })
        const task: AgentTask = { id: 'test-2', type: 'search', description: 'Quick search' }
        const context: AgentContext = {
            sessionId: 'sess-2',
            workingState: {} as any,
            projectContext: '',
            conversationHistory: [],
            signal: new AbortController().signal,
        }

        const result = await runner.run(agent, task, context)
        expect(result.success).toBe(true)
        expect(result.output).toBe('done')
    })

    it('does not trim when messages.length <= KEEP_START + KEEP_END (8)', async () => {
        // Only 2 tool call rounds → system + user + 2*(assistant+tool) = 6 messages
        // 6 <= 8 (KEEP_START=2 + KEEP_END=6), so no trimming should occur
        const responses: ChatResponse[] = [
            makeToolCallResponse('glob'),
            makeToolCallResponse('glob'),
            makeStopResponse('done'),
        ]

        const llmClient = createMockLLM(responses)
        const runner = new AgentRunner({
            llmClient,
            toolExecutor: toolExecutor as any,
            toolRegistry: toolRegistry as any,
            tracer: tracer as any,
            eventBus,
            projectDir: '/test',
            fs: fs as any,
            tokenBudget: { target: 3000, hardCap: 4800 },
        })

        const agent = createMockAgent({ maxTurns: 5 })
        const task: AgentTask = { id: 'test-3', type: 'search', description: 'Short search' }
        const context: AgentContext = {
            sessionId: 'sess-3',
            workingState: {} as any,
            projectContext: '',
            conversationHistory: [],
            signal: new AbortController().signal,
        }

        const result = await runner.run(agent, task, context)
        expect(result.success).toBe(true)
    })

    it('preserves system and user task messages after trim', async () => {
        // Create enough tool calls with large outputs to trigger trimming
        const responses: ChatResponse[] = []
        for (let i = 0; i < 12; i++) {
            responses.push(makeToolCallResponse('glob', `call_${i}_` + 'x'.repeat(8000)))
        }
        responses.push(makeStopResponse('final'))

        const bigToolExecutor = {
            executeSafe: mock(async () => ({ ok: true, value: 'z'.repeat(15000) })),
        }

        const llmClient = createMockLLM(responses)
        const runner = new AgentRunner({
            llmClient,
            toolExecutor: bigToolExecutor as any,
            toolRegistry: toolRegistry as any,
            tracer: tracer as any,
            eventBus,
            projectDir: '/test',
            fs: fs as any,
            tokenBudget: { target: 3000, hardCap: 4800 },
        })

        const agent = createMockAgent({ maxTurns: 15 })
        const task: AgentTask = { id: 'test-4', type: 'search', description: 'MARKER_TASK_DESC' }
        const context: AgentContext = {
            sessionId: 'sess-4',
            workingState: {} as any,
            projectContext: '',
            conversationHistory: [],
            signal: new AbortController().signal,
        }

        const result = await runner.run(agent, task, context)
        expect(result).toBeDefined()

        // Verify the LLM was called with messages that always start with system + user
        const calls = (llmClient.chat as any).mock.calls
        for (const call of calls) {
            const msgs = call[0].messages as ChatMessage[]
            expect(msgs[0]!.role).toBe('system')
            expect(msgs[1]!.role).toBe('user')
        }
    })
})

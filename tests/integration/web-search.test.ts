import { describe, it, expect, mock } from 'bun:test'
import { ResearchAgent } from '../../src/agents/research/research-agent.js'
import { AgentRunner } from '../../src/agents/runner.js'
import { ToolRegistry } from '../../src/tools/registry.js'
import { ToolExecutor } from '../../src/tools/executor.js'
import { Tracer } from '../../src/tracing/tracer.js'
import { TypedEventEmitter } from '../../src/core/events.js'
import { PermissionManager } from '../../src/permissions/manager.js'
import { webFetchTool, cache } from '../../src/tools/web/web-fetch.js'
import type { LLMClient, ChatResponse, ChatParams } from '../../src/llm/types.js'
import type { ResolvedConfig } from '../../src/config/schema.js'
import type { FileSystem } from '../../src/core/fs.js'
import pino from 'pino'

const mockLogger = pino({ level: 'silent' })
const mockConfig = {
    logLevel: 'silent',
    permissionMode: 'auto',
} as ResolvedConfig

describe('Web Search Integration (Phase 5A)', () => {
    it('Research Agent uses :online model and completes task', async () => {
        const capturedModels: (string | undefined)[] = []

        const mockLLM: LLMClient = {
            chat: mock(async (params: ChatParams): Promise<ChatResponse> => {
                capturedModels.push(params.model)
                return {
                    content: 'The latest version of Bun is 1.3.8. Source: https://bun.sh',
                    toolCalls: [],
                    finishReason: 'stop',
                    usage: { promptTokens: 100, completionTokens: 50 },
                }
            }),
            chatStream: mock(async function* () {
                yield { content: 'streaming' }
            }),
        }

        const registry = new ToolRegistry()
        registry.register(webFetchTool)
        registry.registerForAgent('research', ['web_fetch'])

        const pm = new PermissionManager(mockConfig, mockLogger)
        const eventBus = new TypedEventEmitter()
        const tracer = new Tracer(mockLogger, eventBus)
        const executor = new ToolExecutor(registry, pm, tracer)

        const runner = new AgentRunner({
            llmClient: mockLLM,
            toolExecutor: executor,
            toolRegistry: registry,
            tracer,
            eventBus,
            projectDir: '/test',
            fs: {} as FileSystem,
            tokenBudget: { target: 3000, hardCap: 4800 },
            defaultModel: 'anthropic/claude-sonnet',
        })

        const agent = new ResearchAgent()
        const result = await runner.run(
            agent,
            { id: 'r1', description: 'What is the latest version of Bun?', type: 'research' },
            {}
        )

        expect(result.success).toBe(true)
        expect(result.output).toContain('Bun')
        expect(capturedModels[0]).toBe('anthropic/claude-sonnet:online')
    })

    it('web_fetch returns Markdown-converted content', async () => {
        cache.clear()

        // Mock fetch for this test
        const originalFetch = globalThis.fetch
        globalThis.fetch = mock(async () => ({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'content-type': 'text/html' }),
            text: async () =>
                '<html><body><h1>Documentation</h1><p>This is a <strong>paragraph</strong>.</p><ul><li>Item A</li><li>Item B</li></ul></body></html>',
        })) as any

        try {
            const result = await webFetchTool.execute(
                { url: 'https://docs.example.com/integration-test' },
                { fs: {} as any, cwd: '/test', agentType: 'research' }
            )

            expect(result).toContain('# Documentation')
            expect(result).toContain('**paragraph**')
            expect(result).toMatch(/-\s+Item A/)
        } finally {
            globalThis.fetch = originalFetch
        }
    })

    it('web_fetch cache works between calls', async () => {
        cache.clear()

        const originalFetch = globalThis.fetch
        const fetchMock = mock(async () => ({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'content-type': 'text/html' }),
            text: async () => '<html><body><p>Cached content</p></body></html>',
        }))
        globalThis.fetch = fetchMock as any

        try {
            const url = 'https://docs.example.com/cache-test'
            const ctx = { fs: {} as any, cwd: '/test', agentType: 'research' as const }

            const r1 = await webFetchTool.execute({ url }, ctx)
            const r2 = await webFetchTool.execute({ url }, ctx)

            expect(r1).toBe(r2)
            expect(fetchMock).toHaveBeenCalledTimes(1)
        } finally {
            globalThis.fetch = originalFetch
        }
    })
})

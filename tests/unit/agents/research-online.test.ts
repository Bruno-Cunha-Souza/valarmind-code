import { describe, it, expect, mock } from 'bun:test'
import { ResearchAgent } from '../../../src/agents/research/research-agent.js'
import { AgentRunner } from '../../../src/agents/runner.js'
import type { LLMClient, ChatResponse } from '../../../src/llm/types.js'
import { ToolRegistry } from '../../../src/tools/registry.js'
import { ToolExecutor } from '../../../src/tools/executor.js'
import { Tracer } from '../../../src/tracing/tracer.js'
import { TypedEventEmitter } from '../../../src/core/events.js'
import { PermissionManager } from '../../../src/permissions/manager.js'
import type { ResolvedConfig } from '../../../src/config/schema.js'
import type { FileSystem } from '../../../src/core/fs.js'
import pino from 'pino'

const mockLogger = pino({ level: 'silent' })

describe('ResearchAgent :online suffix', () => {
    it('returns :online as modelSuffix', () => {
        const agent = new ResearchAgent()
        expect(agent.modelSuffix).toBe(':online')
    })

    it('does not include web_search in allowedTools', () => {
        const agent = new ResearchAgent()
        expect(agent.allowedTools).not.toContain('web_search')
        expect(agent.allowedTools).toContain('web_fetch')
        expect(agent.allowedTools).toContain('read_file')
    })

    it('AgentRunner passes model with :online suffix for research agent', async () => {
        const capturedParams: any[] = []
        const mockLLM: LLMClient = {
            chat: mock(async (params): Promise<ChatResponse> => {
                capturedParams.push(params)
                return {
                    content: 'Research result',
                    toolCalls: [],
                    finishReason: 'stop',
                    usage: { promptTokens: 10, completionTokens: 10 },
                }
            }),
            chatStream: mock(async function* () {
                yield { content: 'chunk' }
            }),
        }

        const registry = new ToolRegistry()
        const pm = new PermissionManager(
            { logLevel: 'silent', permissionMode: 'auto' } as ResolvedConfig,
            mockLogger
        )
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
        await runner.run(agent, { id: 't1', description: 'Search for info', type: 'research' }, {})

        expect(capturedParams.length).toBeGreaterThan(0)
        expect(capturedParams[0].model).toBe('anthropic/claude-sonnet:online')
    })

    it('AgentRunner does not add suffix for agents without modelSuffix', async () => {
        const capturedParams: any[] = []
        const mockLLM: LLMClient = {
            chat: mock(async (params): Promise<ChatResponse> => {
                capturedParams.push(params)
                return {
                    content: 'Result',
                    toolCalls: [],
                    finishReason: 'stop',
                    usage: { promptTokens: 10, completionTokens: 10 },
                }
            }),
            chatStream: mock(async function* () {
                yield { content: 'chunk' }
            }),
        }

        const registry = new ToolRegistry()
        const pm = new PermissionManager(
            { logLevel: 'silent', permissionMode: 'auto' } as ResolvedConfig,
            mockLogger
        )
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

        // Use a mock agent with no modelSuffix
        const mockAgent = {
            type: 'code' as const,
            permissions: { read: true, write: true, execute: false, spawn: false },
            timeout: { default: 120, max: 300 },
            maxTurns: 25,
            modelSuffix: undefined,
            allowedTools: [],
            buildSystemPrompt: () => 'system prompt',
            formatTask: (d: string) => d,
            depth: 0,
        }

        await runner.run(mockAgent as any, { id: 't2', description: 'Code task', type: 'code' }, {})

        expect(capturedParams.length).toBeGreaterThan(0)
        expect(capturedParams[0].model).toBeUndefined()
    })
})

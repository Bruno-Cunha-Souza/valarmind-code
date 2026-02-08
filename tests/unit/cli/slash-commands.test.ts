import { describe, it, expect, mock } from 'bun:test'
import { handleSlashCommand, getSlashCommands } from '../../../src/cli/slash-commands.js'
import type { Container } from '../../../src/core/container.js'

function createMockContainer(): Container {
    return {
        config: {
            model: 'test-model',
            apiKey: 'test',
            baseURL: 'https://test.com',
            temperature: 0,
            maxTokens: 100,
            logLevel: 'silent',
            permissionMode: 'auto',
            tokenBudget: { target: 3000, hardCap: 4800 },
            planMode: false,
            agentTimeouts: {},
            hooks: {},
            mcp: {},
            projectDir: '/tmp/test',
            configDir: '/tmp/config',
        },
        stateManager: {
            load: mock(async () => ({
                schema_version: 1,
                updated_at: '',
                goal: 'Test goal',
                now: 'Testing',
                decisions_recent: [],
                tasks_open: [],
                conventions: {},
            })),
        },
        agentRegistry: {
            getAll: mock(() => [
                { type: 'search', allowedTools: ['read_file', 'glob'] },
                { type: 'code', allowedTools: ['read_file', 'write_file'] },
            ]),
        },
        orchestrator: {
            clearHistory: mock(() => {}),
            process: mock(async () => 'processed'),
            createPlan: mock(async () => ({
                plan: 'Test plan',
                tasks: [{ agent: 'search', description: 'Find files' }],
            })),
            executePendingPlan: mock(async () => 'executed'),
            rejectPendingPlan: mock(() => true),
            getPendingPlan: mock(() => ({
                plan: 'Test plan',
                tasks: [{ agent: 'search', description: 'Find files' }],
            })),
            processStream: mock(async function* () { yield 'streamed' }),
        },
        hookRunner: {
            run: mock(async () => []),
        },
        metricsCollector: {
            formatStatus: mock(() => 'Session tokens: 100'),
            getSessionTokens: mock(() => ({ prompt: 50, completion: 50, total: 100 })),
            getAgentMetrics: mock(() => new Map()),
        },
    } as unknown as Container
}

describe('Slash Commands', () => {
    it('/help lists all commands', async () => {
        const container = createMockContainer()
        const result = await handleSlashCommand('/help', container)
        expect(result).toContain('Available commands')
        expect(result).toContain('/help')
        expect(result).toContain('/plan')
        expect(result).toContain('/approve')
        expect(result).toContain('/reject')
        expect(result).toContain('/tasks')
        expect(result).toContain('/undo')
        expect(result).toContain('/diff')
        expect(result).toContain('/commit')
        expect(result).toContain('/status')
        expect(result).toContain('/agents')
        expect(result).toContain('/clear')
        expect(result).toContain('/init')
        expect(result).toContain('/compact')
        expect(result).toContain('/exit')
    })

    it('/status includes metrics', async () => {
        const container = createMockContainer()
        const result = await handleSlashCommand('/status', container)
        expect(result).toContain('Model: test-model')
        expect(result).toContain('Goal: Test goal')
        expect(result).toContain('Session tokens')
    })

    it('/agents lists agents', async () => {
        const container = createMockContainer()
        const result = await handleSlashCommand('/agents', container)
        expect(result).toContain('search')
        expect(result).toContain('code')
    })

    it('/clear clears history', async () => {
        const container = createMockContainer()
        const result = await handleSlashCommand('/clear', container)
        expect(result).toBe('History cleared.')
        expect(container.orchestrator.clearHistory).toHaveBeenCalled()
    })

    it('/plan requires args', async () => {
        const container = createMockContainer()
        const result = await handleSlashCommand('/plan', container)
        expect(result).toContain('Usage:')
    })

    it('/plan with args creates plan', async () => {
        const container = createMockContainer()
        const result = await handleSlashCommand('/plan test task', container)
        expect(result).toContain('Plan:')
        expect(result).toContain('Test plan')
    })

    it('/approve executes pending plan', async () => {
        const container = createMockContainer()
        const result = await handleSlashCommand('/approve', container)
        expect(result).toBe('executed')
    })

    it('/reject rejects plan', async () => {
        const container = createMockContainer()
        const result = await handleSlashCommand('/reject', container)
        expect(result).toBe('Plan rejected.')
    })

    it('/reject without plan returns message', async () => {
        const container = createMockContainer()
        ;(container.orchestrator as any).rejectPendingPlan = mock(() => false)
        const result = await handleSlashCommand('/reject', container)
        expect(result).toContain('No pending plan')
    })

    it('/tasks lists pending plan tasks', async () => {
        const container = createMockContainer()
        const result = await handleSlashCommand('/tasks', container)
        expect(result).toContain('Test plan')
        expect(result).toContain('search')
    })

    it('/commit requires message', async () => {
        const container = createMockContainer()
        const result = await handleSlashCommand('/commit', container)
        expect(result).toContain('Usage:')
    })

    it('returns null for unknown command', async () => {
        const container = createMockContainer()
        const result = await handleSlashCommand('/unknown', container)
        expect(result).toBeNull()
    })

    it('getSlashCommands returns all commands', () => {
        const commands = getSlashCommands()
        expect(commands.length).toBeGreaterThanOrEqual(14)
        const names = commands.map((c) => c.name)
        expect(names).toContain('/help')
        expect(names).toContain('/plan')
        expect(names).toContain('/approve')
        expect(names).toContain('/reject')
        expect(names).toContain('/tasks')
        expect(names).toContain('/undo')
        expect(names).toContain('/diff')
        expect(names).toContain('/commit')
    })
})

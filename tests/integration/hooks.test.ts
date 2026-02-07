import { describe, it, expect, mock } from 'bun:test'
import { HookRunner } from '../../src/hooks/runner.js'
import { TypedEventEmitter } from '../../src/core/events.js'
import type { ResolvedConfig } from '../../src/config/schema.js'

function createConfig(hooks: ResolvedConfig['hooks'] = {}): ResolvedConfig {
    return {
        model: 'test',
        apiKey: 'test',
        baseURL: 'https://test.com',
        temperature: 0,
        maxTokens: 100,
        logLevel: 'silent',
        permissionMode: 'auto',
        tokenBudget: { target: 3000, hardCap: 4800 },
        planMode: false,
        agentTimeouts: {},
        hooks,
        mcp: {},
        projectDir: '/tmp',
        configDir: '/tmp',
    }
}

function createLogger() {
    return {
        info: mock(() => {}),
        warn: mock(() => {}),
        error: mock(() => {}),
        debug: mock(() => {}),
        fatal: mock(() => {}),
        trace: mock(() => {}),
        child: mock(function (this: any) { return this }),
        level: 'silent',
    }
}

describe('Hooks Integration', () => {
    it('PreToolUse hooks receive correct env vars', async () => {
        const config = createConfig({
            PreToolUse: [{ command: 'echo "$VALARMIND_TOOL $VALARMIND_AGENT"', timeout: 5000 }],
        })
        const eventBus = new TypedEventEmitter()
        const runner = new HookRunner(config, createLogger() as any, eventBus)

        const results = await runner.run('PreToolUse', {
            VALARMIND_TOOL: 'read_file',
            VALARMIND_AGENT: 'search',
            VALARMIND_ARGS: '{"path":"/test"}',
        })

        expect(results).toHaveLength(1)
        expect(results[0]!.success).toBe(true)
        expect(results[0]!.output).toContain('read_file')
        expect(results[0]!.output).toContain('search')
    })

    it('PostToolUse hooks receive success status', async () => {
        const config = createConfig({
            PostToolUse: [{ command: 'echo "$VALARMIND_SUCCESS"', timeout: 5000 }],
        })
        const eventBus = new TypedEventEmitter()
        const runner = new HookRunner(config, createLogger() as any, eventBus)

        const results = await runner.run('PostToolUse', {
            VALARMIND_TOOL: 'write_file',
            VALARMIND_AGENT: 'code',
            VALARMIND_SUCCESS: 'true',
        })

        expect(results).toHaveLength(1)
        expect(results[0]!.output).toContain('true')
    })

    it('SessionEnd hooks receive session ID', async () => {
        const config = createConfig({
            SessionEnd: [{ command: 'echo "$VALARMIND_SESSION_ID"', timeout: 5000 }],
        })
        const eventBus = new TypedEventEmitter()
        const runner = new HookRunner(config, createLogger() as any, eventBus)

        const results = await runner.run('SessionEnd', {
            VALARMIND_SESSION_ID: 'session-abc-123',
        })

        expect(results).toHaveLength(1)
        expect(results[0]!.output).toContain('session-abc-123')
    })

    it('multiple hooks run sequentially', async () => {
        const config = createConfig({
            PreToolUse: [
                { command: 'echo "first"', timeout: 5000 },
                { command: 'echo "second"', timeout: 5000 },
            ],
        })
        const eventBus = new TypedEventEmitter()
        const runner = new HookRunner(config, createLogger() as any, eventBus)

        const results = await runner.run('PreToolUse')
        expect(results).toHaveLength(2)
        expect(results[0]!.output).toContain('first')
        expect(results[1]!.output).toContain('second')
    })

    it('handles failing hooks gracefully', async () => {
        const config = createConfig({
            PreToolUse: [{ command: 'echo ok' }, { command: 'nonexistent_command_xyz', timeout: 2000 }],
        })
        const eventBus = new TypedEventEmitter()
        const logger = createLogger()
        const runner = new HookRunner(config, logger as any, eventBus)

        const results = await runner.run('PreToolUse')
        expect(results).toHaveLength(2)
        // First hook succeeds
        expect(results[0]!.success).toBe(true)
        // Second hook fails (command not found) — but execa reject:false returns anyway
    })
})

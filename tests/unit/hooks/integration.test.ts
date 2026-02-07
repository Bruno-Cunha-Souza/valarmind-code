import { describe, it, expect, mock } from 'bun:test'
import { HookRunner } from '../../../src/hooks/runner.js'
import { TypedEventEmitter } from '../../../src/core/events.js'
import type { ResolvedConfig } from '../../../src/config/schema.js'

function createMockConfig(hooks: ResolvedConfig['hooks'] = {}): ResolvedConfig {
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

function createMockLogger() {
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

describe('HookRunner integration', () => {
    it('runs no hooks when none configured', async () => {
        const eventBus = new TypedEventEmitter()
        const runner = new HookRunner(createMockConfig(), createMockLogger() as any, eventBus)
        const results = await runner.run('PreToolUse', { VALARMIND_TOOL: 'read_file' })
        expect(results).toEqual([])
    })

    it('runs configured hooks with env vars', async () => {
        const config = createMockConfig({
            PreToolUse: [{ command: 'echo $VALARMIND_TOOL', timeout: 5000 }],
        })
        const eventBus = new TypedEventEmitter()
        const runner = new HookRunner(config, createMockLogger() as any, eventBus)
        const results = await runner.run('PreToolUse', { VALARMIND_TOOL: 'read_file' })
        expect(results).toHaveLength(1)
        expect(results[0]!.success).toBe(true)
        expect(results[0]!.output).toContain('read_file')
    })

    it('handles PostToolUse hooks', async () => {
        const config = createMockConfig({
            PostToolUse: [{ command: 'echo "tool: $VALARMIND_TOOL success: $VALARMIND_SUCCESS"', timeout: 5000 }],
        })
        const eventBus = new TypedEventEmitter()
        const runner = new HookRunner(config, createMockLogger() as any, eventBus)
        const results = await runner.run('PostToolUse', {
            VALARMIND_TOOL: 'write_file',
            VALARMIND_AGENT: 'code',
            VALARMIND_SUCCESS: 'true',
        })
        expect(results).toHaveLength(1)
        expect(results[0]!.success).toBe(true)
    })

    it('handles SessionEnd hooks', async () => {
        const config = createMockConfig({
            SessionEnd: [{ command: 'echo $VALARMIND_SESSION_ID', timeout: 5000 }],
        })
        const eventBus = new TypedEventEmitter()
        const runner = new HookRunner(config, createMockLogger() as any, eventBus)
        const results = await runner.run('SessionEnd', { VALARMIND_SESSION_ID: 'test-123' })
        expect(results).toHaveLength(1)
        expect(results[0]!.output).toContain('test-123')
    })

    it('handles PreCompact hooks', async () => {
        const config = createMockConfig({
            PreCompact: [{ command: 'echo compact', timeout: 5000 }],
        })
        const eventBus = new TypedEventEmitter()
        const runner = new HookRunner(config, createMockLogger() as any, eventBus)
        const results = await runner.run('PreCompact')
        expect(results).toHaveLength(1)
        expect(results[0]!.success).toBe(true)
    })

    it('handles hook failure gracefully', async () => {
        const config = createMockConfig({
            PreToolUse: [{ command: 'exit 1', timeout: 5000 }],
        })
        const eventBus = new TypedEventEmitter()
        const logger = createMockLogger()
        const runner = new HookRunner(config, logger as any, eventBus)
        const results = await runner.run('PreToolUse')
        expect(results).toHaveLength(1)
        // Even failed commands return results (execa with reject: false)
    })
})

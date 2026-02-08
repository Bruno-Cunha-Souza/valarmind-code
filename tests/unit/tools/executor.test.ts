import { describe, it, expect, mock } from 'bun:test'
import { z } from 'zod'
import { ToolExecutor } from '../../../src/tools/executor.js'
import { ToolRegistry } from '../../../src/tools/registry.js'
import { PermissionManager } from '../../../src/permissions/manager.js'
import { Tracer } from '../../../src/tracing/tracer.js'
import { TypedEventEmitter } from '../../../src/core/events.js'
import type { AnyTool, ToolContext } from '../../../src/tools/types.js'
import type { ResolvedConfig } from '../../../src/config/schema.js'
import pino from 'pino'

const mockLogger = pino({ level: 'silent' })
const mockConfig = {
    logLevel: 'silent',
    permissionMode: 'auto',
} as ResolvedConfig

function createExecutor(tools: AnyTool[], config?: Partial<ResolvedConfig>) {
    const registry = new ToolRegistry()
    for (const tool of tools) registry.register(tool)

    const pm = new PermissionManager({ ...mockConfig, ...config } as ResolvedConfig, mockLogger)
    const tracer = new Tracer(mockLogger, new TypedEventEmitter())
    return { executor: new ToolExecutor(registry, pm, tracer), pm }
}

const dummyCtx: ToolContext = {
    fs: {} as never,
    cwd: '/test',
    agentType: 'code',
}

describe('ToolExecutor', () => {
    it('returns error for unknown tool', async () => {
        const { executor } = createExecutor([])
        const result = await executor.executeSafe('unknown', {}, dummyCtx, {
            agentPermissions: { read: true, write: true, execute: false, spawn: false },
        })
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.error).toContain('not found')
    })

    it('returns error for invalid params', async () => {
        const tool: AnyTool = {
            name: 'test_tool',
            description: 'test',
            parameters: z.object({ path: z.string() }),
            requiredPermission: 'read',
            execute: async () => 'ok',
        }
        const { executor } = createExecutor([tool])
        const result = await executor.executeSafe('test_tool', { path: 123 }, dummyCtx, {
            agentPermissions: { read: true, write: false, execute: false, spawn: false },
        })
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.error).toContain('Invalid params')
    })

    it('returns error for permission denied', async () => {
        const tool: AnyTool = {
            name: 'write_tool',
            description: 'writes',
            parameters: z.object({}),
            requiredPermission: 'write',
            execute: async () => 'ok',
        }
        const { executor } = createExecutor([tool])
        const result = await executor.executeSafe('write_tool', {}, dummyCtx, {
            agentPermissions: { read: true, write: false, execute: false, spawn: false },
        })
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.error).toContain('Permission denied')
    })

    it('executes tool successfully', async () => {
        const tool: AnyTool = {
            name: 'echo',
            description: 'echoes',
            parameters: z.object({ text: z.string() }),
            requiredPermission: 'read',
            execute: async (input: unknown) => (input as { text: string }).text,
        }
        const { executor } = createExecutor([tool])
        const result = await executor.executeSafe('echo', { text: 'hello' }, dummyCtx, {
            agentPermissions: { read: true, write: false, execute: false, spawn: false },
        })
        expect(result.ok).toBe(true)
        if (result.ok) expect(result.value).toBe('hello')
    })

    it('catches execution errors and returns as text', async () => {
        const tool: AnyTool = {
            name: 'fail_tool',
            description: 'always fails',
            parameters: z.object({}),
            requiredPermission: 'read',
            execute: async () => {
                throw new Error('boom')
            },
        }
        const { executor } = createExecutor([tool])
        const result = await executor.executeSafe('fail_tool', {}, dummyCtx, {
            agentPermissions: { read: true, write: false, execute: false, spawn: false },
        })
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.error).toContain('boom')
    })

    it('calls requestPermission for write tools', async () => {
        const tool: AnyTool = {
            name: 'write_file',
            description: 'writes a file',
            parameters: z.object({ path: z.string() }),
            requiredPermission: 'write',
            execute: async () => 'ok',
        }
        // Use 'auto' mode so requestPermission auto-grants
        const { executor, pm } = createExecutor([tool], { permissionMode: 'auto' } as Partial<ResolvedConfig>)
        const spy = mock(() => Promise.resolve({ granted: true }))
        pm.requestPermission = spy as any

        const result = await executor.executeSafe('write_file', { path: '/test' }, dummyCtx, {
            agentPermissions: { read: true, write: true, execute: false, spawn: false },
        })

        expect(result.ok).toBe(true)
        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy.mock.calls[0][0]).toMatchObject({
            toolName: 'write_file',
            permission: 'write',
        })
    })

    it('calls requestPermission for execute tools', async () => {
        const tool: AnyTool = {
            name: 'bash',
            description: 'runs a command',
            parameters: z.object({ cmd: z.string() }),
            requiredPermission: 'execute',
            execute: async () => 'ok',
        }
        const { executor, pm } = createExecutor([tool], { permissionMode: 'auto' } as Partial<ResolvedConfig>)
        const spy = mock(() => Promise.resolve({ granted: true }))
        pm.requestPermission = spy as any

        const result = await executor.executeSafe('bash', { cmd: 'ls' }, dummyCtx, {
            agentPermissions: { read: true, write: false, execute: true, spawn: false },
        })

        expect(result.ok).toBe(true)
        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy.mock.calls[0][0]).toMatchObject({
            toolName: 'bash',
            permission: 'execute',
        })
    })

    it('does NOT call requestPermission for read tools', async () => {
        const tool: AnyTool = {
            name: 'read_file',
            description: 'reads a file',
            parameters: z.object({ path: z.string() }),
            requiredPermission: 'read',
            execute: async () => 'content',
        }
        const { executor, pm } = createExecutor([tool])
        const spy = mock(() => Promise.resolve({ granted: true }))
        pm.requestPermission = spy as any

        const result = await executor.executeSafe('read_file', { path: '/test' }, dummyCtx, {
            agentPermissions: { read: true, write: false, execute: false, spawn: false },
        })

        expect(result.ok).toBe(true)
        expect(spy).not.toHaveBeenCalled()
    })

    it('returns error when user denies permission', async () => {
        const tool: AnyTool = {
            name: 'write_file',
            description: 'writes a file',
            parameters: z.object({ path: z.string() }),
            requiredPermission: 'write',
            execute: async () => 'ok',
        }
        const { executor, pm } = createExecutor([tool])
        pm.requestPermission = mock(() => Promise.resolve({ granted: false, reason: 'User said no' })) as any

        const result = await executor.executeSafe('write_file', { path: '/test' }, dummyCtx, {
            agentPermissions: { read: true, write: true, execute: false, spawn: false },
        })

        expect(result.ok).toBe(false)
        if (!result.ok) {
            expect(result.error).toContain('Permission denied by user')
            expect(result.error).toContain('User said no')
        }
    })
})

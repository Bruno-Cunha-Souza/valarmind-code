import { describe, it, expect } from 'bun:test'
import { PluginManager } from '../../src/plugins/manager.js'
import type { HookPlugin, PluginContext } from '../../src/plugins/types.js'
import pino from 'pino'

const mockLogger = pino({ level: 'silent' })

function createMockContext(): PluginContext {
    return {
        config: {} as any,
        logger: mockLogger,
        eventBus: { emit: () => {}, on: () => {} } as any,
        mcpManager: {} as any,
    }
}

describe('Plugin Integration', () => {
    it('full lifecycle: register, trigger hook, shutdown', async () => {
        const ctx = createMockContext()
        const manager = new PluginManager(ctx, mockLogger)
        const events: string[] = []

        const plugin: HookPlugin = {
            name: 'audit-logger',
            version: '1.0.0',
            type: 'hook',
            hooks: {
                'pre:tool': async (event) => {
                    events.push(`pre:tool:${JSON.stringify(event)}`)
                    return { continue: true }
                },
                'post:tool': async (event) => {
                    events.push(`post:tool:${JSON.stringify(event)}`)
                    return { continue: true }
                },
            },
            activate: async () => { events.push('activated') },
            deactivate: async () => { events.push('deactivated') },
        }

        await manager.register(plugin)
        expect(events).toContain('activated')

        const result1 = await manager.triggerHook('pre:tool', { tool: 'bash', agent: 'code' })
        expect(result1.continue).toBe(true)
        expect(events).toContain('pre:tool:{"tool":"bash","agent":"code"}')

        const result2 = await manager.triggerHook('post:tool', { tool: 'bash', success: true })
        expect(result2.continue).toBe(true)

        await manager.shutdown()
        expect(events).toContain('deactivated')
        expect(manager.getHookPlugins()).toHaveLength(0)
    })

    it('multiple hook plugins chain correctly', async () => {
        const ctx = createMockContext()
        const manager = new PluginManager(ctx, mockLogger)
        const order: string[] = []

        const plugin1: HookPlugin = {
            name: 'logger',
            version: '1.0.0',
            type: 'hook',
            hooks: {
                'pre:tool': async () => {
                    order.push('logger')
                    return { continue: true }
                },
            },
            activate: async () => {},
            deactivate: async () => {},
        }

        const plugin2: HookPlugin = {
            name: 'validator',
            version: '1.0.0',
            type: 'hook',
            hooks: {
                'pre:tool': async () => {
                    order.push('validator')
                    return { continue: true }
                },
            },
            activate: async () => {},
            deactivate: async () => {},
        }

        await manager.register(plugin1)
        await manager.register(plugin2)

        await manager.triggerHook('pre:tool', {})
        expect(order).toEqual(['logger', 'validator'])
    })

    it('blocking plugin prevents subsequent plugins from running', async () => {
        const ctx = createMockContext()
        const manager = new PluginManager(ctx, mockLogger)

        const securityPlugin: HookPlugin = {
            name: 'security',
            version: '1.0.0',
            type: 'hook',
            hooks: {
                'pre:tool': async (event: any) => {
                    if (event.tool === 'bash' && event.command?.includes('rm -rf')) {
                        return { continue: false, message: 'Dangerous command blocked' }
                    }
                    return { continue: true }
                },
            },
            activate: async () => {},
            deactivate: async () => {},
        }

        await manager.register(securityPlugin)

        const blocked = await manager.triggerHook('pre:tool', { tool: 'bash', command: 'rm -rf /' })
        expect(blocked.continue).toBe(false)
        expect(blocked.message).toBe('Dangerous command blocked')

        const allowed = await manager.triggerHook('pre:tool', { tool: 'bash', command: 'echo hello' })
        expect(allowed.continue).toBe(true)
    })
})

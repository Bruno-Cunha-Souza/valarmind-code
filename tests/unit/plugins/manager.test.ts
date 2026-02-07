import { describe, it, expect } from 'bun:test'
import { PluginManager } from '../../../src/plugins/manager.js'
import type { AnyPlugin, HookPlugin, AgentPlugin, ProviderPlugin, PluginContext } from '../../../src/plugins/types.js'
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

function createHookPlugin(overrides: Partial<HookPlugin> = {}): HookPlugin {
    return {
        name: 'test-hook',
        version: '1.0.0',
        type: 'hook',
        hooks: {},
        activate: async () => {},
        deactivate: async () => {},
        ...overrides,
    }
}

function createAgentPlugin(overrides: Partial<AgentPlugin> = {}): AgentPlugin {
    return {
        name: 'test-agent',
        version: '1.0.0',
        type: 'agent',
        agentType: 'custom',
        permissions: { read: true, write: false, execute: false, web: false, spawn: false },
        tools: ['read_file'],
        systemPrompt: 'You are a custom agent.',
        activate: async () => {},
        deactivate: async () => {},
        ...overrides,
    }
}

describe('PluginManager', () => {
    it('registers a hook plugin', async () => {
        const ctx = createMockContext()
        const manager = new PluginManager(ctx, mockLogger)
        const plugin = createHookPlugin()

        await manager.register(plugin)

        expect(manager.getHookPlugins()).toHaveLength(1)
        expect(manager.getHookPlugins()[0].name).toBe('test-hook')
    })

    it('registers an agent plugin', async () => {
        const ctx = createMockContext()
        const manager = new PluginManager(ctx, mockLogger)
        const plugin = createAgentPlugin()

        await manager.register(plugin)

        const retrieved = manager.getAgentPlugin('test-agent')
        expect(retrieved).toBeDefined()
        expect(retrieved!.agentType).toBe('custom')
    })

    it('registers a provider plugin', async () => {
        const ctx = createMockContext()
        const manager = new PluginManager(ctx, mockLogger)
        const plugin: ProviderPlugin = {
            name: 'test-provider',
            version: '1.0.0',
            type: 'provider',
            providerName: 'ollama',
            models: [{ id: 'llama3', name: 'Llama 3', contextWindow: 8192 }],
            chat: async () => ({ content: 'ok' }),
            activate: async () => {},
            deactivate: async () => {},
        }

        await manager.register(plugin)

        const retrieved = manager.getProviderPlugin('test-provider')
        expect(retrieved).toBeDefined()
        expect(retrieved!.providerName).toBe('ollama')
    })

    it('calls activate on register', async () => {
        const ctx = createMockContext()
        const manager = new PluginManager(ctx, mockLogger)
        let activated = false
        const plugin = createHookPlugin({
            activate: async () => { activated = true },
        })

        await manager.register(plugin)

        expect(activated).toBe(true)
    })

    it('triggerHook executes matching handler', async () => {
        const ctx = createMockContext()
        const manager = new PluginManager(ctx, mockLogger)
        const plugin = createHookPlugin({
            hooks: {
                'pre:tool': async (event) => {
                    return { continue: true, modified: event }
                },
            },
        })

        await manager.register(plugin)

        const result = await manager.triggerHook('pre:tool', { tool: 'bash' })
        expect(result.continue).toBe(true)
    })

    it('triggerHook stops on continue=false', async () => {
        const ctx = createMockContext()
        const manager = new PluginManager(ctx, mockLogger)
        let secondCalled = false

        const plugin1 = createHookPlugin({
            name: 'blocker',
            hooks: {
                'pre:tool': async () => ({ continue: false, message: 'blocked' }),
            },
        })
        const plugin2 = createHookPlugin({
            name: 'second',
            hooks: {
                'pre:tool': async () => { secondCalled = true; return { continue: true } },
            },
        })

        await manager.register(plugin1)
        await manager.register(plugin2)

        const result = await manager.triggerHook('pre:tool', {})
        expect(result.continue).toBe(false)
        expect(result.message).toBe('blocked')
        expect(secondCalled).toBe(false)
    })

    it('triggerHook returns continue=true when no handler matches', async () => {
        const ctx = createMockContext()
        const manager = new PluginManager(ctx, mockLogger)

        const result = await manager.triggerHook('nonexistent', {})
        expect(result.continue).toBe(true)
    })

    it('getAgentPlugin returns undefined for non-agent plugins', async () => {
        const ctx = createMockContext()
        const manager = new PluginManager(ctx, mockLogger)
        const plugin = createHookPlugin()

        await manager.register(plugin)

        expect(manager.getAgentPlugin('test-hook')).toBeUndefined()
    })

    it('getProviderPlugin returns undefined for non-provider plugins', async () => {
        const ctx = createMockContext()
        const manager = new PluginManager(ctx, mockLogger)
        const plugin = createHookPlugin()

        await manager.register(plugin)

        expect(manager.getProviderPlugin('test-hook')).toBeUndefined()
    })

    it('validate rejects plugin without name', async () => {
        const ctx = createMockContext()
        const manager = new PluginManager(ctx, mockLogger)
        const invalid = { version: '1.0.0', activate: async () => {}, deactivate: async () => {} }

        await expect(manager.register(invalid as any)).rejects.toThrow('Invalid plugin')
    })

    it('validate rejects plugin without version', async () => {
        const ctx = createMockContext()
        const manager = new PluginManager(ctx, mockLogger)
        const invalid = { name: 'test', activate: async () => {}, deactivate: async () => {} }

        await expect(manager.register(invalid as any)).rejects.toThrow('Invalid plugin')
    })

    it('shutdown calls deactivate on all plugins', async () => {
        const ctx = createMockContext()
        const manager = new PluginManager(ctx, mockLogger)
        let deactivated1 = false
        let deactivated2 = false

        await manager.register(createHookPlugin({
            name: 'p1',
            deactivate: async () => { deactivated1 = true },
        }))
        await manager.register(createAgentPlugin({
            name: 'p2',
            deactivate: async () => { deactivated2 = true },
        }))

        await manager.shutdown()

        expect(deactivated1).toBe(true)
        expect(deactivated2).toBe(true)
    })

    it('shutdown clears all plugins', async () => {
        const ctx = createMockContext()
        const manager = new PluginManager(ctx, mockLogger)
        await manager.register(createHookPlugin())

        await manager.shutdown()

        expect(manager.getHookPlugins()).toHaveLength(0)
    })

    it('shutdown handles deactivation errors gracefully', async () => {
        const ctx = createMockContext()
        const manager = new PluginManager(ctx, mockLogger)
        await manager.register(createHookPlugin({
            deactivate: async () => { throw new Error('deactivation failed') },
        }))

        // Should not throw
        await manager.shutdown()
        expect(manager.getHookPlugins()).toHaveLength(0)
    })
})

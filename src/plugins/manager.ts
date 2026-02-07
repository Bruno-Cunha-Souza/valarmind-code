import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import type { Logger } from '../logger/index.js'
import type { AgentPlugin, AnyPlugin, HookPlugin, HookResult, PluginContext, ProviderPlugin } from './types.js'

const PluginBaseSchema = z.object({
    name: z.string().min(1),
    version: z.string().min(1),
    activate: z.function(),
    deactivate: z.function(),
})

export class PluginManager {
    private plugins = new Map<string, AnyPlugin>()
    private hookPlugins: HookPlugin[] = []

    constructor(
        private context: PluginContext,
        private logger: Logger
    ) {}

    async loadFromConfig(pluginNames: string[]): Promise<void> {
        for (const name of pluginNames) {
            try {
                await this.loadFromPath(name)
            } catch (error) {
                this.logger.error(`Failed to load plugin '${name}': ${(error as Error).message}`)
            }
        }
    }

    async loadFromPath(filePath: string): Promise<void> {
        let module: { default?: unknown }

        if (filePath.startsWith('/') || filePath.startsWith('./') || filePath.startsWith('../')) {
            module = await import(pathToFileURL(filePath).href)
        } else {
            module = await import(filePath)
        }

        const plugin = module.default
        if (!plugin || typeof plugin !== 'object') {
            throw new Error(`Plugin '${filePath}' must have a default export`)
        }

        await this.register(plugin as AnyPlugin)
    }

    async register(plugin: AnyPlugin): Promise<void> {
        this.validate(plugin)

        await plugin.activate(this.context)

        this.plugins.set(plugin.name, plugin)

        if ('type' in plugin && plugin.type === 'hook') {
            this.hookPlugins.push(plugin as HookPlugin)
        }

        this.logger.info(`Plugin loaded: ${plugin.name} v${plugin.version}`)
    }

    getHookPlugins(): HookPlugin[] {
        return [...this.hookPlugins]
    }

    getAgentPlugin(name: string): AgentPlugin | undefined {
        const plugin = this.plugins.get(name)
        if (plugin && 'type' in plugin && plugin.type === 'agent') {
            return plugin as AgentPlugin
        }
        return undefined
    }

    getProviderPlugin(name: string): ProviderPlugin | undefined {
        const plugin = this.plugins.get(name)
        if (plugin && 'type' in plugin && plugin.type === 'provider') {
            return plugin as ProviderPlugin
        }
        return undefined
    }

    async triggerHook(hookName: string, event: unknown): Promise<HookResult> {
        for (const plugin of this.hookPlugins) {
            const handler = plugin.hooks[hookName]
            if (!handler) continue

            const result = await handler(event, this.context)
            if (!result.continue) {
                return result
            }
        }

        return { continue: true }
    }

    async shutdown(): Promise<void> {
        for (const plugin of this.plugins.values()) {
            try {
                await plugin.deactivate()
            } catch (error) {
                this.logger.error(`Error deactivating plugin '${plugin.name}': ${(error as Error).message}`)
            }
        }

        this.plugins.clear()
        this.hookPlugins = []
    }

    private validate(plugin: unknown): asserts plugin is AnyPlugin {
        const result = PluginBaseSchema.safeParse(plugin)
        if (!result.success) {
            throw new Error(`Invalid plugin: ${result.error.message}`)
        }
    }
}

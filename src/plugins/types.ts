import type { ResolvedConfig } from '../config/schema.js'
import type { TypedEventEmitter } from '../core/events.js'
import type { ToolPermissions } from '../core/types.js'
import type { Logger } from '../logger/index.js'
import type { MCPManager } from '../mcp/manager.js'

export interface Plugin {
    name: string
    version: string
    description?: string
    activate(context: PluginContext): Promise<void>
    deactivate(): Promise<void>
}

export interface PluginContext {
    config: ResolvedConfig
    logger: Logger
    eventBus: TypedEventEmitter
    mcpManager: MCPManager
}

export interface HookPlugin extends Plugin {
    type: 'hook'
    hooks: Partial<Record<string, HookHandler>>
}

export type HookHandler = (event: unknown, context: PluginContext) => Promise<HookResult>

export interface HookResult {
    continue: boolean
    modified?: unknown
    message?: string
}

export interface AgentPlugin extends Plugin {
    type: 'agent'
    agentType: string
    permissions: ToolPermissions
    tools: string[]
    systemPrompt: string
}

export interface ProviderPlugin extends Plugin {
    type: 'provider'
    providerName: string
    models: { id: string; name: string; contextWindow: number }[]
    chat(params: unknown): Promise<unknown>
}

export type AnyPlugin = HookPlugin | AgentPlugin | ProviderPlugin

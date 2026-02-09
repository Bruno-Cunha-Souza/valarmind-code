import { Orchestrator } from '../agents/orchestrator/orchestrator.js'
import type { AgentRegistry } from '../agents/registry.js'
import { AgentRunner } from '../agents/runner.js'
import { createAgentRegistry } from '../agents/setup.js'
import type { ResolvedConfig } from '../config/schema.js'
import { HookRunner } from '../hooks/runner.js'
import { createLLMClient } from '../llm/client.js'
import { ModelRouter } from '../llm/model-router.js'
import type { LLMClient } from '../llm/types.js'
import type { Logger } from '../logger/index.js'
import { createLogger } from '../logger/index.js'
import { MCPManager } from '../mcp/manager.js'
import { ContextLoader } from '../memory/context-loader.js'
import { StateManager } from '../memory/state-manager.js'
import { PermissionManager } from '../permissions/manager.js'
import { PluginManager } from '../plugins/manager.js'
import { SandboxManager } from '../security/sandbox.js'
import { ToolExecutor } from '../tools/executor.js'
import type { ToolRegistry } from '../tools/registry.js'
import { createToolRegistry, registerMCPTools } from '../tools/setup.js'
import { TraceExporter } from '../tracing/exporter.js'
import { MetricsCollector } from '../tracing/metrics.js'
import { Tracer } from '../tracing/tracer.js'
import { TypedEventEmitter } from './events.js'
import { BunFileSystem, type FileSystem } from './fs.js'

export interface Container {
    config: ResolvedConfig
    logger: Logger
    eventBus: TypedEventEmitter
    tracer: Tracer
    traceExporter: TraceExporter
    fs: FileSystem
    llmClient: LLMClient
    toolRegistry: ToolRegistry
    toolExecutor: ToolExecutor
    agentRegistry: AgentRegistry
    agentRunner: AgentRunner
    stateManager: StateManager
    contextLoader: ContextLoader
    hookRunner: HookRunner
    permissionManager: PermissionManager
    orchestrator: Orchestrator
    metricsCollector: MetricsCollector
    mcpManager: MCPManager
    pluginManager: PluginManager
    sandboxManager: SandboxManager
    initialize(): Promise<void>
    shutdown(): Promise<void>
}

export function createContainer(config: ResolvedConfig): Container {
    const logger = createLogger(config)
    const eventBus = new TypedEventEmitter()
    const tracer = new Tracer(logger, eventBus)
    const traceExporter = new TraceExporter(logger)
    const fs = new BunFileSystem()
    const llmClient = createLLMClient(config, logger, tracer)
    const permissionManager = new PermissionManager(config, logger)
    const toolRegistry = createToolRegistry(config, logger, fs)
    const toolExecutor = new ToolExecutor(toolRegistry, permissionManager, tracer)
    const stateManager = new StateManager(config, fs, logger)
    const contextLoader = new ContextLoader(fs, stateManager)
    const hookRunner = new HookRunner(config, logger, eventBus)
    const agentRegistry = createAgentRegistry()
    const mcpManager = new MCPManager(config.mcp?.servers ?? {}, logger)
    const sandboxManager = new SandboxManager(config.sandbox?.enabled ?? false, logger)
    const pluginManager = new PluginManager({ config, logger, eventBus, mcpManager }, logger)
    const modelRouter = new ModelRouter({
        default: config.model,
        agentModels: config.agentModels,
        costTier: config.costTier,
    })
    const agentRunner = new AgentRunner({
        llmClient,
        toolExecutor,
        toolRegistry,
        tracer,
        eventBus,
        projectDir: config.projectDir,
        fs,
        hookRunner,
        tokenBudget: config.tokenBudget,
        defaultModel: config.model,
        sandboxManager,
        modelRouter,
    })
    const orchestrator = new Orchestrator({
        llmClient,
        agentRunner,
        agentRegistry,
        stateManager,
        contextLoader,
        tracer,
        eventBus,
        logger,
        projectDir: config.projectDir,
        config: { model: config.model },
        modelRouter,
    })
    const metricsCollector = new MetricsCollector(eventBus)

    const container: Container = {
        config,
        logger,
        eventBus,
        tracer,
        traceExporter,
        fs,
        llmClient,
        toolRegistry,
        toolExecutor,
        agentRegistry,
        agentRunner,
        stateManager,
        contextLoader,
        hookRunner,
        permissionManager,
        orchestrator,
        metricsCollector,
        mcpManager,
        pluginManager,
        sandboxManager,

        async initialize() {
            await mcpManager.initialize()
            await registerMCPTools(toolRegistry, mcpManager, config.mcpPermissions)
            await pluginManager.loadFromConfig(config.plugins ?? [])
        },

        async shutdown() {
            const errors: Error[] = []
            try {
                await pluginManager.shutdown()
            } catch (e) {
                errors.push(e instanceof Error ? e : new Error(String(e)))
            }
            try {
                await mcpManager.shutdown()
            } catch (e) {
                errors.push(e instanceof Error ? e : new Error(String(e)))
            }
            try {
                metricsCollector.dispose()
            } catch (e) {
                errors.push(e instanceof Error ? e : new Error(String(e)))
            }
            try {
                eventBus.removeAll()
            } catch (e) {
                errors.push(e instanceof Error ? e : new Error(String(e)))
            }
            if (errors.length > 0) {
                logger.warn({ errors: errors.map((e) => e.message) }, 'Errors during shutdown')
            }
        },
    }

    return container
}

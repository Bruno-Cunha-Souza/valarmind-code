import type { ResolvedConfig } from '../config/schema.js';
import type { Logger } from '../logger/index.js';
import { createLogger } from '../logger/index.js';
import { TypedEventEmitter } from './events.js';
import { BunFileSystem, type FileSystem } from './fs.js';
import { Tracer } from '../tracing/tracer.js';
import { TraceExporter } from '../tracing/exporter.js';
import { createLLMClient } from '../llm/client.js';
import type { LLMClient } from '../llm/types.js';
import { PermissionManager } from '../permissions/manager.js';
import { createToolRegistry } from '../tools/setup.js';
import { ToolRegistry } from '../tools/registry.js';
import { ToolExecutor } from '../tools/executor.js';
import { StateManager } from '../memory/state-manager.js';
import { ContextLoader } from '../memory/context-loader.js';
import { HookRunner } from '../hooks/runner.js';
import { AgentRunner } from '../agents/runner.js';
import { AgentRegistry } from '../agents/registry.js';
import { createAgentRegistry } from '../agents/setup.js';
import { Orchestrator } from '../agents/orchestrator/orchestrator.js';

export interface Container {
  config: ResolvedConfig;
  logger: Logger;
  eventBus: TypedEventEmitter;
  tracer: Tracer;
  traceExporter: TraceExporter;
  fs: FileSystem;
  llmClient: LLMClient;
  toolRegistry: ToolRegistry;
  toolExecutor: ToolExecutor;
  agentRegistry: AgentRegistry;
  agentRunner: AgentRunner;
  stateManager: StateManager;
  contextLoader: ContextLoader;
  hookRunner: HookRunner;
  permissionManager: PermissionManager;
  orchestrator: Orchestrator;
}

export function createContainer(config: ResolvedConfig): Container {
  const logger = createLogger(config);
  const eventBus = new TypedEventEmitter();
  const tracer = new Tracer(logger, eventBus);
  const traceExporter = new TraceExporter(logger);
  const fs = new BunFileSystem();
  const llmClient = createLLMClient(config, logger, tracer);
  const permissionManager = new PermissionManager(config, logger);
  const toolRegistry = createToolRegistry(config, logger, fs);
  const toolExecutor = new ToolExecutor(toolRegistry, permissionManager, tracer);
  const stateManager = new StateManager(config, fs, logger);
  const contextLoader = new ContextLoader(fs, stateManager);
  const hookRunner = new HookRunner(config, logger, eventBus);
  const agentRegistry = createAgentRegistry();
  const agentRunner = new AgentRunner(
    llmClient,
    toolExecutor,
    toolRegistry,
    tracer,
    eventBus,
    config.projectDir,
    fs,
  );
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
  });

  return {
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
  };
}

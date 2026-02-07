import { randomUUID } from 'node:crypto'
import type { AgentType } from '../../core/types.js'
import type { TypedEventEmitter } from '../../core/events.js'
import type { LLMClient, ChatMessage } from '../../llm/types.js'
import type { Logger } from '../../logger/index.js'
import type { Tracer } from '../../tracing/tracer.js'
import type { StateManager } from '../../memory/state-manager.js'
import type { ContextLoader, ProjectContext } from '../../memory/context-loader.js'
import type { AgentRunner } from '../runner.js'
import type { AgentRegistry } from '../registry.js'
import type { AgentContext, AgentResult, AgentTask } from '../types.js'
import { TaskManager } from './task-manager.js'
import { parsePlan, isDirectAnswer } from './planner.js'
import { ORCHESTRATOR_SYSTEM_PROMPT } from './system-prompt.js'

interface OrchestratorDeps {
    llmClient: LLMClient
    agentRunner: AgentRunner
    agentRegistry: AgentRegistry
    stateManager: StateManager
    contextLoader: ContextLoader
    tracer: Tracer
    eventBus: TypedEventEmitter
    logger: Logger
    projectDir: string
}

export class Orchestrator {
    private taskManager = new TaskManager()
    private conversationHistory: ChatMessage[] = []

    constructor(private deps: OrchestratorDeps) {}

    async process(input: string, signal?: AbortSignal): Promise<string> {
        const sessionId = randomUUID()
        this.deps.tracer.startTrace(sessionId)
        const span = this.deps.tracer.startSpan('orchestrator', { input: input.slice(0, 100) })

        try {
            // Load project context
            const projectContext = await this.deps.contextLoader.load(this.deps.projectDir)
            const state = await this.deps.stateManager.load()

            const agentContext: AgentContext = {
                sessionId,
                workingState: state,
                projectContext: this.buildProjectContextString(projectContext),
                conversationHistory: this.conversationHistory,
                signal: signal ?? new AbortController().signal,
            }

            // Ask LLM to classify and plan
            const systemPrompt =
                ORCHESTRATOR_SYSTEM_PROMPT +
                (projectContext.valarmindMd ? `\n\n## Project\n${projectContext.valarmindMd}` : '') +
                (projectContext.stateCompact ? `\n\n## Working State\n${projectContext.stateCompact}` : '')

            this.conversationHistory.push({ role: 'user', content: input })

            const planResponse = await this.deps.llmClient.chat({
                messages: [{ role: 'system', content: systemPrompt }, ...this.conversationHistory],
                signal,
            })

            const llmOutput = planResponse.content ?? ''

            // Direct answer (no delegation)
            if (isDirectAnswer(llmOutput)) {
                this.conversationHistory.push({ role: 'assistant', content: llmOutput })
                await this.deps.stateManager.update({ now: input })
                this.deps.tracer.endSpan(span)
                this.deps.tracer.endTrace()
                return llmOutput
            }

            // Plan with delegation
            const plan = parsePlan(llmOutput)
            if (!plan) {
                this.deps.tracer.endSpan(span)
                this.deps.tracer.endTrace()
                return llmOutput
            }

            this.deps.logger.info({ plan: plan.plan, tasks: plan.tasks.length }, 'Plan created')

            // Create managed tasks
            this.taskManager.clear()
            for (const t of plan.tasks) {
                this.taskManager.addTask(t.agent, t.description, t.dependsOn ?? [])
            }

            // Execute tasks respecting dependencies
            const results: AgentResult[] = []

            while (!this.taskManager.isComplete()) {
                const ready = this.taskManager.getReadyTasks()
                if (ready.length === 0) break

                // Run independent tasks in parallel
                const promises = ready.map(async (task, _idx) => {
                    const tasks = this.taskManager.getTasks()
                    const taskIndex = tasks.indexOf(task)
                    this.taskManager.markInProgress(taskIndex)

                    const agent = this.deps.agentRegistry.get(task.agent as AgentType)
                    if (!agent) {
                        this.taskManager.markFailed(taskIndex, `Agent '${task.agent}' not found`)
                        return null
                    }

                    // Enrich context with results from dependencies
                    const depContext: Record<string, unknown> = {}
                    for (const depIdx of task.dependsOn) {
                        const depTask = tasks[depIdx]
                        if (depTask?.result) {
                            depContext[`${depTask.agent}_result`] = depTask.result
                        }
                    }

                    const agentTask: AgentTask = {
                        id: task.id,
                        type: task.agent,
                        description: task.description,
                        context: depContext,
                    }

                    try {
                        const result = await this.deps.agentRunner.run(agent, agentTask, agentContext)
                        this.taskManager.markCompleted(taskIndex, result.output)
                        return result
                    } catch (error) {
                        this.taskManager.markFailed(taskIndex, (error as Error).message)
                        return null
                    }
                })

                const batchResults = await Promise.all(promises)
                for (const r of batchResults) {
                    if (r) results.push(r)
                }
            }

            // Synthesize results
            const summary = this.synthesize(plan.plan, results)
            this.conversationHistory.push({ role: 'assistant', content: summary })

            // Update state
            await this.deps.stateManager.update({
                now: plan.plan,
                goal: input,
            })

            this.deps.tracer.endSpan(span)
            this.deps.tracer.endTrace()
            return summary
        } catch (error) {
            this.deps.tracer.endSpan(span)
            this.deps.tracer.endTrace()
            throw error
        }
    }

    private buildProjectContextString(ctx: ProjectContext): string {
        const parts: string[] = []
        if (ctx.valarmindMd) parts.push(ctx.valarmindMd)
        if (ctx.localMd) parts.push(ctx.localMd)
        if (ctx.stateCompact) parts.push(ctx.stateCompact)
        return parts.join('\n\n---\n\n')
    }

    private synthesize(plan: string, results: AgentResult[]): string {
        const successCount = results.filter((r) => r.success).length
        const parts: string[] = []

        parts.push(`**Plan:** ${plan}`)
        parts.push(`**Results:** ${successCount}/${results.length} tasks completed\n`)

        for (const result of results) {
            if (result.success && result.summary) {
                parts.push(result.summary)
            } else if (!result.success) {
                parts.push(`[Failed] ${result.summary}`)
            }
        }

        return parts.join('\n\n')
    }

    clearHistory(): void {
        this.conversationHistory = []
    }
}

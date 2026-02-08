import { randomUUID } from 'node:crypto'
import { errorMessage } from '../../core/errors.js'
import type { TypedEventEmitter } from '../../core/events.js'
import type { AgentType } from '../../core/types.js'
import type { ChatMessage, LLMClient } from '../../llm/types.js'
import type { Logger } from '../../logger/index.js'
import type { ContextLoader, ProjectContext } from '../../memory/context-loader.js'
import type { StateManager } from '../../memory/state-manager.js'
import type { Tracer } from '../../tracing/tracer.js'
import type { AgentRegistry } from '../registry.js'
import type { AgentRunner } from '../runner.js'
import type { AgentContext, AgentResult, AgentTask } from '../types.js'
import type { Plan } from './planner.js'
import { isDirectAnswer, parsePlan } from './planner.js'
import { requiresQA, requiresReview } from './quality-gates.js'
import { parseQAOutput, parseReviewOutput } from './result-parser.js'
import { ORCHESTRATOR_SYSTEM_PROMPT } from './system-prompt.js'
import { TaskManager } from './task-manager.js'

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
    private static readonly MAX_HISTORY = 50
    private static readonly CORE_AGENTS = new Set(['search', 'code', 'test'])
    private taskManager = new TaskManager()
    private conversationHistory: ChatMessage[] = []
    private pendingPlan: Plan | null = null

    constructor(private deps: OrchestratorDeps) {}

    private trimHistory(): void {
        if (this.conversationHistory.length > Orchestrator.MAX_HISTORY) {
            this.conversationHistory = this.conversationHistory.slice(-Orchestrator.MAX_HISTORY)
        }
    }

    async process(input: string, signal?: AbortSignal): Promise<string> {
        // Clear any stale pending plan when processing normal input
        this.pendingPlan = null

        const sessionId = randomUUID()
        this.deps.tracer.startTrace(sessionId)
        const span = this.deps.tracer.startSpan('orchestrator', { input: input.slice(0, 100) })

        try {
            const { agentContext, systemPrompt } = await this.prepareContext(sessionId, signal)

            this.conversationHistory.push({ role: 'user', content: input })
            this.trimHistory()

            const planResponse = await this.deps.llmClient.chat({
                messages: [{ role: 'system', content: systemPrompt }, ...this.conversationHistory],
                signal,
            })

            const llmOutput = planResponse.content ?? ''

            // Direct answer (no delegation)
            if (isDirectAnswer(llmOutput)) {
                this.conversationHistory.push({ role: 'assistant', content: llmOutput })
                this.trimHistory()
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

            const results = await this.executePlan(plan, input, agentContext)

            // Apply quality gates
            const gateResults = await this.applyQualityGates(results, input, agentContext)
            results.push(...gateResults)

            // Synthesize results
            const summary = this.synthesize(plan.plan, results)
            this.conversationHistory.push({ role: 'assistant', content: summary })
            this.trimHistory()

            await this.deps.stateManager.update({ now: plan.plan, goal: input })
            this.deps.tracer.endSpan(span)
            this.deps.tracer.endTrace()
            return summary
        } catch (error) {
            this.deps.tracer.endSpan(span)
            this.deps.tracer.endTrace()
            throw error
        }
    }

    async *processStream(input: string, signal?: AbortSignal): AsyncIterable<string> {
        this.pendingPlan = null

        const sessionId = randomUUID()
        this.deps.tracer.startTrace(sessionId)
        const span = this.deps.tracer.startSpan('orchestrator', { input: input.slice(0, 100) })

        try {
            const { agentContext, systemPrompt } = await this.prepareContext(sessionId, signal)

            this.conversationHistory.push({ role: 'user', content: input })
            this.trimHistory()

            // Try streaming for a direct answer first
            const chunks: string[] = []
            let isStreaming = true

            for await (const chunk of this.deps.llmClient.chatStream({
                messages: [{ role: 'system', content: systemPrompt }, ...this.conversationHistory],
                signal,
            })) {
                if (chunk.content) {
                    chunks.push(chunk.content)
                    if (isStreaming) yield chunk.content
                }
                if (chunk.toolCalls && chunk.toolCalls.length > 0) {
                    isStreaming = false
                }
            }

            const fullContent = chunks.join('')

            if (isDirectAnswer(fullContent)) {
                this.conversationHistory.push({ role: 'assistant', content: fullContent })
                this.trimHistory()
                await this.deps.stateManager.update({ now: input })
            } else {
                // For plan-based execution, fall back to non-streaming
                const plan = parsePlan(fullContent)
                if (plan) {
                    const results = await this.executePlan(plan, input, agentContext)
                    const gateResults = await this.applyQualityGates(results, input, agentContext)
                    results.push(...gateResults)
                    const summary = this.synthesize(plan.plan, results)
                    this.conversationHistory.push({ role: 'assistant', content: summary })
                    this.trimHistory()
                    await this.deps.stateManager.update({ now: plan.plan, goal: input })
                    yield summary
                }
            }

            this.deps.tracer.endSpan(span)
            this.deps.tracer.endTrace()
        } catch (error) {
            this.deps.tracer.endSpan(span)
            this.deps.tracer.endTrace()
            throw error
        }
    }

    async createPlan(input: string, signal?: AbortSignal): Promise<Plan | null> {
        const sessionId = randomUUID()
        this.deps.tracer.startTrace(sessionId)

        try {
            const { systemPrompt } = await this.prepareContext(sessionId, signal)

            this.conversationHistory.push({ role: 'user', content: input })
            this.trimHistory()

            const planResponse = await this.deps.llmClient.chat({
                messages: [{ role: 'system', content: systemPrompt }, ...this.conversationHistory],
                signal,
            })

            const llmOutput = planResponse.content ?? ''
            const plan = parsePlan(llmOutput)

            if (plan) {
                this.pendingPlan = plan
                this.deps.logger.info({ plan: plan.plan, tasks: plan.tasks.length }, 'Plan created (pending approval)')
            }

            this.deps.tracer.endTrace()
            return plan
        } catch (error) {
            this.deps.tracer.endTrace()
            throw error
        }
    }

    async executePendingPlan(signal?: AbortSignal): Promise<string | null> {
        if (!this.pendingPlan) return null

        const plan = this.pendingPlan
        this.pendingPlan = null

        const sessionId = randomUUID()
        this.deps.tracer.startTrace(sessionId)
        const span = this.deps.tracer.startSpan('orchestrator', { plan: plan.plan })

        try {
            const { agentContext } = await this.prepareContext(sessionId, signal)

            const results = await this.executePlan(plan, plan.plan, agentContext)
            const gateResults = await this.applyQualityGates(results, plan.plan, agentContext)
            results.push(...gateResults)

            const summary = this.synthesize(plan.plan, results)
            this.conversationHistory.push({ role: 'assistant', content: summary })
            this.trimHistory()
            await this.deps.stateManager.update({ now: plan.plan, goal: plan.plan })

            this.deps.tracer.endSpan(span)
            this.deps.tracer.endTrace()
            return summary
        } catch (error) {
            this.deps.tracer.endSpan(span)
            this.deps.tracer.endTrace()
            throw error
        }
    }

    rejectPendingPlan(): boolean {
        if (!this.pendingPlan) return false
        this.pendingPlan = null
        return true
    }

    getPendingPlan(): Plan | null {
        return this.pendingPlan
    }

    updatePlanTask(index: number, changes: { description?: string; agent?: string }): boolean {
        if (!this.pendingPlan || index < 0 || index >= this.pendingPlan.tasks.length) return false
        const task = this.pendingPlan.tasks[index]!
        if (changes.description) task.description = changes.description
        if (changes.agent) {
            if (!this.deps.agentRegistry.has(changes.agent as AgentType)) return false
            task.agent = changes.agent as AgentType
        }
        return true
    }

    async executePrebuiltPlan(plan: Plan, signal?: AbortSignal): Promise<string> {
        const sessionId = randomUUID()
        this.deps.tracer.startTrace(sessionId)
        const span = this.deps.tracer.startSpan('orchestrator', { plan: plan.plan })

        try {
            const { agentContext } = await this.prepareContext(sessionId, signal)
            const results = await this.executePlan(plan, plan.plan, agentContext)

            // Filter out results from tasks marked as excludeFromSummary
            const managedTasks = this.taskManager.getTasks()
            const visibleResults = results.filter((r) => {
                const idx = managedTasks.findIndex((t) => t.id === r.taskId)
                return idx === -1 || !plan.tasks[idx]?.excludeFromSummary
            })

            const summary = this.synthesize(plan.plan, visibleResults.length > 0 ? visibleResults : results)

            this.deps.tracer.endSpan(span)
            this.deps.tracer.endTrace()
            return summary
        } catch (error) {
            this.deps.tracer.endSpan(span)
            this.deps.tracer.endTrace()
            throw error
        }
    }

    private async prepareContext(sessionId: string, signal?: AbortSignal) {
        const projectContext = await this.deps.contextLoader.load(this.deps.projectDir)
        const state = await this.deps.stateManager.load()

        const agentContext: AgentContext = {
            sessionId,
            workingState: state,
            projectContext: this.buildProjectContextString(projectContext),
            conversationHistory: this.conversationHistory,
            signal: signal ?? new AbortController().signal,
        }

        const systemPrompt =
            ORCHESTRATOR_SYSTEM_PROMPT +
            (projectContext.valarmindMd ? `\n\n## Project\n${projectContext.valarmindMd}` : '') +
            (projectContext.stateCompact ? `\n\n## Working State\n${projectContext.stateCompact}` : '')

        return { agentContext, systemPrompt, projectContext }
    }

    private async executePlan(plan: Plan, _input: string, agentContext: AgentContext): Promise<AgentResult[]> {
        this.deps.logger.info({ plan: plan.plan, tasks: plan.tasks.length }, 'Plan created')

        this.taskManager.clear()
        for (const t of plan.tasks) {
            this.taskManager.addTask(t.agent, t.description, t.dependsOn ?? [])
        }

        const results: AgentResult[] = []

        while (!this.taskManager.isComplete()) {
            if (agentContext.signal.aborted) break
            let ready = this.taskManager.getReadyTasks()
            if (ready.length === 0) {
                if (!agentContext.signal.aborted) {
                    const retried = this.retryTimedOutTasks()
                    if (retried > 0) {
                        ready = this.taskManager.getReadyTasks()
                    }
                }
                if (ready.length === 0) break
            }

            const promises = ready.map(async (task) => {
                const tasks = this.taskManager.getTasks()
                const taskIndex = tasks.indexOf(task)
                this.taskManager.markInProgress(taskIndex)

                const agent = this.deps.agentRegistry.get(task.agent as AgentType)
                if (!agent) {
                    const msg = `Agent '${task.agent}' not found`
                    this.taskManager.markFailed(taskIndex, msg)
                    return {
                        taskId: task.id,
                        success: false,
                        output: null,
                        summary: `Agent error: ${msg}`,
                        tokenUsage: { prompt: 0, completion: 0 },
                    } satisfies AgentResult
                }

                let depContext: Record<string, unknown> = {}
                for (const depIdx of task.dependsOn) {
                    const depTask = tasks[depIdx]
                    if (depTask?.result) {
                        depContext[`${depTask.agent}_${depIdx}_result`] = depTask.result
                    }
                }

                // TOON-encode dependency results when task opts in
                const planTask = plan.tasks[taskIndex]
                if (planTask?.toonCompact && Object.keys(depContext).length > 0) {
                    try {
                        const { encode } = await import('@toon-format/toon')
                        depContext = { _toon_encoded: encode(depContext) }
                    } catch {
                        // Fallback: use depContext as-is (JSON)
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
                    const msg = errorMessage(error)
                    this.taskManager.markFailed(taskIndex, msg)
                    return {
                        taskId: task.id,
                        success: false,
                        output: null,
                        summary: `Agent error: ${msg}`,
                        tokenUsage: { prompt: 0, completion: 0 },
                    } satisfies AgentResult
                }
            })

            const batchResults = await Promise.all(promises)
            for (const r of batchResults) {
                if (r) results.push(r)
            }
        }

        return results
    }

    private async applyQualityGates(results: AgentResult[], input: string, agentContext: AgentContext): Promise<AgentResult[]> {
        const codeResults = results.filter((r) => {
            const task = this.taskManager.getTasks().find((t) => t.id === r.taskId)
            return task?.agent === 'code'
        })

        if (codeResults.length === 0) return []

        const allFiles = codeResults.flatMap((r) => [...(r.filesModified ?? []), ...(r.filesCreated ?? [])])
        const gateInput = { filesModified: allFiles, description: input }

        const gateResults: AgentResult[] = []

        if (!requiresReview(gateInput)) return gateResults

        // Run review
        const reviewAgent = this.deps.agentRegistry.get('review')
        if (!reviewAgent) {
            this.deps.logger.warn('Review agent not registered, skipping quality gates')
            return gateResults
        }

        const MAX_FIX_ITERATIONS = 2
        let approved = false

        for (let i = 0; i <= MAX_FIX_ITERATIONS && !approved; i++) {
            const reviewDescription =
                i === 0
                    ? `Review the following code changes:\nFiles: ${allFiles.join(', ')}\nContext: ${input}`
                    : `Re-review after auto-fix iteration ${i}:\nFiles: ${allFiles.join(', ')}`

            const reviewTask: AgentTask = {
                id: randomUUID(),
                type: 'review',
                description: reviewDescription,
            }

            const reviewResult = await this.deps.agentRunner.run(reviewAgent, reviewTask, agentContext)
            gateResults.push(reviewResult)

            const parsed = parseReviewOutput(reviewResult.output)
            if (!parsed) {
                this.deps.logger.warn('Could not parse review output, skipping quality gates')
                break
            }

            if (parsed.approved) {
                approved = true
                break
            }

            // Auto-fix: send issues to code agent
            if (i < MAX_FIX_ITERATIONS) {
                const codeAgent = this.deps.agentRegistry.get('code')
                if (!codeAgent) break

                const issuesSummary = parsed.issues
                    .map(
                        (issue) =>
                            `- [${issue.severity}] ${issue.file}${issue.line ? `:${issue.line}` : ''}: ${issue.message}${issue.suggestion ? ` (fix: ${issue.suggestion})` : ''}`
                    )
                    .join('\n')

                const fixTask: AgentTask = {
                    id: randomUUID(),
                    type: 'code',
                    description: `Fix the following review issues:\n${issuesSummary}`,
                    context: { reviewIssues: parsed.issues },
                }

                const fixResult = await this.deps.agentRunner.run(codeAgent, fixTask, agentContext)
                gateResults.push(fixResult)
            }
        }

        if (!approved) {
            this.deps.logger.warn('Review not approved after auto-fix attempts')
        }

        // Run QA if review passed
        if (approved && requiresQA(gateInput)) {
            const qaAgent = this.deps.agentRegistry.get('qa')
            if (qaAgent) {
                const qaTask: AgentTask = {
                    id: randomUUID(),
                    type: 'qa',
                    description: `Run quality checks after code changes:\nFiles: ${allFiles.join(', ')}`,
                }
                const qaResult = await this.deps.agentRunner.run(qaAgent, qaTask, agentContext)
                gateResults.push(qaResult)

                const qaParsed = parseQAOutput(qaResult.output)
                if (qaParsed && !qaParsed.passed) {
                    this.deps.logger.warn({ blockers: qaParsed.blockers }, 'QA checks failed')
                }
            }
        }

        return gateResults
    }

    private retryTimedOutTasks(): number {
        const tasks = this.taskManager.getTasks()
        let retried = 0

        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i]!
            if (task.status !== 'failed') continue

            const errorMsg = String(task.result ?? '')
            const isTimeout = errorMsg.includes('aborted') || errorMsg.includes('Aborted')
            if (!isTimeout) continue

            const agent = this.deps.agentRegistry.get(task.agent as AgentType)
            if (!agent) continue

            const newTimeout = agent.timeout.max * 2
            if (this.taskManager.markForRetry(i, newTimeout)) {
                this.deps.logger.info(
                    { agent: task.agent, taskIndex: i, newTimeout },
                    'Retrying timed-out task with extended timeout'
                )
                retried++
            }
        }

        return retried
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

        const failedCore = results.filter(
            (r) => !r.success && Orchestrator.CORE_AGENTS.has(this.getAgentForTask(r.taskId))
        )
        if (failedCore.length > 0) {
            const agents = [...new Set(failedCore.map((r) => this.getAgentForTask(r.taskId)))]
            parts.push(`**Aviso:** Tarefas críticas falharam (${agents.join(', ')}). Os resultados podem estar incompletos.\n`)
        }

        for (const result of results) {
            if (result.success && result.summary) {
                parts.push(result.summary)
            } else if (!result.success) {
                parts.push(`[Failed] ${result.summary}`)
            }
        }

        return parts.join('\n\n')
    }

    private getAgentForTask(taskId: string): string {
        const task = this.taskManager.getTasks().find((t) => t.id === taskId)
        return task?.agent ?? ''
    }

    getLastTaskResults(): { agent: string; result: unknown; status: string }[] {
        return this.taskManager.getTasks().map((t) => ({
            agent: t.agent,
            result: t.result,
            status: t.status,
        }))
    }

    clearHistory(): void {
        this.conversationHistory = []
        this.pendingPlan = null
    }
}

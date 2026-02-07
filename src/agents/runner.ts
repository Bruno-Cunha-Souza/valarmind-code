import { errorMessage } from '../core/errors.js'
import type { TypedEventEmitter } from '../core/events.js'
import type { FileSystem } from '../core/fs.js'
import type { HookRunner } from '../hooks/runner.js'
import { PromptBuilder } from '../llm/prompt-builder.js'
import type { ChatMessage, LLMClient } from '../llm/types.js'
import type { SandboxManager } from '../security/sandbox.js'
import type { ToolExecutor } from '../tools/executor.js'
import type { ToolRegistry } from '../tools/registry.js'
import type { ToolContext } from '../tools/types.js'
import type { Tracer } from '../tracing/tracer.js'
import type { BaseAgent } from './base-agent.js'
import type { AgentContext, AgentResult, AgentTask } from './types.js'

function formatToolResult(result: { ok: boolean; value?: string; error?: string }): string {
    if (result.ok) return result.value ?? ''
    return `ERROR: ${result.error}`
}

export class AgentRunner {
    constructor(
        private llmClient: LLMClient,
        private toolExecutor: ToolExecutor,
        private toolRegistry: ToolRegistry,
        private tracer: Tracer,
        private eventBus: TypedEventEmitter,
        private projectDir: string,
        private fs: FileSystem,
        private hookRunner?: HookRunner,
        private tokenBudget: { target: number; hardCap: number } = { target: 3000, hardCap: 4800 },
        private defaultModel?: string,
        private sandboxManager?: SandboxManager
    ) {}

    async run(agent: BaseAgent, task: AgentTask, context: AgentContext): Promise<AgentResult> {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), agent.timeout.max * 1000)
        const span = this.tracer.startSpan('agent', { agent: agent.type, task: task.id })

        this.eventBus.emit('agent:start', { agentType: agent.type, taskId: task.id })

        const tools = this.toolRegistry.getToolDefinitions(agent.type)
        let totalPromptTokens = 0
        let totalCompletionTokens = 0

        // Build system prompt with PromptBuilder
        const builder = new PromptBuilder()
        builder.add('System', agent.buildSystemPrompt(context), 100)
        if (context.projectContext) {
            builder.add('Project Context', context.projectContext, 80)
        }

        const systemPrompt = builder.build(this.tokenBudget.hardCap)

        const messages: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: agent.formatTask(task.description, task.context) },
        ]

        try {
            for (let turn = 0; turn < agent.maxTurns; turn++) {
                if (controller.signal.aborted) break

                const model = agent.modelSuffix && this.defaultModel ? `${this.defaultModel}${agent.modelSuffix}` : undefined

                const response = await this.llmClient.chat({
                    model,
                    messages,
                    tools: tools.length > 0 ? tools : undefined,
                    signal: controller.signal,
                })

                totalPromptTokens += response.usage.promptTokens
                totalCompletionTokens += response.usage.completionTokens

                this.eventBus.emit('token:usage', {
                    agentType: agent.type,
                    prompt: response.usage.promptTokens,
                    completion: response.usage.completionTokens,
                })

                if (response.finishReason === 'stop' || response.toolCalls.length === 0) {
                    const duration = this.tracer.endSpan(span)
                    clearTimeout(timer)
                    this.eventBus.emit('agent:complete', {
                        agentType: agent.type,
                        taskId: task.id,
                        duration,
                    })

                    return {
                        taskId: task.id,
                        success: true,
                        output: response.content,
                        summary: response.content ?? '',
                        tokenUsage: { prompt: totalPromptTokens, completion: totalCompletionTokens },
                    }
                }

                // Add assistant message with tool calls
                messages.push({
                    role: 'assistant',
                    content: response.content,
                    tool_calls: response.toolCalls,
                })

                // Execute tool calls
                const toolCtx: ToolContext = {
                    fs: this.fs,
                    cwd: this.projectDir,
                    agentType: agent.type,
                    signal: controller.signal,
                    sandboxManager: this.sandboxManager,
                }

                for (const call of response.toolCalls) {
                    let args: unknown
                    try {
                        args = JSON.parse(call.function.arguments)
                    } catch {
                        args = {}
                    }

                    // PreToolUse hook
                    if (this.hookRunner) {
                        await this.hookRunner.run('PreToolUse', {
                            VALARMIND_TOOL: call.function.name,
                            VALARMIND_AGENT: agent.type,
                            VALARMIND_ARGS: JSON.stringify(args),
                        })
                    }

                    this.eventBus.emit('tool:before', {
                        toolName: call.function.name,
                        agentType: agent.type,
                        args,
                    })

                    const toolStart = Date.now()
                    const result = await this.toolExecutor.executeSafe(call.function.name, args, toolCtx, {
                        agentPermissions: agent.permissions,
                        signal: controller.signal,
                    })
                    const toolDuration = Date.now() - toolStart

                    // PostToolUse hook
                    if (this.hookRunner) {
                        await this.hookRunner.run('PostToolUse', {
                            VALARMIND_TOOL: call.function.name,
                            VALARMIND_AGENT: agent.type,
                            VALARMIND_SUCCESS: String(result.ok),
                        })
                    }

                    this.eventBus.emit('tool:after', {
                        toolName: call.function.name,
                        agentType: agent.type,
                        duration: toolDuration,
                        success: result.ok,
                    })

                    messages.push({
                        role: 'tool',
                        tool_call_id: call.id,
                        content: formatToolResult(result),
                    })
                }
            }
        } catch (error) {
            this.tracer.endSpan(span)
            clearTimeout(timer)
            this.eventBus.emit('agent:error', {
                agentType: agent.type,
                taskId: task.id,
                error: error instanceof Error ? error : new Error(String(error)),
            })

            return {
                taskId: task.id,
                success: false,
                output: null,
                summary: `Agent error: ${errorMessage(error)}`,
                tokenUsage: { prompt: totalPromptTokens, completion: totalCompletionTokens },
            }
        }

        this.tracer.endSpan(span)
        clearTimeout(timer)

        return {
            taskId: task.id,
            success: false,
            output: null,
            summary: 'Max turns reached',
            tokenUsage: { prompt: totalPromptTokens, completion: totalCompletionTokens },
        }
    }
}

import type { FileSystem } from '../core/fs.js';
import type { TypedEventEmitter } from '../core/events.js';
import type { LLMClient, ChatMessage } from '../llm/types.js';
import type { ToolExecutor } from '../tools/executor.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { ToolContext } from '../tools/types.js';
import type { Tracer } from '../tracing/tracer.js';
import type { BaseAgent } from './base-agent.js';
import type { AgentContext, AgentResult, AgentTask } from './types.js';

function formatToolResult(result: { ok: boolean; value?: string; error?: string }): string {
  if (result.ok) return result.value ?? '';
  return `ERROR: ${result.error}`;
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
  ) {}

  async run(agent: BaseAgent, task: AgentTask, context: AgentContext): Promise<AgentResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), agent.timeout.max * 1000);
    const span = this.tracer.startSpan('agent', { agent: agent.type, task: task.id });

    this.eventBus.emit('agent:start', { agentType: agent.type, taskId: task.id });

    const tools = this.toolRegistry.getToolDefinitions(agent.type);
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    const messages: ChatMessage[] = [
      { role: 'system', content: agent.buildSystemPrompt(context) },
      { role: 'user', content: agent.formatTask(task.description, task.context) },
    ];

    try {
      for (let turn = 0; turn < agent.maxTurns; turn++) {
        if (controller.signal.aborted) break;

        const response = await this.llmClient.chat({
          messages,
          tools: tools.length > 0 ? tools : undefined,
          signal: controller.signal,
        });

        totalPromptTokens += response.usage.promptTokens;
        totalCompletionTokens += response.usage.completionTokens;

        this.eventBus.emit('token:usage', {
          agentType: agent.type,
          prompt: response.usage.promptTokens,
          completion: response.usage.completionTokens,
        });

        if (response.finishReason === 'stop' || response.toolCalls.length === 0) {
          const duration = this.tracer.endSpan(span);
          clearTimeout(timer);
          this.eventBus.emit('agent:complete', {
            agentType: agent.type,
            taskId: task.id,
            duration,
          });

          return {
            taskId: task.id,
            success: true,
            output: response.content,
            summary: response.content ?? '',
            tokenUsage: { prompt: totalPromptTokens, completion: totalCompletionTokens },
          };
        }

        // Add assistant message with tool calls
        messages.push({
          role: 'assistant',
          content: response.content,
          tool_calls: response.toolCalls,
        });

        // Execute tool calls
        const toolCtx: ToolContext = {
          fs: this.fs,
          cwd: this.projectDir,
          agentType: agent.type,
          signal: controller.signal,
        };

        for (const call of response.toolCalls) {
          let args: unknown;
          try {
            args = JSON.parse(call.function.arguments);
          } catch {
            args = {};
          }

          this.eventBus.emit('tool:before', {
            toolName: call.function.name,
            agentType: agent.type,
            args,
          });

          const result = await this.toolExecutor.executeSafe(
            call.function.name,
            args,
            toolCtx,
            { agentPermissions: agent.permissions, signal: controller.signal },
          );

          this.eventBus.emit('tool:after', {
            toolName: call.function.name,
            agentType: agent.type,
            duration: 0,
            success: result.ok,
          });

          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: formatToolResult(result),
          });
        }
      }
    } catch (error) {
      this.tracer.endSpan(span);
      clearTimeout(timer);
      this.eventBus.emit('agent:error', {
        agentType: agent.type,
        taskId: task.id,
        error: error as Error,
      });

      return {
        taskId: task.id,
        success: false,
        output: null,
        summary: `Agent error: ${(error as Error).message}`,
        tokenUsage: { prompt: totalPromptTokens, completion: totalCompletionTokens },
      };
    }

    this.tracer.endSpan(span);
    clearTimeout(timer);

    return {
      taskId: task.id,
      success: false,
      output: null,
      summary: 'Max turns reached',
      tokenUsage: { prompt: totalPromptTokens, completion: totalCompletionTokens },
    };
  }
}

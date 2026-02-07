import OpenAI from 'openai'
import type { ResolvedConfig } from '../config/schema.js'
import type { Logger } from '../logger/index.js'
import type { Tracer } from '../tracing/tracer.js'
import { CircuitBreaker, withRetry } from './retry.js'
import type { ChatChunk, ChatParams, ChatResponse, LLMClient, ToolCall } from './types.js'

export function createLLMClient(config: ResolvedConfig, logger: Logger, tracer: Tracer): LLMClient {
    const openai = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        defaultHeaders: {
            'HTTP-Referer': 'https://github.com/valarmind/valarmind',
            'X-Title': 'ValarMind CLI',
        },
    })

    const breaker = new CircuitBreaker()

    return {
        async chat(params: ChatParams): Promise<ChatResponse> {
            const model = params.model ?? config.model
            const span = tracer.startSpan('llm_call', { model })

            try {
                const result = await breaker.execute(() =>
                    withRetry(async () => {
                        const response = await openai.chat.completions.create(
                            {
                                model,
                                messages: params.messages as OpenAI.ChatCompletionMessageParam[],
                                tools: params.tools as OpenAI.ChatCompletionTool[] | undefined,
                                temperature: params.temperature ?? config.temperature,
                                max_tokens: params.maxTokens ?? config.maxTokens,
                            },
                            { signal: params.signal }
                        )

                        const choice = response.choices[0]
                        if (!choice) throw new Error('No response from LLM')

                        const toolCalls: ToolCall[] = (choice.message.tool_calls ?? []).map((tc) => ({
                            id: tc.id,
                            type: 'function' as const,
                            function: {
                                name: tc.function.name,
                                arguments: tc.function.arguments,
                            },
                        }))

                        let finishReason: ChatResponse['finishReason'] = 'stop'
                        if (choice.finish_reason === 'tool_calls') finishReason = 'tool_calls'
                        else if (choice.finish_reason === 'length') finishReason = 'length'
                        else if (toolCalls.length > 0) finishReason = 'tool_calls'

                        return {
                            content: choice.message.content,
                            toolCalls,
                            finishReason,
                            usage: {
                                promptTokens: response.usage?.prompt_tokens ?? 0,
                                completionTokens: response.usage?.completion_tokens ?? 0,
                            },
                        }
                    })
                )

                logger.debug({ model, usage: result.usage, finishReason: result.finishReason }, 'llm:response')
                return result
            } finally {
                tracer.endSpan(span)
            }
        },

        async *chatStream(params: ChatParams): AsyncIterable<ChatChunk> {
            const model = params.model ?? config.model
            const stream = await openai.chat.completions.create(
                {
                    model,
                    messages: params.messages as OpenAI.ChatCompletionMessageParam[],
                    tools: params.tools as OpenAI.ChatCompletionTool[] | undefined,
                    temperature: params.temperature ?? config.temperature,
                    max_tokens: params.maxTokens ?? config.maxTokens,
                    stream: true,
                },
                { signal: params.signal }
            )

            for await (const chunk of stream) {
                const delta = chunk.choices[0]?.delta
                if (!delta) continue

                const toolCalls: ToolCall[] | undefined = delta.tool_calls?.map((tc) => ({
                    id: tc.id ?? '',
                    type: 'function' as const,
                    function: {
                        name: tc.function?.name ?? '',
                        arguments: tc.function?.arguments ?? '',
                    },
                }))

                yield {
                    content: delta.content ?? undefined,
                    toolCalls,
                    finishReason: chunk.choices[0]?.finish_reason ?? undefined,
                }
            }
        },
    }
}

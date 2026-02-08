import type { ChatParams, ChatResponse, ChatChunk, LLMClient, ToolCall } from '../../src/llm/types.js'

export interface ScriptedResponse {
    content: string | null
    toolCalls?: ToolCall[]
    finishReason?: 'stop' | 'tool_calls' | 'length'
    usage?: { promptTokens: number; completionTokens: number }
}

export interface CapturedCall {
    params: ChatParams
    timestamp: number
}

export class ScriptedLLMClient implements LLMClient {
    readonly capturedCalls: CapturedCall[] = []
    private callIndex = 0

    constructor(private responses: ScriptedResponse[]) {}

    async chat(params: ChatParams): Promise<ChatResponse> {
        if (params.signal?.aborted) {
            throw new DOMException('The operation was aborted.', 'AbortError')
        }

        this.capturedCalls.push({ params, timestamp: Date.now() })

        if (this.callIndex >= this.responses.length) {
            throw new Error(
                `ScriptedLLMClient: no more responses (called ${this.callIndex + 1} times, only ${this.responses.length} scripted)`
            )
        }

        const scripted = this.responses[this.callIndex++]!
        return {
            content: scripted.content,
            toolCalls: scripted.toolCalls ?? [],
            finishReason: scripted.finishReason ?? (scripted.toolCalls?.length ? 'tool_calls' : 'stop'),
            usage: scripted.usage ?? { promptTokens: 10, completionTokens: 10 },
        }
    }

    async *chatStream(params: ChatParams): AsyncIterable<ChatChunk> {
        const response = await this.chat(params)
        if (response.content) {
            const chunkSize = Math.ceil(response.content.length / 3)
            for (let i = 0; i < response.content.length; i += chunkSize) {
                yield { content: response.content.slice(i, i + chunkSize) }
            }
        }
        if (response.toolCalls.length > 0) {
            yield { toolCalls: response.toolCalls }
        }
        yield { finishReason: response.finishReason }
    }

    // --- Factory methods ---

    static fromStrings(strings: string[]): ScriptedLLMClient {
        return new ScriptedLLMClient(
            strings.map((s) => ({ content: s, finishReason: 'stop' as const }))
        )
    }

    static withToolCalls(
        calls: ToolCall[],
        finalContent: string
    ): ScriptedLLMClient {
        return new ScriptedLLMClient([
            { content: null, toolCalls: calls, finishReason: 'tool_calls' },
            { content: finalContent, finishReason: 'stop' },
        ])
    }

    static withError(error: Error): ScriptedLLMClient {
        const client = new ScriptedLLMClient([])
        const originalChat = client.chat.bind(client)
        client.chat = async (params: ChatParams) => {
            client.capturedCalls.push({ params, timestamp: Date.now() })
            throw error
        }
        return client
    }

    // --- Assertion helpers ---

    getCall(index: number): CapturedCall {
        if (index >= this.capturedCalls.length) {
            throw new Error(
                `ScriptedLLMClient: no call at index ${index} (only ${this.capturedCalls.length} calls captured)`
            )
        }
        return this.capturedCalls[index]!
    }

    assertToolsProvided(callIndex: number, expectedNames: string[]): void {
        const call = this.getCall(callIndex)
        const toolNames = (call.params.tools ?? []).map((t) => t.function.name)
        for (const name of expectedNames) {
            if (!toolNames.includes(name)) {
                throw new Error(
                    `Expected tool '${name}' at call ${callIndex}, got: [${toolNames.join(', ')}]`
                )
            }
        }
    }

    get totalCalls(): number {
        return this.capturedCalls.length
    }
}

export function makeToolCall(name: string, args: Record<string, unknown> = {}): ToolCall {
    return {
        id: `call_${Math.random().toString(36).slice(2, 10)}`,
        type: 'function',
        function: { name, arguments: JSON.stringify(args) },
    }
}

export function makeScriptedResponse(content: string): ScriptedResponse {
    return { content, finishReason: 'stop' }
}

export function makeToolCallResponse(
    toolCalls: ToolCall[],
    content?: string
): ScriptedResponse {
    return {
        content: content ?? null,
        toolCalls,
        finishReason: 'tool_calls',
    }
}

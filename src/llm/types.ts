export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool'
    content: string | null
    tool_calls?: ToolCall[]
    tool_call_id?: string
}

export interface ToolCall {
    id: string
    type: 'function'
    function: {
        name: string
        arguments: string
    }
}

export interface ToolDefinition {
    type: 'function'
    function: {
        name: string
        description: string
        parameters: Record<string, unknown>
    }
}

export interface ChatParams {
    model?: string
    messages: ChatMessage[]
    tools?: ToolDefinition[]
    temperature?: number
    maxTokens?: number
    signal?: AbortSignal
}

export interface ChatResponse {
    content: string | null
    toolCalls: ToolCall[]
    finishReason: 'stop' | 'tool_calls' | 'length'
    usage: { promptTokens: number; completionTokens: number }
}

export interface ChatChunk {
    content?: string
    toolCalls?: ToolCall[]
    finishReason?: string
}

export interface LLMClient {
    chat(params: ChatParams): Promise<ChatResponse>
    chatStream(params: ChatParams): AsyncIterable<ChatChunk>
}

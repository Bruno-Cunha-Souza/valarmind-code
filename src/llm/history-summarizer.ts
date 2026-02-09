import type { ChatMessage, LLMClient } from './types.js'

export async function summarizeHistory(messages: ChatMessage[], llmClient: LLMClient, summaryModel: string): Promise<string> {
    const content = messages.map((m) => `[${m.role}]: ${typeof m.content === 'string' ? m.content?.slice(0, 500) : '(tool)'}`).join('\n')

    const response = await llmClient.chat({
        model: summaryModel,
        messages: [
            {
                role: 'system',
                content: 'Summarize this conversation in 2-4 bullet points. Keep key decisions, file names, and outcomes. Be extremely concise.',
            },
            { role: 'user', content },
        ],
        maxTokens: 300,
    })

    return response.content ?? '[Summary unavailable]'
}

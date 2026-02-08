import { describe, it, expect, mock } from 'bun:test'
import { summarizeHistory } from '../../../src/llm/history-summarizer.js'
import type { ChatMessage, ChatResponse, LLMClient } from '../../../src/llm/types.js'

function createMockLLM(response: Partial<ChatResponse> = {}): LLMClient {
    return {
        chat: mock(async () => ({
            content: response.content ?? '- Decision made\n- Files changed',
            toolCalls: [],
            finishReason: 'stop' as const,
            usage: { promptTokens: 50, completionTokens: 30 },
            ...response,
        })),
        chatStream: mock(async function* () {
            yield { content: 'stream' }
        }),
    }
}

const sampleMessages: ChatMessage[] = [
    { role: 'user', content: 'Add authentication to the API' },
    { role: 'assistant', content: 'I will add JWT-based authentication using jsonwebtoken.' },
    { role: 'user', content: 'Also add rate limiting' },
    { role: 'assistant', content: 'Added rate limiting middleware using express-rate-limit.' },
]

describe('summarizeHistory', () => {
    it('returns summary from LLM response', async () => {
        const llm = createMockLLM({ content: '- Added JWT auth\n- Added rate limiting' })

        const result = await summarizeHistory(sampleMessages, llm, 'test-model')

        expect(result).toBe('- Added JWT auth\n- Added rate limiting')
    })

    it('passes correct model to LLM', async () => {
        const llm = createMockLLM()

        await summarizeHistory(sampleMessages, llm, 'google/gemini-flash')

        const call = (llm.chat as any).mock.calls[0][0]
        expect(call.model).toBe('google/gemini-flash')
    })

    it('sends system prompt asking for concise summary', async () => {
        const llm = createMockLLM()

        await summarizeHistory(sampleMessages, llm, 'test-model')

        const call = (llm.chat as any).mock.calls[0][0]
        const systemMsg = call.messages[0]
        expect(systemMsg.role).toBe('system')
        expect(systemMsg.content).toContain('Summarize')
        expect(systemMsg.content).toContain('bullet points')
    })

    it('truncates message content to 500 chars each', async () => {
        const longMessages: ChatMessage[] = [
            { role: 'user', content: 'x'.repeat(1000) },
            { role: 'assistant', content: 'y'.repeat(1000) },
        ]

        const llm = createMockLLM()

        await summarizeHistory(longMessages, llm, 'test-model')

        const call = (llm.chat as any).mock.calls[0][0]
        const userContent = call.messages[1].content
        // Each message should be truncated to 500 chars + prefix
        expect(userContent.length).toBeLessThan(1500) // two messages, each ~500 + prefix
    })

    it('limits maxTokens to 300', async () => {
        const llm = createMockLLM()

        await summarizeHistory(sampleMessages, llm, 'test-model')

        const call = (llm.chat as any).mock.calls[0][0]
        expect(call.maxTokens).toBe(300)
    })

    it('returns fallback when LLM returns null content', async () => {
        const llm = createMockLLM({ content: null })

        const result = await summarizeHistory(sampleMessages, llm, 'test-model')

        expect(result).toBe('[Summary unavailable]')
    })

    it('propagates LLM errors to caller', async () => {
        const llm: LLMClient = {
            chat: mock(async () => { throw new Error('API rate limit exceeded') }),
            chatStream: mock(async function* () { yield { content: '' } }),
        }

        await expect(summarizeHistory(sampleMessages, llm, 'test-model')).rejects.toThrow('API rate limit exceeded')
    })

    it('handles tool messages by marking them as (tool)', async () => {
        const messagesWithTool: ChatMessage[] = [
            { role: 'user', content: 'Search for files' },
            { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'glob', arguments: '{}' } }] },
            { role: 'tool', content: 'file1.ts\nfile2.ts', tool_call_id: 'c1' },
        ]

        const llm = createMockLLM()

        await summarizeHistory(messagesWithTool, llm, 'test-model')

        const call = (llm.chat as any).mock.calls[0][0]
        const userContent = call.messages[1].content
        // Assistant message with null content should show (tool)
        expect(userContent).toContain('(tool)')
    })
})

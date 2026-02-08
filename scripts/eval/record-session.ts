#!/usr/bin/env bun
/**
 * Record a live LLM session to a JSONL fixture for later replay.
 *
 * Usage:
 *   bun run eval:record -- --name search-flow --task "Find test files"
 *
 * Output:
 *   fixtures/eval/<name>/session.jsonl
 */

import { parseArgs } from 'node:util'
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ChatParams, ChatResponse, LLMClient } from '../../src/llm/types.js'

export interface RecordedExchange {
    timestamp: string
    request: { model?: string; messages: unknown[]; tools?: unknown[] }
    response: ChatResponse
    latencyMs: number
}

export class RecordingLLMClient implements LLMClient {
    readonly exchanges: RecordedExchange[] = []

    constructor(private inner: LLMClient) {}

    async chat(params: ChatParams): Promise<ChatResponse> {
        const start = Date.now()
        const response = await this.inner.chat(params)
        const latencyMs = Date.now() - start

        this.exchanges.push({
            timestamp: new Date().toISOString(),
            request: {
                model: params.model,
                messages: params.messages,
                tools: params.tools,
            },
            response,
            latencyMs,
        })

        return response
    }

    async *chatStream(params: ChatParams): AsyncIterable<any> {
        // For recording, fall back to non-streaming
        const response = await this.chat(params)
        yield { content: response.content, finishReason: response.finishReason }
    }

    saveToFile(filePath: string): void {
        writeFileSync(filePath, '')
        for (const exchange of this.exchanges) {
            appendFileSync(filePath, JSON.stringify(exchange) + '\n')
        }
    }
}

async function main() {
    const { values } = parseArgs({
        options: {
            name: { type: 'string', short: 'n' },
            task: { type: 'string', short: 't' },
        },
        strict: true,
    })

    if (!values.name || !values.task) {
        console.error('Usage: bun run eval:record -- --name <name> --task <task>')
        process.exit(1)
    }

    const fixtureDir = join(process.cwd(), 'fixtures', 'eval', values.name)
    mkdirSync(fixtureDir, { recursive: true })

    const outputPath = join(fixtureDir, 'session.jsonl')

    // Dynamic import of the real LLM client
    const { createLLMClient } = await import('../../src/llm/client.js')
    const { loadCredentials } = await import('../../src/config/credentials.js')

    const credentials = await loadCredentials()
    if (!credentials) {
        console.error('No API credentials found. Run `valarmind auth` first.')
        process.exit(1)
    }

    const innerClient = createLLMClient(credentials.apiKey)
    const recorder = new RecordingLLMClient(innerClient)

    console.log(`Recording session: ${values.name}`)
    console.log(`Task: ${values.task}`)

    // Simple chat to exercise the LLM
    const response = await recorder.chat({
        messages: [
            { role: 'system', content: 'You are a helpful coding assistant.' },
            { role: 'user', content: values.task },
        ],
    })

    console.log(`Response: ${response.content?.slice(0, 200)}...`)
    console.log(`Exchanges recorded: ${recorder.exchanges.length}`)

    recorder.saveToFile(outputPath)
    console.log(`Saved to: ${outputPath}`)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})

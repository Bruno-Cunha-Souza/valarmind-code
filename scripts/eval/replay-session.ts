#!/usr/bin/env bun
/**
 * Replay a recorded LLM session from a JSONL fixture.
 * Returns responses deterministically without consuming tokens.
 *
 * Usage:
 *   bun run eval:replay -- --fixture fixtures/eval/smoke/session.jsonl
 *   bun run eval:replay -- --fixture fixtures/eval/smoke/session.jsonl --strict
 */

import { parseArgs } from 'node:util'
import { readFileSync } from 'node:fs'
import type { ChatParams, ChatResponse, LLMClient } from '../../src/llm/types.js'
import type { RecordedExchange } from './record-session.js'

export interface ReplayMismatch {
    exchangeIndex: number
    field: string
    expected: unknown
    actual: unknown
}

export class ReplayingLLMClient implements LLMClient {
    private exchanges: RecordedExchange[]
    private callIndex = 0
    readonly mismatches: ReplayMismatch[] = []

    constructor(
        exchanges: RecordedExchange[],
        private strict = false,
    ) {
        this.exchanges = exchanges
    }

    static fromFile(filePath: string, strict = false): ReplayingLLMClient {
        const content = readFileSync(filePath, 'utf-8')
        const exchanges = content
            .split('\n')
            .filter((line) => line.trim())
            .map((line) => JSON.parse(line) as RecordedExchange)
        return new ReplayingLLMClient(exchanges, strict)
    }

    async chat(params: ChatParams): Promise<ChatResponse> {
        if (this.callIndex >= this.exchanges.length) {
            throw new Error(
                `ReplayingLLMClient: no more exchanges (called ${this.callIndex + 1} times, only ${this.exchanges.length} recorded)`
            )
        }

        const exchange = this.exchanges[this.callIndex]!

        // Validate in strict mode
        if (this.strict) {
            this.validateRequest(params, exchange, this.callIndex)
        }

        this.callIndex++
        return exchange.response
    }

    async *chatStream(params: ChatParams): AsyncIterable<any> {
        const response = await this.chat(params)
        yield { content: response.content, finishReason: response.finishReason }
    }

    private validateRequest(params: ChatParams, exchange: RecordedExchange, index: number): void {
        // Validate message roles match
        const expectedRoles = exchange.request.messages.map((m: any) => m.role)
        const actualRoles = params.messages.map((m) => m.role)

        if (JSON.stringify(expectedRoles) !== JSON.stringify(actualRoles)) {
            const mismatch: ReplayMismatch = {
                exchangeIndex: index,
                field: 'message_roles',
                expected: expectedRoles,
                actual: actualRoles,
            }
            this.mismatches.push(mismatch)

            if (this.strict) {
                throw new Error(
                    `Replay mismatch at exchange ${index}: message roles differ.\n` +
                    `Expected: [${expectedRoles.join(', ')}]\n` +
                    `Actual:   [${actualRoles.join(', ')}]`
                )
            }
        }

        // Validate tool names if present
        const expectedTools = (exchange.request.tools ?? []).map((t: any) => t.function?.name).filter(Boolean)
        const actualTools = (params.tools ?? []).map((t) => t.function.name)

        if (expectedTools.length > 0 && JSON.stringify(expectedTools) !== JSON.stringify(actualTools)) {
            this.mismatches.push({
                exchangeIndex: index,
                field: 'tool_names',
                expected: expectedTools,
                actual: actualTools,
            })
        }
    }

    get remainingExchanges(): number {
        return this.exchanges.length - this.callIndex
    }

    get totalExchanges(): number {
        return this.exchanges.length
    }
}

async function main() {
    const { values } = parseArgs({
        options: {
            fixture: { type: 'string', short: 'f' },
            strict: { type: 'boolean', default: false },
        },
        strict: true,
    })

    if (!values.fixture) {
        console.error('Usage: bun run eval:replay -- --fixture <path>')
        process.exit(1)
    }

    const client = ReplayingLLMClient.fromFile(values.fixture, values.strict)
    console.log(`Loaded ${client.totalExchanges} exchanges from ${values.fixture}`)

    // Replay all exchanges
    let idx = 0
    while (client.remainingExchanges > 0) {
        const response = await client.chat({
            messages: [{ role: 'user', content: `replay-${idx}` }],
        })
        console.log(`[${idx}] ${response.finishReason}: ${response.content?.slice(0, 100) ?? '(null)'}`)
        idx++
    }

    if (client.mismatches.length > 0) {
        console.warn(`\nMismatches found: ${client.mismatches.length}`)
        for (const m of client.mismatches) {
            console.warn(`  Exchange ${m.exchangeIndex}: ${m.field}`)
        }
    } else {
        console.log('\nAll exchanges replayed successfully (no mismatches)')
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})

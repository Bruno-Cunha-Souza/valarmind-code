export interface ModelSpec {
    contextWindow: number // total tokens (input + output)
    maxOutput: number // max output tokens
}

export const MODEL_SPECS: Record<string, ModelSpec> = {
    'anthropic/claude-opus-4.6': { contextWindow: 200_000, maxOutput: 4_096 },
    'anthropic/claude-opus-4.5': { contextWindow: 200_000, maxOutput: 4_096 },
    'anthropic/claude-sonnet-4.5': { contextWindow: 200_000, maxOutput: 8_192 },
    'google/gemini-2.5-flash': { contextWindow: 1_000_000, maxOutput: 8_192 },
    'openai/gpt-5.2-codex': { contextWindow: 128_000, maxOutput: 16_384 },
    'moonshotai/kimi-k2.5': { contextWindow: 262_144, maxOutput: 8_192 },
}

const DEFAULT_CONTEXT_WINDOW = 128_000

export function getModelSpec(modelId: string): ModelSpec {
    return (
        MODEL_SPECS[modelId] ?? {
            contextWindow: DEFAULT_CONTEXT_WINDOW,
            maxOutput: 4_096,
        }
    )
}

export function getCompactThreshold(modelId: string): number {
    const spec = getModelSpec(modelId)
    return Math.floor(spec.contextWindow * 0.75)
}

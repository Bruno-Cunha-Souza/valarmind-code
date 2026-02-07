import type { AgentType } from '../../core/types.js'
import { extractJSON } from './result-parser.js'

export interface PlanTask {
    agent: AgentType
    description: string
    dependsOn?: number[]
    toonCompact?: boolean
    excludeFromSummary?: boolean
}

export interface Plan {
    plan: string
    tasks: PlanTask[]
}

export function parsePlan(llmOutput: string): Plan | null {
    try {
        const parsed = extractJSON(llmOutput)
        if (!parsed || typeof parsed !== 'object') return null
        const obj = parsed as Record<string, unknown>
        if (typeof obj.plan !== 'string' || !Array.isArray(obj.tasks)) return null
        return obj as unknown as Plan
    } catch {
        return null
    }
}

export function isDirectAnswer(llmOutput: string): boolean {
    // If the output doesn't contain a plan JSON, it's a direct answer
    return parsePlan(llmOutput) === null
}

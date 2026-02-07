import { AGENT_PERMISSIONS, AGENT_TIMEOUTS, type AgentType, type ToolPermissions } from '../core/types.js'
import type { AgentContext } from './types.js'

export abstract class BaseAgent {
    abstract readonly type: AgentType
    readonly depth: number = 0

    get permissions(): ToolPermissions {
        return AGENT_PERMISSIONS[this.type]
    }

    get timeout(): { default: number; max: number } {
        return AGENT_TIMEOUTS[this.type]
    }

    get maxTurns(): number {
        return 25
    }

    abstract get allowedTools(): string[]

    get modelSuffix(): string | undefined {
        return undefined
    }

    abstract buildSystemPrompt(context: AgentContext): string

    formatTask(description: string, additionalContext?: Record<string, unknown>): string {
        let prompt = description
        if (additionalContext) {
            prompt += `\n\nAdditional context:\n${JSON.stringify(additionalContext, null, 2)}`
        }
        return prompt
    }
}

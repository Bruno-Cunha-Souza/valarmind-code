import type { AgentType } from '../../core/types.js'
import { BaseAgent } from '../base-agent.js'
import type { AgentContext } from '../types.js'
import { INIT_SYSTEM_PROMPT } from './system-prompt.js'

export class InitAgent extends BaseAgent {
    readonly type: AgentType = 'init'

    get allowedTools(): string[] {
        return ['read_file', 'glob', 'grep', 'tree_view']
    }

    get maxTokens(): number {
        return 16384 // needs large output to return full VALARMIND.md content as text
    }

    get systemPrompt(): string {
        return INIT_SYSTEM_PROMPT
    }

    buildSystemPrompt(context: AgentContext): string {
        let prompt = this.systemPrompt
        if (context.projectContext) {
            prompt += `\n\n## Existing Project Context\n${context.projectContext}`
        }
        return prompt
    }

    formatTask(description: string, additionalContext?: Record<string, unknown>): string {
        let prompt = description
        if (additionalContext) {
            if (typeof additionalContext._toon_encoded === 'string') {
                prompt += `\n\nPre-gathered search results (TOON format):\n${additionalContext._toon_encoded}`
            } else {
                prompt += `\n\nAdditional context:\n${JSON.stringify(additionalContext, null, 2)}`
            }
        }
        return prompt
    }
}

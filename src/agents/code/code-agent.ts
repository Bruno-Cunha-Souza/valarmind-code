import type { AgentType } from '../../core/types.js'
import { BaseAgent } from '../base-agent.js'
import type { AgentContext } from '../types.js'
import { CODE_SYSTEM_PROMPT } from './system-prompt.js'

export class CodeAgent extends BaseAgent {
    readonly type: AgentType = 'code'

    get allowedTools(): string[] {
        return ['read_file', 'write_file', 'edit_file', 'glob', 'grep']
    }

    get systemPrompt(): string {
        return CODE_SYSTEM_PROMPT
    }

    buildSystemPrompt(context: AgentContext): string {
        let prompt = super.buildSystemPrompt(context)
        if (context.workingState.conventions) {
            const conv = Object.entries(context.workingState.conventions)
                .map(([k, v]) => `- ${k}: ${v}`)
                .join('\n')
            if (conv) prompt += `\n\n## Conventions\n${conv}`
        }
        return prompt
    }
}

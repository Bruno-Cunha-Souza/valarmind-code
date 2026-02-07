import type { AgentType } from '../../core/types.js'
import { BaseAgent } from '../base-agent.js'
import type { AgentContext } from '../types.js'
import { REVIEW_SYSTEM_PROMPT } from './system-prompt.js'

export class ReviewAgent extends BaseAgent {
    readonly type: AgentType = 'review'

    get allowedTools(): string[] {
        return ['read_file', 'glob', 'grep', 'git_diff']
    }

    buildSystemPrompt(context: AgentContext): string {
        let prompt = REVIEW_SYSTEM_PROMPT
        if (context.projectContext) {
            prompt += `\n\n## Project Context\n${context.projectContext}`
        }
        if (context.workingState.conventions) {
            const conv = Object.entries(context.workingState.conventions)
                .map(([k, v]) => `- ${k}: ${v}`)
                .join('\n')
            if (conv) prompt += `\n\n## Conventions\n${conv}`
        }
        return prompt
    }
}

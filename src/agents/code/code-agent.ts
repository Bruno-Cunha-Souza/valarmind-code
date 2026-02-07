import type { AgentType } from '../../core/types.js'
import { BaseAgent } from '../base-agent.js'
import type { AgentContext } from '../types.js'
import { CODE_SYSTEM_PROMPT } from './system-prompt.js'

export class CodeAgent extends BaseAgent {
    readonly type: AgentType = 'code'

    get allowedTools(): string[] {
        return ['read_file', 'write_file', 'edit_file', 'glob', 'grep']
    }

    buildSystemPrompt(context: AgentContext): string {
        let prompt = CODE_SYSTEM_PROMPT
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

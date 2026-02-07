import type { AgentType } from '../../core/types.js'
import { BaseAgent } from '../base-agent.js'
import type { AgentContext } from '../types.js'
import { SEARCH_SYSTEM_PROMPT } from './system-prompt.js'

export class SearchAgent extends BaseAgent {
    readonly type: AgentType = 'search'

    get allowedTools(): string[] {
        return ['read_file', 'glob', 'grep', 'tree_view', 'git_diff']
    }

    buildSystemPrompt(context: AgentContext): string {
        let prompt = SEARCH_SYSTEM_PROMPT
        if (context.projectContext) {
            prompt += `\n\n## Project Context\n${context.projectContext}`
        }
        return prompt
    }
}

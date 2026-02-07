import type { AgentType } from '../../core/types.js'
import { BaseAgent } from '../base-agent.js'
import { SEARCH_SYSTEM_PROMPT } from './system-prompt.js'

export class SearchAgent extends BaseAgent {
    readonly type: AgentType = 'search'

    get allowedTools(): string[] {
        return ['read_file', 'glob', 'grep', 'tree_view', 'git_diff']
    }

    get systemPrompt(): string {
        return SEARCH_SYSTEM_PROMPT
    }
}

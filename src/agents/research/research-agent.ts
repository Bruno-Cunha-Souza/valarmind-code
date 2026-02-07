import type { AgentType } from '../../core/types.js'
import { BaseAgent } from '../base-agent.js'
import { RESEARCH_SYSTEM_PROMPT } from './system-prompt.js'

export class ResearchAgent extends BaseAgent {
    readonly type: AgentType = 'research'

    get allowedTools(): string[] {
        return ['read_file', 'glob', 'grep', 'web_fetch']
    }

    get modelSuffix(): string {
        return ':online'
    }

    get systemPrompt(): string {
        return RESEARCH_SYSTEM_PROMPT
    }
}

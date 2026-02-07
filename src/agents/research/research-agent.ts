import type { AgentType } from '../../core/types.js'
import { BaseAgent } from '../base-agent.js'
import type { AgentContext } from '../types.js'
import { RESEARCH_SYSTEM_PROMPT } from './system-prompt.js'

export class ResearchAgent extends BaseAgent {
    readonly type: AgentType = 'research'

    get allowedTools(): string[] {
        return ['read_file', 'glob', 'grep', 'web_fetch']
    }

    get modelSuffix(): string {
        return ':online'
    }

    buildSystemPrompt(context: AgentContext): string {
        let prompt = RESEARCH_SYSTEM_PROMPT
        if (context.projectContext) {
            prompt += `\n\n## Project Context\n${context.projectContext}`
        }
        return prompt
    }
}

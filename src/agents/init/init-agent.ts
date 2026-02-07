import type { AgentType } from '../../core/types.js'
import { BaseAgent } from '../base-agent.js'
import type { AgentContext } from '../types.js'
import { INIT_SYSTEM_PROMPT } from './system-prompt.js'

export class InitAgent extends BaseAgent {
    readonly type: AgentType = 'init'

    get allowedTools(): string[] {
        return ['read_file', 'write_file', 'glob', 'grep', 'tree_view']
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
}

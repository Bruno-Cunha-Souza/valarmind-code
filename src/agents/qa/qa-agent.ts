import type { AgentType } from '../../core/types.js'
import { BaseAgent } from '../base-agent.js'
import type { AgentContext } from '../types.js'
import { QA_SYSTEM_PROMPT } from './system-prompt.js'

export class QAAgent extends BaseAgent {
    readonly type: AgentType = 'qa'

    get allowedTools(): string[] {
        return ['read_file', 'glob', 'grep', 'bash', 'git_diff']
    }

    buildSystemPrompt(context: AgentContext): string {
        let prompt = QA_SYSTEM_PROMPT
        if (context.projectContext) {
            prompt += `\n\n## Project Context\n${context.projectContext}`
        }
        return prompt
    }
}

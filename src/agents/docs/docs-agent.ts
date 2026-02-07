import type { AgentType } from '../../core/types.js'
import { BaseAgent } from '../base-agent.js'
import type { AgentContext } from '../types.js'
import { DOCS_SYSTEM_PROMPT } from './system-prompt.js'

export class DocsAgent extends BaseAgent {
    readonly type: AgentType = 'docs'

    get allowedTools(): string[] {
        return ['read_file', 'write_file', 'edit_file', 'glob', 'web_fetch']
    }

    buildSystemPrompt(context: AgentContext): string {
        let prompt = DOCS_SYSTEM_PROMPT
        if (context.projectContext) {
            prompt += `\n\n## Project Context\n${context.projectContext}`
        }
        return prompt
    }
}

import type { AgentType } from '../../core/types.js'
import { BaseAgent } from '../base-agent.js'
import { DOCS_SYSTEM_PROMPT } from './system-prompt.js'

export class DocsAgent extends BaseAgent {
    readonly type: AgentType = 'docs'

    get allowedTools(): string[] {
        return ['read_file', 'write_file', 'edit_file', 'glob', 'web_fetch']
    }

    get systemPrompt(): string {
        return DOCS_SYSTEM_PROMPT
    }
}

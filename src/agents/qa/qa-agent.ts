import type { AgentType } from '../../core/types.js'
import { BaseAgent } from '../base-agent.js'
import { QA_SYSTEM_PROMPT } from './system-prompt.js'

export class QAAgent extends BaseAgent {
    readonly type: AgentType = 'qa'

    get allowedTools(): string[] {
        return ['read_file', 'glob', 'grep', 'bash', 'git_diff']
    }

    get systemPrompt(): string {
        return QA_SYSTEM_PROMPT
    }
}

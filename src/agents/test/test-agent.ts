import type { AgentType } from '../../core/types.js'
import { BaseAgent } from '../base-agent.js'
import { TEST_SYSTEM_PROMPT } from './system-prompt.js'

export class TestAgent extends BaseAgent {
    readonly type: AgentType = 'test'

    get allowedTools(): string[] {
        return ['read_file', 'write_file', 'edit_file', 'glob', 'grep', 'bash']
    }

    get systemPrompt(): string {
        return TEST_SYSTEM_PROMPT
    }
}

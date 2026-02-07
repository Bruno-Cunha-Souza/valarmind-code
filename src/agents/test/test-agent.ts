import type { AgentType } from '../../core/types.js'
import { BaseAgent } from '../base-agent.js'
import type { AgentContext } from '../types.js'
import { TEST_SYSTEM_PROMPT } from './system-prompt.js'

export class TestAgent extends BaseAgent {
    readonly type: AgentType = 'test'

    get allowedTools(): string[] {
        return ['read_file', 'write_file', 'edit_file', 'glob', 'grep', 'bash']
    }

    buildSystemPrompt(context: AgentContext): string {
        let prompt = TEST_SYSTEM_PROMPT
        if (context.projectContext) {
            prompt += `\n\n## Project Context\n${context.projectContext}`
        }
        return prompt
    }
}

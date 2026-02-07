import type { TypedEventEmitter } from '../core/events.js'
import type { AgentType } from '../core/types.js'

interface AgentMetrics {
    invocations: number
    totalDuration: number
    errors: number
    promptTokens: number
    completionTokens: number
    toolCalls: number
}

export class MetricsCollector {
    private agents = new Map<AgentType, AgentMetrics>()
    private sessionTokens = { prompt: 0, completion: 0 }

    constructor(eventBus: TypedEventEmitter) {
        eventBus.on('agent:start', ({ agentType }) => {
            this.ensureAgent(agentType)
            this.agents.get(agentType)!.invocations++
        })

        eventBus.on('agent:complete', ({ agentType, duration }) => {
            this.ensureAgent(agentType)
            this.agents.get(agentType)!.totalDuration += duration
        })

        eventBus.on('agent:error', ({ agentType }) => {
            this.ensureAgent(agentType)
            this.agents.get(agentType)!.errors++
        })

        eventBus.on('token:usage', ({ agentType, prompt, completion }) => {
            this.ensureAgent(agentType)
            const m = this.agents.get(agentType)!
            m.promptTokens += prompt
            m.completionTokens += completion
            this.sessionTokens.prompt += prompt
            this.sessionTokens.completion += completion
        })

        eventBus.on('tool:after', ({ agentType }) => {
            this.ensureAgent(agentType)
            this.agents.get(agentType)!.toolCalls++
        })
    }

    private ensureAgent(type: AgentType): void {
        if (!this.agents.has(type)) {
            this.agents.set(type, {
                invocations: 0,
                totalDuration: 0,
                errors: 0,
                promptTokens: 0,
                completionTokens: 0,
                toolCalls: 0,
            })
        }
    }

    getSessionTokens(): { prompt: number; completion: number; total: number } {
        return {
            ...this.sessionTokens,
            total: this.sessionTokens.prompt + this.sessionTokens.completion,
        }
    }

    getAgentMetrics(): Map<AgentType, AgentMetrics> {
        return new Map(this.agents)
    }

    formatStatus(): string {
        const tokens = this.getSessionTokens()
        const lines: string[] = []
        lines.push(`Session tokens: ${tokens.total} (${tokens.prompt}p + ${tokens.completion}c)`)

        if (this.agents.size > 0) {
            lines.push('Agent metrics:')
            for (const [type, m] of this.agents) {
                lines.push(`  ${type}: ${m.invocations} calls, ${m.toolCalls} tools, ${m.errors} errors, ${m.promptTokens + m.completionTokens} tokens`)
            }
        }

        return lines.join('\n')
    }
}

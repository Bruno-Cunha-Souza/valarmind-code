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
    private cleanups: Array<() => void> = []

    constructor(eventBus: TypedEventEmitter) {
        const onStart = ({ agentType }: { agentType: AgentType }) => {
            this.ensureAgent(agentType)
            this.agents.get(agentType)!.invocations++
        }
        eventBus.on('agent:start', onStart)
        this.cleanups.push(() => eventBus.off('agent:start', onStart))

        const onComplete = ({ agentType, duration }: { agentType: AgentType; duration: number }) => {
            this.ensureAgent(agentType)
            this.agents.get(agentType)!.totalDuration += duration
        }
        eventBus.on('agent:complete', onComplete)
        this.cleanups.push(() => eventBus.off('agent:complete', onComplete))

        const onError = ({ agentType }: { agentType: AgentType }) => {
            this.ensureAgent(agentType)
            this.agents.get(agentType)!.errors++
        }
        eventBus.on('agent:error', onError)
        this.cleanups.push(() => eventBus.off('agent:error', onError))

        const onTokenUsage = ({ agentType, prompt, completion }: { agentType: AgentType; prompt: number; completion: number }) => {
            this.ensureAgent(agentType)
            const m = this.agents.get(agentType)!
            m.promptTokens += prompt
            m.completionTokens += completion
            this.sessionTokens.prompt += prompt
            this.sessionTokens.completion += completion
        }
        eventBus.on('token:usage', onTokenUsage)
        this.cleanups.push(() => eventBus.off('token:usage', onTokenUsage))

        const onToolAfter = ({ agentType }: { agentType: AgentType }) => {
            this.ensureAgent(agentType)
            this.agents.get(agentType)!.toolCalls++
        }
        eventBus.on('tool:after', onToolAfter)
        this.cleanups.push(() => eventBus.off('tool:after', onToolAfter))
    }

    dispose(): void {
        for (const cleanup of this.cleanups) cleanup()
        this.cleanups = []
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

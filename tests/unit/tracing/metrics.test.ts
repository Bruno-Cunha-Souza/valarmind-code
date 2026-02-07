import { describe, it, expect } from 'bun:test'
import { MetricsCollector } from '../../../src/tracing/metrics.js'
import { TypedEventEmitter } from '../../../src/core/events.js'

describe('MetricsCollector', () => {
    it('starts with zero tokens', () => {
        const eventBus = new TypedEventEmitter()
        const collector = new MetricsCollector(eventBus)
        const tokens = collector.getSessionTokens()
        expect(tokens.total).toBe(0)
        expect(tokens.prompt).toBe(0)
        expect(tokens.completion).toBe(0)
    })

    it('tracks token usage', () => {
        const eventBus = new TypedEventEmitter()
        const collector = new MetricsCollector(eventBus)

        eventBus.emit('token:usage', { agentType: 'search', prompt: 100, completion: 50 })
        eventBus.emit('token:usage', { agentType: 'code', prompt: 200, completion: 100 })

        const tokens = collector.getSessionTokens()
        expect(tokens.prompt).toBe(300)
        expect(tokens.completion).toBe(150)
        expect(tokens.total).toBe(450)
    })

    it('tracks agent invocations', () => {
        const eventBus = new TypedEventEmitter()
        const collector = new MetricsCollector(eventBus)

        eventBus.emit('agent:start', { agentType: 'search', taskId: 't1' })
        eventBus.emit('agent:start', { agentType: 'search', taskId: 't2' })
        eventBus.emit('agent:start', { agentType: 'code', taskId: 't3' })

        const metrics = collector.getAgentMetrics()
        expect(metrics.get('search')!.invocations).toBe(2)
        expect(metrics.get('code')!.invocations).toBe(1)
    })

    it('tracks agent errors', () => {
        const eventBus = new TypedEventEmitter()
        const collector = new MetricsCollector(eventBus)

        eventBus.emit('agent:error', { agentType: 'code', taskId: 't1', error: new Error('fail') })

        const metrics = collector.getAgentMetrics()
        expect(metrics.get('code')!.errors).toBe(1)
    })

    it('tracks agent duration', () => {
        const eventBus = new TypedEventEmitter()
        const collector = new MetricsCollector(eventBus)

        eventBus.emit('agent:start', { agentType: 'search', taskId: 't1' })
        eventBus.emit('agent:complete', { agentType: 'search', taskId: 't1', duration: 1500 })

        const metrics = collector.getAgentMetrics()
        expect(metrics.get('search')!.totalDuration).toBe(1500)
    })

    it('tracks tool calls', () => {
        const eventBus = new TypedEventEmitter()
        const collector = new MetricsCollector(eventBus)

        eventBus.emit('tool:after', { toolName: 'read_file', agentType: 'search', duration: 10, success: true })
        eventBus.emit('tool:after', { toolName: 'glob', agentType: 'search', duration: 5, success: true })

        const metrics = collector.getAgentMetrics()
        expect(metrics.get('search')!.toolCalls).toBe(2)
    })

    it('formatStatus returns string with token info', () => {
        const eventBus = new TypedEventEmitter()
        const collector = new MetricsCollector(eventBus)

        eventBus.emit('token:usage', { agentType: 'search', prompt: 100, completion: 50 })

        const status = collector.formatStatus()
        expect(status).toContain('Session tokens: 150')
        expect(status).toContain('search')
    })

    it('formatStatus works with no data', () => {
        const eventBus = new TypedEventEmitter()
        const collector = new MetricsCollector(eventBus)
        const status = collector.formatStatus()
        expect(status).toContain('Session tokens: 0')
    })
})

import { describe, it, expect } from 'bun:test'
import { Tracer } from '../../../src/tracing/tracer.js'
import { TypedEventEmitter } from '../../../src/core/events.js'
import pino from 'pino'

const mockLogger = pino({ level: 'silent' })

describe('Tracer', () => {
    it('starts and ends a trace', () => {
        const tracer = new Tracer(mockLogger, new TypedEventEmitter())
        const trace = tracer.startTrace('session-1')
        expect(trace.sessionId).toBe('session-1')
        expect(trace.id).toBeDefined()

        const ended = tracer.endTrace()
        expect(ended).not.toBeNull()
        expect(ended!.endTime).toBeDefined()
    })

    it('creates nested spans', () => {
        const tracer = new Tracer(mockLogger, new TypedEventEmitter())
        tracer.startTrace('s1')

        const agentSpan = tracer.startSpan('agent', { agent: 'search' })
        const toolSpan = tracer.startSpan('tool', { name: 'glob' })

        tracer.endSpan(toolSpan)
        tracer.endSpan(agentSpan)

        const trace = tracer.endTrace()
        expect(trace!.rootSpan.children).toHaveLength(1)
        expect(trace!.rootSpan.children[0]?.children).toHaveLength(1)
    })

    it('measures span duration', async () => {
        const tracer = new Tracer(mockLogger, new TypedEventEmitter())
        tracer.startTrace('s1')

        const span = tracer.startSpan('tool', { name: 'test' })
        await new Promise((r) => setTimeout(r, 20))
        const duration = tracer.endSpan(span)

        expect(duration).toBeGreaterThanOrEqual(15)
    })

    it('returns null when no trace active', () => {
        const tracer = new Tracer(mockLogger, new TypedEventEmitter())
        expect(tracer.getTrace()).toBeNull()
        expect(tracer.endTrace()).toBeNull()
    })
})

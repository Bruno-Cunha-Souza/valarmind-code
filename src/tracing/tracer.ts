import { randomUUID } from 'node:crypto'
import type { TypedEventEmitter } from '../core/events.js'
import type { Logger } from '../logger/index.js'
import type { Span, SpanKind, Trace } from './types.js'

function createSpan(kind: SpanKind, name: string, attributes: Record<string, unknown> = {}): Span {
    const span: Span = {
        id: randomUUID(),
        kind,
        name,
        startTime: Date.now(),
        attributes,
        children: [],
        end() {
            span.endTime = Date.now()
            return span.endTime - span.startTime
        },
    }
    return span
}

export class Tracer {
    private currentTrace: Trace | null = null
    private spanStack: Span[] = []

    constructor(
        private logger: Logger,
        _eventBus: TypedEventEmitter
    ) {}

    startTrace(sessionId: string): Trace {
        const rootSpan = createSpan('orchestrator', 'session')
        this.currentTrace = {
            id: randomUUID(),
            sessionId,
            rootSpan,
            startTime: Date.now(),
        }
        this.spanStack = [rootSpan]
        return this.currentTrace
    }

    startSpan(kind: SpanKind, attributes: Record<string, unknown> = {}): Span {
        const name = (attributes.name as string) ?? (attributes.agent as string) ?? kind
        const span = createSpan(kind, name, attributes)
        const parent = this.spanStack[this.spanStack.length - 1]
        if (parent) {
            parent.children.push(span)
        }
        this.spanStack.push(span)
        this.logger.debug({ spanId: span.id, kind, name }, 'span:start')
        return span
    }

    endSpan(span: Span): number {
        const duration = span.end()
        const idx = this.spanStack.indexOf(span)
        if (idx !== -1) {
            this.spanStack.splice(idx, 1)
        }
        this.logger.debug({ spanId: span.id, duration }, 'span:end')
        return duration
    }

    endTrace(): Trace | null {
        if (!this.currentTrace) return null
        this.currentTrace.rootSpan.end()
        this.currentTrace.endTime = Date.now()
        const trace = this.currentTrace
        this.currentTrace = null
        this.spanStack = []
        return trace
    }

    getTrace(): Trace | null {
        return this.currentTrace
    }
}

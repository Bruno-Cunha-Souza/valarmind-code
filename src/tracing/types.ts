export type SpanKind = 'orchestrator' | 'agent' | 'llm_call' | 'tool' | 'hook'

export interface Span {
    id: string
    kind: SpanKind
    name: string
    startTime: number
    endTime?: number
    attributes: Record<string, unknown>
    children: Span[]
    end(): number
}

export interface Trace {
    id: string
    sessionId: string
    rootSpan: Span
    startTime: number
    endTime?: number
}

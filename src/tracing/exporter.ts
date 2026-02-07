import type { Logger } from '../logger/index.js';
import type { Span, Trace } from './types.js';

export class TraceExporter {
  constructor(private logger: Logger) {}

  exportToLog(trace: Trace): void {
    this.logger.info(
      {
        traceId: trace.id,
        sessionId: trace.sessionId,
        duration: (trace.endTime ?? Date.now()) - trace.startTime,
        spans: this.flattenSpans(trace.rootSpan),
      },
      'trace:export',
    );
  }

  private flattenSpans(span: Span, depth = 0): unknown[] {
    const result: unknown[] = [
      {
        id: span.id,
        kind: span.kind,
        name: span.name,
        depth,
        duration: span.endTime ? span.endTime - span.startTime : null,
        attributes: span.attributes,
      },
    ];
    for (const child of span.children) {
      result.push(...this.flattenSpans(child, depth + 1));
    }
    return result;
  }
}

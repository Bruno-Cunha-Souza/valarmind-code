export type ErrorKind = 'transient' | 'permanent';

export class ValarMindError extends Error {
  readonly kind: ErrorKind;

  constructor(message: string, kind: ErrorKind, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ValarMindError';
    this.kind = kind;
  }
}

export class TransientError extends ValarMindError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'transient', options);
    this.name = 'TransientError';
  }
}

export class PermanentError extends ValarMindError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'permanent', options);
    this.name = 'PermanentError';
  }
}

export function classifyHttpError(status: number): ErrorKind {
  if ([429, 500, 502, 503, 504].includes(status)) return 'transient';
  return 'permanent';
}

export function classifyError(error: unknown): ErrorKind {
  if (error instanceof ValarMindError) return error.kind;
  if (error instanceof TypeError && error.message.includes('fetch')) return 'transient';
  if (typeof error === 'object' && error !== null && 'status' in error) {
    return classifyHttpError((error as { status: number }).status);
  }
  return 'permanent';
}

import { classifyError } from '../core/errors.js'

export interface RetryOptions {
    maxRetries: number
    baseDelay: number
    maxDelay: number
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 60000,
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function withRetry<T>(fn: () => Promise<T>, opts = DEFAULT_RETRY_OPTIONS): Promise<T> {
    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
        try {
            return await fn()
        } catch (error) {
            if (classifyError(error) === 'permanent' || attempt === opts.maxRetries) {
                throw error
            }
            const delay = Math.min(opts.baseDelay * 2 ** attempt, opts.maxDelay)
            const jitter = delay * 0.1 * Math.random()
            await sleep(delay + jitter)
        }
    }
    throw new Error('Unreachable')
}

type CircuitState = 'closed' | 'open' | 'half_open'

export class CircuitBreaker {
    private state: CircuitState = 'closed'
    private failures = 0
    private lastFailure = 0

    constructor(
        private threshold: number = 5,
        private cooldownMs: number = 30000
    ) {}

    async execute<T>(fn: () => Promise<T>): Promise<T> {
        if (this.state === 'open') {
            if (Date.now() - this.lastFailure > this.cooldownMs) {
                this.state = 'half_open'
            } else {
                throw new Error('Circuit breaker is open')
            }
        }

        try {
            const result = await fn()
            this.onSuccess()
            return result
        } catch (error) {
            this.onFailure()
            throw error
        }
    }

    private onSuccess(): void {
        this.failures = 0
        this.state = 'closed'
    }

    private onFailure(): void {
        this.failures++
        this.lastFailure = Date.now()
        if (this.failures >= this.threshold) {
            this.state = 'open'
        }
    }

    getState(): CircuitState {
        return this.state
    }
}

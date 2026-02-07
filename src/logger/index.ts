import pino from 'pino'
import type { ResolvedConfig } from '../config/schema.js'

export type Logger = pino.Logger

export function createLogger(config: ResolvedConfig): Logger {
    return pino({
        name: 'valarmind',
        level: config.logLevel === 'debug' ? 'debug' : 'warn',
        transport: config.logLevel === 'debug'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
    })
}

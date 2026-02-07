import { execaCommand } from 'execa'
import type { TypedEventEmitter } from '../core/events.js'
import type { ResolvedConfig } from '../config/schema.js'
import type { Logger } from '../logger/index.js'
import type { HookConfig, HookName, HookResult } from './types.js'

export class HookRunner {
    constructor(
        private config: ResolvedConfig,
        private logger: Logger,
        _eventBus: TypedEventEmitter
    ) {}

    async run(hookName: HookName, env?: Record<string, string>): Promise<HookResult[]> {
        const hooks = (this.config.hooks?.[hookName] ?? []) as HookConfig[]
        if (hooks.length === 0) return []

        const results: HookResult[] = []

        for (const hook of hooks) {
            try {
                const { stdout } = await execaCommand(hook.command, {
                    timeout: hook.timeout ?? 10000,
                    env: { ...process.env, ...env },
                    cwd: this.config.projectDir,
                    reject: false,
                    shell: true,
                })

                results.push({ hookName, success: true, output: stdout })
                this.logger.debug({ hookName, command: hook.command }, 'hook:success')
            } catch (error) {
                const result: HookResult = {
                    hookName,
                    success: false,
                    error: (error as Error).message,
                }
                results.push(result)
                this.logger.warn({ hookName, error: (error as Error).message }, 'hook:error')
            }
        }

        return results
    }
}

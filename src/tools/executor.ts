import type { Result } from '../core/result.js'
import { ok, err } from '../core/result.js'
import type { ToolPermissions } from '../core/types.js'
import type { PermissionManager } from '../permissions/manager.js'
import type { Tracer } from '../tracing/tracer.js'
import type { ToolRegistry } from './registry.js'
import type { ToolContext } from './types.js'

interface ExecuteOptions {
    agentPermissions: ToolPermissions
    signal?: AbortSignal
}

export class ToolExecutor {
    constructor(
        private registry: ToolRegistry,
        private permissionManager: PermissionManager,
        private tracer: Tracer
    ) {}

    async executeSafe(name: string, args: unknown, ctx: ToolContext, opts: ExecuteOptions): Promise<Result<string>> {
        const tool = this.registry.get(name)
        if (!tool) {
            return err(`Tool '${name}' not found`)
        }

        if (!this.permissionManager.hasPermission(opts.agentPermissions, tool.requiredPermission)) {
            return err(`Permission denied: ${name} requires '${tool.requiredPermission}'`)
        }

        const parsed = tool.parameters.safeParse(args)
        if (!parsed.success) {
            return err(`Invalid params for ${name}: ${parsed.error.message}`)
        }

        const span = this.tracer.startSpan('tool', { name })

        try {
            const result = await tool.execute(parsed.data, ctx)
            this.tracer.endSpan(span)
            return ok(typeof result === 'string' ? result : JSON.stringify(result))
        } catch (error) {
            this.tracer.endSpan(span)
            return err(`Tool '${name}' failed: ${(error as Error).message}`)
        }
    }
}

import type { ZodSchema } from 'zod'
import type { FileSystem } from '../core/fs.js'
import type { Result } from '../core/result.js'
import type { AgentType, Permission } from '../core/types.js'

export interface ToolContext {
    fs: FileSystem
    cwd: string
    agentType: AgentType
    signal?: AbortSignal
}

export interface Tool<TInput = unknown, TOutput = unknown> {
    name: string
    description: string
    parameters: ZodSchema<TInput>
    requiredPermission: Permission
    execute(input: TInput, ctx: ToolContext): Promise<TOutput>
}

export type ToolResult<T = unknown> = Result<T, string>

export type AnyTool = Tool<unknown, unknown>

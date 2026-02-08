import { z } from 'zod'
import type { AgentType } from '../core/types.js'

export const HookConfigSchema = z.object({
    command: z.string(),
    timeout: z.number().optional(),
})

export const McpServerSchema = z
    .object({
        command: z.string().optional(),
        args: z.array(z.string()).optional(),
        env: z.record(z.string()).optional(),
        url: z.string().url().optional(),
        headers: z.record(z.string()).optional(),
        enabled: z.boolean().optional(),
        timeout: z.number().optional(),
    })
    .refine((data) => data.command || data.url, { message: 'Server must have either command (stdio) or url (http)' })

export const ConfigSchema = z.object({
    model: z.string().optional(),
    apiKey: z.string().optional(),
    baseURL: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().positive().optional(),
    logLevel: z.enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace']).optional(),
    permissionMode: z.enum(['auto', 'suggest', 'ask']).optional(),
    tokenBudget: z
        .object({
            target: z.number().optional(),
            hardCap: z.number().optional(),
        })
        .optional(),
    agentTimeouts: z
        .record(
            z.object({
                default: z.number().optional(),
                max: z.number().optional(),
            })
        )
        .optional(),
    hooks: z
        .object({
            UserPromptSubmit: z.array(HookConfigSchema).optional(),
            PreToolUse: z.array(HookConfigSchema).optional(),
            PostToolUse: z.array(HookConfigSchema).optional(),
            PermissionRequest: z.array(HookConfigSchema).optional(),
            PreCompact: z.array(HookConfigSchema).optional(),
            SessionEnd: z.array(HookConfigSchema).optional(),
        })
        .optional(),
    planMode: z.boolean().optional(),
    mcp: z
        .object({
            servers: z.record(McpServerSchema).optional(),
        })
        .optional(),
    mcpPermissions: z.record(z.union([z.literal('*'), z.array(z.string())])).optional(),
    plugins: z.array(z.string()).optional(),
    pluginSettings: z.record(z.unknown()).optional(),
    sandbox: z
        .object({
            enabled: z.boolean().optional(),
            customProfiles: z.record(z.unknown()).optional(),
        })
        .optional(),
    costTier: z
        .object({
            light: z.string().optional(),
            standard: z.string().optional(),
            heavy: z.string().optional(),
        })
        .optional(),
    agentModels: z.record(z.string()).optional(),
})

export type Config = z.infer<typeof ConfigSchema>

export interface ResolvedConfig {
    model: string
    apiKey: string
    baseURL: string
    temperature: number
    maxTokens: number
    logLevel: 'silent' | 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'
    permissionMode: 'auto' | 'suggest' | 'ask'
    tokenBudget: { target: number; hardCap: number }
    agentTimeouts: Partial<Record<AgentType, { default: number; max: number }>>
    planMode: boolean
    hooks: Config['hooks'] & {}
    mcp: Config['mcp'] & {}
    mcpPermissions: Record<string, string[] | '*'>
    plugins: string[]
    pluginSettings: Record<string, unknown>
    sandbox: { enabled: boolean; customProfiles: Record<string, unknown> }
    costTier?: { light: string; standard: string; heavy: string }
    agentModels?: Partial<Record<AgentType, string>>
    projectDir: string
    configDir: string
}

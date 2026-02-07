export type HookName = 'UserPromptSubmit' | 'PreToolUse' | 'PostToolUse' | 'PermissionRequest' | 'PreCompact' | 'SessionEnd'

export interface HookConfig {
    command: string
    timeout?: number
}

export interface HookResult {
    hookName: HookName
    success: boolean
    output?: string
    error?: string
}

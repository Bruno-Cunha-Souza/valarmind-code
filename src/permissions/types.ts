import type { Permission } from '../core/types.js'

export type PermissionMode = 'auto' | 'suggest' | 'ask'

export interface PermissionRequest {
    toolName: string
    permission: Permission
    description: string
    args?: unknown
}

export interface PermissionResult {
    granted: boolean
    reason?: string
}

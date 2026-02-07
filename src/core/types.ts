export type AgentType = 'orchestrator' | 'search' | 'research' | 'code' | 'review' | 'test' | 'docs' | 'qa' | 'init'

export type Permission = 'read' | 'write' | 'execute' | 'spawn' | 'web'

export interface ToolPermissions {
    read: boolean
    write: boolean
    execute: boolean
    spawn: boolean
    web?: boolean
}

export const AGENT_PERMISSIONS: Record<AgentType, ToolPermissions> = {
    orchestrator: { read: true, write: false, execute: false, spawn: true },
    search: { read: true, write: false, execute: false, spawn: false },
    research: { read: true, write: false, execute: false, spawn: false, web: true },
    code: { read: true, write: true, execute: false, spawn: false },
    review: { read: true, write: false, execute: false, spawn: false },
    test: { read: true, write: true, execute: true, spawn: false },
    docs: { read: true, write: true, execute: false, spawn: false },
    qa: { read: true, write: false, execute: true, spawn: false },
    init: { read: true, write: true, execute: false, spawn: false },
}

export const AGENT_TIMEOUTS: Record<AgentType, { default: number; max: number }> = {
    orchestrator: { default: 120, max: 300 },
    search: { default: 30, max: 60 },
    research: { default: 45, max: 120 },
    code: { default: 120, max: 300 },
    review: { default: 60, max: 120 },
    test: { default: 180, max: 600 },
    docs: { default: 60, max: 120 },
    qa: { default: 120, max: 300 },
    init: { default: 120, max: 300 },
}

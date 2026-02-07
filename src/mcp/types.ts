export interface MCPServerConfig {
    command?: string
    args?: string[]
    env?: Record<string, string>
    url?: string
    headers?: Record<string, string>
    enabled?: boolean
    timeout?: number
}

export interface MCPToolInfo {
    server: string
    name: string
    originalName: string
    description: string
    inputSchema: Record<string, unknown>
}

export type MCPServerStatus = 'connecting' | 'ready' | 'error' | 'closed'

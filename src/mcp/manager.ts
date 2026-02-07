import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { errorMessage } from '../core/errors.js'
import type { AgentType } from '../core/types.js'
import type { Logger } from '../logger/index.js'
import type { MCPServerConfig, MCPServerStatus, MCPToolInfo } from './types.js'

const MAX_RETRIES = 3
const RETRY_BASE_MS = 1000

interface ServerConnection {
    client: Client | null
    status: MCPServerStatus
    tools: MCPToolInfo[]
}

export class MCPManager {
    private connections = new Map<string, ServerConnection>()

    constructor(
        private configs: Record<string, MCPServerConfig>,
        private logger: Logger
    ) {}

    async initialize(): Promise<void> {
        const entries = Object.entries(this.configs)
        for (const [name, config] of entries) {
            if (config.enabled === false) continue
            try {
                await this.connectServer(name, config)
            } catch (error) {
                this.logger.error(`MCP server '${name}' failed to connect: ${errorMessage(error)}`)
            }
        }
    }

    async connectServer(name: string, config: MCPServerConfig): Promise<void> {
        this.connections.set(name, {
            client: null,
            status: 'connecting',
            tools: [],
        })

        let lastError: Error | null = null

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                const transport = this.createTransport(config)
                const client = new Client({ name: 'valarmind-code', version: '1.0.0' })

                await client.connect(transport)

                const { tools } = await client.listTools()
                const toolInfos: MCPToolInfo[] = tools.map((t) => ({
                    server: name,
                    name: `mcp__${name}__${t.name}`,
                    originalName: t.name,
                    description: t.description ?? '',
                    inputSchema: (t.inputSchema as Record<string, unknown>) ?? {},
                }))

                this.connections.set(name, { client, status: 'ready', tools: toolInfos })
                this.logger.info(`MCP server '${name}' connected with ${toolInfos.length} tools`)
                return
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error))
                if (attempt < MAX_RETRIES - 1) {
                    const delay = RETRY_BASE_MS * 2 ** attempt
                    await new Promise((r) => setTimeout(r, delay))
                }
            }
        }

        this.connections.set(name, {
            client: null,
            status: 'error',
            tools: [],
        })

        throw lastError ?? new Error(`Failed to connect to MCP server '${name}'`)
    }

    async disconnect(name: string): Promise<void> {
        const conn = this.connections.get(name)
        if (!conn || !conn.client) return

        try {
            await conn.client.close()
        } catch {
            // Ignore close errors
        }
        conn.status = 'closed'
        this.connections.delete(name)
    }

    async shutdown(): Promise<void> {
        for (const name of [...this.connections.keys()]) {
            await this.disconnect(name)
        }
    }

    getToolsForAgent(agentType: AgentType, mcpPermissions: Record<string, string[] | '*'>): MCPToolInfo[] {
        const perms = mcpPermissions[agentType]
        if (!perms) return []

        const tools: MCPToolInfo[] = []

        if (perms === '*') {
            for (const conn of this.connections.values()) {
                if (conn.status === 'ready') {
                    tools.push(...conn.tools)
                }
            }
        } else {
            for (const serverName of perms) {
                const conn = this.connections.get(serverName)
                if (conn?.status === 'ready') {
                    tools.push(...conn.tools)
                }
            }
        }

        return tools
    }

    async callTool(namespacedName: string, args: Record<string, unknown>): Promise<string> {
        const parts = namespacedName.split('__')
        if (parts.length < 3 || parts[0] !== 'mcp') {
            throw new Error(`Invalid MCP tool name: ${namespacedName}`)
        }

        const serverName = parts[1]!
        const toolName = parts.slice(2).join('__')
        const conn = this.connections.get(serverName)

        if (!conn || conn.status !== 'ready' || !conn.client) {
            throw new Error(`MCP server not connected: ${serverName}`)
        }

        const result = await conn.client.callTool({ name: toolName, arguments: args })

        if (result.content && Array.isArray(result.content)) {
            return result.content
                .map((c) => {
                    if (typeof c === 'object' && c !== null && 'text' in c) {
                        return (c as { text: string }).text
                    }
                    return JSON.stringify(c)
                })
                .join('\n')
        }

        return JSON.stringify(result)
    }

    async healthCheck(name: string): Promise<boolean> {
        const conn = this.connections.get(name)
        if (!conn || conn.status !== 'ready' || !conn.client) return false

        try {
            await conn.client.ping()
            return true
        } catch {
            return false
        }
    }

    getStatus(): Map<string, MCPServerStatus> {
        const statuses = new Map<string, MCPServerStatus>()
        for (const [name, conn] of this.connections) {
            statuses.set(name, conn.status)
        }
        return statuses
    }

    private resolveEnv(env?: Record<string, string>): Record<string, string> {
        if (!env) return {}
        const resolved: Record<string, string> = {}
        for (const [key, value] of Object.entries(env)) {
            resolved[key] = value.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? '')
        }
        return resolved
    }

    private createTransport(config: MCPServerConfig) {
        if (config.url) {
            return new StreamableHTTPClientTransport(new URL(config.url))
        }

        return new StdioClientTransport({
            command: config.command!,
            args: config.args,
            env: { ...process.env, ...this.resolveEnv(config.env) } as Record<string, string>,
        })
    }
}

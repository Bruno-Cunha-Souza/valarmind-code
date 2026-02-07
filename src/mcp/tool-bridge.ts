import { z } from 'zod'
import type { Tool } from '../tools/types.js'
import type { MCPManager } from './manager.js'
import type { MCPToolInfo } from './types.js'

export function createMCPToolBridge(mcpManager: MCPManager, toolInfo: MCPToolInfo): Tool {
    return {
        name: toolInfo.name,
        description: `[MCP:${toolInfo.server}] ${toolInfo.description}`,
        parameters: z.record(z.unknown()),
        requiredPermission: 'web',
        async execute(input, _ctx) {
            const result = await mcpManager.callTool(toolInfo.name, input as Record<string, unknown>)
            return result
        },
    }
}

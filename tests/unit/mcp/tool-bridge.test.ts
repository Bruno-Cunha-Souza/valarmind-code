import { describe, it, expect, mock } from 'bun:test'
import { createMCPToolBridge } from '../../../src/mcp/tool-bridge.js'
import type { MCPManager } from '../../../src/mcp/manager.js'
import type { MCPToolInfo } from '../../../src/mcp/types.js'
import type { ToolContext } from '../../../src/tools/types.js'

describe('createMCPToolBridge', () => {
    const dummyCtx: ToolContext = {
        fs: {} as never,
        cwd: '/test',
        agentType: 'research',
    }

    it('creates a valid Tool object', () => {
        const mockManager = { callTool: mock(async () => 'result') } as unknown as MCPManager
        const toolInfo: MCPToolInfo = {
            server: 'postgres',
            name: 'mcp__postgres__query',
            originalName: 'query',
            description: 'Run SQL query',
            inputSchema: { type: 'object' },
        }

        const tool = createMCPToolBridge(mockManager, toolInfo)

        expect(tool.name).toBe('mcp__postgres__query')
        expect(tool.description).toContain('[MCP:postgres]')
        expect(tool.description).toContain('Run SQL query')
        expect(tool.requiredPermission).toBe('web')
    })

    it('delegates execute to MCPManager.callTool', async () => {
        const callToolMock = mock(async () => 'query result')
        const mockManager = { callTool: callToolMock } as unknown as MCPManager
        const toolInfo: MCPToolInfo = {
            server: 'postgres',
            name: 'mcp__postgres__query',
            originalName: 'query',
            description: 'Run SQL query',
            inputSchema: {},
        }

        const tool = createMCPToolBridge(mockManager, toolInfo)
        const result = await tool.execute({ sql: 'SELECT 1' }, dummyCtx)

        expect(result).toBe('query result')
        expect(callToolMock).toHaveBeenCalledWith('mcp__postgres__query', { sql: 'SELECT 1' })
    })
})

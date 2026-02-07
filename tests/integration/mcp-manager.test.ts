import { describe, it, expect, mock } from 'bun:test'
import { MCPManager } from '../../src/mcp/manager.js'
import { createMCPToolBridge } from '../../src/mcp/tool-bridge.js'
import { ToolRegistry } from '../../src/tools/registry.js'
import type { MCPToolInfo } from '../../src/mcp/types.js'
import pino from 'pino'

const mockLogger = pino({ level: 'silent' })

describe('MCP Manager Integration', () => {
    it('MCPManager initializes without servers', async () => {
        const manager = new MCPManager({}, mockLogger)
        await manager.initialize()
        expect(manager.getStatus().size).toBe(0)
        await manager.shutdown()
    })

    it('tool bridge registers tools in ToolRegistry', () => {
        const registry = new ToolRegistry()

        const mockManager = {
            callTool: mock(async () => 'result'),
        } as unknown as MCPManager

        const toolInfos: MCPToolInfo[] = [
            {
                server: 'postgres',
                name: 'mcp__postgres__run_sql',
                originalName: 'run_sql',
                description: 'Run SQL',
                inputSchema: {},
            },
            {
                server: 'postgres',
                name: 'mcp__postgres__list_tables',
                originalName: 'list_tables',
                description: 'List tables',
                inputSchema: {},
            },
        ]

        for (const info of toolInfos) {
            const tool = createMCPToolBridge(mockManager, info)
            registry.register(tool)
        }

        registry.appendForAgent('research', toolInfos.map((t) => t.name))

        const tools = registry.getToolsForAgent('research')
        expect(tools.length).toBe(2)
        expect(tools.map((t) => t.name)).toContain('mcp__postgres__run_sql')
        expect(tools.map((t) => t.name)).toContain('mcp__postgres__list_tables')
    })

    it('tool definitions are valid for LLM', () => {
        const registry = new ToolRegistry()

        const mockManager = {
            callTool: mock(async () => 'result'),
        } as unknown as MCPManager

        const info: MCPToolInfo = {
            server: 'test',
            name: 'mcp__test__action',
            originalName: 'action',
            description: 'Test action',
            inputSchema: {},
        }

        const tool = createMCPToolBridge(mockManager, info)
        registry.register(tool)
        registry.registerForAgent('research', ['mcp__test__action'])

        const defs = registry.getToolDefinitions('research')
        expect(defs.length).toBe(1)
        expect(defs[0].type).toBe('function')
        expect(defs[0].function.name).toBe('mcp__test__action')
    })

    it('shutdown is safe to call multiple times', async () => {
        const manager = new MCPManager({}, mockLogger)
        await manager.initialize()
        await manager.shutdown()
        await manager.shutdown()
        expect(manager.getStatus().size).toBe(0)
    })
})

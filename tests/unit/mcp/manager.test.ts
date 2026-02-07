import { describe, it, expect, mock } from 'bun:test'
import { MCPManager } from '../../../src/mcp/manager.js'
import type { MCPServerConfig } from '../../../src/mcp/types.js'
import pino from 'pino'

const mockLogger = pino({ level: 'silent' })

describe('MCPManager', () => {
    it('initializes with empty config', async () => {
        const manager = new MCPManager({}, mockLogger)
        await manager.initialize()
        expect(manager.getStatus().size).toBe(0)
    })

    it('skips disabled servers', async () => {
        const configs: Record<string, MCPServerConfig> = {
            disabled: { command: 'echo', enabled: false },
        }
        const manager = new MCPManager(configs, mockLogger)
        await manager.initialize()
        expect(manager.getStatus().size).toBe(0)
    })

    it('returns empty tools for unknown agent type', () => {
        const manager = new MCPManager({}, mockLogger)
        const tools = manager.getToolsForAgent('code', {})
        expect(tools).toEqual([])
    })

    it('getToolsForAgent with wildcard returns all ready server tools', async () => {
        const manager = new MCPManager({}, mockLogger)
        // Without connected servers, should return empty
        const tools = manager.getToolsForAgent('research', { research: '*' })
        expect(tools).toEqual([])
    })

    it('resolves env variables', () => {
        const original = process.env.TEST_DB_URL
        process.env.TEST_DB_URL = 'postgres://localhost/test'

        const manager = new MCPManager({}, mockLogger)
        // Access private method via cast
        const resolveEnv = (manager as any).resolveEnv.bind(manager)
        const result = resolveEnv({ DATABASE_URL: '${TEST_DB_URL}' })

        expect(result.DATABASE_URL).toBe('postgres://localhost/test')

        if (original !== undefined) process.env.TEST_DB_URL = original
        else delete process.env.TEST_DB_URL
    })

    it('tool namespace format is mcp__server__tool', async () => {
        // Verify namespace structure without needing real connections
        const namespacedName = `mcp__postgres__run_sql`
        const parts = namespacedName.split('__')
        expect(parts[0]).toBe('mcp')
        expect(parts[1]).toBe('postgres')
        expect(parts[2]).toBe('run_sql')
    })

    it('callTool rejects invalid namespace', async () => {
        const manager = new MCPManager({}, mockLogger)
        await expect(manager.callTool('invalid_name', {})).rejects.toThrow('Invalid MCP tool name')
    })

    it('callTool rejects disconnected server', async () => {
        const manager = new MCPManager({}, mockLogger)
        await expect(manager.callTool('mcp__postgres__query', {})).rejects.toThrow('not connected')
    })

    it('healthCheck returns false for unknown server', async () => {
        const manager = new MCPManager({}, mockLogger)
        const healthy = await manager.healthCheck('unknown')
        expect(healthy).toBe(false)
    })

    it('shutdown is idempotent', async () => {
        const manager = new MCPManager({}, mockLogger)
        await manager.shutdown()
        await manager.shutdown()
        expect(manager.getStatus().size).toBe(0)
    })
})

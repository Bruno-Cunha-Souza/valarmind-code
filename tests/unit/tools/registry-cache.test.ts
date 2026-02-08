import { describe, it, expect } from 'bun:test'
import { z } from 'zod'
import { ToolRegistry } from '../../../src/tools/registry.js'
import type { AnyTool } from '../../../src/tools/types.js'

function makeTool(name: string): AnyTool {
    return {
        name,
        description: `Tool ${name}`,
        parameters: z.object({ input: z.string().optional() }),
        execute: async () => ({ ok: true, value: 'done' }),
    } as unknown as AnyTool
}

describe('ToolRegistry definition cache', () => {
    it('returns cached definitions on second call', () => {
        const registry = new ToolRegistry()
        registry.register(makeTool('glob'))
        registry.registerForAgent('search', ['glob'])

        const first = registry.getToolDefinitions('search')
        const second = registry.getToolDefinitions('search')

        expect(first).toBe(second) // same reference = cache hit
    })

    it('invalidates all agents on register()', () => {
        const registry = new ToolRegistry()
        registry.register(makeTool('glob'))
        registry.registerForAgent('search', ['glob'])

        const before = registry.getToolDefinitions('search')

        registry.register(makeTool('grep'))

        const after = registry.getToolDefinitions('search')
        expect(before).not.toBe(after) // different reference = cache miss
    })

    it('invalidates only affected agent on registerForAgent()', () => {
        const registry = new ToolRegistry()
        registry.register(makeTool('glob'))
        registry.register(makeTool('grep'))
        registry.registerForAgent('search', ['glob'])
        registry.registerForAgent('code', ['glob', 'grep'])

        const searchBefore = registry.getToolDefinitions('search')
        const codeBefore = registry.getToolDefinitions('code')

        // Re-register search agent tools — only search cache should invalidate
        registry.registerForAgent('search', ['glob', 'grep'])

        const searchAfter = registry.getToolDefinitions('search')
        const codeAfter = registry.getToolDefinitions('code')

        expect(searchBefore).not.toBe(searchAfter) // invalidated
        expect(codeBefore).toBe(codeAfter) // still cached
    })

    it('invalidates only affected agent on appendForAgent()', () => {
        const registry = new ToolRegistry()
        registry.register(makeTool('glob'))
        registry.register(makeTool('grep'))
        registry.registerForAgent('search', ['glob'])
        registry.registerForAgent('code', ['glob'])

        const searchBefore = registry.getToolDefinitions('search')
        const codeBefore = registry.getToolDefinitions('code')

        registry.appendForAgent('search', ['grep'])

        const searchAfter = registry.getToolDefinitions('search')
        const codeAfter = registry.getToolDefinitions('code')

        expect(searchBefore).not.toBe(searchAfter)
        expect(codeBefore).toBe(codeAfter)
    })

    it('returns correct tool definitions from cache', () => {
        const registry = new ToolRegistry()
        registry.register(makeTool('glob'))
        registry.register(makeTool('grep'))
        registry.registerForAgent('search', ['glob', 'grep'])

        const defs = registry.getToolDefinitions('search')

        expect(defs).toHaveLength(2)
        expect(defs[0]!.function.name).toBe('glob')
        expect(defs[1]!.function.name).toBe('grep')
        expect(defs[0]!.type).toBe('function')
    })

    it('returns empty array for agent with no tools', () => {
        const registry = new ToolRegistry()
        const defs = registry.getToolDefinitions('search')
        expect(defs).toEqual([])
    })

    it('appendForAgent does not duplicate existing tools', () => {
        const registry = new ToolRegistry()
        registry.register(makeTool('glob'))
        registry.registerForAgent('search', ['glob'])

        registry.appendForAgent('search', ['glob'])

        const defs = registry.getToolDefinitions('search')
        expect(defs).toHaveLength(1)
    })
})

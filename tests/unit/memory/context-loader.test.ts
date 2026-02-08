import { describe, it, expect } from 'bun:test'
import { MockFileSystem } from '../../../src/core/fs.js'
import { ContextLoader } from '../../../src/memory/context-loader.js'
import { StateManager } from '../../../src/memory/state-manager.js'
import type { ResolvedConfig } from '../../../src/config/schema.js'
import pino from 'pino'

const mockLogger = pino({ level: 'silent' })
const mockConfig = { projectDir: '/project' } as ResolvedConfig

function createLoader(fs: MockFileSystem) {
    const stateManager = new StateManager(mockConfig, fs, mockLogger)
    return new ContextLoader(fs, stateManager)
}

describe('ContextLoader', () => {
    it('loads VALARMIND.md and VALARMIND.local.md from disk', async () => {
        const fs = new MockFileSystem()
        fs.setFile('/project/VALARMIND.md', '# Project')
        fs.setFile('/project/VALARMIND.local.md', '# Local prefs')

        const loader = createLoader(fs)
        const ctx = await loader.load('/project')

        expect(ctx.valarmindMd).toBe('# Project')
        expect(ctx.localMd).toBe('# Local prefs')
    })

    it('returns null when files do not exist', async () => {
        const fs = new MockFileSystem()
        const loader = createLoader(fs)
        const ctx = await loader.load('/project')

        expect(ctx.valarmindMd).toBeNull()
        expect(ctx.localMd).toBeNull()
    })

    it('caches valarmindMd and localMd on second load', async () => {
        const fs = new MockFileSystem()
        fs.setFile('/project/VALARMIND.md', '# V1')

        const loader = createLoader(fs)

        // First load — reads from disk
        const ctx1 = await loader.load('/project')
        expect(ctx1.valarmindMd).toBe('# V1')

        // Change file on disk — cache should prevent seeing the change
        fs.setFile('/project/VALARMIND.md', '# V2')

        const ctx2 = await loader.load('/project')
        expect(ctx2.valarmindMd).toBe('# V1') // still cached
    })

    it('invalidate() clears cache so next load reads from disk', async () => {
        const fs = new MockFileSystem()
        fs.setFile('/project/VALARMIND.md', '# V1')

        const loader = createLoader(fs)

        await loader.load('/project')

        // Update file and invalidate
        fs.setFile('/project/VALARMIND.md', '# V2')
        loader.invalidate()

        const ctx = await loader.load('/project')
        expect(ctx.valarmindMd).toBe('# V2')
    })

    it('stateCompact is always loaded fresh (not cached)', async () => {
        const fs = new MockFileSystem()
        const stateManager = new StateManager(mockConfig, fs, mockLogger)
        const loader = new ContextLoader(fs, stateManager)

        // First load — no state
        const ctx1 = await loader.load('/project')
        expect(ctx1.stateCompact).toBeNull()

        // Update state
        await stateManager.update({ goal: 'Build feature', now: 'Working' })

        // Second load — stateCompact should reflect the update
        const ctx2 = await loader.load('/project')
        expect(ctx2.stateCompact).not.toBeNull()
        expect(ctx2.stateCompact).toContain('Build feature')
    })

    it('cache is per projectDir', async () => {
        const fs = new MockFileSystem()
        fs.setFile('/project-a/VALARMIND.md', '# A')
        fs.setFile('/project-b/VALARMIND.md', '# B')

        const stateManager = new StateManager(mockConfig, fs, mockLogger)
        const loader = new ContextLoader(fs, stateManager)

        const ctxA = await loader.load('/project-a')
        expect(ctxA.valarmindMd).toBe('# A')

        // Loading a different projectDir should not use the cache
        const ctxB = await loader.load('/project-b')
        expect(ctxB.valarmindMd).toBe('# B')
    })
})

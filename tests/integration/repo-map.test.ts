import { describe, it, expect } from 'bun:test'
import { RepoMapper } from '../../src/code-understanding/repo-map.js'
import { BunFileSystem } from '../../src/core/fs.js'
import { Glob } from 'bun'
import path from 'node:path'

describe('Repo Map Integration', () => {
    it('generates map from real project files', async () => {
        const fs = new BunFileSystem()
        const projectRoot = path.resolve(import.meta.dir, '../..')

        // Collect a few real source files
        const glob = new Glob('src/core/*.ts')
        const files: string[] = []
        for await (const file of glob.scan({ cwd: projectRoot, absolute: true })) {
            files.push(file)
            if (files.length >= 5) break
        }

        const mapper = new RepoMapper()
        const result = await mapper.generateMap(files, fs)

        // Should have extracted at least some symbols from the core module
        expect(result).not.toBe('(no symbols found)')
        expect(result.length).toBeGreaterThan(50)
    })

    it('generates map from container.ts', async () => {
        const fs = new BunFileSystem()
        const containerPath = path.resolve(import.meta.dir, '../../src/core/container.ts')

        const mapper = new RepoMapper()
        const result = await mapper.generateMap([containerPath], fs)

        expect(result).toContain('container.ts')
        expect(result).toContain('createContainer')
    })
})

import { describe, it, expect } from 'bun:test'
import { MockFileSystem } from '../../../src/core/fs.js'

describe('MockFileSystem', () => {
    it('reads and writes text', async () => {
        const fs = new MockFileSystem()
        await fs.writeText('/test.txt', 'hello')
        expect(await fs.readText('/test.txt')).toBe('hello')
    })

    it('reads and writes JSON', async () => {
        const fs = new MockFileSystem()
        await fs.writeJSON('/test.json', { key: 'value' })
        expect(await fs.readJSON('/test.json')).toEqual({ key: 'value' })
    })

    it('throws on missing file', async () => {
        const fs = new MockFileSystem()
        await expect(fs.readText('/missing.txt')).rejects.toThrow('ENOENT')
    })

    it('checks existence', async () => {
        const fs = new MockFileSystem()
        expect(await fs.exists('/missing.txt')).toBe(false)
        await fs.writeText('/exists.txt', 'data')
        expect(await fs.exists('/exists.txt')).toBe(true)
    })

    it('removes files', async () => {
        const fs = new MockFileSystem()
        await fs.writeText('/temp.txt', 'data')
        await fs.remove('/temp.txt')
        expect(await fs.exists('/temp.txt')).toBe(false)
    })

    it('setFile helper works', async () => {
        const fs = new MockFileSystem()
        fs.setFile('/preset.txt', 'preset content')
        expect(await fs.readText('/preset.txt')).toBe('preset content')
    })

    it('getFiles returns all files', async () => {
        const fs = new MockFileSystem()
        fs.setFile('/a.txt', 'a')
        fs.setFile('/b.txt', 'b')
        const files = fs.getFiles()
        expect(files.size).toBe(2)
    })
})

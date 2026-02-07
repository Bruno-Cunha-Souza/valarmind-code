import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { MockFileSystem } from '../../../src/core/fs.js'
import { loadConfig } from '../../../src/config/loader.js'

describe('loadConfig', () => {
    const originalEnv = process.env

    beforeEach(() => {
        process.env = { ...originalEnv }
        delete process.env.VALARMIND_API_KEY
        delete process.env.VALARMIND_MODEL
        delete process.env.VALARMIND_LOG_LEVEL
    })

    afterEach(() => {
        process.env = originalEnv
    })

    it('returns defaults when no config files exist', async () => {
        const fs = new MockFileSystem()
        const config = await loadConfig({ fs })
        expect(config.model).toBe('anthropic/claude-sonnet-4.5')
        expect(config.temperature).toBe(0)
        expect(config.logLevel).toBe('info')
        expect(config.apiKey).toBe('')
    })

    it('merges CLI flags over defaults', async () => {
        const fs = new MockFileSystem()
        const config = await loadConfig({
            fs,
            cliFlags: { model: 'openai/gpt-4o', apiKey: 'sk-or-test' },
        })
        expect(config.model).toBe('openai/gpt-4o')
        expect(config.apiKey).toBe('sk-or-test')
    })

    it('env vars override config files', async () => {
        const fs = new MockFileSystem()
        process.env.VALARMIND_API_KEY = 'sk-or-env'
        const config = await loadConfig({ fs })
        expect(config.apiKey).toBe('sk-or-env')
    })

    it('CLI flags override env vars', async () => {
        const fs = new MockFileSystem()
        process.env.VALARMIND_API_KEY = 'sk-or-env'
        const config = await loadConfig({
            fs,
            cliFlags: { apiKey: 'sk-or-cli' },
        })
        expect(config.apiKey).toBe('sk-or-cli')
    })

    it('loads global config file', async () => {
        const fs = new MockFileSystem()
        fs.setFile(`${process.env.HOME}/.config/valarmind/config.json`, JSON.stringify({ model: 'google/gemini-pro' }))
        const config = await loadConfig({ fs })
        expect(config.model).toBe('google/gemini-pro')
    })
})

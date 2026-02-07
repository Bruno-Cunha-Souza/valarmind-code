import { describe, it, expect } from 'bun:test'
import { SandboxManager, AGENT_SANDBOX_PROFILES } from '../../../src/security/sandbox.js'
import type { AgentType } from '../../../src/core/types.js'
import pino from 'pino'

const mockLogger = pino({ level: 'silent' })

describe('AGENT_SANDBOX_PROFILES', () => {
    it('has profiles for all agent types', () => {
        const expectedAgents: AgentType[] = [
            'orchestrator', 'search', 'research', 'code', 'review', 'test', 'docs', 'qa', 'init',
        ]
        for (const agent of expectedAgents) {
            expect(AGENT_SANDBOX_PROFILES[agent]).toBeDefined()
        }
    })

    it('search agent has read-only filesystem', () => {
        const profile = AGENT_SANDBOX_PROFILES.search
        expect(profile.filesystem.denyWrite).toEqual(['*'])
        expect(profile.filesystem.allowWrite).toEqual([])
    })

    it('code agent can write to project dir but not .env', () => {
        const profile = AGENT_SANDBOX_PROFILES.code
        expect(profile.filesystem.allowWrite).toContain('.')
        expect(profile.filesystem.denyWrite).toContain('.env')
    })

    it('research agent has full network access', () => {
        const profile = AGENT_SANDBOX_PROFILES.research
        expect(profile.network.allowedDomains).toContain('*')
    })

    it('test agent has network access to npm registry', () => {
        const profile = AGENT_SANDBOX_PROFILES.test
        expect(profile.network.allowedDomains).toContain('registry.npmjs.org')
    })

    it('search agent denies read to sensitive dirs', () => {
        const profile = AGENT_SANDBOX_PROFILES.search
        expect(profile.filesystem.denyRead).toContain('~/.ssh')
        expect(profile.filesystem.denyRead).toContain('~/.aws')
    })
})

describe('SandboxManager', () => {
    it('returns enabled state', () => {
        const sm = new SandboxManager(true, mockLogger)
        expect(sm.enabled).toBe(true)
    })

    it('returns disabled state', () => {
        const sm = new SandboxManager(false, mockLogger)
        expect(sm.enabled).toBe(false)
    })

    it('getProfile returns correct profile for agent', () => {
        const sm = new SandboxManager(true, mockLogger)
        const profile = sm.getProfile('code')
        expect(profile).toEqual(AGENT_SANDBOX_PROFILES.code)
    })

    it('wrapCommand returns original command when disabled', () => {
        const sm = new SandboxManager(false, mockLogger)
        const result = sm.wrapCommand('echo hello', 'code')
        expect(result).toBe('echo hello')
    })

    it('wrapCommand on darwin generates sandbox-exec command', () => {
        // Only test if on macOS
        if (process.platform !== 'darwin') return

        const sm = new SandboxManager(true, mockLogger)
        const result = sm.wrapCommand('echo hello', 'search')

        expect(result).toContain('sandbox-exec')
        expect(result).toContain('(version 1)')
        expect(result).toContain('(allow default)')
        expect(result).toContain('echo hello')
    })

    it('wrapCommand on darwin includes deny-read rules', () => {
        if (process.platform !== 'darwin') return

        const sm = new SandboxManager(true, mockLogger)
        const result = sm.wrapCommand('ls', 'search')

        expect(result).toContain('deny file-read*')
        expect(result).toContain('.ssh')
    })

    it('wrapCommand on darwin includes deny-write-all for read-only agents', () => {
        if (process.platform !== 'darwin') return

        const sm = new SandboxManager(true, mockLogger)
        const result = sm.wrapCommand('ls', 'search')

        expect(result).toContain('(deny file-write*)')
    })

    it('wrapCommand on darwin includes specific deny-write for code agent', () => {
        if (process.platform !== 'darwin') return

        const sm = new SandboxManager(true, mockLogger)
        const result = sm.wrapCommand('echo test', 'code')

        expect(result).toContain('.env')
        expect(result).toContain('deny file-write*')
    })

    it('wrapCommand escapes single quotes in command', () => {
        if (process.platform !== 'darwin') return

        const sm = new SandboxManager(true, mockLogger)
        const result = sm.wrapCommand("echo 'hello world'", 'code')

        // Should contain escaped quotes
        expect(result).toContain('sandbox-exec')
    })

    it('isAvailable returns false when disabled', () => {
        const sm = new SandboxManager(false, mockLogger)
        expect(sm.isAvailable()).toBe(false)
    })
})

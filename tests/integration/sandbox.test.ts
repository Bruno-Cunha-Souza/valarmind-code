import { describe, it, expect } from 'bun:test'
import { SandboxManager, AGENT_SANDBOX_PROFILES } from '../../src/security/sandbox.js'
import type { ToolContext } from '../../src/tools/types.js'
import pino from 'pino'

const mockLogger = pino({ level: 'silent' })

describe('Sandbox Integration', () => {
    it('bash tool context includes sandboxManager', () => {
        const sm = new SandboxManager(true, mockLogger)
        const ctx: ToolContext = {
            fs: {} as any,
            cwd: '/tmp/project',
            agentType: 'code',
            sandboxManager: sm,
        }

        expect(ctx.sandboxManager).toBeDefined()
        expect(ctx.sandboxManager!.enabled).toBe(true)
    })

    it('sandbox disabled passes command through unchanged', () => {
        const sm = new SandboxManager(false, mockLogger)
        const command = 'npm test'
        const wrapped = sm.wrapCommand(command, 'test')
        expect(wrapped).toBe(command)
    })

    it('correct profile is applied per agent type', () => {
        const sm = new SandboxManager(true, mockLogger)

        const searchProfile = sm.getProfile('search')
        expect(searchProfile.filesystem.denyWrite).toEqual(['*'])

        const codeProfile = sm.getProfile('code')
        expect(codeProfile.filesystem.allowWrite).toContain('.')

        const testProfile = sm.getProfile('test')
        expect(testProfile.filesystem.allowWrite).toContain('/tmp')
        expect(testProfile.network.allowedDomains).toContain('registry.npmjs.org')
    })

    it('sandbox wrapping generates platform-appropriate commands', () => {
        const sm = new SandboxManager(true, mockLogger)
        const command = 'echo hello'
        const result = sm.wrapCommand(command, 'search')

        if (process.platform === 'darwin') {
            expect(result).toContain('sandbox-exec')
            expect(result).toContain('(version 1)')
        } else if (process.platform === 'linux') {
            expect(result).toContain('bwrap')
            expect(result).toContain('--die-with-parent')
        } else {
            // Unsupported platform - command passes through
            expect(result).toBe(command)
        }
    })

    it('all agent profiles deny access to ~/.ssh', () => {
        const agentTypes = Object.keys(AGENT_SANDBOX_PROFILES) as Array<keyof typeof AGENT_SANDBOX_PROFILES>

        for (const agent of agentTypes) {
            const profile = AGENT_SANDBOX_PROFILES[agent]
            expect(profile.filesystem.denyRead).toContain('~/.ssh')
        }
    })

    it('read-only agents cannot write anywhere', () => {
        const readOnlyAgents = ['orchestrator', 'search', 'research', 'review', 'qa'] as const

        for (const agent of readOnlyAgents) {
            const profile = AGENT_SANDBOX_PROFILES[agent]
            expect(profile.filesystem.denyWrite).toContain('*')
            expect(profile.filesystem.allowWrite).toEqual([])
        }
    })
})

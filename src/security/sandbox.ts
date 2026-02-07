import type { AgentType } from '../core/types.js'
import type { Logger } from '../logger/index.js'

export interface SandboxProfile {
    filesystem: {
        denyRead: string[]
        allowWrite: string[]
        denyWrite: string[]
    }
    network: {
        allowedDomains: string[]
    }
}

export const AGENT_SANDBOX_PROFILES: Record<AgentType, SandboxProfile> = {
    orchestrator: {
        filesystem: { denyRead: ['~/.ssh', '~/.aws'], allowWrite: [], denyWrite: ['*'] },
        network: { allowedDomains: [] },
    },
    search: {
        filesystem: { denyRead: ['~/.ssh', '~/.aws'], allowWrite: [], denyWrite: ['*'] },
        network: { allowedDomains: [] },
    },
    research: {
        filesystem: { denyRead: ['~/.ssh', '~/.aws'], allowWrite: [], denyWrite: ['*'] },
        network: { allowedDomains: ['*'] },
    },
    code: {
        filesystem: { denyRead: ['~/.ssh'], allowWrite: ['.'], denyWrite: ['.env', '.env.*'] },
        network: { allowedDomains: [] },
    },
    review: {
        filesystem: { denyRead: ['~/.ssh', '~/.aws'], allowWrite: [], denyWrite: ['*'] },
        network: { allowedDomains: [] },
    },
    test: {
        filesystem: { denyRead: ['~/.ssh'], allowWrite: ['.', '/tmp'], denyWrite: ['.env'] },
        network: { allowedDomains: ['registry.npmjs.org'] },
    },
    docs: {
        filesystem: { denyRead: ['~/.ssh'], allowWrite: ['.'], denyWrite: ['.env'] },
        network: { allowedDomains: [] },
    },
    qa: {
        filesystem: { denyRead: ['~/.ssh'], allowWrite: [], denyWrite: ['*'] },
        network: { allowedDomains: [] },
    },
    init: {
        filesystem: { denyRead: ['~/.ssh'], allowWrite: ['.'], denyWrite: ['.env'] },
        network: { allowedDomains: [] },
    },
}

export class SandboxManager {
    private _enabled: boolean

    constructor(
        enabled: boolean,
        private logger: Logger
    ) {
        this._enabled = enabled
    }

    get enabled(): boolean {
        return this._enabled
    }

    isAvailable(): boolean {
        if (!this._enabled) return false

        // macOS: sandbox-exec; Linux: bubblewrap (bwrap)
        if (process.platform === 'darwin') {
            try {
                Bun.spawnSync({ cmd: ['which', 'sandbox-exec'] })
                return true
            } catch {
                return false
            }
        }

        if (process.platform === 'linux') {
            try {
                Bun.spawnSync({ cmd: ['which', 'bwrap'] })
                return true
            } catch {
                return false
            }
        }

        return false
    }

    getProfile(agentType: AgentType): SandboxProfile {
        return AGENT_SANDBOX_PROFILES[agentType]
    }

    wrapCommand(command: string, agentType: AgentType): string {
        if (!this._enabled) return command

        const profile = this.getProfile(agentType)

        if (process.platform === 'darwin') {
            return this.wrapDarwin(command, profile)
        }

        if (process.platform === 'linux') {
            return this.wrapLinux(command, profile)
        }

        this.logger.warn(`Sandbox not supported on ${process.platform}, executing without sandbox`)
        return command
    }

    private wrapDarwin(command: string, profile: SandboxProfile): string {
        const rules: string[] = ['(version 1)', '(allow default)']

        for (const denied of profile.filesystem.denyRead) {
            const expanded = denied.replace('~', process.env.HOME ?? '/root')
            rules.push(`(deny file-read* (subpath "${expanded}"))`)
        }

        for (const denied of profile.filesystem.denyWrite) {
            if (denied === '*') {
                rules.push('(deny file-write*)')
                break
            }
            const expanded = denied.replace('~', process.env.HOME ?? '/root')
            rules.push(`(deny file-write* (subpath "${expanded}"))`)
        }

        const seatbelt = rules.join('\n')
        const escaped = command.replace(/'/g, "'\\''")
        return `sandbox-exec -p '${seatbelt}' /bin/sh -c '${escaped}'`
    }

    private wrapLinux(command: string, profile: SandboxProfile): string {
        const args: string[] = ['bwrap', '--die-with-parent']

        // Basic filesystem setup
        args.push('--ro-bind', '/', '/')

        for (const dir of profile.filesystem.allowWrite) {
            const resolved = dir === '.' ? process.cwd() : dir
            args.push('--bind', resolved, resolved)
        }

        for (const denied of profile.filesystem.denyRead) {
            const expanded = denied.replace('~', process.env.HOME ?? '/root')
            args.push('--tmpfs', expanded)
        }

        if (profile.network.allowedDomains.length === 0) {
            args.push('--unshare-net')
        }

        const escaped = command.replace(/'/g, "'\\''")
        args.push('--', '/bin/sh', '-c', `'${escaped}'`)
        return args.join(' ')
    }
}

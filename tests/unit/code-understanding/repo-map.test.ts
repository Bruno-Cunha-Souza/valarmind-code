import { describe, it, expect, mock } from 'bun:test'
import { RepoMapper } from '../../../src/code-understanding/repo-map.js'
import type { FileSystem } from '../../../src/core/fs.js'

function createMockFs(files: Record<string, string>): FileSystem {
    return {
        readText: mock(async (path: string) => {
            const content = files[path]
            if (content === undefined) throw new Error(`File not found: ${path}`)
            return content
        }),
        writeFile: mock(async () => {}),
        exists: mock(async (path: string) => path in files),
        readJSON: mock(async () => ({})),
        writeJSON: mock(async () => {}),
        mkdir: mock(async () => {}),
        readdir: mock(async () => []),
    } as unknown as FileSystem
}

describe('RepoMapper', () => {
    it('generates map for multiple files', async () => {
        const fs = createMockFs({
            'src/auth.ts': `
export class AuthService {
    async login(user: string, pass: string): Promise<Token> {
        return this.jwt.sign(user)
    }

    logout(): void {
        this.session.destroy()
    }
}

export function createAuthService(): AuthService {
    return new AuthService()
}
`,
            'src/config.ts': `
export interface AppConfig {
    port: number
    host: string
}

export const DEFAULT_PORT = 3000
`,
        })

        const mapper = new RepoMapper()
        const result = await mapper.generateMap(['src/auth.ts', 'src/config.ts'], fs)

        expect(result).toContain('src/auth.ts')
        expect(result).toContain('AuthService')
        expect(result).toContain('login')
        expect(result).toContain('logout')
        expect(result).toContain('createAuthService')
        expect(result).toContain('src/config.ts')
        expect(result).toContain('AppConfig')
        expect(result).toContain('DEFAULT_PORT')
    })

    it('skips unsupported file extensions', async () => {
        const fs = createMockFs({
            'style.css': 'body { color: red; }',
            'app.ts': 'export function main() {}',
        })

        const mapper = new RepoMapper()
        const result = await mapper.generateMap(['style.css', 'app.ts'], fs)

        expect(result).toContain('app.ts')
        expect(result).toContain('main')
        expect(result).not.toContain('style.css')
    })

    it('returns placeholder for empty input', async () => {
        const fs = createMockFs({})
        const mapper = new RepoMapper()
        const result = await mapper.generateMap([], fs)
        expect(result).toBe('(no symbols found)')
    })

    it('handles read errors gracefully', async () => {
        const fs = createMockFs({
            'exists.ts': 'export const A = 1',
        })

        const mapper = new RepoMapper()
        const result = await mapper.generateMap(['exists.ts', 'missing.ts'], fs)

        expect(result).toContain('exists.ts')
        expect(result).not.toContain('missing.ts')
    })
})

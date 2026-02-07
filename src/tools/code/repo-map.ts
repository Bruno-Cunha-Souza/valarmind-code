import path from 'node:path'
import { z } from 'zod'
import { isSupportedExtension } from '../../code-understanding/parser.js'
import { RepoMapper } from '../../code-understanding/repo-map.js'
import type { Tool } from '../types.js'

const RepoMapInput = z.object({
    paths: z.array(z.string()).optional().describe('File or directory paths to map. Defaults to project root.'),
    maxFiles: z.number().optional().describe('Max files to include (default: 50)'),
})

type RepoMapInput = z.infer<typeof RepoMapInput>

const mapper = new RepoMapper()

async function scanDirectory(dir: string, filePaths: string[], maxFiles: number): Promise<void> {
    const glob = new Bun.Glob('**/*.*')
    for await (const file of glob.scan({ cwd: dir, absolute: true })) {
        if (filePaths.length >= maxFiles) break
        if (isSupportedExtension(path.extname(file))) {
            filePaths.push(file)
        }
    }
}

export const repoMapTool: Tool<RepoMapInput, string> = {
    name: 'repo_map',
    description: 'Generate a structural map of code files showing functions, classes, interfaces and their signatures',
    parameters: RepoMapInput,
    requiredPermission: 'read',
    async execute(input, ctx) {
        const maxFiles = input.maxFiles ?? 50
        const basePaths = input.paths ?? ['.']

        const filePaths: string[] = []

        for (const p of basePaths) {
            const resolved = path.isAbsolute(p) ? p : path.join(ctx.cwd, p)

            try {
                const stat = await Bun.file(resolved).exists()
                if (stat) {
                    if (isSupportedExtension(path.extname(resolved))) {
                        filePaths.push(resolved)
                    }
                } else {
                    await scanDirectory(resolved, filePaths, maxFiles)
                }
            } catch {
                try {
                    await scanDirectory(resolved, filePaths, maxFiles)
                } catch {
                    // Skip invalid paths
                }
            }

            if (filePaths.length >= maxFiles) break
        }

        const limited = filePaths.slice(0, maxFiles)
        return mapper.generateMap(limited, ctx.fs)
    },
}

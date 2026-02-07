import { z } from 'zod'
import { execaCommand } from 'execa'
import type { Tool } from '../types.js'

const GrepInput = z.object({
    pattern: z.string().describe('Regex pattern to search for'),
    path: z.string().optional().describe('File or directory to search in (default: cwd)'),
    glob: z.string().optional().describe('Glob filter for files (e.g., "*.ts")'),
    maxResults: z.number().optional().describe('Max results (default: 50)'),
})

type GrepInput = z.infer<typeof GrepInput>

export const grepTool: Tool<GrepInput, string> = {
    name: 'grep',
    description: 'Search for a pattern in file contents using ripgrep',
    parameters: GrepInput,
    requiredPermission: 'read',
    async execute(input, ctx) {
        const args = ['-n', '--no-heading', '--color=never']
        if (input.glob) args.push('--glob', input.glob)
        if (input.maxResults) args.push('-m', String(input.maxResults))
        args.push(input.pattern, input.path ?? ctx.cwd)

        try {
            const { stdout } = await execaCommand(`rg ${args.join(' ')}`, { cwd: ctx.cwd })
            return stdout || 'No matches found'
        } catch {
            return 'No matches found'
        }
    },
}

import { z } from 'zod'
import { execaCommand } from 'execa'
import type { Tool } from '../types.js'

const BashInput = z.object({
    command: z.string().describe('Shell command to execute'),
    cwd: z.string().optional().describe('Working directory (default: project root)'),
    timeout: z.number().optional().describe('Timeout in milliseconds (default: 30000)'),
})

type BashInput = z.infer<typeof BashInput>

export const bashTool: Tool<BashInput, string> = {
    name: 'bash',
    description: 'Execute a shell command and return stdout/stderr',
    parameters: BashInput,
    requiredPermission: 'execute',
    async execute(input, ctx) {
        const { stdout, stderr } = await execaCommand(input.command, {
            cwd: input.cwd ?? ctx.cwd,
            timeout: input.timeout ?? 30000,
            reject: false,
            shell: true,
        })

        const output = [stdout, stderr].filter(Boolean).join('\n')
        return output || '(no output)'
    },
}

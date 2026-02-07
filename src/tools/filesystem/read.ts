import { z } from 'zod'
import type { Tool } from '../types.js'

const ReadInput = z.object({
    path: z.string().describe('Absolute file path to read'),
    maxLines: z.number().optional().describe('Max lines to read (default: all)'),
    offset: z.number().optional().describe('Line offset to start reading from (0-based)'),
})

type ReadInput = z.infer<typeof ReadInput>

export const readFileTool: Tool<ReadInput, string> = {
    name: 'read_file',
    description: 'Read contents of a file at the given path',
    parameters: ReadInput,
    requiredPermission: 'read',
    async execute(input, ctx) {
        let content = await ctx.fs.readText(input.path)

        if (input.offset !== undefined || input.maxLines !== undefined) {
            const lines = content.split('\n')
            const start = input.offset ?? 0
            const end = input.maxLines !== undefined ? start + input.maxLines : lines.length
            content = lines.slice(start, end).join('\n')
        }

        return content
    },
}

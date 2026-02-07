import { execa } from 'execa'
import { z } from 'zod'
import type { Tool } from '../types.js'

const TreeViewInput = z.object({
    path: z.string().optional().describe('Root directory (default: cwd)'),
    depth: z.number().optional().describe('Max depth level (default: 3)'),
    ignorePatterns: z.array(z.string()).optional().describe('Patterns to ignore (e.g., ["node_modules", "dist"])'),
})

type TreeViewInput = z.infer<typeof TreeViewInput>

export const treeViewTool: Tool<TreeViewInput, string> = {
    name: 'tree_view',
    description: 'Display directory tree structure',
    parameters: TreeViewInput,
    requiredPermission: 'read',
    async execute(input, ctx) {
        const dir = input.path ?? ctx.cwd
        const depth = input.depth ?? 3
        const ignores = input.ignorePatterns ?? ['node_modules', '.git', 'dist', 'coverage']

        try {
            const treeArgs = ['-L', String(depth)]
            for (const p of ignores) {
                treeArgs.push('-I', p)
            }
            treeArgs.push(dir)
            const { stdout } = await execa('tree', treeArgs, { cwd: ctx.cwd })
            return stdout
        } catch {
            // Fallback if tree is not installed: use find
            const findArgs = [dir, '-maxdepth', String(depth), '-not', '-path', '*/node_modules/*', '-not', '-path', '*/.git/*']
            const { stdout } = await execa('find', findArgs, { cwd: ctx.cwd })
            const lines = stdout.split('\n').sort()
            return lines.join('\n')
        }
    },
}

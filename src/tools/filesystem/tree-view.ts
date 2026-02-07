import { z } from 'zod';
import { execaCommand } from 'execa';
import type { Tool } from '../types.js';

const TreeViewInput = z.object({
  path: z.string().optional().describe('Root directory (default: cwd)'),
  depth: z.number().optional().describe('Max depth level (default: 3)'),
  ignorePatterns: z
    .array(z.string())
    .optional()
    .describe('Patterns to ignore (e.g., ["node_modules", "dist"])'),
});

type TreeViewInput = z.infer<typeof TreeViewInput>;

export const treeViewTool: Tool<TreeViewInput, string> = {
  name: 'tree_view',
  description: 'Display directory tree structure',
  parameters: TreeViewInput,
  requiredPermission: 'read',
  async execute(input, ctx) {
    const dir = input.path ?? ctx.cwd;
    const depth = input.depth ?? 3;
    const ignores = input.ignorePatterns ?? ['node_modules', '.git', 'dist', 'coverage'];

    const ignoreFlags = ignores.map((p) => `-I "${p}"`).join(' ');

    try {
      const { stdout } = await execaCommand(`tree -L ${depth} ${ignoreFlags} ${dir}`, {
        cwd: ctx.cwd,
      });
      return stdout;
    } catch {
      // Fallback if tree is not installed: use find
      const { stdout } = await execaCommand(
        `find ${dir} -maxdepth ${depth} -not -path '*/node_modules/*' -not -path '*/.git/*' | sort`,
        { cwd: ctx.cwd },
      );
      return stdout;
    }
  },
};

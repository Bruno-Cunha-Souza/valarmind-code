import { z } from 'zod';
import type { Tool } from '../types.js';

const GlobInput = z.object({
  pattern: z.string().describe('Glob pattern (e.g., "**/*.ts", "src/**/*.tsx")'),
  cwd: z.string().optional().describe('Working directory for the glob (default: project root)'),
});

type GlobInput = z.infer<typeof GlobInput>;

export const globTool: Tool<GlobInput, string[]> = {
  name: 'glob',
  description: 'Find files matching a glob pattern',
  parameters: GlobInput,
  requiredPermission: 'read',
  async execute(input, ctx) {
    return ctx.fs.glob(input.pattern, input.cwd ?? ctx.cwd);
  },
};

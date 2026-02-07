import { z } from 'zod';
import { execaCommand } from 'execa';
import type { Tool } from '../types.js';

const GitDiffInput = z.object({
  staged: z.boolean().optional().describe('Show staged changes only (default: false)'),
  file: z.string().optional().describe('Specific file to diff'),
});

type GitDiffInput = z.infer<typeof GitDiffInput>;

export const gitDiffTool: Tool<GitDiffInput, string> = {
  name: 'git_diff',
  description: 'Show git diff of changes',
  parameters: GitDiffInput,
  requiredPermission: 'read',
  async execute(input, ctx) {
    const args = ['git', 'diff'];
    if (input.staged) args.push('--cached');
    if (input.file) args.push('--', input.file);

    const { stdout } = await execaCommand(args.join(' '), {
      cwd: ctx.cwd,
      reject: false,
    });

    return stdout || '(no changes)';
  },
};

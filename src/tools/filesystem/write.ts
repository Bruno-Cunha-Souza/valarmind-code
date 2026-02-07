import { z } from 'zod';
import type { Tool } from '../types.js';

const WriteInput = z.object({
  path: z.string().describe('Absolute file path to write'),
  content: z.string().describe('Content to write to the file'),
});

type WriteInput = z.infer<typeof WriteInput>;

export const writeFileTool: Tool<WriteInput, string> = {
  name: 'write_file',
  description: 'Write content to a file, creating it if needed',
  parameters: WriteInput,
  requiredPermission: 'write',
  async execute(input, ctx) {
    await ctx.fs.writeText(input.path, input.content);
    return `File written: ${input.path}`;
  },
};

import { z } from 'zod';
import type { Tool } from '../types.js';

const EditInput = z.object({
  path: z.string().describe('Absolute file path to edit'),
  oldString: z.string().describe('Exact string to find and replace'),
  newString: z.string().describe('Replacement string'),
  replaceAll: z.boolean().optional().describe('Replace all occurrences (default: false)'),
});

type EditInput = z.infer<typeof EditInput>;

export const editFileTool: Tool<EditInput, string> = {
  name: 'edit_file',
  description: 'Replace exact string in a file. The old_string must be unique unless replace_all is true',
  parameters: EditInput,
  requiredPermission: 'write',
  async execute(input, ctx) {
    const content = await ctx.fs.readText(input.path);

    if (!content.includes(input.oldString)) {
      throw new Error(`String not found in ${input.path}`);
    }

    let newContent: string;
    if (input.replaceAll) {
      newContent = content.replaceAll(input.oldString, input.newString);
    } else {
      const count = content.split(input.oldString).length - 1;
      if (count > 1) {
        throw new Error(
          `String appears ${count} times in ${input.path}. Use replaceAll or provide more context`,
        );
      }
      newContent = content.replace(input.oldString, input.newString);
    }

    await ctx.fs.writeText(input.path, newContent);
    return `File edited: ${input.path}`;
  },
};

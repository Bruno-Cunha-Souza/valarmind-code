import type { ResolvedConfig } from '../config/schema.js'
import type { FileSystem } from '../core/fs.js'
import type { Logger } from '../logger/index.js'
import { editFileTool } from './filesystem/edit.js'
import { globTool } from './filesystem/glob.js'
import { grepTool } from './filesystem/grep.js'
import { readFileTool } from './filesystem/read.js'
import { treeViewTool } from './filesystem/tree-view.js'
import { writeFileTool } from './filesystem/write.js'
import { ToolRegistry } from './registry.js'
import { bashTool } from './shell/bash.js'
import { gitDiffTool } from './shell/git-diff.js'
import { webFetchTool } from './web/web-fetch.js'
import { webSearchTool } from './web/web-search.js'

export function createToolRegistry(_config: ResolvedConfig, _logger: Logger, _fs: FileSystem): ToolRegistry {
    const registry = new ToolRegistry()

    // Register all tools
    registry.register(readFileTool)
    registry.register(writeFileTool)
    registry.register(editFileTool)
    registry.register(globTool)
    registry.register(grepTool)
    registry.register(treeViewTool)
    registry.register(bashTool)
    registry.register(gitDiffTool)
    registry.register(webSearchTool)
    registry.register(webFetchTool)

    // Map tools to agents
    registry.registerForAgent('orchestrator', ['read_file', 'glob'])

    registry.registerForAgent('search', ['read_file', 'glob', 'grep', 'tree_view', 'git_diff'])

    registry.registerForAgent('research', ['read_file', 'glob', 'grep', 'web_search', 'web_fetch'])

    registry.registerForAgent('code', ['read_file', 'write_file', 'edit_file', 'glob', 'grep'])

    registry.registerForAgent('review', ['read_file', 'glob', 'grep', 'git_diff'])

    registry.registerForAgent('test', ['read_file', 'write_file', 'edit_file', 'glob', 'grep', 'bash'])

    registry.registerForAgent('docs', ['read_file', 'write_file', 'edit_file', 'glob', 'web_fetch'])

    registry.registerForAgent('qa', ['read_file', 'glob', 'grep', 'bash', 'git_diff'])

    registry.registerForAgent('init', ['read_file', 'write_file', 'glob', 'grep', 'tree_view'])

    return registry
}

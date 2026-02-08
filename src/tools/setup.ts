import type { ResolvedConfig } from '../config/schema.js'
import type { FileSystem } from '../core/fs.js'
import type { AgentType } from '../core/types.js'
import type { Logger } from '../logger/index.js'
import type { MCPManager } from '../mcp/manager.js'
import { createMCPToolBridge } from '../mcp/tool-bridge.js'
import { repoMapTool } from './code/repo-map.js'
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

const AGENT_TYPES: AgentType[] = ['orchestrator', 'search', 'research', 'code', 'review', 'test', 'docs', 'qa', 'init']

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
    registry.register(webFetchTool)
    registry.register(repoMapTool)

    // Map tools to agents
    registry.registerForAgent('orchestrator', ['read_file', 'glob', 'repo_map'])

    registry.registerForAgent('search', ['read_file', 'glob', 'grep', 'tree_view', 'git_diff', 'repo_map'])

    registry.registerForAgent('research', ['read_file', 'glob', 'grep', 'web_fetch'])

    registry.registerForAgent('code', ['read_file', 'write_file', 'edit_file', 'glob', 'grep', 'repo_map'])

    registry.registerForAgent('review', ['read_file', 'glob', 'grep', 'git_diff', 'repo_map'])

    registry.registerForAgent('test', ['read_file', 'write_file', 'edit_file', 'glob', 'grep', 'bash'])

    registry.registerForAgent('docs', ['read_file', 'write_file', 'edit_file', 'glob', 'web_fetch'])

    registry.registerForAgent('qa', ['read_file', 'glob', 'grep', 'bash', 'git_diff'])

    registry.registerForAgent('init', ['read_file', 'glob', 'grep', 'tree_view'])

    return registry
}

export async function registerMCPTools(registry: ToolRegistry, mcpManager: MCPManager, mcpPermissions: Record<string, string[] | '*'>): Promise<void> {
    for (const agentType of AGENT_TYPES) {
        const tools = mcpManager.getToolsForAgent(agentType, mcpPermissions)
        const bridgedTools = tools.map((t) => createMCPToolBridge(mcpManager, t))

        for (const tool of bridgedTools) {
            if (!registry.get(tool.name)) {
                registry.register(tool)
            }
        }

        const mcpNames = bridgedTools.map((t) => t.name)
        if (mcpNames.length > 0) {
            registry.appendForAgent(agentType as AgentType, mcpNames)
        }
    }
}

import { describe, it, expect } from 'bun:test'
import { createAgentRegistry } from '../../../src/agents/setup.js'
import { AGENT_PERMISSIONS, type AgentType, type ToolPermissions } from '../../../src/core/types.js'

// Maps tools to the permission they require.
// web_fetch is used by docs agent (write perm) and research agent (web perm),
// so it's not strictly a "web-only" tool — we track it separately.
const TOOL_PERMISSION_MAP: Record<string, keyof ToolPermissions> = {
    read_file: 'read',
    glob: 'read',
    grep: 'read',
    tree_view: 'read',
    git_diff: 'read',
    write_file: 'write',
    edit_file: 'write',
    bash: 'execute',
    web_search: 'web',
    // web_fetch excluded: used by both web-enabled (research) and non-web (docs) agents
}

const WRITE_TOOLS = ['write_file', 'edit_file']
const EXECUTE_TOOLS = ['bash']
const WEB_TOOLS = ['web_search']

describe('Agent Tool Permissions', () => {
    const registry = createAgentRegistry()
    const agents = registry.getAll()

    it('all 8 agents are registered', () => {
        expect(agents.length).toBe(8)
    })

    for (const agent of agents) {
        describe(`${agent.type}`, () => {
            it('permissions match AGENT_PERMISSIONS table', () => {
                expect(agent.permissions).toEqual(AGENT_PERMISSIONS[agent.type])
            })

            it('allowed tools are consistent with permissions', () => {
                for (const tool of agent.allowedTools) {
                    const requiredPerm = TOOL_PERMISSION_MAP[tool]
                    if (!requiredPerm) continue // unknown tool, skip

                    const hasPerm = requiredPerm === 'web'
                        ? agent.permissions.web === true
                        : agent.permissions[requiredPerm]

                    expect(hasPerm).toBe(true)
                }
            })

            if (!AGENT_PERMISSIONS[agent.type].write) {
                it('read-only agent has no write tools', () => {
                    for (const tool of WRITE_TOOLS) {
                        expect(agent.allowedTools).not.toContain(tool)
                    }
                })
            }

            if (!AGENT_PERMISSIONS[agent.type].execute) {
                it('no-execute agent has no bash', () => {
                    for (const tool of EXECUTE_TOOLS) {
                        expect(agent.allowedTools).not.toContain(tool)
                    }
                })
            }

            if (!AGENT_PERMISSIONS[agent.type].web) {
                it('no-web agent has no web tools', () => {
                    for (const tool of WEB_TOOLS) {
                        expect(agent.allowedTools).not.toContain(tool)
                    }
                })
            }
        })
    }

    describe('specific agent constraints', () => {
        it('search agent is read-only', () => {
            const search = registry.get('search')!
            expect(search.permissions.write).toBe(false)
            expect(search.permissions.execute).toBe(false)
            expect(search.allowedTools).not.toContain('write_file')
            expect(search.allowedTools).not.toContain('edit_file')
            expect(search.allowedTools).not.toContain('bash')
        })

        it('review agent is read-only', () => {
            const review = registry.get('review')!
            expect(review.permissions.write).toBe(false)
            expect(review.permissions.execute).toBe(false)
        })

        it('research agent has web access but no write/execute', () => {
            const research = registry.get('research')!
            expect(research.permissions.web).toBe(true)
            expect(research.permissions.write).toBe(false)
            expect(research.permissions.execute).toBe(false)
        })

        it('code agent can write but not execute', () => {
            const code = registry.get('code')!
            expect(code.permissions.write).toBe(true)
            expect(code.permissions.execute).toBe(false)
            expect(code.allowedTools).not.toContain('bash')
        })

        it('test agent can write and execute', () => {
            const test = registry.get('test')!
            expect(test.permissions.write).toBe(true)
            expect(test.permissions.execute).toBe(true)
            expect(test.allowedTools).toContain('bash')
        })

        it('qa agent can execute but not write', () => {
            const qa = registry.get('qa')!
            expect(qa.permissions.write).toBe(false)
            expect(qa.permissions.execute).toBe(true)
            expect(qa.allowedTools).toContain('bash')
            expect(qa.allowedTools).not.toContain('write_file')
        })

        it('docs agent can write but not execute', () => {
            const docs = registry.get('docs')!
            expect(docs.permissions.write).toBe(true)
            expect(docs.permissions.execute).toBe(false)
            expect(docs.allowedTools).not.toContain('bash')
        })

        it('research agent has :online model suffix', () => {
            const research = registry.get('research')!
            expect(research.modelSuffix).toBe(':online')
        })

        it('non-research agents have no model suffix', () => {
            for (const type of ['search', 'code', 'test', 'review', 'qa', 'docs', 'init'] as const) {
                const agent = registry.get(type)!
                expect(agent.modelSuffix).toBeUndefined()
            }
        })
    })
})

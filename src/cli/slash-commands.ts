import * as clack from '@clack/prompts'
import { execaCommand } from 'execa'
import type { Plan } from '../agents/orchestrator/planner.js'
import { maskApiKey, saveCredentials } from '../auth/credentials.js'
import { AVAILABLE_MODELS, getModelLabel, MODEL_ALIASES } from '../config/defaults.js'
import { saveGlobalConfig } from '../config/persistence.js'
import type { Container } from '../core/container.js'
import { askApiKey, askModel } from './prompts.js'
import { colors } from './ui.js'

interface SlashCommand {
    name: string
    description: string
    handler: (container: Container, args: string) => Promise<string>
}

const commands: SlashCommand[] = [
    {
        name: '/help',
        description: 'Show help',
        handler: async () => {
            const lines = commands.map((c) => `  ${colors.bold(c.name.padEnd(12))} ${c.description}`)
            return `Available commands:\n${lines.join('\n')}`
        },
    },
    {
        name: '/status',
        description: 'Show current state',
        handler: async (container) => {
            const state = await container.stateManager.load()
            const parts: string[] = []
            parts.push(`Model: ${getModelLabel(container.config.model)}`)
            if (state.goal) parts.push(`Goal: ${state.goal}`)
            if (state.now) parts.push(`Now: ${state.now}`)
            parts.push(`Open tasks: ${state.tasks_open.filter((t) => t.status !== 'done').length}`)
            parts.push('')
            parts.push(container.metricsCollector.formatStatus())
            return parts.join('\n')
        },
    },
    {
        name: '/agents',
        description: 'List available agents',
        handler: async (container) => {
            const agents = container.agentRegistry.getAll()
            const lines = agents.map((a) => `  ${colors.agent(a.type)} — tools: ${a.allowedTools.join(', ')}`)
            return `Agents:\n${lines.join('\n')}`
        },
    },
    {
        name: '/clear',
        description: 'Clear conversation history',
        handler: async (container) => {
            container.orchestrator.clearHistory()
            return 'History cleared.'
        },
    },
    {
        name: '/init',
        description: 'Generate VALARMIND.md',
        handler: async (container) => {
            const plan: Plan = {
                plan: 'Analyze project with parallel search agents and generate VALARMIND.md',
                // 4 search tasks run in parallel (no inter-dependencies), then init task depends on all 4
                tasks: [
                    {
                        agent: 'search',
                        description: `Analyze project structure, metadata, and existing documentation:
1. Use tree_view to get directory structure (depth 3)
2. Read package.json — extract fields: name, version, description, scripts (every script)
3. Read README.md for project description and objective
4. Read tsconfig.json or equivalent compiler config
5. Glob for config files: biome.json, .eslintrc*, .prettierrc*, jest.config*, vitest.config* — read each found file
6. Glob for docs/*.md — list all documentation files and read key ones (architecture, general)
7. Read CLAUDE.md, AGENTS.md, or .cursorrules if they exist (existing AI context)
8. Read .env.example or .env.template if they exist (environment variables)
9. Read src/cli/slash-commands.ts — extract ALL slash command names and descriptions from the SlashCommand[] array (commands like /help, /status, /agents, /clear, /init, /compact, /plan, /approve, /reject, /tasks, /undo, /diff, /commit, /model, /settings, /exit)

Return a structured summary with: project description, tech stack, available scripts/commands, ALL slash commands with descriptions, directory tree, documentation index, environment variables, existing AI context highlights.`,
                        excludeFromSummary: true,
                    },
                    {
                        agent: 'search',
                        description: `Analyze code architecture, design patterns, and workflows:
1. Glob src/**/*.ts to map file structure
2. Grep for exported classes, interfaces, and key functions
3. Read entry points (src/index.ts, src/main.ts, src/app.ts, or similar)
4. Read src/core/container.ts — extract ALL properties from Container interface (lines 26-49): config, logger, eventBus, tracer, traceExporter, fs, llmClient, toolRegistry, toolExecutor, agentRegistry, agentRunner, stateManager, contextLoader, hookRunner, permissionManager, orchestrator, metricsCollector, mcpManager, pluginManager, sandboxManager. Note each property's type and source file.
5. Grep for 'type HookName' in src/hooks/ — extract the EXACT hook names from the union type (expected: UserPromptSubmit, PreToolUse, PostToolUse, PermissionRequest, PreCompact, SessionEnd)
6. Grep for 'extends BaseAgent' in src/agents/ — for EACH agent file found, read it and extract: class name, allowedTools array, timeout values
7. Read src/agents/runner.ts — understand agent execution flow (how agents are spawned, how tools are provided, prompt construction)
8. Read src/llm/prompt-builder.ts — understand prompt construction (sections, priorities, token budget)
9. Read src/agents/orchestrator/orchestrator.ts — understand orchestration flow (planning, task dispatch, inter-agent communication)
10. Grep for inter-module communication: EventBus, EventEmitter, message, dispatch, subscribe

Return a structured summary with: ALL Container properties with their source paths, ALL hook names from HookName type, ALL agents with their allowedTools arrays, architectural pattern, main execution flow, prompt construction details, orchestration flow.`,
                        excludeFromSummary: true,
                    },
                    {
                        agent: 'search',
                        description: `Analyze dependencies, auth flow, practices, security, integrations, and conventions:
1. Read package.json dependencies and devDependencies — extract EXACT version strings (e.g. "^1.2.3"), not just package names
2. Authentication flow — read these SPECIFIC files in order:
   a. src/auth/credentials.ts — extract functions: loadCredentials, saveCredentials, removeCredentials, maskApiKey
   b. src/config/defaults.ts — extract CREDENTIALS_FILE path (~/.config/valarmind/credentials.json), CONFIG_DIR, DEFAULT_CONFIG
   c. Grep for 'apiKey' in src/config/schema.ts — find where API key is resolved
   d. Document the EXACT priority order: 1. --key CLI flag, 2. VALARMIND_API_KEY env var, 3. ~/.config/valarmind/credentials.json
3. Read biome.json — extract ALL formatting rules: indentStyle, indentWidth, lineWidth, semicolons, quoteStyle, trailingComma
4. Grep for test patterns (describe, it, test, expect) to identify test framework and coverage requirements
5. Glob for CI/CD configs (.github/workflows/*, Dockerfile, docker-compose*)
6. Glob for .env.example or environment documentation
7. Grep for external API calls, SDK usage (fetch, axios, http, client, webhook)
8. Read src/mcp/manager.ts — understand MCP server management
9. Analyze naming conventions: are files kebab-case? Classes PascalCase? Check import style (relative vs absolute)

Return a structured summary with: ALL dependencies with EXACT versions, auth flow with EXACT priority order and file paths, formatting rules from biome.json, testing framework and practices, security-sensitive areas with specific files, MCP setup details, naming conventions.`,
                        excludeFromSummary: true,
                    },
                    {
                        agent: 'search',
                        description: `Analyze core code for snippets, patterns, and troubleshooting:
1. Read these SPECIFIC core files and extract 2-3 code snippets (10-20 lines each) that show the project's key patterns:
   a. src/core/container.ts — how dependencies are wired (createContainer function)
   b. src/agents/runner.ts — how agents execute (the main run loop)
   c. src/llm/prompt-builder.ts — how prompts are built (section priorities, token budget)
   d. src/agents/orchestrator/orchestrator.ts — how tasks are dispatched to agents
2. For each snippet, include the EXACT file path and line numbers as a comment: /* src/path/file.ts:10-30 */
3. Grep for 'TODO|FIXME|HACK|WARN' in src/ — extract the line + surrounding context for each match
4. Grep for common error messages: 'API key', 'not found', 'failed to', 'invalid', 'timeout', 'permission denied'
5. Look for troubleshooting patterns: diagnostic commands (/status, /agents), debug flags (logLevel), health checks

Return a structured summary with: 2-3 snippets with /* src/path:lines */ format, list of TODO/FIXME/HACK items with file paths, common error messages with probable causes and solutions, diagnostic mechanisms available.`,
                        excludeFromSummary: true,
                    },
                    {
                        agent: 'init',
                        description: `Generate a comprehensive VALARMIND.md using the pre-gathered search results from context.
The search agents have already analyzed the project in depth. Use their findings (provided in TOON format in the context) to write a rich, project-specific VALARMIND.md.

Focus on ACTIONABLE, NON-OBVIOUS information. Do not repeat what is obvious from package.json or file names.
Include deeper details: workflows, auth flows, agent architecture, memory/state, conventions, environment variables, troubleshooting, and key code snippets.
If the project has existing AI context (CLAUDE.md, AGENTS.md), reference it and incorporate its best insights.

MANDATORY RULES:
- Extract EXACT versions from search results for ALL tables (Stack, Dependencies). NEVER use '-' as version.
- NEVER infer file paths — only use paths explicitly found in search data. NEVER add '(inferred)'.
- Use TABLE format for: Agent Architecture, Hooks, Endpoints (slash commands), Stack, Dependencies, Commands.
- NEVER use speculative language: "likely", "probably", "possibly", "potentially", "appears to".
- Include Snippets section with /* src/file.ts:lines */ comments from search task 3 results.
- Include Troubleshooting section with Error | Cause | Solution table from search task 3 results.
- Auth Flow must include the exact priority order: 1. --key flag, 2. VALARMIND_API_KEY env, 3. credentials.json.

IMPORTANT: Return the complete VALARMIND.md content directly as your text response. Start with "# VALARMIND.md" on the first line. Do NOT wrap in code fences. Do NOT add preamble or postamble — ONLY the raw markdown. The caller handles saving the file.

Only use your own tools (glob, grep, read_file) if the search results are missing critical information.`,
                        dependsOn: [0, 1, 2, 3],
                        toonCompact: true,
                    },
                ],
            }
            await container.orchestrator.executePrebuiltPlan(plan)

            // Extract init agent's raw output and write to file
            const valarmindPath = `${container.config.projectDir}/VALARMIND.md`
            const taskResults = container.orchestrator.getLastTaskResults()
            const initResult = taskResults.find((t) => t.agent === 'init')
            const content = typeof initResult?.result === 'string' ? initResult.result : null

            if (content && content.includes('# ')) {
                await container.fs.writeText(valarmindPath, content)
                container.contextLoader.invalidate()
                const lineCount = content.split('\n').length
                return `VALARMIND.md generated (${lineCount} lines). Saved to ${valarmindPath}`
            }

            // Fallback: check if file was somehow written by the agent via tools
            if (await container.fs.exists(valarmindPath)) {
                return `VALARMIND.md generated. Saved to ${valarmindPath}`
            }

            return '⚠ VALARMIND.md was not generated. The init agent returned no content. Try running /init again.'
        },
    },
    {
        name: '/compact',
        description: 'Compact state to TOON',
        handler: async (container) => {
            await container.hookRunner.run('PreCompact')
            const { compactState } = await import('../memory/compactor.js')
            const state = await container.stateManager.load()
            const compact = await compactState(state)
            return `State compacted (${compact.length} chars):\n${compact}`
        },
    },
    {
        name: '/plan',
        description: 'Create a plan without executing',
        handler: async (container, args) => {
            if (!args.trim()) return 'Usage: /plan <task description>'
            const plan = await container.orchestrator.createPlan(args)
            if (!plan) return 'Could not create a plan for this request.'

            const lines: string[] = []
            lines.push(`${colors.bold('Plan:')} ${plan.plan}`)
            lines.push('')
            for (let i = 0; i < plan.tasks.length; i++) {
                const t = plan.tasks[i]!
                const deps = t.dependsOn?.length ? ` ${colors.dim(`(depends on: ${t.dependsOn.join(', ')})`)}` : ''
                lines.push(`  ${i}. ${colors.agent(t.agent)} ${t.description}${deps}`)
            }
            lines.push('')
            lines.push(colors.dim('Use /approve to execute, /reject to cancel'))
            return lines.join('\n')
        },
    },
    {
        name: '/approve',
        description: 'Approve and execute pending plan',
        handler: async (container) => {
            const result = await container.orchestrator.executePendingPlan()
            if (result === null) return 'No pending plan to approve.'
            return result
        },
    },
    {
        name: '/reject',
        description: 'Reject pending plan',
        handler: async (container) => {
            const rejected = container.orchestrator.rejectPendingPlan()
            if (!rejected) return 'No pending plan to reject.'
            return 'Plan rejected.'
        },
    },
    {
        name: '/tasks',
        description: 'List pending plan tasks',
        handler: async (container) => {
            const plan = container.orchestrator.getPendingPlan()
            if (!plan) return 'No pending plan.'

            const lines: string[] = []
            lines.push(`${colors.bold('Plan:')} ${plan.plan}`)
            for (let i = 0; i < plan.tasks.length; i++) {
                const t = plan.tasks[i]!
                const deps = t.dependsOn?.length ? ` ${colors.dim(`(depends on: ${t.dependsOn.join(', ')})`)}` : ''
                lines.push(`  ${i}. ${colors.agent(t.agent)} ${t.description}${deps}`)
            }
            return lines.join('\n')
        },
    },
    {
        name: '/undo',
        description: 'Undo changes (git checkout .)',
        handler: async (container) => {
            try {
                const { stdout: diff } = await execaCommand('git diff --stat', {
                    cwd: container.config.projectDir,
                    reject: false,
                })
                if (!diff.trim()) return 'No changes to undo.'
                const { stdout } = await execaCommand('git checkout .', {
                    cwd: container.config.projectDir,
                })
                return `Changes undone:\n${diff}\n${stdout}`
            } catch (error) {
                return `Error undoing changes: ${(error as Error).message}`
            }
        },
    },
    {
        name: '/diff',
        description: 'Show diff (git diff)',
        handler: async (container) => {
            try {
                const { stdout } = await execaCommand('git diff', {
                    cwd: container.config.projectDir,
                    reject: false,
                })
                return stdout || 'No changes.'
            } catch (error) {
                return `Error: ${(error as Error).message}`
            }
        },
    },
    {
        name: '/commit',
        description: 'Commit changes (git commit)',
        handler: async (container, args) => {
            const message = args.trim()
            if (!message) return 'Usage: /commit <message>'
            try {
                const { stdout } = await execaCommand(`git add -A && git commit -m "${message.replace(/"/g, '\\"')}"`, {
                    cwd: container.config.projectDir,
                    shell: true,
                })
                return stdout
            } catch (error) {
                return `Error committing: ${(error as Error).message}`
            }
        },
    },
    {
        name: '/model',
        description: 'Switch model',
        handler: async (container, args) => {
            const arg = args.trim()

            // /model list — text list
            if (arg === 'list') {
                const lines = AVAILABLE_MODELS.map((m) => {
                    const current = m.id === container.config.model ? ' \u2713' : ''
                    return `  ${m.label}${current}  ${colors.dim(m.id)}  ${colors.dim(m.description)}`
                })
                return lines.join('\n')
            }

            let selectedModel: string | null = null

            if (arg) {
                // /model <alias> or /model <full-id>
                const resolved = MODEL_ALIASES[arg.toLowerCase()] ?? arg
                const valid = AVAILABLE_MODELS.find((m) => m.id === resolved)
                if (!valid) {
                    const aliases = Object.keys(MODEL_ALIASES).join(', ')
                    return `Unknown model "${arg}". Available aliases: ${aliases}\nOr use a full model ID.`
                }
                selectedModel = resolved
            } else {
                // /model — interactive select
                selectedModel = await askModel(container.config.model)
                if (!selectedModel) return 'Cancelled.'
            }

            // Persist + mutate
            await saveGlobalConfig(container.fs, { model: selectedModel })
            container.config.model = selectedModel

            return `Model switched to ${getModelLabel(selectedModel)} (${selectedModel})`
        },
    },
    {
        name: '/settings',
        description: 'Edit settings',
        handler: async (container, args) => {
            const settingsDef = buildSettingsDef(container)
            const arg = args.trim().toLowerCase()

            if (arg) {
                // Direct jump: /settings model, /settings key, /settings temp, etc.
                const entry = settingsDef.find((s) => s.key === arg || s.aliases?.includes(arg))
                if (!entry) {
                    const keys = settingsDef.map((s) => s.key).join(', ')
                    return `Unknown setting "${arg}". Available: ${keys}`
                }
                return editSetting(entry, container)
            }

            // Interactive: show all settings
            const result = await clack.select({
                message: 'Configure ValarMind preferences',
                options: settingsDef.map((s) => ({
                    value: s.key,
                    label: s.label,
                    hint: s.display(),
                })),
            })

            if (clack.isCancel(result)) return 'Cancelled.'

            const selected = result as string
            const entry = settingsDef.find((s) => s.key === selected)!
            return editSetting(entry, container)
        },
    },
    {
        name: '/exit',
        description: 'Exit REPL',
        handler: async () => {
            process.exit(0)
        },
    },
]

interface SettingDef {
    key: string
    label: string
    aliases?: string[]
    display: () => string
    edit: () => Promise<string | null>
}

function buildSettingsDef(container: Container): SettingDef[] {
    const cfg = container.config
    return [
        {
            key: 'model',
            label: 'Model',
            display: () => getModelLabel(cfg.model),
            edit: async () => {
                const selected = await askModel(cfg.model)
                if (!selected) return null
                await saveGlobalConfig(container.fs, { model: selected })
                cfg.model = selected
                return `Model set to ${getModelLabel(selected)} (${selected})`
            },
        },
        {
            key: 'key',
            label: 'API Key',
            aliases: ['apikey', 'api-key'],
            display: () => (cfg.apiKey ? maskApiKey(cfg.apiKey) : 'not set'),
            edit: async () => {
                const key = await askApiKey()
                if (!key) return null
                await saveCredentials(container.fs, key)
                cfg.apiKey = key
                return `API key updated (${maskApiKey(key)})`
            },
        },
        {
            key: 'temperature',
            label: 'Temperature',
            aliases: ['temp'],
            display: () => String(cfg.temperature),
            edit: async () => {
                const result = await clack.text({
                    message: 'Temperature (0-2)',
                    defaultValue: String(cfg.temperature),
                    validate(value) {
                        const n = Number(value)
                        if (Number.isNaN(n) || n < 0 || n > 2) return 'Must be a number between 0 and 2'
                    },
                })
                if (clack.isCancel(result)) return null
                const val = Number(result)
                await saveGlobalConfig(container.fs, { temperature: val })
                cfg.temperature = val
                return `Temperature set to ${val}`
            },
        },
        {
            key: 'maxtokens',
            label: 'Max Tokens',
            aliases: ['tokens', 'max-tokens'],
            display: () => String(cfg.maxTokens),
            edit: async () => {
                const result = await clack.text({
                    message: 'Max tokens (positive integer)',
                    defaultValue: String(cfg.maxTokens),
                    validate(value) {
                        const n = Number(value)
                        if (!Number.isInteger(n) || n <= 0) return 'Must be a positive integer'
                    },
                })
                if (clack.isCancel(result)) return null
                const val = Number(result)
                await saveGlobalConfig(container.fs, { maxTokens: val })
                cfg.maxTokens = val
                return `Max tokens set to ${val}`
            },
        },
        {
            key: 'loglevel',
            label: 'Log Level',
            aliases: ['log', 'log-level'],
            display: () => cfg.logLevel,
            edit: async () => {
                const levels = ['silent', 'error', 'warn', 'info', 'debug'] as const
                const result = await clack.select({
                    message: 'Log level',
                    options: levels.map((l) => ({
                        value: l,
                        label: l === cfg.logLevel ? `${l} \u2713` : l,
                    })),
                })
                if (clack.isCancel(result)) return null
                const val = result as typeof cfg.logLevel
                await saveGlobalConfig(container.fs, { logLevel: val })
                cfg.logLevel = val
                return `Log level set to ${val}`
            },
        },
        {
            key: 'permission',
            label: 'Permission Mode',
            aliases: ['permissions', 'permission-mode'],
            display: () => cfg.permissionMode,
            edit: async () => {
                const modes = ['auto', 'suggest', 'ask'] as const
                const result = await clack.select({
                    message: 'Permission mode',
                    options: modes.map((m) => ({
                        value: m,
                        label: m === cfg.permissionMode ? `${m} \u2713` : m,
                    })),
                })
                if (clack.isCancel(result)) return null
                const val = result as typeof cfg.permissionMode
                await saveGlobalConfig(container.fs, { permissionMode: val })
                cfg.permissionMode = val
                return `Permission mode set to ${val}`
            },
        },
        {
            key: 'planmode',
            label: 'Plan Mode',
            aliases: ['plan', 'plan-mode'],
            display: () => String(cfg.planMode),
            edit: async () => {
                const result = await clack.confirm({
                    message: 'Enable plan mode?',
                    initialValue: cfg.planMode,
                })
                if (clack.isCancel(result)) return null
                await saveGlobalConfig(container.fs, { planMode: result })
                cfg.planMode = result
                return `Plan mode ${result ? 'enabled' : 'disabled'}`
            },
        },
    ]
}

async function editSetting(entry: SettingDef, _container: Container): Promise<string> {
    const result = await entry.edit()
    return result ?? 'Cancelled.'
}

export function getSlashCommands(): SlashCommand[] {
    return commands
}

export async function handleSlashCommand(input: string, container: Container): Promise<string | null> {
    const [cmdName, ...rest] = input.trim().split(' ')
    const args = rest.join(' ')

    const cmd = commands.find((c) => c.name === cmdName)
    if (!cmd) return null

    return cmd.handler(container, args)
}

import * as clack from '@clack/prompts'
import { execaCommand } from 'execa'
import { saveCredentials } from '../auth/credentials.js'
import { maskApiKey } from '../auth/credentials.js'
import { AVAILABLE_MODELS, MODEL_ALIASES, getModelLabel } from '../config/defaults.js'
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
        description: 'Mostra ajuda',
        handler: async () => {
            const lines = commands.map((c) => `  ${colors.bold(c.name.padEnd(12))} ${c.description}`)
            return `Comandos disponíveis:\n${lines.join('\n')}`
        },
    },
    {
        name: '/status',
        description: 'Mostra estado atual',
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
        description: 'Lista agentes disponíveis',
        handler: async (container) => {
            const agents = container.agentRegistry.getAll()
            const lines = agents.map((a) => `  ${colors.agent(a.type)} — tools: ${a.allowedTools.join(', ')}`)
            return `Agentes:\n${lines.join('\n')}`
        },
    },
    {
        name: '/clear',
        description: 'Limpa histórico da conversa',
        handler: async (container) => {
            container.orchestrator.clearHistory()
            return 'Histórico limpo.'
        },
    },
    {
        name: '/init',
        description: 'Gera VALARMIND.md',
        handler: async (container) => {
            return container.orchestrator.process('Analyze this project and generate a VALARMIND.md file following the Init Agent guidelines.')
        },
    },
    {
        name: '/compact',
        description: 'Compacta state para TOON',
        handler: async (container) => {
            await container.hookRunner.run('PreCompact')
            const { compactState } = await import('../memory/compactor.js')
            const state = await container.stateManager.load()
            const compact = await compactState(state)
            return `State compactado (${compact.length} chars):\n${compact}`
        },
    },
    {
        name: '/plan',
        description: 'Cria um plano sem executar',
        handler: async (container, args) => {
            if (!args.trim()) return 'Uso: /plan <descrição da tarefa>'
            const plan = await container.orchestrator.createPlan(args)
            if (!plan) return 'Não foi possível criar um plano para esta solicitação.'

            const lines: string[] = []
            lines.push(`${colors.bold('Plano:')} ${plan.plan}`)
            lines.push('')
            for (let i = 0; i < plan.tasks.length; i++) {
                const t = plan.tasks[i]!
                const deps = t.dependsOn?.length ? ` ${colors.dim(`(depende de: ${t.dependsOn.join(', ')})`)}` : ''
                lines.push(`  ${i}. ${colors.agent(t.agent)} ${t.description}${deps}`)
            }
            lines.push('')
            lines.push(colors.dim('Use /approve para executar, /reject para cancelar'))
            return lines.join('\n')
        },
    },
    {
        name: '/approve',
        description: 'Aprova e executa o plano pendente',
        handler: async (container) => {
            const result = await container.orchestrator.executePendingPlan()
            if (result === null) return 'Nenhum plano pendente para aprovar.'
            return result
        },
    },
    {
        name: '/reject',
        description: 'Rejeita o plano pendente',
        handler: async (container) => {
            const rejected = container.orchestrator.rejectPendingPlan()
            if (!rejected) return 'Nenhum plano pendente para rejeitar.'
            return 'Plano rejeitado.'
        },
    },
    {
        name: '/tasks',
        description: 'Lista tasks do plano pendente',
        handler: async (container) => {
            const plan = container.orchestrator.getPendingPlan()
            if (!plan) return 'Nenhum plano pendente.'

            const lines: string[] = []
            lines.push(`${colors.bold('Plano:')} ${plan.plan}`)
            for (let i = 0; i < plan.tasks.length; i++) {
                const t = plan.tasks[i]!
                const deps = t.dependsOn?.length ? ` ${colors.dim(`(depende de: ${t.dependsOn.join(', ')})`)}` : ''
                lines.push(`  ${i}. ${colors.agent(t.agent)} ${t.description}${deps}`)
            }
            return lines.join('\n')
        },
    },
    {
        name: '/undo',
        description: 'Desfaz alterações (git checkout .)',
        handler: async (container) => {
            try {
                const { stdout: diff } = await execaCommand('git diff --stat', {
                    cwd: container.config.projectDir,
                    reject: false,
                })
                if (!diff.trim()) return 'Nenhuma alteração para desfazer.'
                const { stdout } = await execaCommand('git checkout .', {
                    cwd: container.config.projectDir,
                })
                return `Alterações desfeitas:\n${diff}\n${stdout}`
            } catch (error) {
                return `Erro ao desfazer: ${(error as Error).message}`
            }
        },
    },
    {
        name: '/diff',
        description: 'Mostra diff (git diff)',
        handler: async (container) => {
            try {
                const { stdout } = await execaCommand('git diff', {
                    cwd: container.config.projectDir,
                    reject: false,
                })
                return stdout || 'Nenhuma alteração.'
            } catch (error) {
                return `Erro: ${(error as Error).message}`
            }
        },
    },
    {
        name: '/commit',
        description: 'Commita alterações (git commit)',
        handler: async (container, args) => {
            const message = args.trim()
            if (!message) return 'Uso: /commit <mensagem>'
            try {
                const { stdout } = await execaCommand(`git add -A && git commit -m "${message.replace(/"/g, '\\"')}"`, {
                    cwd: container.config.projectDir,
                    shell: true,
                })
                return stdout
            } catch (error) {
                return `Erro ao commitar: ${(error as Error).message}`
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
        description: 'Sai do REPL',
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

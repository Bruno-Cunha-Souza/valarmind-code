import { execaCommand } from 'execa'
import type { Container } from '../core/container.js'
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
            parts.push(`Model: ${container.config.model}`)
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
        name: '/exit',
        description: 'Sai do REPL',
        handler: async () => {
            process.exit(0)
        },
    },
]

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

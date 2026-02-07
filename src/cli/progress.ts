import type { AgentType } from '../core/types.js'
import type { TypedEventEmitter } from '../core/events.js'

const AGENT_LABELS: Record<AgentType, string> = {
    orchestrator: 'Orquestrando...',
    search: 'Buscando no código...',
    research: 'Pesquisando na web...',
    code: 'Escrevendo código...',
    review: 'Revisando alterações...',
    test: 'Executando testes...',
    docs: 'Gerando documentação...',
    qa: 'Verificando qualidade...',
    init: 'Analisando projeto...',
}

const TOOL_LABELS: Record<string, string> = {
    glob: 'Buscando arquivos...',
    grep: 'Pesquisando padrões...',
    read_file: 'Lendo arquivos...',
    edit_file: 'Editando código...',
    write_file: 'Escrevendo arquivo...',
    bash: 'Executando comando...',
    web_search: 'Pesquisando na web...',
    web_fetch: 'Carregando página...',
    tree_view: 'Mapeando estrutura...',
    git_diff: 'Analisando diferenças...',
    repo_map: 'Mapeando repositório...',
}

interface Spinner {
    message(msg: string): void
}

export interface ProgressTracker {
    dispose(): void
}

export function createProgressTracker(
    eventBus: TypedEventEmitter,
    spinner: Spinner
): ProgressTracker {
    let currentAgent: AgentType | null = null

    const onAgentStart = (data: { agentType: AgentType; taskId: string }) => {
        if (data.agentType === 'orchestrator') return
        currentAgent = data.agentType
        spinner.message(AGENT_LABELS[data.agentType] ?? `${data.agentType}...`)
    }

    const onAgentComplete = (data: { agentType: AgentType; taskId: string; duration: number }) => {
        if (data.agentType === 'orchestrator') return
        const secs = (data.duration / 1000).toFixed(1)
        spinner.message(`${AGENT_LABELS[data.agentType]?.replace('...', '')} concluído (${secs}s)`)
        currentAgent = null
    }

    const onToolBefore = (data: { toolName: string; agentType: AgentType; args: unknown }) => {
        const label = TOOL_LABELS[data.toolName]
        if (label) {
            spinner.message(label)
        }
    }

    const onToolAfter = (_data: { toolName: string; agentType: AgentType; duration: number; success: boolean }) => {
        if (currentAgent) {
            spinner.message(AGENT_LABELS[currentAgent] ?? `${currentAgent}...`)
        }
    }

    eventBus.on('agent:start', onAgentStart)
    eventBus.on('agent:complete', onAgentComplete)
    eventBus.on('tool:before', onToolBefore)
    eventBus.on('tool:after', onToolAfter)

    return {
        dispose() {
            eventBus.off('agent:start', onAgentStart)
            eventBus.off('agent:complete', onAgentComplete)
            eventBus.off('tool:before', onToolBefore)
            eventBus.off('tool:after', onToolAfter)
            currentAgent = null
        },
    }
}

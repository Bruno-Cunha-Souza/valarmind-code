import type { AgentType } from '../core/types.js'
import type { TypedEventEmitter } from '../core/events.js'

const AGENT_LABELS: Record<AgentType, string> = {
    orchestrator: 'Orchestrating...',
    search: 'Searching code...',
    research: 'Searching the web...',
    code: 'Writing code...',
    review: 'Reviewing changes...',
    test: 'Running tests...',
    docs: 'Generating docs...',
    qa: 'Checking quality...',
    init: 'Analyzing project...',
}

const TOOL_LABELS: Record<string, string> = {
    glob: 'Searching files...',
    grep: 'Searching patterns...',
    read_file: 'Reading files...',
    edit_file: 'Editing code...',
    write_file: 'Writing file...',
    bash: 'Running command...',
    web_search: 'Searching the web...',
    web_fetch: 'Loading page...',
    tree_view: 'Mapping structure...',
    git_diff: 'Analyzing diff...',
    repo_map: 'Mapping repository...',
}

interface Spinner {
    message(msg: string): void
}

export interface ProgressTracker {
    dispose(): void
    notifySpinnerStopped(): void
}

export function createProgressTracker(
    eventBus: TypedEventEmitter,
    spinner: Spinner,
    restartSpinner?: () => void
): ProgressTracker {
    let currentAgent: AgentType | null = null
    let spinnerActive = true

    const onAgentStart = (data: { agentType: AgentType; taskId: string }) => {
        if (data.agentType === 'orchestrator') return
        currentAgent = data.agentType
        if (!spinnerActive && restartSpinner) {
            restartSpinner()
            spinnerActive = true
        }
        spinner.message(AGENT_LABELS[data.agentType] ?? `${data.agentType}...`)
    }

    const onAgentComplete = (data: { agentType: AgentType; taskId: string; duration: number }) => {
        if (data.agentType === 'orchestrator') return
        const secs = (data.duration / 1000).toFixed(1)
        spinner.message(`${AGENT_LABELS[data.agentType]?.replace('...', '')} done (${secs}s)`)
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
            spinnerActive = false
        },
        notifySpinnerStopped() {
            spinnerActive = false
        },
    }
}

import type { AgentType } from '../core/types.js'

export interface ModelRouterConfig {
    default: string
    agentModels?: Partial<Record<AgentType, string>>
    costTier?: {
        light: string
        standard: string
        heavy: string
    }
}

const AGENT_COST_TIER: Record<Exclude<AgentType, 'orchestrator'>, 'light' | 'standard' | 'heavy'> = {
    search: 'light',
    research: 'light',
    review: 'standard',
    code: 'standard',
    test: 'standard',
    docs: 'standard',
    qa: 'light',
    init: 'standard',
}

export class ModelRouter {
    constructor(private config: ModelRouterConfig) {}

    resolve(agentType?: AgentType): string {
        if (agentType && this.config.agentModels?.[agentType]) {
            return this.config.agentModels[agentType]!
        }

        if (agentType && agentType !== 'orchestrator' && this.config.costTier) {
            const tier = AGENT_COST_TIER[agentType]
            return this.config.costTier[tier] ?? this.config.default
        }

        return this.config.default
    }
}

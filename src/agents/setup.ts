import { AgentRegistry } from './registry.js'
import { SearchAgent } from './search/search-agent.js'
import { ResearchAgent } from './research/research-agent.js'
import { CodeAgent } from './code/code-agent.js'
import { TestAgent } from './test/test-agent.js'
import { InitAgent } from './init/init-agent.js'

export function createAgentRegistry(): AgentRegistry {
    const registry = new AgentRegistry()

    registry.register(new SearchAgent())
    registry.register(new ResearchAgent())
    registry.register(new CodeAgent())
    registry.register(new TestAgent())
    registry.register(new InitAgent())

    return registry
}

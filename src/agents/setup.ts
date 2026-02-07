import { CodeAgent } from './code/code-agent.js'
import { DocsAgent } from './docs/docs-agent.js'
import { InitAgent } from './init/init-agent.js'
import { QAAgent } from './qa/qa-agent.js'
import { AgentRegistry } from './registry.js'
import { ResearchAgent } from './research/research-agent.js'
import { ReviewAgent } from './review/review-agent.js'
import { SearchAgent } from './search/search-agent.js'
import { TestAgent } from './test/test-agent.js'

export function createAgentRegistry(): AgentRegistry {
    const registry = new AgentRegistry()

    registry.register(new SearchAgent())
    registry.register(new ResearchAgent())
    registry.register(new CodeAgent())
    registry.register(new TestAgent())
    registry.register(new InitAgent())
    registry.register(new ReviewAgent())
    registry.register(new QAAgent())
    registry.register(new DocsAgent())

    return registry
}

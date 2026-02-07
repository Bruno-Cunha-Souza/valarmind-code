import type { AgentType } from '../core/types.js';
import type { BaseAgent } from './base-agent.js';

export class AgentRegistry {
  private agents = new Map<AgentType, BaseAgent>();

  register(agent: BaseAgent): void {
    this.agents.set(agent.type, agent);
  }

  get(type: AgentType): BaseAgent | undefined {
    return this.agents.get(type);
  }

  getAll(): BaseAgent[] {
    return [...this.agents.values()];
  }

  has(type: AgentType): boolean {
    return this.agents.has(type);
  }
}

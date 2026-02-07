import { zodToJsonSchema } from 'zod-to-json-schema';
import type { AgentType } from '../core/types.js';
import type { ToolDefinition } from '../llm/types.js';
import type { AnyTool } from './types.js';

export class ToolRegistry {
  private tools = new Map<string, AnyTool>();
  private agentTools = new Map<AgentType, string[]>();

  register(tool: AnyTool): void {
    this.tools.set(tool.name, tool);
  }

  registerForAgent(agentType: AgentType, toolNames: string[]): void {
    this.agentTools.set(agentType, toolNames);
  }

  get(name: string): AnyTool | undefined {
    return this.tools.get(name);
  }

  getToolsForAgent(agentType: AgentType): AnyTool[] {
    const names = this.agentTools.get(agentType);
    if (!names) return [];
    return names.map((n) => this.tools.get(n)).filter((t): t is AnyTool => t !== undefined);
  }

  getToolDefinitions(agentType: AgentType): ToolDefinition[] {
    return this.getToolsForAgent(agentType).map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: zodToJsonSchema(tool.parameters) as Record<string, unknown>,
      },
    }));
  }

  listAll(): AnyTool[] {
    return [...this.tools.values()];
  }
}

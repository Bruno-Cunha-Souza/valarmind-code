import type { AgentType } from '../../core/types.js';

export interface PlanTask {
  agent: AgentType;
  description: string;
  dependsOn?: number[];
}

export interface Plan {
  plan: string;
  tasks: PlanTask[];
}

export function parsePlan(llmOutput: string): Plan | null {
  try {
    // Try to extract JSON from the response
    const jsonMatch = llmOutput.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as Plan;
    if (!parsed.plan || !Array.isArray(parsed.tasks)) return null;

    return parsed;
  } catch {
    return null;
  }
}

export function isDirectAnswer(llmOutput: string): boolean {
  // If the output doesn't contain a plan JSON, it's a direct answer
  return parsePlan(llmOutput) === null;
}

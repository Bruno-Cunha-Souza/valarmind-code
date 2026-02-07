// Simple token estimation: ~4 chars per token for English, ~3 for code
// Good enough for budget tracking, not for exact billing
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

export function isWithinBudget(
  tokens: number,
  budget: { target: number; hardCap: number },
): { withinTarget: boolean; withinHardCap: boolean } {
  return {
    withinTarget: tokens <= budget.target,
    withinHardCap: tokens <= budget.hardCap,
  };
}

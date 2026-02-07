interface QualityGateInput {
  filesModified: string[];
  description: string;
}

export function requiresReview(input: QualityGateInput): boolean {
  const { filesModified, description } = input;

  // Multi-file changes
  if (filesModified.length > 2) return true;

  // Risky patterns
  const riskyPatterns = [/auth/i, /payment/i, /security/i, /credential/i, /secret/i, /token/i];
  const descriptionRisky = riskyPatterns.some((p) => p.test(description));
  const filesRisky = filesModified.some((f) => riskyPatterns.some((p) => p.test(f)));

  if (descriptionRisky || filesRisky) return true;

  // API changes
  const apiPatterns = [/route/i, /endpoint/i, /controller/i, /api\//i];
  if (filesModified.some((f) => apiPatterns.some((p) => p.test(f)))) return true;

  return false;
}

export function requiresQA(input: QualityGateInput): boolean {
  // QA is required when review is required
  return requiresReview(input);
}

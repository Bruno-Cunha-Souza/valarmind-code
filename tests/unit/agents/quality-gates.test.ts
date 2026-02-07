import { describe, it, expect } from 'vitest';
import { requiresReview, requiresQA } from '../../../src/agents/orchestrator/quality-gates.js';

describe('requiresReview', () => {
  it('requires review for multi-file changes', () => {
    expect(
      requiresReview({ filesModified: ['a.ts', 'b.ts', 'c.ts'], description: 'Update' }),
    ).toBe(true);
  });

  it('requires review for auth-related description', () => {
    expect(
      requiresReview({ filesModified: ['login.ts'], description: 'Fix authentication bug' }),
    ).toBe(true);
  });

  it('requires review for security files', () => {
    expect(
      requiresReview({ filesModified: ['src/auth/credentials.ts'], description: 'Refactor' }),
    ).toBe(true);
  });

  it('requires review for API changes', () => {
    expect(
      requiresReview({ filesModified: ['src/api/routes.ts'], description: 'Add endpoint' }),
    ).toBe(true);
  });

  it('does not require review for simple changes', () => {
    expect(
      requiresReview({ filesModified: ['src/utils/format.ts'], description: 'Fix typo' }),
    ).toBe(false);
  });
});

describe('requiresQA', () => {
  it('mirrors requiresReview', () => {
    const risky = { filesModified: ['auth.ts', 'token.ts', 'login.ts'], description: 'Fix' };
    expect(requiresQA(risky)).toBe(requiresReview(risky));
  });
});

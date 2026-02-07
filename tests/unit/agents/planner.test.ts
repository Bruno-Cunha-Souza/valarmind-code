import { describe, it, expect } from 'vitest';
import { parsePlan, isDirectAnswer } from '../../../src/agents/orchestrator/planner.js';

describe('parsePlan', () => {
  it('parses valid plan JSON', () => {
    const input = JSON.stringify({
      plan: 'Search then code',
      tasks: [
        { agent: 'search', description: 'Find relevant files' },
        { agent: 'code', description: 'Implement changes', dependsOn: [0] },
      ],
    });
    const plan = parsePlan(input);
    expect(plan).not.toBeNull();
    expect(plan!.plan).toBe('Search then code');
    expect(plan!.tasks).toHaveLength(2);
  });

  it('extracts JSON from surrounding text', () => {
    const input = `Here's my plan:\n${JSON.stringify({
      plan: 'Do stuff',
      tasks: [{ agent: 'search', description: 'Find things' }],
    })}\nLet me know!`;
    const plan = parsePlan(input);
    expect(plan).not.toBeNull();
    expect(plan!.tasks).toHaveLength(1);
  });

  it('returns null for invalid JSON', () => {
    expect(parsePlan('Just a plain text response')).toBeNull();
    expect(parsePlan('{ invalid json')).toBeNull();
  });

  it('returns null for missing fields', () => {
    expect(parsePlan(JSON.stringify({ plan: 'no tasks' }))).toBeNull();
    expect(parsePlan(JSON.stringify({ tasks: [] }))).toBeNull();
  });
});

describe('isDirectAnswer', () => {
  it('returns true for plain text', () => {
    expect(isDirectAnswer('Here is your answer.')).toBe(true);
  });

  it('returns false for plan JSON', () => {
    const plan = JSON.stringify({
      plan: 'Test',
      tasks: [{ agent: 'search', description: 'Find' }],
    });
    expect(isDirectAnswer(plan)).toBe(false);
  });
});

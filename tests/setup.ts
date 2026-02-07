import { vi } from 'vitest';

// Mock the 'bun' module for Vitest (runs on Node, not Bun)
vi.mock('bun', () => ({
  Glob: class {
    constructor(public pattern: string) {}
    async *scan() {
      // no-op in tests
    }
  },
  file: () => ({
    text: async () => '',
    json: async () => ({}),
    exists: async () => false,
  }),
  write: async () => {},
}));

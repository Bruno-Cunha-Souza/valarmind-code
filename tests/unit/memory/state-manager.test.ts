import { describe, it, expect } from 'vitest';
import { MockFileSystem } from '../../../src/core/fs.js';
import { StateManager } from '../../../src/memory/state-manager.js';
import type { ResolvedConfig } from '../../../src/config/schema.js';
import pino from 'pino';

const mockLogger = pino({ level: 'silent' });
const mockConfig = { projectDir: '/project' } as ResolvedConfig;

describe('StateManager', () => {
  it('returns default state when no file exists', async () => {
    const fs = new MockFileSystem();
    const manager = new StateManager(mockConfig, fs, mockLogger);
    const state = await manager.load();
    expect(state.schema_version).toBe(1);
    expect(state.goal).toBe('');
    expect(state.tasks_open).toEqual([]);
  });

  it('saves and loads state', async () => {
    const fs = new MockFileSystem();
    const manager = new StateManager(mockConfig, fs, mockLogger);

    await manager.save({
      schema_version: 1,
      updated_at: new Date().toISOString(),
      goal: 'Build feature X',
      now: 'Implementing tests',
      decisions_recent: [],
      tasks_open: [{ id: 'T-1', title: 'Write tests', status: 'open', updated_at: '' }],
      conventions: { language: 'TypeScript' },
    });

    manager.reset(); // clear cache
    const state = await manager.load();
    expect(state.goal).toBe('Build feature X');
    expect(state.tasks_open).toHaveLength(1);
  });

  it('updates partial state', async () => {
    const fs = new MockFileSystem();
    const manager = new StateManager(mockConfig, fs, mockLogger);

    await manager.update({ goal: 'New goal' });
    const state = await manager.load();
    expect(state.goal).toBe('New goal');
  });

  it('handles corrupt state file', async () => {
    const fs = new MockFileSystem();
    fs.setFile('/project/.valarmind/memory/state.json', 'invalid json{');
    const manager = new StateManager(mockConfig, fs, mockLogger);
    const state = await manager.load();
    expect(state.schema_version).toBe(1); // falls back to default
  });
});

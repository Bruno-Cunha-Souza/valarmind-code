import path from 'node:path';
import type { FileSystem } from '../core/fs.js';
import type { StateManager } from './state-manager.js';
import { compactState } from './compactor.js';

export interface ProjectContext {
  valarmindMd: string | null;
  localMd: string | null;
  stateCompact: string | null;
}

export class ContextLoader {
  constructor(
    private fs: FileSystem,
    private stateManager: StateManager,
  ) {}

  async load(projectDir: string): Promise<ProjectContext> {
    const [valarmindMd, localMd, state] = await Promise.all([
      this.loadFile(path.join(projectDir, 'VALARMIND.md')),
      this.loadFile(path.join(projectDir, 'VALARMIND.local.md')),
      this.stateManager.load(),
    ]);

    let stateCompact: string | null = null;
    if (state.goal || state.now || state.tasks_open.length > 0) {
      stateCompact = await compactState(state);
    }

    return { valarmindMd, localMd, stateCompact };
  }

  private async loadFile(filePath: string): Promise<string | null> {
    try {
      if (await this.fs.exists(filePath)) {
        return await this.fs.readText(filePath);
      }
    } catch {
      // file not readable
    }
    return null;
  }
}

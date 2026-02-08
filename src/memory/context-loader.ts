import path from 'node:path'
import type { FileSystem } from '../core/fs.js'
import { compactState } from './compactor.js'
import type { StateManager } from './state-manager.js'

export interface ProjectContext {
    valarmindMd: string | null
    localMd: string | null
    stateCompact: string | null
}

export class ContextLoader {
    private cache: { valarmindMd: string | null; localMd: string | null; projectDir: string } | null = null

    constructor(
        private fs: FileSystem,
        private stateManager: StateManager
    ) {}

    async load(projectDir: string): Promise<ProjectContext> {
        let valarmindMd: string | null
        let localMd: string | null

        if (this.cache && this.cache.projectDir === projectDir) {
            valarmindMd = this.cache.valarmindMd
            localMd = this.cache.localMd
        } else {
            ;[valarmindMd, localMd] = await Promise.all([
                this.loadFile(path.join(projectDir, 'VALARMIND.md')),
                this.loadFile(path.join(projectDir, 'VALARMIND.local.md')),
            ])
            this.cache = { valarmindMd, localMd, projectDir }
        }

        const state = await this.stateManager.load()
        let stateCompact: string | null = null
        if (state.goal || state.now || state.tasks_open.length > 0) {
            stateCompact = await compactState(state)
        }

        return { valarmindMd, localMd, stateCompact }
    }

    invalidate(): void {
        this.cache = null
    }

    private async loadFile(filePath: string): Promise<string | null> {
        try {
            if (await this.fs.exists(filePath)) {
                return await this.fs.readText(filePath)
            }
        } catch {
            // file not readable
        }
        return null
    }
}

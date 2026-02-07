import path from 'node:path'
import { z } from 'zod'
import type { ResolvedConfig } from '../config/schema.js'
import type { FileSystem } from '../core/fs.js'
import type { Logger } from '../logger/index.js'
import type { WorkingState } from './types.js'

const WorkingStateSchema = z.object({
    schema_version: z.number(),
    updated_at: z.string(),
    goal: z.string(),
    now: z.string(),
    decisions_recent: z.array(z.object({ id: z.string(), title: z.string(), why: z.string(), ts: z.string() })),
    tasks_open: z.array(
        z.object({
            id: z.string(),
            title: z.string(),
            status: z.enum(['open', 'in_progress', 'done']),
            updated_at: z.string(),
        })
    ),
    conventions: z.record(z.string()),
})

function defaultState(): WorkingState {
    return {
        schema_version: 1,
        updated_at: new Date().toISOString(),
        goal: '',
        now: '',
        decisions_recent: [],
        tasks_open: [],
        conventions: {},
    }
}

export class StateManager {
    private statePath: string
    private cached: WorkingState | null = null

    constructor(
        config: ResolvedConfig,
        private fs: FileSystem,
        private logger: Logger
    ) {
        this.statePath = path.join(config.projectDir, '.valarmind/memory/state.json')
    }

    async load(): Promise<WorkingState> {
        if (this.cached) return this.cached

        try {
            if (await this.fs.exists(this.statePath)) {
                const raw = await this.fs.readJSON<unknown>(this.statePath)
                this.cached = WorkingStateSchema.parse(raw)
                return this.cached
            }
        } catch (error) {
            this.logger.warn({ error }, 'Failed to load state.json, using defaults')
        }

        this.cached = defaultState()
        return this.cached
    }

    async save(state: WorkingState): Promise<void> {
        state.updated_at = new Date().toISOString()
        const dir = path.dirname(this.statePath)
        await this.fs.mkdir(dir)
        await this.fs.writeJSON(this.statePath, state)
        this.cached = state
        this.logger.debug('State saved')
    }

    async update(partial: Partial<WorkingState>): Promise<void> {
        const current = await this.load()
        const updated = { ...current, ...partial }
        await this.save(updated)
    }

    reset(): void {
        this.cached = null
    }
}

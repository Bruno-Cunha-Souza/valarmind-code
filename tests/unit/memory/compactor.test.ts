import { describe, it, expect } from 'bun:test'
import { compactState } from '../../../src/memory/compactor.js'
import type { WorkingState } from '../../../src/memory/types.js'

const emptyState: WorkingState = {
    schema_version: 1,
    updated_at: '2025-01-01T00:00:00Z',
    goal: '',
    now: '',
    decisions_recent: [],
    tasks_open: [],
    conventions: {},
}

const fullState: WorkingState = {
    schema_version: 1,
    updated_at: '2025-06-15T10:30:00Z',
    goal: 'Implement multi-agent system',
    now: 'Writing tests',
    decisions_recent: [
        { id: 'ADR-001', title: 'Use Bun runtime', why: 'Fast and TypeScript-native', ts: '2025-06-15T10:00:00Z' },
        { id: 'ADR-002', title: 'OpenRouter API', why: 'Multi-model access', ts: '2025-06-15T10:15:00Z' },
    ],
    tasks_open: [
        { id: 'T-01', title: 'Implement Review Agent', status: 'open', updated_at: '2025-06-15T10:20:00Z' },
        { id: 'T-02', title: 'Write integration tests', status: 'in_progress', updated_at: '2025-06-15T10:25:00Z' },
    ],
    conventions: {
        language: 'TypeScript',
        runtime: 'Bun',
        testing: 'bun:test',
    },
}

describe('compactState', () => {
    it('produces output for empty state', async () => {
        const compact = await compactState(emptyState)
        expect(compact).toBeTruthy()
        expect(compact.length).toBeGreaterThan(0)
    })

    it('includes schema version in output', async () => {
        const compact = await compactState(emptyState)
        // TOON or manual format — both include schema_version somehow
        expect(compact).toMatch(/schema_version|v1/)
    })

    it('includes goal and now for full state', async () => {
        const compact = await compactState(fullState)
        expect(compact).toContain('Implement multi-agent system')
        expect(compact).toContain('Writing tests')
    })

    it('includes decisions', async () => {
        const compact = await compactState(fullState)
        expect(compact).toContain('ADR-001')
        expect(compact).toContain('Use Bun runtime')
    })

    it('includes tasks', async () => {
        const compact = await compactState(fullState)
        expect(compact).toContain('T-01')
        expect(compact).toContain('Implement Review Agent')
    })

    it('includes conventions', async () => {
        const compact = await compactState(fullState)
        expect(compact).toContain('TypeScript')
    })

    it('compact output is smaller than JSON.stringify', async () => {
        const compact = await compactState(fullState)
        const json = JSON.stringify(fullState)
        expect(compact.length).toBeLessThan(json.length)
    })
})

import type { WorkingState } from './types.js'

// TOON compaction: convert state to a compact format for prompts
// Uses @toon-format/toon when available, falls back to manual compaction
export async function compactState(state: WorkingState): Promise<string> {
    try {
        const { encode } = await import('@toon-format/toon')
        return encode(state)
    } catch {
        // Fallback: manual compact format
        return manualCompact(state)
    }
}

function manualCompact(state: WorkingState): string {
    const lines: string[] = []
    lines.push(`v${state.schema_version} | ${state.updated_at}`)

    if (state.goal) lines.push(`GOAL: ${state.goal}`)
    if (state.now) lines.push(`NOW: ${state.now}`)

    if (state.decisions_recent.length > 0) {
        lines.push('DECISIONS:')
        for (const d of state.decisions_recent) {
            lines.push(`  ${d.id}: ${d.title} — ${d.why}`)
        }
    }

    if (state.tasks_open.length > 0) {
        lines.push('TASKS:')
        for (const t of state.tasks_open) {
            lines.push(`  ${t.id} [${t.status}] ${t.title}`)
        }
    }

    if (Object.keys(state.conventions).length > 0) {
        lines.push('CONV:')
        for (const [k, v] of Object.entries(state.conventions)) {
            lines.push(`  ${k}: ${v}`)
        }
    }

    return lines.join('\n')
}

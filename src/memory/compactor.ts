import type { WorkingState } from './types.js'

// Cached TOON module to avoid dynamic import on every call
let toonModule: { encode: (data: unknown) => string } | null | undefined

async function getToon(): Promise<{ encode: (data: unknown) => string } | null> {
    if (toonModule !== undefined) return toonModule
    try {
        toonModule = await import('@toon-format/toon')
        return toonModule
    } catch {
        toonModule = null
        return null
    }
}

// Compact generic text using TOON encoding
// Falls back to original text if TOON is unavailable or doesn't save enough
export async function compactText(text: string): Promise<string> {
    const toon = await getToon()
    if (!toon) return text

    const compacted = toon.encode(text)
    // Only use if it actually saves tokens (>15% reduction)
    if (compacted.length < text.length * 0.85) return compacted
    return text
}

// TOON compaction: convert state to a compact format for prompts
// Uses @toon-format/toon when available, falls back to manual compaction
export async function compactState(state: WorkingState): Promise<string> {
    const toon = await getToon()
    if (!toon) return manualCompact(state)

    const compacted = toon.encode(state)
    const fallback = manualCompact(state)
    // Only use TOON if it actually saves space (>15% reduction)
    if (compacted.length < fallback.length * 0.85) return compacted
    return fallback
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

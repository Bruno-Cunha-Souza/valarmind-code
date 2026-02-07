export interface ReviewIssue {
    file: string
    line?: number
    severity: 'critical' | 'major' | 'minor' | 'info'
    category: 'security' | 'performance' | 'correctness' | 'maintenance'
    message: string
    suggestion?: string
}

export interface ReviewOutput {
    filesReviewed: string[]
    issues: ReviewIssue[]
    overallScore: number
    approved: boolean
    summary: string
}

export interface QACheck {
    name: string
    command: string
    passed: boolean
    output: string
}

export interface QAOutput {
    checks: QACheck[]
    passed: boolean
    blockers: string[]
    warnings: string[]
}

function extractJSON(raw: unknown): unknown | null {
    if (raw === null || raw === undefined) return null
    const str = typeof raw === 'string' ? raw : JSON.stringify(raw)

    // Try parsing the whole string first (most common case)
    try {
        return JSON.parse(str)
    } catch {
        // Fall through to regex extraction
    }

    // Extract JSON from surrounding text using balanced brace matching
    const startIdx = str.indexOf('{')
    if (startIdx === -1) return null

    let depth = 0
    for (let i = startIdx; i < str.length; i++) {
        if (str[i] === '{') depth++
        else if (str[i] === '}') depth--
        if (depth === 0) {
            try {
                return JSON.parse(str.slice(startIdx, i + 1))
            } catch {
                return null
            }
        }
    }
    return null
}

export function parseReviewOutput(raw: unknown): ReviewOutput | null {
    const parsed = extractJSON(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const obj = parsed as Record<string, unknown>
    if (!Array.isArray(obj.filesReviewed) || !Array.isArray(obj.issues) || typeof obj.overallScore !== 'number' || typeof obj.approved !== 'boolean') {
        return null
    }
    return {
        filesReviewed: obj.filesReviewed as string[],
        issues: obj.issues as ReviewIssue[],
        overallScore: obj.overallScore,
        approved: obj.approved,
        summary: (obj.summary as string) ?? '',
    }
}

export function parseQAOutput(raw: unknown): QAOutput | null {
    const parsed = extractJSON(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const obj = parsed as Record<string, unknown>
    if (!Array.isArray(obj.checks) || typeof obj.passed !== 'boolean') {
        return null
    }
    return {
        checks: obj.checks as QACheck[],
        passed: obj.passed,
        blockers: (obj.blockers as string[]) ?? [],
        warnings: (obj.warnings as string[]) ?? [],
    }
}

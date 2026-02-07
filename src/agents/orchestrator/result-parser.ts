import { z } from 'zod'

const ReviewIssueSchema = z.object({
    file: z.string(),
    line: z.number().optional(),
    severity: z.enum(['critical', 'major', 'minor', 'info']),
    category: z.enum(['security', 'performance', 'correctness', 'maintenance']),
    message: z.string(),
    suggestion: z.string().optional(),
})

const ReviewOutputSchema = z.object({
    filesReviewed: z.array(z.string()),
    issues: z.array(ReviewIssueSchema),
    overallScore: z.number(),
    approved: z.boolean(),
    summary: z.string().optional().default(''),
})

const QACheckSchema = z.object({
    name: z.string(),
    command: z.string(),
    passed: z.boolean(),
    output: z.string(),
})

const QAOutputSchema = z.object({
    checks: z.array(QACheckSchema),
    passed: z.boolean(),
    blockers: z.array(z.string()).optional().default([]),
    warnings: z.array(z.string()).optional().default([]),
})

export type ReviewIssue = z.infer<typeof ReviewIssueSchema>
export type ReviewOutput = z.infer<typeof ReviewOutputSchema>
export type QACheck = z.infer<typeof QACheckSchema>
export type QAOutput = z.infer<typeof QAOutputSchema>

export function extractJSON(raw: unknown): unknown | null {
    if (raw === null || raw === undefined) return null
    const str = typeof raw === 'string' ? raw : JSON.stringify(raw)

    // Try parsing the whole string first (most common case)
    try {
        return JSON.parse(str)
    } catch {
        // Fall through to balanced brace extraction
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
    const result = ReviewOutputSchema.safeParse(parsed)
    return result.success ? result.data : null
}

export function parseQAOutput(raw: unknown): QAOutput | null {
    const parsed = extractJSON(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const result = QAOutputSchema.safeParse(parsed)
    return result.success ? result.data : null
}

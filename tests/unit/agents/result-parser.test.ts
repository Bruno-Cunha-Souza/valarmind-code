import { describe, it, expect } from 'bun:test'
import { parseReviewOutput, parseQAOutput } from '../../../src/agents/orchestrator/result-parser.js'

describe('parseReviewOutput', () => {
    it('parses valid review JSON', () => {
        const input = JSON.stringify({
            filesReviewed: ['src/foo.ts'],
            issues: [
                {
                    file: 'src/foo.ts',
                    line: 10,
                    severity: 'major',
                    category: 'correctness',
                    message: 'Missing null check',
                    suggestion: 'Add if (x != null)',
                },
            ],
            overallScore: 7,
            approved: false,
            summary: 'Found 1 issue',
        })

        const result = parseReviewOutput(input)
        expect(result).not.toBeNull()
        expect(result!.filesReviewed).toEqual(['src/foo.ts'])
        expect(result!.issues).toHaveLength(1)
        expect(result!.overallScore).toBe(7)
        expect(result!.approved).toBe(false)
    })

    it('extracts JSON from surrounding text', () => {
        const json = JSON.stringify({
            filesReviewed: ['a.ts'],
            issues: [],
            overallScore: 9,
            approved: true,
            summary: 'Looks good',
        })
        const input = `Here is my review:\n${json}\nEnd of review.`
        const result = parseReviewOutput(input)
        expect(result).not.toBeNull()
        expect(result!.approved).toBe(true)
    })

    it('returns null for invalid input', () => {
        expect(parseReviewOutput('not json')).toBeNull()
        expect(parseReviewOutput(null)).toBeNull()
        expect(parseReviewOutput(undefined)).toBeNull()
    })

    it('returns null for missing required fields', () => {
        expect(parseReviewOutput(JSON.stringify({ filesReviewed: [] }))).toBeNull()
        expect(parseReviewOutput(JSON.stringify({ issues: [], overallScore: 5 }))).toBeNull()
    })
})

describe('parseQAOutput', () => {
    it('parses valid QA JSON', () => {
        const input = JSON.stringify({
            checks: [
                { name: 'build', command: 'bun run build', passed: true, output: 'ok' },
                { name: 'lint', command: 'bun run lint', passed: false, output: 'error' },
            ],
            passed: false,
            blockers: ['lint failed'],
            warnings: [],
        })

        const result = parseQAOutput(input)
        expect(result).not.toBeNull()
        expect(result!.checks).toHaveLength(2)
        expect(result!.passed).toBe(false)
        expect(result!.blockers).toEqual(['lint failed'])
    })

    it('returns null for invalid input', () => {
        expect(parseQAOutput('not json')).toBeNull()
        expect(parseQAOutput(null)).toBeNull()
    })

    it('returns null for missing required fields', () => {
        expect(parseQAOutput(JSON.stringify({ checks: [] }))).toBeNull()
    })

    it('defaults to empty arrays for optional fields', () => {
        const input = JSON.stringify({
            checks: [],
            passed: true,
        })
        const result = parseQAOutput(input)
        expect(result).not.toBeNull()
        expect(result!.blockers).toEqual([])
        expect(result!.warnings).toEqual([])
    })
})

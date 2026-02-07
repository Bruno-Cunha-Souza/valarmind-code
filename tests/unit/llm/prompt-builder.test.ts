import { describe, it, expect } from 'bun:test'
import { PromptBuilder } from '../../../src/llm/prompt-builder.js'

describe('PromptBuilder', () => {
    it('builds prompt with sections sorted by priority', () => {
        const builder = new PromptBuilder()
        builder.add('Low Priority', 'low content', 10)
        builder.add('High Priority', 'high content', 90)

        const prompt = builder.build(10000)
        // Both should be included but high priority content exists
        expect(prompt).toContain('High Priority')
        expect(prompt).toContain('Low Priority')
    })

    it('enforces hardCap', () => {
        const builder = new PromptBuilder()
        builder.add('Important', 'a'.repeat(100), 100)
        builder.add('Less Important', 'b'.repeat(100), 50)
        builder.add('Least Important', 'c'.repeat(100), 10)

        // Very small cap — only first section fits
        const prompt = builder.build(40)
        expect(prompt).toContain('Important')
        expect(prompt).not.toContain('Less Important')
    })

    it('restores original order for readability', () => {
        const builder = new PromptBuilder()
        builder.add('First', 'first content', 50)
        builder.add('Second', 'second content', 100)
        builder.add('Third', 'third content', 75)

        const prompt = builder.build(10000)
        const firstIdx = prompt.indexOf('First')
        const secondIdx = prompt.indexOf('Second')
        const thirdIdx = prompt.indexOf('Third')
        // Should be in original order: First, Second, Third
        expect(firstIdx).toBeLessThan(secondIdx)
        expect(secondIdx).toBeLessThan(thirdIdx)
    })

    it('buildWithManifest returns manifest', () => {
        const builder = new PromptBuilder()
        builder.add('Section A', 'content a', 100)
        builder.add('Section B', 'content b', 50)

        const { prompt, manifest } = builder.buildWithManifest(10000)
        expect(prompt).toContain('Section A')
        expect(manifest.sections).toHaveLength(2)
        expect(manifest.sections[0]!.label).toBe('Section A')
        expect(manifest.sections[0]!.included).toBe(true)
        expect(manifest.totalTokens).toBeGreaterThan(0)
        expect(manifest.budget).toBe(10000)
    })

    it('manifest marks excluded sections', () => {
        const builder = new PromptBuilder()
        builder.add('Fits', 'x', 100)
        builder.add('Too Large', 'y'.repeat(1000), 10)

        const { manifest } = builder.buildWithManifest(10)
        const fits = manifest.sections.find((s) => s.label === 'Fits')
        const tooLarge = manifest.sections.find((s) => s.label === 'Too Large')
        expect(fits!.included).toBe(true)
        expect(tooLarge!.included).toBe(false)
    })

    it('buildMessages creates system + user messages', () => {
        const builder = new PromptBuilder()
        const messages = builder.buildMessages('system prompt', 'user message')
        expect(messages).toHaveLength(2)
        expect(messages[0]!.role).toBe('system')
        expect(messages[1]!.role).toBe('user')
    })
})

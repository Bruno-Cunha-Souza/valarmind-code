import { estimateTokens } from './token-counter.js'
import type { ChatMessage } from './types.js'

interface PromptSection {
    label: string
    content: string
    priority: number // higher = more important
}

export interface PromptManifest {
    sections: { label: string; tokens: number; included: boolean }[]
    totalTokens: number
    budget: number
}

export class PromptBuilder {
    private sections: PromptSection[] = []

    add(label: string, content: string, priority = 50): this {
        this.sections.push({ label, content, priority })
        return this
    }

    build(hardCap: number): string {
        const { prompt } = this.buildWithManifest(hardCap)
        return prompt
    }

    buildWithManifest(hardCap: number): { prompt: string; manifest: PromptManifest } {
        const sorted = [...this.sections].sort((a, b) => b.priority - a.priority)

        let totalTokens = 0
        const included: PromptSection[] = []
        const sectionTokens = new Map<PromptSection, number>()

        for (const section of sorted) {
            const tokens = estimateTokens(section.content)
            sectionTokens.set(section, tokens)
            if (totalTokens + tokens <= hardCap) {
                included.push(section)
                totalTokens += tokens
            }
        }

        // Restore original order for readability
        included.sort((a, b) => this.sections.indexOf(a) - this.sections.indexOf(b))

        const prompt = included.map((s) => `## ${s.label}\n\n${s.content}`).join('\n\n')

        const manifest: PromptManifest = {
            sections: this.sections.map((s) => ({
                label: s.label,
                tokens: sectionTokens.get(s) ?? estimateTokens(s.content),
                included: included.includes(s),
            })),
            totalTokens,
            budget: hardCap,
        }

        return { prompt, manifest }
    }

    buildMessages(systemPrompt: string, userMessage: string): ChatMessage[] {
        return [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
        ]
    }
}

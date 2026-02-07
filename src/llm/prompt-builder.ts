import type { ChatMessage } from './types.js';
import { estimateTokens } from './token-counter.js';

interface PromptSection {
  label: string;
  content: string;
  priority: number; // higher = more important
}

export class PromptBuilder {
  private sections: PromptSection[] = [];

  add(label: string, content: string, priority = 50): this {
    this.sections.push({ label, content, priority });
    return this;
  }

  build(hardCap: number): string {
    // Sort by priority descending
    const sorted = [...this.sections].sort((a, b) => b.priority - a.priority);

    let totalTokens = 0;
    const included: PromptSection[] = [];

    for (const section of sorted) {
      const sectionTokens = estimateTokens(section.content);
      if (totalTokens + sectionTokens <= hardCap) {
        included.push(section);
        totalTokens += sectionTokens;
      }
    }

    // Restore original order for readability
    included.sort(
      (a, b) => this.sections.indexOf(a) - this.sections.indexOf(b),
    );

    return included.map((s) => `## ${s.label}\n\n${s.content}`).join('\n\n');
  }

  buildMessages(systemPrompt: string, userMessage: string): ChatMessage[] {
    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];
  }
}

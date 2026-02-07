import pc from 'picocolors'

export const colors = {
    brand: (text: string) => pc.magenta(pc.bold(text)),
    success: (text: string) => pc.green(text),
    error: (text: string) => pc.red(text),
    warn: (text: string) => pc.yellow(text),
    dim: (text: string) => pc.dim(text),
    bold: (text: string) => pc.bold(text),
    agent: (name: string) => pc.cyan(`[${name}]`),
    tool: (name: string) => pc.blue(`${name}`),
}

export function banner(): string {
    return `${colors.brand('ValarMind')} ${colors.dim('v0.1.0')} — CLI multi-agente`
}

export function formatAgentResult(agent: string, summary: string): string {
    return `${colors.agent(agent)} ${summary}`
}

export function formatError(message: string): string {
    return `${colors.error('Error:')} ${message}`
}

export function formatTokenUsage(prompt: number, completion: number): string {
    const total = prompt + completion
    return colors.dim(`tokens: ${total} (${prompt}p + ${completion}c)`)
}

import * as clack from '@clack/prompts'
import { colors } from './ui.js'

export async function askApiKey(): Promise<string | null> {
    const result = await clack.text({
        message: 'Cole sua API key do OpenRouter:',
        placeholder: 'sk-or-v1-...',
        validate(value) {
            if (!value.startsWith('sk-or-')) return 'API key deve começar com "sk-or-"'
        },
    })

    if (clack.isCancel(result)) return null
    return result
}

export async function askModel(models: { id: string; name: string }[]): Promise<string | null> {
    const popular = models.slice(0, 10)

    const result = await clack.select({
        message: 'Escolha o modelo default:',
        options: popular.map((m) => ({
            value: m.id,
            label: m.name || m.id,
        })),
    })

    if (clack.isCancel(result)) return null
    return result as string
}

export async function confirmAction(message: string): Promise<boolean> {
    const result = await clack.confirm({ message })
    if (clack.isCancel(result)) return false
    return result
}

export function showWelcome(): void {
    clack.intro(colors.brand('ValarMind Code'))
}

export function showOutro(message: string): void {
    clack.outro(message)
}

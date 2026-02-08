import type { Container } from '../../core/container.js'
import { colors } from '../ui.js'

export async function configCommand(container: Container, key?: string, value?: string): Promise<void> {
    if (!key) {
        // Show current config (redact sensitive values)
        const config = { ...container.config }
        const display = {
            ...config,
            apiKey: config.apiKey ? '****' : '(não configurado)',
        }
        console.log(JSON.stringify(display, null, 2))
        return
    }

    if (!value) {
        // Show specific key
        const val = (container.config as unknown as Record<string, unknown>)[key]
        if (val !== undefined) {
            console.log(`${key}: ${JSON.stringify(val)}`)
        } else {
            console.log(colors.warn(`Chave de config '${key}' não encontrada`))
        }
        return
    }

    console.log(colors.dim('Atualização de config via CLI ainda não implementada. Edite config.json diretamente.'))
}

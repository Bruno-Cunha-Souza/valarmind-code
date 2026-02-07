import * as clack from '@clack/prompts'
import type { Container } from '../core/container.js'
import { banner, colors, formatError } from './ui.js'
import { handleSlashCommand } from './slash-commands.js'

export async function startREPL(container: Container): Promise<void> {
    console.log(banner())
    console.log(colors.dim(`Model: ${container.config.model}`))
    console.log(colors.dim('Type /help for commands, /exit to quit\n'))

    while (true) {
        const input = await clack.text({
            message: '',
            placeholder: 'Ask anything...',
        })

        if (clack.isCancel(input)) {
            console.log(colors.dim('Bye!'))
            break
        }

        const text = (input as string).trim()
        if (!text) continue

        // Slash commands
        if (text.startsWith('/')) {
            const result = await handleSlashCommand(text, container)
            if (result !== null) {
                console.log(result)
            } else {
                console.log(formatError(`Comando desconhecido: ${text}`))
            }
            continue
        }

        // Process via orchestrator
        const spinner = clack.spinner()
        spinner.start('Processando...')

        try {
            await container.hookRunner.run('UserPromptSubmit', { VALARMIND_INPUT: text })

            const result = await container.orchestrator.process(text)
            spinner.stop('Concluído')
            console.log(`\n${result}\n`)
        } catch (error) {
            spinner.stop('Erro')
            console.log(formatError((error as Error).message))
        }
    }
}

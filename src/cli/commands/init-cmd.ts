import * as clack from '@clack/prompts'
import type { Container } from '../../core/container.js'
import { colors } from '../ui.js'

export async function initCommand(container: Container): Promise<void> {
    clack.intro(colors.brand('ValarMind Init'))

    const spinner = clack.spinner()
    spinner.start('Analisando projeto...')

    try {
        const result = await container.orchestrator.process(
            'Analyze this project and generate a comprehensive VALARMIND.md file. ' +
                'Follow the Init Agent guidelines: use tabular format, target ~3000 tokens, ' +
                'include all required sections (Objective, Stack, Dependencies, Architecture, ' +
                'Design, Practices, Commands, Project Core, Sensitive Points, TREE).'
        )

        spinner.stop(colors.success('VALARMIND.md gerado'))
        console.log(result)
        clack.outro('Init completo!')
    } catch (error) {
        spinner.stop(colors.error('Falha'))
        console.error(colors.error((error as Error).message))
    }
}

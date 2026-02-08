import { randomUUID } from 'node:crypto'
import * as clack from '@clack/prompts'
import { getModelLabel } from '../config/defaults.js'
import type { Container } from '../core/container.js'
import { promptInput } from './input.js'
import { handleSlashCommand } from './slash-commands.js'
import { createProgressTracker } from './progress.js'
import { banner, colors, formatError } from './ui.js'

export async function startREPL(container: Container): Promise<void> {
    const sessionId = randomUUID()

    console.log(banner())
    console.log(colors.dim(`Model: ${getModelLabel(container.config.model)}`))
    console.log(colors.dim('Type /help for commands, /exit to quit\n'))

    const usePlanMode = container.config.planMode

    while (true) {
        const input = await promptInput()

        if (input === null) {
            await container.hookRunner.run('SessionEnd', { VALARMIND_SESSION_ID: sessionId })
            console.log(colors.dim('Goodbye!'))
            break
        }

        const text = input.trim()
        if (!text) continue

        // Slash commands
        if (text.startsWith('/')) {
            const cmdName = text.split(' ')[0]
            const needsSpinner = ['/init', '/plan', '/approve', '/compact'].includes(cmdName!)

            if (needsSpinner) {
                const spinner = clack.spinner()
                spinner.start('Processing...')
                const progress = createProgressTracker(container.eventBus, spinner)
                try {
                    const result = await handleSlashCommand(text, container)
                    spinner.stop('Done')
                    if (result !== null) {
                        console.log(result)
                    }
                } catch (error) {
                    spinner.stop('Error')
                    console.log(formatError((error as Error).message))
                } finally {
                    progress.dispose()
                }
            } else {
                const isInteractive = ['/model', '/settings'].includes(cmdName!)
                const isClear = cmdName === '/clear'
                const result = await handleSlashCommand(text, container)
                if (result !== null) {
                    if (isInteractive || isClear) {
                        console.clear()
                        console.log(banner())
                        console.log(colors.dim(`Model: ${getModelLabel(container.config.model)}`))
                        console.log(colors.dim('Type /help for commands, /exit to quit\n'))
                    }
                    console.log(result)
                } else {
                    console.log(formatError(`Unknown command: ${text}`))
                }
            }
            continue
        }

        // Process via orchestrator
        try {
            await container.hookRunner.run('UserPromptSubmit', { VALARMIND_INPUT: text })

            if (usePlanMode) {
                // Plan mode: create plan, wait for /approve or /reject
                const spinner = clack.spinner()
                spinner.start('Creating plan...')
                const plan = await container.orchestrator.createPlan(text)
                spinner.stop('Plan created')

                if (plan) {
                    console.log(`\n${colors.bold('Plan:')} ${plan.plan}`)
                    console.log(colors.dim('Tasks:'))
                    for (let i = 0; i < plan.tasks.length; i++) {
                        const t = plan.tasks[i]!
                        const deps = t.dependsOn?.length ? ` (depends on: ${t.dependsOn.join(', ')})` : ''
                        console.log(`  ${i}. ${colors.agent(t.agent)} ${t.description}${colors.dim(deps)}`)
                    }
                    console.log(colors.dim('\nUse /approve to execute, /reject to cancel'))
                } else {
                    console.log(colors.warn('Could not create a plan for this request.'))
                }
            } else {
                // Streaming for direct answers, spinner for delegated tasks
                let isStreaming = false
                let hasOutput = false
                const spinner = clack.spinner()
                spinner.start('Processing...')
                const progress = createProgressTracker(container.eventBus, spinner, () => {
                    spinner.start('Processing...')
                })

                try {
                    for await (const chunk of container.orchestrator.processStream(text)) {
                        if (!isStreaming) {
                            progress.notifySpinnerStopped()
                            spinner.stop('')
                            isStreaming = true
                        }
                        process.stdout.write(chunk)
                        hasOutput = true
                    }

                    if (!isStreaming) {
                        spinner.stop('Done')
                    }
                    if (hasOutput) {
                        process.stdout.write('\n\n')
                    }
                } catch (error) {
                    if (!isStreaming) {
                        spinner.stop('Error')
                    }
                    throw error
                } finally {
                    progress.dispose()
                }
            }
        } catch (error) {
            console.log(formatError((error as Error).message))
        }
    }
}

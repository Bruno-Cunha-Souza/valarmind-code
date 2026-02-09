import * as clack from '@clack/prompts'
import { Command } from 'commander'
import { loadCredentials, saveCredentials } from '../auth/credentials.js'
import { validateApiKey } from '../auth/validator.js'
import { CONFIG_DIR, GLOBAL_CONFIG_FILE } from '../config/defaults.js'
import { loadConfig } from '../config/loader.js'
import { createContainer } from '../core/container.js'
import type { FileSystem } from '../core/fs.js'
import { BunFileSystem } from '../core/fs.js'
import { authCommand } from './commands/auth.js'
import { configCommand } from './commands/config-cmd.js'
import { doctorCommand } from './commands/doctor.js'
import { initCommand } from './commands/init-cmd.js'
import { askApiKey, askModel } from './prompts.js'
import { startREPL } from './repl.js'
import { colors, formatError } from './ui.js'

interface SetupResult {
    apiKey: string
    model?: string
}

/**
 * Interactive first-use flow: requests API key, validates, selects model, and saves.
 */
async function setupFirstUse(fs: FileSystem): Promise<SetupResult | null> {
    clack.intro(colors.brand('ValarMind Code — Initial Setup'))

    console.log(colors.dim("No API key found. Let's set it up!"))
    console.log(colors.dim('You need an OpenRouter API key (https://openrouter.ai/keys)\n'))

    const apiKey = await askApiKey()
    if (!apiKey) {
        clack.outro(colors.warn('Setup cancelled. Run again when you have your API key.'))
        return null
    }

    const spinner = clack.spinner()
    spinner.start('Validating API key...')

    const result = await validateApiKey(apiKey)
    if (!result.ok) {
        spinner.stop(colors.error('Invalid key'))
        console.log(colors.error(result.error))
        console.log(colors.dim('\nCheck your key and try again.'))
        return null
    }

    spinner.stop(colors.success(`Valid key — ${result.value.length} models available`))

    await saveCredentials(fs, apiKey)

    // Model selection
    const model = await askModel()
    if (model) {
        await fs.mkdir(CONFIG_DIR)
        await fs.writeJSON(GLOBAL_CONFIG_FILE, { model })
    }

    clack.outro(colors.success('Setup complete!'))

    return { apiKey, model: model ?? undefined }
}

export function createProgram(): Command {
    const program = new Command()

    program
        .name('valarmind-code')
        .description('Multi-agent CLI for software development')
        .version('0.1.0')
        .option('-p, --prompt <text>', 'Run a single prompt')
        .option('-m, --model <model>', 'LLM model to use')
        .option('-k, --key <key>', 'OpenRouter API key')
        .option('--plan', 'Plan mode (no execution)')
        .option('-y, --yes', 'Auto-approve all')
        .option('--sandbox', 'Sandbox mode (restricted)')
        .option('--debug', 'Enable debug logging')
        .action(async (options) => {
            try {
                const fs = new BunFileSystem()

                // Load API key from credentials if not provided
                const credKey = await loadCredentials(fs)

                let config = await loadConfig({
                    fs,
                    cliFlags: {
                        model: options.model,
                        apiKey: options.key ?? credKey ?? undefined,
                        logLevel: options.debug ? 'debug' : undefined,
                        permissionMode: options.yes ? 'auto' : undefined,
                    },
                })

                if (!config.apiKey) {
                    const setup = await setupFirstUse(fs)
                    if (!setup) process.exit(1)
                    config = { ...config, apiKey: setup.apiKey }
                    if (setup.model) config = { ...config, model: setup.model }
                    console.clear()
                }

                const container = createContainer(config)

                if (options.prompt) {
                    // Single prompt mode
                    const result = await container.orchestrator.process(options.prompt)
                    console.log(result)
                } else {
                    // REPL mode
                    await startREPL(container)
                }
            } catch (error) {
                console.error(formatError((error as Error).message))
                process.exit(1)
            }
        })

    program
        .command('auth')
        .description('Configure OpenRouter authentication')
        .option('-k, --key <key>', 'Set API key directly')
        .option('--logout', 'Remove credentials')
        .option('--status', 'Show authentication status')
        .option('--validate', 'Re-validate existing key')
        .action(authCommand)

    program
        .command('init')
        .description('Generate VALARMIND.md for the project')
        .action(async () => {
            const fs = new BunFileSystem()
            const credKey = await loadCredentials(fs)
            let config = await loadConfig({ fs, cliFlags: { apiKey: credKey ?? undefined } })
            if (!config.apiKey) {
                const setup = await setupFirstUse(fs)
                if (!setup) process.exit(1)
                config = { ...config, apiKey: setup.apiKey }
                if (setup.model) config = { ...config, model: setup.model }
                console.clear()
            }
            const container = createContainer(config)
            await initCommand(container)
        })

    program
        .command('config [key] [value]')
        .description('Manage configuration')
        .action(async (key, value) => {
            const fs = new BunFileSystem()
            const config = await loadConfig({ fs })
            const container = createContainer(config)
            await configCommand(container, key, value)
        })

    program.command('doctor').description('Environment diagnostics').action(doctorCommand)

    return program
}

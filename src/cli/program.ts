import { Command } from 'commander'
import { loadCredentials } from '../auth/credentials.js'
import { loadConfig } from '../config/loader.js'
import { createContainer } from '../core/container.js'
import { BunFileSystem } from '../core/fs.js'
import { authCommand } from './commands/auth.js'
import { configCommand } from './commands/config-cmd.js'
import { doctorCommand } from './commands/doctor.js'
import { initCommand } from './commands/init-cmd.js'
import { startREPL } from './repl.js'
import { formatError } from './ui.js'

export function createProgram(): Command {
    const program = new Command()

    program
        .name('valarmind-code')
        .description('CLI multi-agente para desenvolvimento de software')
        .version('0.1.0')
        .option('-p, --prompt <text>', 'Executa um prompt único')
        .option('-m, --model <model>', 'Modelo LLM a usar')
        .option('-k, --key <key>', 'API key do OpenRouter')
        .option('--plan', 'Modo plan (sem execução)')
        .option('-y, --yes', 'Auto-approve tudo')
        .option('--sandbox', 'Modo sandbox (restrito)')
        .option('--debug', 'Ativa debug logging')
        .action(async (options) => {
            try {
                const fs = new BunFileSystem()

                // Load API key from credentials if not provided
                const credKey = await loadCredentials(fs)

                const config = await loadConfig({
                    fs,
                    cliFlags: {
                        model: options.model,
                        apiKey: options.key ?? credKey ?? undefined,
                        logLevel: options.debug ? 'debug' : undefined,
                        permissionMode: options.yes ? 'auto' : undefined,
                    },
                })

                if (!config.apiKey) {
                    console.log(formatError('API key não configurada. Execute: valarmind auth'))
                    process.exit(1)
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
        .description('Configura autenticação OpenRouter')
        .option('-k, --key <key>', 'Set API key diretamente')
        .option('--logout', 'Remove credenciais')
        .option('--status', 'Mostra status da autenticação')
        .option('--validate', 'Revalida key existente')
        .action(authCommand)

    program
        .command('init')
        .description('Gera VALARMIND.md para o projeto')
        .action(async () => {
            const fs = new BunFileSystem()
            const credKey = await loadCredentials(fs)
            const config = await loadConfig({ fs, cliFlags: { apiKey: credKey ?? undefined } })
            if (!config.apiKey) {
                console.log(formatError('API key não configurada. Execute: valarmind auth'))
                process.exit(1)
            }
            const container = createContainer(config)
            await initCommand(container)
        })

    program
        .command('config [key] [value]')
        .description('Gerencia configuração')
        .action(async (key, value) => {
            const fs = new BunFileSystem()
            const config = await loadConfig({ fs })
            const container = createContainer(config)
            await configCommand(container, key, value)
        })

    program.command('doctor').description('Diagnóstico do ambiente').action(doctorCommand)

    return program
}

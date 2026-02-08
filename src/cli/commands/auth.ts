import * as clack from '@clack/prompts'
import { loadCredentials, maskApiKey, removeCredentials, saveCredentials } from '../../auth/credentials.js'
import { validateApiKey } from '../../auth/validator.js'
import { BunFileSystem } from '../../core/fs.js'
import { askApiKey } from '../prompts.js'
import { colors } from '../ui.js'

interface AuthOptions {
    key?: string
    logout?: boolean
    status?: boolean
    validate?: boolean
}

export async function authCommand(options: AuthOptions): Promise<void> {
    const fs = new BunFileSystem()

    if (options.logout) {
        await removeCredentials(fs)
        console.log(colors.success('Credentials removed.'))
        return
    }

    if (options.status) {
        const key = await loadCredentials(fs)
        if (key) {
            console.log(`API Key: ${maskApiKey(key)}`)
            console.log(colors.success('Authenticated'))
        } else {
            console.log(colors.warn('Not authenticated. Run: valarmind auth'))
        }
        return
    }

    if (options.validate) {
        const key = await loadCredentials(fs)
        if (!key) {
            console.log(colors.error('No API key found.'))
            return
        }
        const result = await validateApiKey(key)
        if (result.ok) {
            console.log(colors.success(`API key valid. ${result.value.length} models available.`))
        } else {
            console.log(colors.error(result.error))
        }
        return
    }

    // Interactive auth flow or direct key
    let apiKey = options.key

    if (!apiKey) {
        clack.intro(colors.brand('ValarMind Code Auth'))

        const existingKey = await loadCredentials(fs)
        if (existingKey) {
            console.log(colors.dim(`Existing key: ${maskApiKey(existingKey)}`))
            const replace = await clack.confirm({ message: 'Replace existing key?' })
            if (clack.isCancel(replace) || !replace) {
                clack.outro('Auth cancelled.')
                return
            }
        }

        apiKey = (await askApiKey()) ?? undefined
        if (!apiKey) {
            clack.outro('Auth cancelled.')
            return
        }
    }

    // Validate
    const spinner = clack.spinner()
    spinner.start('Validating API key...')

    const result = await validateApiKey(apiKey)
    if (!result.ok) {
        spinner.stop(colors.error('Invalid key'))
        console.log(colors.error(result.error))
        return
    }

    spinner.stop(colors.success('Valid key'))

    // Save
    await saveCredentials(fs, apiKey)
    console.log(colors.success(`Saved! ${result.value.length} models available.`))

    if (!options.key) {
        clack.outro('Auth configured successfully!')
    }
}

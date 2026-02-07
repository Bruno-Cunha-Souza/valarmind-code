import { CONFIG_DIR, CREDENTIALS_FILE } from '../config/defaults.js'
import type { FileSystem } from '../core/fs.js'

interface Credentials {
    apiKey: string
    createdAt: string
}

export async function loadCredentials(fs: FileSystem): Promise<string | null> {
    try {
        if (await fs.exists(CREDENTIALS_FILE)) {
            const creds = await fs.readJSON<Credentials>(CREDENTIALS_FILE)
            return creds.apiKey || null
        }
    } catch {
        // corrupt file
    }
    return null
}

export async function saveCredentials(fs: FileSystem, apiKey: string): Promise<void> {
    await fs.mkdir(CONFIG_DIR)
    const creds: Credentials = { apiKey, createdAt: new Date().toISOString() }
    await fs.writeJSON(CREDENTIALS_FILE, creds)
    await fs.chmod(CREDENTIALS_FILE, 0o600)
}

export async function removeCredentials(fs: FileSystem): Promise<void> {
    await fs.remove(CREDENTIALS_FILE)
}

export function maskApiKey(key: string): string {
    if (key.length <= 8) return '****'
    return `${key.slice(0, 6)}****${key.slice(-4)}`
}

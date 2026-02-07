import type { FileSystem } from '../core/fs.js'
import { CONFIG_DIR, GLOBAL_CONFIG_FILE } from './defaults.js'
import { type Config, ConfigSchema } from './schema.js'

export async function loadGlobalConfig(fs: FileSystem): Promise<Config> {
    try {
        if (await fs.exists(GLOBAL_CONFIG_FILE)) {
            const raw = await fs.readJSON<unknown>(GLOBAL_CONFIG_FILE)
            return ConfigSchema.parse(raw)
        }
    } catch {
        // corrupt file, return empty
    }
    return {}
}

export async function saveGlobalConfig(fs: FileSystem, updates: Partial<Config>): Promise<void> {
    await fs.mkdir(CONFIG_DIR)
    const existing = await loadGlobalConfig(fs)
    const merged = { ...existing, ...updates }
    await fs.writeJSON(GLOBAL_CONFIG_FILE, merged)
}

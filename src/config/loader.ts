import path from 'node:path'
import type { FileSystem } from '../core/fs.js'
import { CONFIG_DIR, DEFAULT_CONFIG, GLOBAL_CONFIG_FILE, LOCAL_CONFIG_FILE } from './defaults.js'
import { type Config, ConfigSchema, type ResolvedConfig } from './schema.js'

interface LoadConfigOptions {
    fs: FileSystem
    cliFlags?: Partial<Config>
    projectDir?: string
}

async function loadJsonConfig(fs: FileSystem, filePath: string): Promise<Config> {
    try {
        if (await fs.exists(filePath)) {
            const raw = await fs.readJSON<unknown>(filePath)
            return ConfigSchema.parse(raw)
        }
    } catch {
        // Invalid config file, skip
    }
    return {}
}

function mergeConfigs(...configs: Config[]): Config {
    const merged: Config = {}
    for (const cfg of configs) {
        for (const [key, value] of Object.entries(cfg)) {
            if (value !== undefined) {
                ;(merged as Record<string, unknown>)[key] = value
            }
        }
    }
    return merged
}

export async function loadConfig(options: LoadConfigOptions): Promise<ResolvedConfig> {
    const { fs, cliFlags = {}, projectDir = process.cwd() } = options

    const globalConfig = await loadJsonConfig(fs, GLOBAL_CONFIG_FILE)
    const localConfig = await loadJsonConfig(fs, path.join(projectDir, LOCAL_CONFIG_FILE))

    // Priority: CLI flags > env vars > local config > global config > defaults
    const envConfig: Config = {}
    if (process.env.VALARMIND_API_KEY) envConfig.apiKey = process.env.VALARMIND_API_KEY
    if (process.env.VALARMIND_MODEL) envConfig.model = process.env.VALARMIND_MODEL
    if (process.env.VALARMIND_LOG_LEVEL) envConfig.logLevel = process.env.VALARMIND_LOG_LEVEL as Config['logLevel']

    const merged = mergeConfigs(globalConfig, localConfig, envConfig, cliFlags)

    return {
        ...DEFAULT_CONFIG,
        ...merged,
        apiKey: merged.apiKey ?? '',
        projectDir,
        configDir: CONFIG_DIR,
        tokenBudget: {
            ...DEFAULT_CONFIG.tokenBudget,
            ...merged.tokenBudget,
        },
        agentTimeouts: {
            ...DEFAULT_CONFIG.agentTimeouts,
            ...merged.agentTimeouts,
        },
        hooks: { ...DEFAULT_CONFIG.hooks, ...merged.hooks },
        mcp: { ...DEFAULT_CONFIG.mcp, ...merged.mcp },
        mcpPermissions: { ...DEFAULT_CONFIG.mcpPermissions, ...merged.mcpPermissions },
        plugins: merged.plugins ?? DEFAULT_CONFIG.plugins,
        pluginSettings: { ...DEFAULT_CONFIG.pluginSettings, ...merged.pluginSettings },
        sandbox: { ...DEFAULT_CONFIG.sandbox, ...merged.sandbox },
        costTier:
            merged.costTier?.light && merged.costTier?.standard && merged.costTier?.heavy
                ? { light: merged.costTier.light, standard: merged.costTier.standard, heavy: merged.costTier.heavy }
                : undefined,
        agentModels: merged.agentModels as ResolvedConfig['agentModels'],
    }
}

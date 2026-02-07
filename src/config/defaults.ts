import type { ResolvedConfig } from './schema.js'

export const DEFAULT_CONFIG: Omit<ResolvedConfig, 'apiKey' | 'projectDir' | 'configDir'> = {
    model: 'anthropic/claude-sonnet-4-20250514',
    baseURL: 'https://openrouter.ai/api/v1',
    temperature: 0,
    maxTokens: 4096,
    logLevel: 'info',
    permissionMode: 'suggest',
    tokenBudget: { target: 3000, hardCap: 4800 },
    planMode: false,
    agentTimeouts: {},
    hooks: {},
    mcp: {},
}

export const CONFIG_DIR = `${process.env.HOME ?? '~'}/.config/valarmind`
export const CREDENTIALS_FILE = `${CONFIG_DIR}/credentials.json`
export const GLOBAL_CONFIG_FILE = `${CONFIG_DIR}/config.json`
export const LOCAL_CONFIG_DIR = '.valarmind'
export const LOCAL_CONFIG_FILE = `${LOCAL_CONFIG_DIR}/config.json`

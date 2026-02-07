import type { ResolvedConfig } from './schema.js'

export interface ModelOption {
    id: string
    label: string
}

export const AVAILABLE_MODELS: ModelOption[] = [
    { id: 'anthropic/claude-opus-4.6', label: 'Claude Opus 4.6' },
    { id: 'anthropic/claude-opus-4.5', label: 'Claude Opus 4.5' },
    { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5' },
    { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'openai/gpt-5.2-codex', label: 'GPT 5.2 Codex' },
]

export function getModelLabel(modelId: string): string {
    return AVAILABLE_MODELS.find((m) => m.id === modelId)?.label ?? modelId
}

export const DEFAULT_CONFIG: Omit<ResolvedConfig, 'apiKey' | 'projectDir' | 'configDir'> = {
    model: 'anthropic/claude-sonnet-4.5',
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
    mcpPermissions: {
        research: '*',
        code: [],
        qa: [],
    },
    plugins: [],
    pluginSettings: {},
    sandbox: { enabled: false, customProfiles: {} },
}

export const CONFIG_DIR = `${process.env.HOME ?? '~'}/.config/valarmind`
export const CREDENTIALS_FILE = `${CONFIG_DIR}/credentials.json`
export const GLOBAL_CONFIG_FILE = `${CONFIG_DIR}/config.json`
export const LOCAL_CONFIG_DIR = '.valarmind'
export const LOCAL_CONFIG_FILE = `${LOCAL_CONFIG_DIR}/config.json`

import type { Result } from '../core/result.js'
import { ok, err } from '../core/result.js'

interface ModelInfo {
    id: string
    name: string
}

export async function validateApiKey(apiKey: string, baseURL = 'https://openrouter.ai/api/v1'): Promise<Result<ModelInfo[]>> {
    try {
        const response = await fetch(`${baseURL}/models`, {
            headers: { Authorization: `Bearer ${apiKey}` },
        })

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                return err('API key inválida ou sem permissão')
            }
            return err(`Erro ao validar: HTTP ${response.status}`)
        }

        const data = (await response.json()) as { data: ModelInfo[] }
        return ok(data.data ?? [])
    } catch (error) {
        return err(`Falha na conexão: ${(error as Error).message}`)
    }
}

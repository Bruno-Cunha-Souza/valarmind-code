import type { AgentType } from './types.js'

export type EventMap = {
    'agent:start': { agentType: AgentType; taskId: string }
    'agent:complete': { agentType: AgentType; taskId: string; duration: number }
    'agent:error': { agentType: AgentType; taskId: string; error: Error }
    'tool:before': { toolName: string; agentType: AgentType; args: unknown }
    'tool:after': {
        toolName: string
        agentType: AgentType
        duration: number
        success: boolean
    }
    'token:usage': { agentType: AgentType; prompt: number; completion: number }
    'session:end': { sessionId: string; totalTokens: number }
}

type EventHandler<T> = (data: T) => void

export class TypedEventEmitter {
    private handlers = new Map<string, Set<EventHandler<unknown>>>()

    on<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, new Set())
        }
        this.handlers.get(event)!.add(handler as EventHandler<unknown>)
    }

    off<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void {
        this.handlers.get(event)?.delete(handler as EventHandler<unknown>)
    }

    emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
        const set = this.handlers.get(event)
        if (!set) return
        for (const handler of set) {
            try {
                handler(data)
            } catch {
                // cross-cutting listeners should not crash the main flow
            }
        }
    }

    removeAll(): void {
        this.handlers.clear()
    }
}

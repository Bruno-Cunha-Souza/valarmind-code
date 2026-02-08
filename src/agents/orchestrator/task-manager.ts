import { randomUUID } from 'node:crypto'
import type { AgentTask } from '../types.js'

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

export interface ManagedTask extends AgentTask {
    status: TaskStatus
    agent: string
    dependsOn: number[]
    result?: unknown
    retryCount: number
}

export class TaskManager {
    private tasks: ManagedTask[] = []

    addTask(agent: string, description: string, dependsOn: number[] = []): number {
        const index = this.tasks.length
        this.tasks.push({
            id: randomUUID(),
            type: agent,
            description,
            agent,
            dependsOn,
            status: 'pending',
            retryCount: 0,
        })
        return index
    }

    getReadyTasks(): ManagedTask[] {
        return this.tasks.filter((t) => t.status === 'pending' && t.dependsOn.every((dep) => this.tasks[dep]?.status === 'completed'))
    }

    markInProgress(index: number): void {
        const task = this.tasks[index]
        if (task) task.status = 'in_progress'
    }

    markCompleted(index: number, result: unknown): void {
        const task = this.tasks[index]
        if (task) {
            task.status = 'completed'
            task.result = result
        }
    }

    markFailed(index: number, error: string): void {
        const task = this.tasks[index]
        if (task) {
            task.status = 'failed'
            task.result = error
        }
    }

    isComplete(): boolean {
        return this.tasks.every((t) => t.status === 'completed' || t.status === 'failed')
    }

    getTasks(): ManagedTask[] {
        return [...this.tasks]
    }

    markForRetry(index: number, timeoutOverride?: number): boolean {
        const task = this.tasks[index]
        if (!task || task.retryCount >= 1) return false
        task.status = 'pending'
        task.retryCount++
        task.result = undefined
        if (timeoutOverride) task.timeoutOverride = timeoutOverride
        return true
    }

    clear(): void {
        this.tasks = []
    }
}

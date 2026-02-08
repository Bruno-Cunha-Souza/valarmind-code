import { describe, it, expect } from 'bun:test'
import { TaskManager } from '../../../src/agents/orchestrator/task-manager.js'

describe('TaskManager', () => {
    it('adds tasks', () => {
        const tm = new TaskManager()
        const idx = tm.addTask('search', 'Find files')
        expect(idx).toBe(0)
        expect(tm.getTasks()).toHaveLength(1)
    })

    it('returns ready tasks (no dependencies)', () => {
        const tm = new TaskManager()
        tm.addTask('search', 'Find files')
        tm.addTask('research', 'Lookup docs')
        const ready = tm.getReadyTasks()
        expect(ready).toHaveLength(2)
    })

    it('respects dependencies', () => {
        const tm = new TaskManager()
        tm.addTask('search', 'Find files')
        tm.addTask('code', 'Write code', [0])

        let ready = tm.getReadyTasks()
        expect(ready).toHaveLength(1)
        expect(ready[0]?.agent).toBe('search')

        tm.markCompleted(0, 'found')
        ready = tm.getReadyTasks()
        expect(ready).toHaveLength(1)
        expect(ready[0]?.agent).toBe('code')
    })

    it('tracks completion', () => {
        const tm = new TaskManager()
        tm.addTask('search', 'Find')
        expect(tm.isComplete()).toBe(false)

        tm.markCompleted(0, 'done')
        expect(tm.isComplete()).toBe(true)
    })

    it('counts failed as complete', () => {
        const tm = new TaskManager()
        tm.addTask('search', 'Find')
        tm.markFailed(0, 'timeout')
        expect(tm.isComplete()).toBe(true)
    })

    it('clears all tasks', () => {
        const tm = new TaskManager()
        tm.addTask('a', 'task a')
        tm.addTask('b', 'task b')
        tm.clear()
        expect(tm.getTasks()).toHaveLength(0)
    })

    it('initializes retryCount to 0', () => {
        const tm = new TaskManager()
        tm.addTask('search', 'Find files')
        expect(tm.getTasks()[0]!.retryCount).toBe(0)
    })
})

describe('TaskManager.markForRetry', () => {
    it('resets failed task to pending', () => {
        const tm = new TaskManager()
        tm.addTask('search', 'Find files')
        tm.markFailed(0, 'Request was aborted')

        const result = tm.markForRetry(0, 240)
        expect(result).toBe(true)

        const task = tm.getTasks()[0]!
        expect(task.status).toBe('pending')
        expect(task.retryCount).toBe(1)
        expect(task.result).toBeUndefined()
        expect(task.timeoutOverride).toBe(240)
    })

    it('refuses second retry (max 1)', () => {
        const tm = new TaskManager()
        tm.addTask('search', 'Find files')
        tm.markFailed(0, 'aborted')

        expect(tm.markForRetry(0)).toBe(true)
        // Simulate second failure
        tm.markFailed(0, 'aborted again')
        expect(tm.markForRetry(0)).toBe(false)
    })

    it('returns false for invalid index', () => {
        const tm = new TaskManager()
        expect(tm.markForRetry(99)).toBe(false)
    })

    it('makes task available via getReadyTasks after retry', () => {
        const tm = new TaskManager()
        tm.addTask('search', 'Find files')
        tm.markFailed(0, 'aborted')

        expect(tm.getReadyTasks()).toHaveLength(0)

        tm.markForRetry(0, 180)
        expect(tm.getReadyTasks()).toHaveLength(1)
    })

    it('propagates timeoutOverride', () => {
        const tm = new TaskManager()
        tm.addTask('search', 'Find')
        tm.markFailed(0, 'aborted')
        tm.markForRetry(0, 300)

        expect(tm.getTasks()[0]!.timeoutOverride).toBe(300)
    })

    it('does not set timeoutOverride when not provided', () => {
        const tm = new TaskManager()
        tm.addTask('search', 'Find')
        tm.markFailed(0, 'aborted')
        tm.markForRetry(0)

        expect(tm.getTasks()[0]!.timeoutOverride).toBeUndefined()
    })
})

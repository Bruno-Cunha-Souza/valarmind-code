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
})

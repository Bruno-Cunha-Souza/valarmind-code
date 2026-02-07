import { describe, it, expect, mock } from 'bun:test'
import { TypedEventEmitter } from '../../../src/core/events.js'

describe('TypedEventEmitter', () => {
    it('emits and handles events', () => {
        const emitter = new TypedEventEmitter()
        const handler = mock(() => {})

        emitter.on('agent:start', handler)
        emitter.emit('agent:start', { agentType: 'search', taskId: '1' })

        expect(handler.mock.calls[0]).toEqual([{ agentType: 'search', taskId: '1' }])
    })

    it('supports multiple handlers', () => {
        const emitter = new TypedEventEmitter()
        const h1 = mock(() => {})
        const h2 = mock(() => {})

        emitter.on('tool:before', h1)
        emitter.on('tool:before', h2)
        emitter.emit('tool:before', {
            toolName: 'read_file',
            agentType: 'search',
            args: {},
        })

        expect(h1.mock.calls.length).toBe(1)
        expect(h2.mock.calls.length).toBe(1)
    })

    it('removes handler with off', () => {
        const emitter = new TypedEventEmitter()
        const handler = mock(() => {})

        emitter.on('agent:complete', handler)
        emitter.off('agent:complete', handler)
        emitter.emit('agent:complete', { agentType: 'code', taskId: '1', duration: 100 })

        expect(handler.mock.calls.length).toBe(0)
    })

    it('removeAll clears all handlers', () => {
        const emitter = new TypedEventEmitter()
        const handler = mock(() => {})

        emitter.on('agent:start', handler)
        emitter.removeAll()
        emitter.emit('agent:start', { agentType: 'search', taskId: '1' })

        expect(handler.mock.calls.length).toBe(0)
    })

    it('swallows handler exceptions', () => {
        const emitter = new TypedEventEmitter()
        const badHandler = mock(() => {
            throw new Error('boom')
        })
        const goodHandler = mock(() => {})

        emitter.on('agent:start', badHandler)
        emitter.on('agent:start', goodHandler)
        emitter.emit('agent:start', { agentType: 'search', taskId: '1' })

        expect(badHandler.mock.calls.length).toBeGreaterThan(0)
        expect(goodHandler.mock.calls.length).toBeGreaterThan(0)
    })
})

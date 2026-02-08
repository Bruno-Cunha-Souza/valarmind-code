import { describe, it, expect, mock } from 'bun:test'
import { TypedEventEmitter } from '../../../src/core/events.js'
import { createProgressTracker } from '../../../src/cli/progress.js'

function createMockSpinner() {
    return {
        message: mock((_msg: string) => {}),
        start: mock((_msg: string) => {}),
    }
}

describe('ProgressTracker', () => {
    it('updates spinner message on agent:start', () => {
        const eventBus = new TypedEventEmitter()
        const spinner = createMockSpinner()
        createProgressTracker(eventBus, spinner)

        eventBus.emit('agent:start', { agentType: 'search', taskId: 't1' })

        expect(spinner.message).toHaveBeenCalledWith('Searching code...')
    })

    it('ignores orchestrator agent:start', () => {
        const eventBus = new TypedEventEmitter()
        const spinner = createMockSpinner()
        createProgressTracker(eventBus, spinner)

        eventBus.emit('agent:start', { agentType: 'orchestrator', taskId: 't1' })

        expect(spinner.message).not.toHaveBeenCalled()
    })

    it('restarts spinner when agent:start fires after notifySpinnerStopped', () => {
        const eventBus = new TypedEventEmitter()
        const spinner = createMockSpinner()
        const restartSpinner = mock(() => {})
        const tracker = createProgressTracker(eventBus, spinner, restartSpinner)

        tracker.notifySpinnerStopped()
        eventBus.emit('agent:start', { agentType: 'code', taskId: 't2' })

        expect(restartSpinner).toHaveBeenCalledTimes(1)
        expect(spinner.message).toHaveBeenCalledWith('Writing code...')
    })

    it('does NOT restart spinner if restartSpinner callback not provided', () => {
        const eventBus = new TypedEventEmitter()
        const spinner = createMockSpinner()
        const tracker = createProgressTracker(eventBus, spinner)

        tracker.notifySpinnerStopped()
        // Should not throw even without restartSpinner
        eventBus.emit('agent:start', { agentType: 'code', taskId: 't2' })

        expect(spinner.message).toHaveBeenCalledWith('Writing code...')
    })

    it('does NOT restart spinner if spinner is still active', () => {
        const eventBus = new TypedEventEmitter()
        const spinner = createMockSpinner()
        const restartSpinner = mock(() => {})
        createProgressTracker(eventBus, spinner, restartSpinner)

        // Spinner is active by default, should NOT restart
        eventBus.emit('agent:start', { agentType: 'code', taskId: 't2' })

        expect(restartSpinner).not.toHaveBeenCalled()
    })

    it('dispose removes all listeners', () => {
        const eventBus = new TypedEventEmitter()
        const spinner = createMockSpinner()
        const tracker = createProgressTracker(eventBus, spinner)

        tracker.dispose()

        eventBus.emit('agent:start', { agentType: 'search', taskId: 't1' })
        expect(spinner.message).not.toHaveBeenCalled()
    })

    it('shows tool label on tool:before', () => {
        const eventBus = new TypedEventEmitter()
        const spinner = createMockSpinner()
        createProgressTracker(eventBus, spinner)

        eventBus.emit('tool:before', { toolName: 'glob', agentType: 'search', args: {} })

        expect(spinner.message).toHaveBeenCalledWith('Searching files...')
    })

    it('restores agent label on tool:after', () => {
        const eventBus = new TypedEventEmitter()
        const spinner = createMockSpinner()
        createProgressTracker(eventBus, spinner)

        eventBus.emit('agent:start', { agentType: 'search', taskId: 't1' })
        eventBus.emit('tool:before', { toolName: 'glob', agentType: 'search', args: {} })
        eventBus.emit('tool:after', { toolName: 'glob', agentType: 'search', duration: 100, success: true })

        // Last call should restore agent label
        const calls = (spinner.message as any).mock.calls
        expect(calls[calls.length - 1][0]).toBe('Searching code...')
    })
})

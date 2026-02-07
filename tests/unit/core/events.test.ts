import { describe, it, expect, vi } from 'vitest';
import { TypedEventEmitter } from '../../../src/core/events.js';

describe('TypedEventEmitter', () => {
  it('emits and handles events', () => {
    const emitter = new TypedEventEmitter();
    const handler = vi.fn();

    emitter.on('agent:start', handler);
    emitter.emit('agent:start', { agentType: 'search', taskId: '1' });

    expect(handler).toHaveBeenCalledWith({ agentType: 'search', taskId: '1' });
  });

  it('supports multiple handlers', () => {
    const emitter = new TypedEventEmitter();
    const h1 = vi.fn();
    const h2 = vi.fn();

    emitter.on('tool:before', h1);
    emitter.on('tool:before', h2);
    emitter.emit('tool:before', {
      toolName: 'read_file',
      agentType: 'search',
      args: {},
    });

    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('removes handler with off', () => {
    const emitter = new TypedEventEmitter();
    const handler = vi.fn();

    emitter.on('agent:complete', handler);
    emitter.off('agent:complete', handler);
    emitter.emit('agent:complete', { agentType: 'code', taskId: '1', duration: 100 });

    expect(handler).not.toHaveBeenCalled();
  });

  it('removeAll clears all handlers', () => {
    const emitter = new TypedEventEmitter();
    const handler = vi.fn();

    emitter.on('agent:start', handler);
    emitter.removeAll();
    emitter.emit('agent:start', { agentType: 'search', taskId: '1' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('swallows handler exceptions', () => {
    const emitter = new TypedEventEmitter();
    const badHandler = vi.fn(() => {
      throw new Error('boom');
    });
    const goodHandler = vi.fn();

    emitter.on('agent:start', badHandler);
    emitter.on('agent:start', goodHandler);
    emitter.emit('agent:start', { agentType: 'search', taskId: '1' });

    expect(badHandler).toHaveBeenCalled();
    expect(goodHandler).toHaveBeenCalled();
  });
});

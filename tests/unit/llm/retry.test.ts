import { describe, it, expect, vi } from 'vitest';
import { withRetry, CircuitBreaker } from '../../../src/llm/retry.js';
import { TransientError, PermanentError } from '../../../src/core/errors.js';

describe('withRetry', () => {
  it('returns on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxRetries: 3, baseDelay: 10, maxDelay: 100 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('retries on transient error', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new TransientError('timeout'))
      .mockResolvedValueOnce('recovered');

    const result = await withRetry(fn, { maxRetries: 3, baseDelay: 10, maxDelay: 100 });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws immediately on permanent error', async () => {
    const fn = vi.fn().mockRejectedValue(new PermanentError('invalid key'));
    await expect(
      withRetry(fn, { maxRetries: 3, baseDelay: 10, maxDelay: 100 }),
    ).rejects.toThrow('invalid key');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('throws after max retries', async () => {
    const fn = vi.fn().mockRejectedValue(new TransientError('timeout'));
    await expect(
      withRetry(fn, { maxRetries: 2, baseDelay: 10, maxDelay: 100 }),
    ).rejects.toThrow('timeout');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});

describe('CircuitBreaker', () => {
  it('starts in closed state', () => {
    const breaker = new CircuitBreaker();
    expect(breaker.getState()).toBe('closed');
  });

  it('opens after threshold failures', async () => {
    const breaker = new CircuitBreaker(2, 100);
    const fail = () => Promise.reject(new Error('fail'));

    await expect(breaker.execute(fail)).rejects.toThrow();
    await expect(breaker.execute(fail)).rejects.toThrow();
    expect(breaker.getState()).toBe('open');

    await expect(breaker.execute(fail)).rejects.toThrow('Circuit breaker is open');
  });

  it('recovers after cooldown', async () => {
    const breaker = new CircuitBreaker(1, 50);
    await expect(breaker.execute(() => Promise.reject(new Error('x')))).rejects.toThrow();
    expect(breaker.getState()).toBe('open');

    await new Promise((r) => setTimeout(r, 60));
    const result = await breaker.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
    expect(breaker.getState()).toBe('closed');
  });
});

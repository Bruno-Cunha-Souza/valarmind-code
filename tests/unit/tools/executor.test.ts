import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { ToolExecutor } from '../../../src/tools/executor.js';
import { ToolRegistry } from '../../../src/tools/registry.js';
import { PermissionManager } from '../../../src/permissions/manager.js';
import { Tracer } from '../../../src/tracing/tracer.js';
import { TypedEventEmitter } from '../../../src/core/events.js';
import type { AnyTool, ToolContext } from '../../../src/tools/types.js';
import type { ResolvedConfig } from '../../../src/config/schema.js';
import pino from 'pino';

const mockLogger = pino({ level: 'silent' });
const mockConfig = {
  logLevel: 'silent',
  permissionMode: 'auto',
} as ResolvedConfig;

function createExecutor(tools: AnyTool[]) {
  const registry = new ToolRegistry();
  for (const tool of tools) registry.register(tool);

  const pm = new PermissionManager(mockConfig, mockLogger);
  const tracer = new Tracer(mockLogger, new TypedEventEmitter());
  return new ToolExecutor(registry, pm, tracer);
}

const dummyCtx: ToolContext = {
  fs: {} as never,
  cwd: '/test',
  agentType: 'code',
};

describe('ToolExecutor', () => {
  it('returns error for unknown tool', async () => {
    const executor = createExecutor([]);
    const result = await executor.executeSafe('unknown', {}, dummyCtx, {
      agentPermissions: { read: true, write: true, execute: false, spawn: false },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not found');
  });

  it('returns error for invalid params', async () => {
    const tool: AnyTool = {
      name: 'test_tool',
      description: 'test',
      parameters: z.object({ path: z.string() }),
      requiredPermission: 'read',
      execute: async () => 'ok',
    };
    const executor = createExecutor([tool]);
    const result = await executor.executeSafe('test_tool', { path: 123 }, dummyCtx, {
      agentPermissions: { read: true, write: false, execute: false, spawn: false },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Invalid params');
  });

  it('returns error for permission denied', async () => {
    const tool: AnyTool = {
      name: 'write_tool',
      description: 'writes',
      parameters: z.object({}),
      requiredPermission: 'write',
      execute: async () => 'ok',
    };
    const executor = createExecutor([tool]);
    const result = await executor.executeSafe('write_tool', {}, dummyCtx, {
      agentPermissions: { read: true, write: false, execute: false, spawn: false },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Permission denied');
  });

  it('executes tool successfully', async () => {
    const tool: AnyTool = {
      name: 'echo',
      description: 'echoes',
      parameters: z.object({ text: z.string() }),
      requiredPermission: 'read',
      execute: async (input: unknown) => (input as { text: string }).text,
    };
    const executor = createExecutor([tool]);
    const result = await executor.executeSafe('echo', { text: 'hello' }, dummyCtx, {
      agentPermissions: { read: true, write: false, execute: false, spawn: false },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('hello');
  });

  it('catches execution errors and returns as text', async () => {
    const tool: AnyTool = {
      name: 'fail_tool',
      description: 'always fails',
      parameters: z.object({}),
      requiredPermission: 'read',
      execute: async () => {
        throw new Error('boom');
      },
    };
    const executor = createExecutor([tool]);
    const result = await executor.executeSafe('fail_tool', {}, dummyCtx, {
      agentPermissions: { read: true, write: false, execute: false, spawn: false },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('boom');
  });
});

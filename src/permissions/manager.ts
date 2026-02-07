import * as clack from '@clack/prompts';
import type { ResolvedConfig } from '../config/schema.js';
import type { ToolPermissions, Permission } from '../core/types.js';
import type { Logger } from '../logger/index.js';
import type { PermissionRequest, PermissionResult } from './types.js';

export class PermissionManager {
  private sessionAllowed = new Set<string>();

  constructor(
    private config: ResolvedConfig,
    private logger: Logger,
  ) {}

  hasPermission(agentPermissions: ToolPermissions, required: Permission): boolean {
    switch (required) {
      case 'read':
        return agentPermissions.read;
      case 'write':
        return agentPermissions.write;
      case 'execute':
        return agentPermissions.execute;
      case 'spawn':
        return agentPermissions.spawn;
      case 'web':
        return agentPermissions.web ?? false;
      default:
        return false;
    }
  }

  async requestPermission(request: PermissionRequest): Promise<PermissionResult> {
    const key = `${request.toolName}:${request.permission}`;

    if (this.config.permissionMode === 'auto') {
      return { granted: true };
    }

    if (this.sessionAllowed.has(key)) {
      return { granted: true };
    }

    if (this.config.permissionMode === 'suggest') {
      this.logger.info({ tool: request.toolName, permission: request.permission }, 'permission:auto-granted');
      return { granted: true };
    }

    // ask mode
    const answer = await clack.confirm({
      message: `Permitir ${request.toolName} (${request.permission})? ${request.description}`,
    });

    if (clack.isCancel(answer) || !answer) {
      return { granted: false, reason: 'Negado pelo usuário' };
    }

    this.sessionAllowed.add(key);
    return { granted: true };
  }

  reset(): void {
    this.sessionAllowed.clear();
  }
}

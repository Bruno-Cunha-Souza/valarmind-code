import type { AgentType, ToolPermissions } from '../core/types.js';
import type { ChatMessage } from '../llm/types.js';
import type { WorkingState } from '../memory/types.js';

export interface AgentTask {
  id: string;
  type: string;
  description: string;
  context?: Record<string, unknown>;
  parentTaskId?: string;
}

export interface AgentResult {
  taskId: string;
  success: boolean;
  output: unknown;
  filesModified?: string[];
  filesCreated?: string[];
  summary: string;
  warnings?: string[];
  tokenUsage: { prompt: number; completion: number };
}

export interface AgentContext {
  sessionId: string;
  workingState: WorkingState;
  projectContext: string;
  conversationHistory: ChatMessage[];
  signal: AbortSignal;
}

export interface AgentMessage {
  id: string;
  from: AgentType;
  to: AgentType;
  type: 'request' | 'response' | 'event';
  taskId: string;
  payload: unknown;
  timestamp: string;
}

export interface AgentConfig {
  type: AgentType;
  permissions: ToolPermissions;
  allowedTools: string[];
  timeout: { default: number; max: number };
  maxTurns: number;
}

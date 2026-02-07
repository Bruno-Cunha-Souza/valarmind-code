export interface Decision {
  id: string;
  title: string;
  why: string;
  ts: string;
}

export interface TaskEntry {
  id: string;
  title: string;
  status: 'open' | 'in_progress' | 'done';
  updated_at: string;
}

export interface WorkingState {
  schema_version: number;
  updated_at: string;
  goal: string;
  now: string;
  decisions_recent: Decision[];
  tasks_open: TaskEntry[];
  conventions: Record<string, string>;
}

export interface SessionEntry {
  timestamp: string;
  type: 'user' | 'assistant' | 'tool' | 'agent' | 'event';
  content: unknown;
}

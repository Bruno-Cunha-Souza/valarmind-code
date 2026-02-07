import type { Container } from '../core/container.js';
import { colors } from './ui.js';

interface SlashCommand {
  name: string;
  description: string;
  handler: (container: Container, args: string) => Promise<string>;
}

const commands: SlashCommand[] = [
  {
    name: '/help',
    description: 'Mostra ajuda',
    handler: async () => {
      const lines = commands.map((c) => `  ${colors.bold(c.name.padEnd(12))} ${c.description}`);
      return `Comandos disponíveis:\n${lines.join('\n')}`;
    },
  },
  {
    name: '/status',
    description: 'Mostra estado atual',
    handler: async (container) => {
      const state = await container.stateManager.load();
      const parts: string[] = [];
      parts.push(`Model: ${container.config.model}`);
      if (state.goal) parts.push(`Goal: ${state.goal}`);
      if (state.now) parts.push(`Now: ${state.now}`);
      parts.push(`Open tasks: ${state.tasks_open.filter((t) => t.status !== 'done').length}`);
      return parts.join('\n');
    },
  },
  {
    name: '/agents',
    description: 'Lista agentes disponíveis',
    handler: async (container) => {
      const agents = container.agentRegistry.getAll();
      const lines = agents.map((a) => `  ${colors.agent(a.type)} — tools: ${a.allowedTools.join(', ')}`);
      return `Agentes:\n${lines.join('\n')}`;
    },
  },
  {
    name: '/clear',
    description: 'Limpa histórico da conversa',
    handler: async (container) => {
      container.orchestrator.clearHistory();
      return 'Histórico limpo.';
    },
  },
  {
    name: '/init',
    description: 'Gera VALARMIND.md',
    handler: async (container) => {
      return container.orchestrator.process(
        'Analyze this project and generate a VALARMIND.md file following the Init Agent guidelines.',
      );
    },
  },
  {
    name: '/compact',
    description: 'Compacta state para TOON',
    handler: async (container) => {
      const { compactState } = await import('../memory/compactor.js');
      const state = await container.stateManager.load();
      const compact = await compactState(state);
      return `State compactado (${compact.length} chars):\n${compact}`;
    },
  },
  {
    name: '/exit',
    description: 'Sai do REPL',
    handler: async () => {
      process.exit(0);
    },
  },
];

export function getSlashCommands(): SlashCommand[] {
  return commands;
}

export async function handleSlashCommand(
  input: string,
  container: Container,
): Promise<string | null> {
  const [cmdName, ...rest] = input.trim().split(' ');
  const args = rest.join(' ');

  const cmd = commands.find((c) => c.name === cmdName);
  if (!cmd) return null;

  return cmd.handler(container, args);
}

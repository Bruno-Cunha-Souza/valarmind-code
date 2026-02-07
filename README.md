# ValarMind

CLI multi-agente para desenvolvimento de software, inspirada no Claude Code CLI e Codex CLI. Cada etapa do processo de desenvolvimento é tratada por um agente especialista.

> **Status:** Fase de especificação - apenas documentação, sem código fonte.

## Features

- **9 Agentes Especialistas** - Orchestrator, Search, Research, Code, Review, Test, Docs, QA, Init
- **Orquestração Hierárquica** - Orchestrator coordena agentes com permissões e ferramentas específicas
- **Quality Gates Automáticos** - Review e QA obrigatórios para código de risco
- **Memória Local** - Curto prazo (sessão) e médio prazo (VALARMIND.md, state.json)
- **Compactação TOON** - Até 40% economia de tokens
- **Plugins Híbridos** - MCP para ferramentas externas + plugins nativos para integração profunda
- **OpenRouter** - Acesso a múltiplos modelos (OpenAI, Anthropic, Google) com uma API key

## Arquitetura de Agentes

| Agente | Permissões | Responsabilidade |
|--------|------------|------------------|
| **Orchestrator** | Read, Spawn | Coordena agentes, cria planos, gerencia todo-list |
| **Search** | Read only | Descoberta e exploração de codebase |
| **Research** | Read, Web | Pesquisa externa (docs, CVEs, best practices) |
| **Code** | Read, Write | Implementação e modificação de código |
| **Review** | Read only | Code review, segurança, performance |
| **Test** | Read, Write, Execute | Execução e criação de testes |
| **Docs** | Read, Write | Documentação e ADRs |
| **QA** | Read, Execute | Validação de qualidade e build |
| **Init** | Read, Write | Geração de VALARMIND.md |

## CLI

```bash
# Instalação
bun install -g valarmind

# Modo interativo
valarmind

# Prompt único
valarmind -p "Add logout button to navbar"

# Plan mode (sem execução)
valarmind --plan -p "Implement user settings"

# Auto-approve em sandbox
valarmind -y --sandbox -p "Run tests and fix failures"
```

### Comandos

| Comando | Descrição |
|---------|-----------|
| `valarmind` | Inicia REPL interativo |
| `valarmind init` | Gera VALARMIND.md |
| `valarmind auth` | Configura autenticação OpenRouter |
| `valarmind config` | Gerencia configuração |
| `valarmind doctor` | Diagnóstico do ambiente |

### Slash Commands (REPL)

`/init` `/compact` `/clear` `/help` `/status` `/plan` `/approve` `/reject` `/undo` `/diff` `/commit` `/agents` `/tasks`

## Configuração

```
~/.config/valarmind/
├── credentials.json     # API key (chmod 600)
└── config.json          # Preferências

<projeto>/
├── VALARMIND.md         # Instruções do projeto (versionado)
├── VALARMIND.local.md   # Preferências locais (gitignored)
└── .valarmind/
    ├── config.json      # Config do projeto
    └── memory/
        ├── state.json   # Estado operacional
        └── state.toon   # Versão compacta
```

## Plugins

### MCP Servers

```json
{
  "mcp": {
    "servers": {
      "postgres": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-postgres"],
        "env": { "DATABASE_URL": "${DATABASE_URL}" }
      }
    }
  }
}
```

### Tipos de Plugin Nativo

| Tipo | Uso |
|------|-----|
| Agent Plugin | Agentes especializados (Terraform, K8s) |
| Provider Plugin | LLM providers alternativos (Ollama) |
| Hook Plugin | Extensão do ciclo de vida (audit, CI/CD) |
| Formatter Plugin | Formatos de output (JUnit XML) |

## Documentação

| Documento | Conteúdo |
|-----------|----------|
| [docs/agents.md](docs/agents.md) | Arquitetura de 9 agentes especialistas |
| [docs/general.md](docs/general.md) | Workflow e agentic loop |
| [docs/memory.md](docs/memory.md) | Memória local e formato TOON |
| [docs/init.md](docs/init.md) | Geração de VALARMIND.md |
| [docs/cli.md](docs/cli.md) | Comandos, opções e hooks da CLI |
| [docs/plugins.md](docs/plugins.md) | Sistema de plugins MCP e nativos |

## Stack

| Tecnologia | Uso |
|------------|-----|
| TypeScript | Linguagem |
| Bun | Runtime |
| OpenRouter API | Provider de modelos |
| Zod | Validação de schemas |
| Commander.js | CLI parsing |
| @toon-format/toon | Compactação de prompts |
| @modelcontextprotocol/sdk | Cliente MCP |
| Biome | Formatting e linting |
| Vitest | Testes |
| Pino | Logging |
| Execa | Execução de comandos |

## Roadmap

### Fase 1: Foundation
- [ ] Interfaces TypeScript para agentes
- [ ] Protocolo de comunicação inter-agentes
- [ ] Orchestrator básico com todo-list
- [ ] Estrutura `.valarmind/memory/`

### Fase 2: Core Agents
- [ ] Search Agent
- [ ] Research Agent
- [ ] Init Agent
- [ ] Code Agent
- [ ] Test Agent

### Fase 3: Quality Agents
- [ ] Review Agent
- [ ] QA Agent
- [ ] Docs Agent

### Fase 4: Integration
- [ ] Agentic loop completo
- [ ] Prompt assembly com token budget
- [ ] Compactação TOON

### Fase 5: Plugins
- [ ] MCP Manager
- [ ] Plugin Manager
- [ ] Segurança e sandboxing

## Referências

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [TOON Format](https://github.com/toon-format/toon)
- [OpenRouter](https://openrouter.ai/)

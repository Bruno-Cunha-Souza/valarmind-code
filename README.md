# ValarMind

Multi-agent CLI for software development, inspired by Claude Code CLI and Codex CLI. Each step of the development process is handled by a specialist agent.

> **Status:** Phase 1-4 implemented — Foundation, Core Agents, Quality Agents, and Integration functional.

## Features

- **9 Specialist Agents** - Orchestrator, Search, Research, Code, Review, Test, Docs, QA, Init
- **Hierarchical Orchestration** - Orchestrator coordinates agents with specific permissions and tools
- **Automatic Quality Gates** - Review and QA required for risky code
- **Local Memory** - Short-term (session) and medium-term (VALARMIND.md, state.json)
- **TOON Compaction** - Up to 40% token savings
- **Hybrid Plugins** - MCP for external tools + native plugins for deep integration
- **OpenRouter** - Access to multiple models (OpenAI, Anthropic, Google) with a single API key

## Agent Architecture

| Agent            | Permissions          | Responsibility                                    |
| ---------------- | -------------------- | ------------------------------------------------- |
| **Orchestrator** | Read, Spawn          | Coordinates agents, creates plans, manages tasks  |
| **Search**       | Read only            | Codebase discovery and exploration                |
| **Research**     | Read, Web            | External research (docs, CVEs, best practices)    |
| **Code**         | Read, Write          | Code implementation and modification              |
| **Review**       | Read only            | Code review, security, performance                |
| **Test**         | Read, Write, Execute | Test execution and creation                       |
| **Docs**         | Read, Write          | Documentation and ADRs                            |
| **QA**           | Read, Execute        | Quality validation and build                      |
| **Init**         | Read, Write          | VALARMIND.md generation                           |

## CLI

```bash
# Install
bun install -g valarmind

# Interactive mode
valarmind

# Single prompt
valarmind -p "Add logout button to navbar"

# Plan mode (no execution)
valarmind --plan -p "Implement user settings"

# Auto-approve in sandbox
valarmind -y --sandbox -p "Run tests and fix failures"
```

### Commands

| Command            | Description                    |
| ------------------ | ------------------------------ |
| `valarmind`        | Start interactive REPL         |
| `valarmind init`   | Generate VALARMIND.md          |
| `valarmind auth`   | Configure OpenRouter auth      |
| `valarmind config` | Manage configuration           |
| `valarmind doctor` | Environment diagnostics        |

### Slash Commands (REPL)

`/init` `/compact` `/clear` `/help` `/status` `/plan` `/approve` `/reject` `/undo` `/diff` `/commit` `/agents` `/tasks`

## Configuration

```
~/.config/valarmind/
├── credentials.json     # API key (chmod 600)
└── config.json          # User preferences

<project>/
├── VALARMIND.md         # Project instructions (versioned)
├── VALARMIND.local.md   # Local preferences (gitignored)
└── .valarmind/
    ├── config.json      # Project config
    └── memory/
        ├── state.json   # Operational state
        └── state.toon   # Compact version
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

### Native Plugin Types

| Type             | Use                                       |
| ---------------- | ----------------------------------------- |
| Agent Plugin     | Domain-specific agents (Terraform, K8s)   |
| Provider Plugin  | Alternative LLM providers (Ollama)        |
| Hook Plugin      | Lifecycle extensions (audit, CI/CD)       |
| Formatter Plugin | Output formats (JUnit XML)                |

## Documentation

| Document                                     | Contents                          |
| -------------------------------------------- | --------------------------------- |
| [docs/agents.md](docs/agents.md)             | 9 specialist agents architecture  |
| [docs/general.md](docs/general.md)           | Workflow and agentic loop         |
| [docs/memory.md](docs/memory.md)             | Local memory and TOON format      |
| [docs/init.md](docs/init.md)                 | VALARMIND.md generation           |
| [docs/cli.md](docs/cli.md)                   | Commands, options and CLI hooks   |
| [docs/plugins.md](docs/plugins.md)           | MCP and native plugin system      |
| [docs/architecture.md](docs/architecture.md) | Technical architecture and ADRs   |

## Stack

| Technology                | Use                  |
| ------------------------- | -------------------- |
| TypeScript                | Language             |
| Bun                       | Runtime              |
| OpenRouter API            | Model provider       |
| Zod                       | Schema validation    |
| Commander.js              | CLI parsing          |
| @toon-format/toon         | Prompt compaction    |
| @modelcontextprotocol/sdk | MCP client           |
| Biome                     | Formatting & linting |
| Bun Test                  | Testing              |
| Pino                      | Logging              |
| Execa                     | Command execution    |

## Roadmap

### Phase 1: Foundation

- [x] TypeScript interfaces for agents
- [x] Inter-agent communication protocol
- [x] Basic Orchestrator with todo-list
- [x] `.valarmind/memory/` structure

### Phase 2: Core Agents

- [x] Search Agent
- [x] Research Agent
- [x] Init Agent
- [x] Code Agent
- [x] Test Agent

### Phase 3: Quality Agents

- [x] Review Agent (code review, security, performance, auto-fix loop)
- [x] QA Agent (build, lint, typecheck, tests via bash)
- [x] Docs Agent (documentation generation and maintenance)
- [x] Agent registration (8 agents total)
- [x] Result parser (balanced brace JSON extraction)
- [x] Quality gates integration in Orchestrator

### Phase 4: Integration

- [x] PromptBuilder integration in AgentRunner (priority-based sections, token budget)
- [x] TOON compaction verification
- [x] Hook integration (PreToolUse, PostToolUse, SessionEnd, PreCompact)
- [x] Streaming in REPL (AsyncIterable for direct answers)
- [x] Plan mode (createPlan, executePendingPlan, rejectPendingPlan, updatePlanTask)
- [x] New slash commands (/plan, /approve, /reject, /tasks, /undo, /diff, /commit)
- [x] MetricsCollector (token tracking, invocations, errors per agent via EventBus)
- [x] Integration tests (orchestrator flow, plan mode, hooks)

### Phase 5: Web Search, Plugins & Deferred

- [ ] Web search via OpenRouter `:online` suffix (Research Agent uses `model:online` for real-time web grounding)
- [ ] Web fetch with Turndown HTML-to-Markdown + cheap model summarization
- [ ] Tree-sitter repo map for structural code understanding (all agents, Aider-style)
- [ ] MCP Manager (stdio/SSE transport)
- [ ] Plugin Manager (native plugins)
- [ ] Security and sandboxing

### Future (not planned)

- LSP integration via MCP (Serena pattern — user installs language-specific MCP servers)

## References

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [TOON Format](https://github.com/toon-format/toon)
- [OpenRouter](https://openrouter.ai/)

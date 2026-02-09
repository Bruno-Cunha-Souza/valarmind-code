# ValarMind Code

Multi-agent CLI for software development, inspired by Claude Code CLI and Codex CLI. Each step of the development process is handled by a specialist agent.

> **Status:** Phase 1-5 implemented — Foundation, Core Agents, Quality Agents, Integration, Web Search, Plugins & Sandboxing functional. Multi-line input and live config editing available.

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
| **Init**         | Read only            | VALARMIND.md generation                           |

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

`/init` `/compact` `/clear` `/help` `/status` `/model` `/settings` `/plan` `/approve` `/reject` `/undo` `/diff` `/commit` `/agents` `/tasks`

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

- [x] Web search via OpenRouter `:online` suffix (Research Agent uses `model:online` for real-time web grounding)
- [x] Web fetch with Turndown HTML-to-Markdown + cache
- [x] Tree-sitter repo map for structural code understanding (web-tree-sitter WASM)
- [x] MCP Manager (stdio/StreamableHTTP transport)
- [x] MCP tool bridge (namespace `mcp__server__tool`)
- [x] Plugin Manager (HookPlugin, AgentPlugin, ProviderPlugin)
- [x] Security sandboxing (per-agent profiles, macOS sandbox-exec, Linux bubblewrap)

### Phase 6: Hardening & Bug Fixes

- [ ] Wire `ModelRouter` in container (agent-specific model routing via cost tiers)
- [ ] Fix `SandboxManager.isAvailable()` exit code verification
- [ ] Fix streaming plan leakage in `processStream()` (buffer before yield)
- [ ] Harden macOS sandbox (deny-default or migrate to @anthropic-ai/sandbox-runtime)
- [ ] Implement network restrictions on macOS (currently Linux-only)
- [ ] Add retry/circuit breaker to `chatStream()` streaming path
- [ ] Sanitize process.env before passing to hooks (filter secrets)
- [ ] Refactor `AgentRunner` constructor to deps object pattern
- [ ] Fix `finish_reason: 'length'` hardcoded `write_file` instruction
- [ ] Fix container `shutdown()` error handling (Promise.allSettled)
- [ ] Align types and documentation (permissions, timeouts, i18n)
- [ ] Improve TOON compactor (module caching, savings threshold for state)
- [ ] Fix streaming tool call accumulation across chunks

### Phase 7: Test Coverage Expansion

- [ ] Integration tests for CLI REPL (slash commands, session lifecycle)
- [ ] Authentication flow tests (first-run, validation, credentials)
- [ ] Unit tests for individual tools (glob, grep, bash, edit, read, write)
- [ ] Error scenario tests (network timeout, permission denied, malformed)
- [ ] Sandbox execution tests (real command wrapping, deny rules)

### Phase 8: Architecture Evolution

- [ ] Plan execution checkpointing (resume-from-failure)
- [ ] Parallel tool execution for read-only I/O-bound tools
- [ ] Real token counter (tiktoken/gpt-tokenizer replacing char-based heuristic)
- [ ] PromptBuilder gradual truncation (partial sections instead of binary drop)
- [ ] Model-aware cache control (Anthropic-only via OpenRouter)
- [ ] Semantic tool result caching between agents in same plan
- [ ] MCP spec updates (Tool Output Schemas, Elicitation, Resource Indicators)
- [ ] Repo map caching with file-hash invalidation
- [ ] IDE integration (VS Code extension or Language Server mode)

### Future (not planned)

- LSP integration via MCP (Serena pattern — user installs language-specific MCP servers)

## References

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [TOON Format](https://github.com/toon-format/toon)
- [OpenRouter](https://openrouter.ai/)

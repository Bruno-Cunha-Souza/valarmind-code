# Arquitetura ValarMind Code

## Visão Geral

ValarMind Code é uma CLI multi-agente single-process usando async/await. Agentes rodam como chamadas LLM com tool-use, coordenados por um Orchestrator central.

```
User → CLI → Bootstrap → Orchestrator → Agent(s) → Tools → Result → User
```

## Decisões Arquiteturais

| Decisão | Escolha | Motivo |
|---------|---------|--------|
| Processo | Single + async/await | LLM calls são I/O-bound (Codex CLI, Claude Code) |
| Paralelismo | Promise.all() | Sem worker threads, agentes independentes em paralelo |
| DI | Composition root manual | Sem framework, `createContainer()` (Aider, Codex CLI) |
| Comunicação | Chamadas diretas + EventBus tipado | Diretas para fluxo principal, eventos para cross-cutting |
| File I/O | Bun.file() via abstração | FileSystem interface para testabilidade |
| Testes | Bun Test (nativo) | Runtime nativo, zero dependências extras |
| Tool errors | Retornados como texto ao LLM | Nunca lançam exceção (OpenAI Agents SDK) |
| Timeouts | AbortController por agente | Pattern nativo, cancelamento limpo |
| Sub-agentes | Profundidade máx 1 | Previne explosão recursiva (Claude Code, Aider) |
| Tracing | Hierárquico desde dia 1 | Spans aninhados (OpenAI Agents SDK) |
| Tools | Zod-first com .describe() | Schema → JSON Schema automático para LLM |
| Code understanding | Tree-sitter repo map (WASM) | Stateless, 30+ linguagens via WASM grammars, sem server lifecycle (Aider) |
| LSP | Não planejado (futuro via MCP) | Complexidade desproporcional ao ganho; diagnostics via bash + tree-sitter cobrem 80% |
| MCP transport | StreamableHTTP (remoto) + stdio (local) | SSE deprecado, StreamableHTTP é o padrão oficial |
| Sandbox | Profiles por agente, optional | Limita filesystem e network por tipo de agente |

## Estrutura de Módulos

```
src/
├── core/               # Tipos, errors, Result<T>, FileSystem, EventBus, Container
├── config/             # Zod schemas, loader hierárquico, defaults
├── logger/             # Pino setup
├── auth/               # Credentials CRUD, API key validation
├── tracing/            # Tracer, Span, TraceExporter
├── llm/                # OpenAI SDK + OpenRouter, retry, circuit breaker, prompt builder
├── permissions/        # PermissionManager, modos auto/suggest/ask
├── tools/              # Registry, Executor, implementações (filesystem, shell, web, code)
├── memory/             # StateManager, compactor TOON, session recorder, context loader
├── agents/             # BaseAgent, AgentRunner, AgentRegistry, agentes especializados
├── hooks/              # HookRunner (shell commands em eventos)
├── mcp/                # MCPManager, tool-bridge (stdio/StreamableHTTP)
├── plugins/            # PluginManager (HookPlugin, AgentPlugin, ProviderPlugin)
├── security/           # SandboxManager (profiles per agent, macOS/Linux)
├── code-understanding/ # Tree-sitter parser, RepoMapper (WASM-based)
└── cli/                # Commander.js, REPL, slash commands, prompts @clack
```

## Design Patterns

### Composition Root
`createContainer(config)` instancia todos os serviços na ordem correta. Cada serviço recebe apenas dependências diretas.

### Strategy — Agentes
`BaseAgent` abstrato define interface. `AgentRunner` executa o agentic loop genérico.

### Command — Tools
Tools definidas com Zod schemas. `ToolExecutor.executeSafe()` nunca lança exceção.

### Observer — EventBus
`TypedEventEmitter` para cross-cutting: logging, tracing, hooks, CLI spinners.

### Result<T, E>
Errors as values para operações que podem falhar previsivelmente.

## Fluxo Principal

### Bootstrap
```
CLI parse → Load env/configs → Validate (Zod) → Check auth → createContainer() → Load context → Ready
```

### Prompt Processing
```
Input → Hook:UserPromptSubmit → Orchestrator classifica
  → Direto? → Responde
  → Complexo? → Cria plano → Delega para agentes (paralelo onde possível)
  → Sintetiza resultado → Atualiza state.json → Output
```

### Agentic Loop (AgentRunner)
```
system_prompt + task → loop(max_turns):
  LLM.chat(messages, tools) →
    stop? → return result
    tool_calls? → validate permissions → execute (error as text) → append to messages
  timeout/max_turns → partial result
```

## Comunicação Inter-Agentes

Hub-and-spoke via Orchestrator. Agentes não se comunicam diretamente.

```
User → Orchestrator → [Search, Research] (paralelo) → Code → [Review, QA] → User
```

Profundidade máxima: 1. Sub-agentes não spawnam outros agentes.

## Quality Gates

Pipeline automático pós-Code Agent para mudanças multi-arquivo ou código de risco:

```
Code Agent → requiresReview() → Review Agent → parseReviewOutput()
  → Não aprovado? → Code Agent (auto-fix) → Re-review (max 2 iterações)
  → Aprovado? → requiresQA() → QA Agent → parseQAOutput()
```

Result parser usa balanced brace matching para extração segura de JSON de outputs LLM.

## Plan Mode

Orchestrator suporta criação e execução separadas de planos:

```
createPlan() → pendingPlan armazenado → executePendingPlan() | rejectPendingPlan()
updatePlanTask(index, changes) → editar tasks antes de aprovar
```

## Métricas

`MetricsCollector` escuta eventos do `TypedEventEmitter`:
- `agent:start/complete/error` → invocações, duração, erros por agente
- `token:usage` → tokens por agente e sessão
- `tool:after` → contagem de tool calls

## Error Handling (3 camadas)

1. **Classificação**: transient (429, 5xx, timeout) vs permanent (401, 400)
2. **Retry**: Backoff exponencial + jitter para transient errors
3. **Circuit Breaker**: Per-provider, CLOSED → OPEN → HALF_OPEN → CLOSED

## Grafo de Dependências

```
core → logger → config → auth → events → tracing → llm → permissions → tools → memory → agents → hooks → cli → index.ts
                                                                    ↑
                                                              mcp/manager
                                                              mcp/tool-bridge
                                                              plugins/manager
                                                              security/sandbox
                                                              code-understanding/parser
                                                              code-understanding/repo-map
```

## Web Search

Research Agent usa OpenRouter `:online` suffix para web search em tempo real, sem API key adicional.

```
Research Agent → LLMClient.chat({ model: "modelo:online" }) → OpenRouter Web Plugin (Exa) → annotations com url_citation
```

| Decisão | Escolha | Motivo |
|---------|---------|--------|
| Provider | OpenRouter `:online` | Zero-config, usa mesma API key, ~$0.02/busca |
| Alternativa | Não implementada (Tavily/Brave como Layer 2 futuro) | Complexidade desnecessária para v1 |
| Content fetch | HTTP + Turndown (HTML→Markdown) com cache TTL 15 min | Mesmo pattern do Claude Code; `script`/`style`/`nav` removidos |
| Cache | TTL 15 min para páginas fetchadas, in-memory Map | Evita re-fetch desnecessário |

O suffix `:online` funciona com o OpenAI SDK porque é apenas parte do string do modelo — o SDK não valida e envia as-is para o OpenRouter.

## Referências

- [Codex CLI](https://github.com/openai/codex) — single process, composition root
- [Claude Code](https://claude.ai/code) — agent depth limits, tool error handling
- [Aider](https://github.com/paul-gauthier/aider) — no sub-agent recursion
- [OpenAI Agents SDK](https://openai.github.io/openai-agents-js/) — hierarchical tracing
- [OpenRouter Web Search](https://openrouter.ai/docs/guides/features/plugins/web-search) — `:online` suffix docs

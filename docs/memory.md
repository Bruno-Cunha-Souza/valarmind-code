# Local Memory Architecture

This document defines how to manage short and medium-term memory in local execution, maintaining useful context with controlled token cost.

## Objectives

- Maintain coherence and progress throughout the session (short-term)
- Persist project operational state between sessions (medium-term)
- Reduce token cost with compression and TOON usage in large contexts
- Run locally with Bun, TypeScript, and OpenAI SDK

## Principles

- Canonical source is always stored as JSON and plain text on disk
- Formats for prompt (TOON and summaries) are derived, not the source of truth
- Prompt is assembled with token budget and clear selection rules
- Nothing enters the prompt without reason — each inclusion generates an entry in the manifest

## Layer Overview

### Short-term (RAM)

Usage: immediate coherence, current flow execution, latest messages.

Typical content:

- Sliding window of the last N messages
- Execution state: current objective, touched files, decisions this session, ongoing tasks
- Current plan and short checklist

Rule:

- Everything still open stays in short-term
- When something is completed or stabilized, promote to medium-term

### Medium-term (local and versioned files)

Usage: continuity between sessions in the same repository.

Shared files (versioned in repo):

- `VALARMIND.md` — project instructions, conventions, shared rules

Local files (gitignored):

- `VALARMIND.local.md` — user's personal preferences
- `.valarmind/memory/state.json` — operational state
- `.valarmind/memory/state.toon` — compact version of state for prompt

Typical content of `state.json`:

- Current project objective
- `now` field with what is being done now
- Recent decisions (with date and reason)
- Repo conventions
- Open tasks and blockers

Update rules:

- Update at the end of each relevant task
- Update when there's a decision that changes the path
- Recompact state.toon when state.json grows

## Directory Structure

### Shared (versioned in repo)

```
VALARMIND.md
docs/adr/*.md
```

### Local (gitignored)

```
VALARMIND.local.md
.valarmind/
  memory/
    state.json
    state.toon
    schemas/
      state.schema.json
    jobs/
      compact.ts
      prompt.ts
  sessions/
    2026-01-31T12-00-00.jsonl
  cache/
    toon/
```

The key: everything inside `.valarmind/` can be disposable and rebuildable (cache and indexes), while `VALARMIND.md` and ADRs in the repo are the human and reviewable source.

## Data Model

### Working State (medium-term)

Example of `.valarmind/memory/state.json`:

```json
{
    "schema_version": 1,
    "updated_at": "2026-01-31T12:34:56-03:00",
    "goal": "Describe and implement the agent's local memory architecture",
    "now": "Implementing state compaction",
    "decisions_recent": [
        {
            "id": "ADR-0003",
            "title": "Use only short and medium-term memory",
            "why": "Simplicity for code CLI",
            "ts": "2026-01-31T12:00:00-03:00"
        }
    ],
    "tasks_open": [
        {
            "id": "T-21",
            "title": "Implement Working State compaction",
            "status": "open",
            "updated_at": "2026-01-31T12:10:00-03:00"
        }
    ],
    "conventions": {
        "language": "TypeScript",
        "runtime": "Bun",
        "testing": "bun test"
    }
}
```

Version for prompt (`.valarmind/memory/state.toon`):

```toon
goal: Describe and implement the agent's local memory architecture
now: Implementing state compaction
decisions_recent[1]{id,title,ts}:
  ADR-0003,Use only short and medium-term memory,2026-01-31T12:00:00-03:00
tasks_open[1]{id,title,status}:
  T-21,Implement Working State compaction,open
conventions:
  language: TypeScript
  runtime: Bun
  testing: bun test
```

Rules:

- Use `@toon-format/toon` for encode/decode and validate round trip
- Include only fields that help with the next decision
- Remove noise, logs, and detailed history

## TOON Strategy for Token Reduction

TOON (Token-Oriented Object Notation) is a compact and readable encoding format that optimizes JSON data for LLM input. We use the official package: https://github.com/toon-format/toon

### Why TOON?

- **Token savings**: Up to 40% fewer tokens than equivalent JSON
- **Tabular arrays**: Very efficient for uniform lists of objects
- **Readability**: Combines indented structure (YAML) with tabular layout (CSV)

### Practical Rules

- JSON is the canonical source
- TOON is a compact projection for prompt
- Use `@toon-format/toon` for encode/decode

### Main Usage: Working State Compaction

TOON is mainly used to compact `state.json` into `state.toon`, reducing tokens in the prompt.

### Usage Example with @toon-format/toon

```typescript
import { encode, decode } from "@toon-format/toon";

// Read state.json and convert to TOON
const state = await Bun.file(".valarmind/memory/state.json").json();
const toon = encode(state);

// Save compact version
await Bun.write(".valarmind/memory/state.toon", toon);

// Validate round trip
const decoded = decode(toon);
console.assert(JSON.stringify(state) === JSON.stringify(decoded));
```

### Recommended Content Pattern in TOON

- Current objective and context
- Recent decisions and constraints
- Open tasks and blockers
- Uniform lists (TOON is very efficient with tabular arrays)

## Prompt Assembly with Token Budget

### Recommended Order

1. System (instructions) and agent rules
2. Current objective + Working State (medium-term)
3. Conversation window (short-term)
4. Current task instructions

### Cutoff Policy

If budget is exceeded:

1. Compact Working State to TOON
2. Summarize the short-term window

### Prompt Manifest

Whenever assembling the prompt, record a JSON with:

```json
{
    "timestamp": "2026-01-31T12:34:56-03:00",
    "total_tokens": 2420,
    "budget_tokens": 4000,
    "items": [
        {
            "id": "state",
            "type": "working_state",
            "format": "toon",
            "tokens": 180,
            "reason": "always_included"
        },
        {
            "id": "conversation",
            "type": "short_term",
            "format": "text",
            "tokens": 1200,
            "reason": "recent_turns"
        }
    ]
}
```

This brings the principle "nothing enters the prompt without reason" to life.

## Local Implementation (Bun)

### OpenAI Client

```typescript
import OpenAI from "openai";

export const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});
```

### Call Example (Responses API)

```typescript
const response = await openai.responses.create({
    model: "gpt-4.1",
    instructions: systemPrompt, // Agent rules
    input: [
        {
            role: "user",
            content: userMessage,
        },
    ],
});

console.log(response.output_text);
```

To keep calls stateless and manually control context (recommended with token budget):

```typescript
// Don't use previous_response_id
// Build context explicitly in input
const response = await openai.responses.create({
    model: "gpt-4.1",
    instructions: systemPrompt,
    input: buildContextualInput(workingState, conversationWindow, task),
});
```

### Token Counting

To calibrate budget:

```typescript
const tokenCount = await openai.responses.inputTokens.count({
    model: "gpt-4.1",
    input: promptInput,
});

console.log(`Tokens: ${tokenCount.total_tokens}`);
```

## Parameters

- `SHORT_BUFFER_TURNS`: 20 to 80
- `MAX_CONTEXT_TOKENS`: total budget

## Quality Control

- Working State always fits in 250 to 750 tokens
- The prompt never carries more than one copy of the same content
- Round trip JSON ↔ TOON validated with `@toon-format/toon`

## Implementation Roadmap

### Phase 1: Foundation

**Objective:** Create base structure.

**Tasks:**

- [ ] Create directory structure `.valarmind/memory/`, `schemas/`, `jobs/`
- [ ] Create `state.schema.json` with JSON Schema

**Files:**

- `.valarmind/memory/schemas/state.schema.json`

**Completion criteria:** Schema validated with Ajv or similar.

---

### Phase 2: Working State

**Objective:** Persistence and compaction of operational state.

**Dependencies:** Phase 1.

**Tasks:**

- [ ] Install `@toon-format/toon` via bun
- [ ] Implement read/write of `state.json` with validation
- [ ] Implement `compact.ts` that generates `state.toon` using the official package
- [ ] Validate round trip JSON → TOON → JSON

**Files:**

- `.valarmind/memory/state.json`
- `.valarmind/memory/jobs/compact.ts`

**Completion criteria:** `bun run compact` generates `state.toon`, round trip passes.

---

### Phase 3: Prompt Assembly

**Objective:** Assemble prompt with token budget.

**Dependencies:** Phase 2.

**Tasks:**

- [ ] Implement token counting (via OpenAI API)
- [ ] Implement order: system → state → conversation → task
- [ ] Implement cutoff policy (compact state → summarize conversation)
- [ ] Generate JSON manifest

**Files:**

- `.valarmind/memory/jobs/prompt.ts`
- `src/memory/tokenCounter.ts`
- `src/memory/promptBuilder.ts`

**Completion criteria:** Prompt generated with manifest, tokens within budget.

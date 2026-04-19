---
name: solid-design
description: SOLID design principles, bounded contexts, port/adapter architecture, Result type
metadata:
  project: smruti-cortex
  version: "9.1"
---

# SOLID Design Principles

## Architecture Overview

The `src/background/` layer follows a ports-and-adapters (hexagonal) architecture:

```
src/background/
  service-worker.ts          # Thin bootstrap (~150 lines max)
  composition-root.ts        # Wires ports to adapters
  handlers/                  # Message handler registry + per-domain handlers
    registry.ts              # Open/Closed: register handlers without touching dispatcher
    search-handlers.ts
    settings-handlers.ts
    index-handlers.ts
    ollama-handlers.ts
    diagnostics-handlers.ts
  ports/                     # Interfaces (abstractions)
    database-port.ts
    ollama-port.ts
    history-port.ts
    storage-port.ts
  search/                    # Search bounded context
  ai/                        # AI/Ollama bounded context
```

## SOLID Principles Applied

### S — Single Responsibility
- Each handler file handles one domain (search, settings, indexing, AI, diagnostics).
- Each scorer in `src/background/search/scorers/` scores one dimension.
- `service-worker.ts` only bootstraps and delegates — no business logic.

### O — Open/Closed
- `handlers/registry.ts` lets you register new handlers without modifying the dispatcher.
- New scorers are added by creating a file in `scorers/` and registering — no switch/case changes.

### L — Liskov Substitution
- All port implementations are interchangeable. A `FakeDatabasePort` in tests behaves identically to `IndexedDBDatabasePort` in production from the handler's perspective.

### I — Interface Segregation
- Ports are narrow: `IDatabasePort` does not include Ollama methods. Each port serves one concern.

### D — Dependency Inversion
- Handlers depend on port interfaces, never on concrete implementations.
- `composition-root.ts` is the only place that knows about concrete adapters.

## Result Type

Use `Result<T, E>` from `src/core/result.ts` for operations that can fail:

```typescript
import { ok, err, Result } from '../core/result';

function parse(input: string): Result<Data, ParseError> {
  if (!input) return err({ code: 'EMPTY', message: 'Input is empty' });
  return ok(JSON.parse(input));
}
```

**NEVER** use `throw` for expected failures (network errors, validation, missing data). Throw only for programmer bugs (invariant violations).

## File Size Limits

| Target       | Max Lines | ESLint Rule |
|--------------|-----------|-------------|
| Production function | 80 | `max-lines-per-function` |
| Cyclomatic complexity | 15 | `complexity` |

These are enforced as warnings. Fix violations when touching affected code.

## Rules for AI Agents

1. **NEVER put business logic in `service-worker.ts`** — it delegates to handlers only.
2. **NEVER import a concrete adapter from a handler** — import the port interface.
3. **NEVER create a God Object** — if a file exceeds 500 lines, split it.
4. **NEVER use `chrome.*` or `indexedDB` directly in handlers** — go through ports.
5. When adding a new message type, create or extend a handler file and register it. Do not add a case/if to service-worker.ts.

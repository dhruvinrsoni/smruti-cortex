---
name: ai-ollama
description: AI keyword expansion, semantic embeddings, Ollama integration, and circuit breaker
metadata:
  project: smruti-cortex
  version: "8.0"
---

# AI & Ollama Integration

## Two Independent AI Features

SmrutiCortex has two optional AI features, both using local Ollama. They are **independent toggles**:

### 1. AI Keyword Expansion (`ollamaEnabled`)
- **What:** Sends query to an LLM (llama3.2:1b) which returns related search terms
- **Example:** "python tutorial" -> adds "django", "flask", "jupyter", "beginner"
- **How:** Single text-generation call per search query
- **Cache:** Results cached by query prefix (avoids redundant LLM calls while typing)
- **Setting:** `ollamaEnabled` toggle in settings

### 2. Semantic Search / Embeddings (`embeddingsEnabled`)
- **What:** Converts pages + queries into mathematical vectors, finds matches by meaning
- **Example:** "how to cook pasta" finds "Italian dinner recipes" (no keyword overlap)
- **How:** Embedding model (nomic-embed-text) generates vectors; cosine similarity scoring
- **Background:** Embedding processor runs during idle, generating vectors for indexed pages
- **Setting:** `embeddingsEnabled` toggle in settings

## Key Files

| File | Purpose |
|------|---------|
| `src/background/ai-keyword-expander.ts` | LLM query expansion with caching |
| `src/background/ollama-service.ts` | Ollama HTTP client, circuit breaker, memory pressure checks |
| `src/background/embedding-processor.ts` | Background embedding generation (idle-time, batched) |
| `src/background/embedding-text.ts` | Build text representation of items for embedding |
| `src/background/search/scorers/embedding-scorer.ts` | Cosine similarity scorer (weight 0.4 when enabled) |

## Two-Phase Search

When AI is enabled, search runs in two phases from the UI:

1. **Phase 1 (instant):** `skipAI: true` -- keyword-only search, returns in <50ms
2. **Phase 2 (delayed):** `skipAI: false` -- AI expansion + semantic, returns richer results

The UI shows Phase 1 results immediately, then replaces with Phase 2 when ready.

## Circuit Breaker

`ollama-service.ts` implements a circuit breaker pattern:
- Tracks consecutive Ollama failures
- Opens circuit after N failures (stops calling Ollama)
- Auto-resets after cooldown period
- Prevents cascading failures when Ollama is down

## Memory Pressure

`checkMemoryPressure()` in `ollama-service.ts`:
- Monitors memory usage before generating embeddings
- Skips embedding generation when memory is high
- Prevents the 14GB RAM leak that occurred with unbounded embedding generation

## Guardrails (search-engine.ts)

- Max 10 embeddings generated per search
- 5-second time budget for embedding generation
- Embeddings cleared from memory after scoring (persisted in IndexedDB)
- Search abort controller cancels in-flight requests on new search

## Ollama Settings

| Setting | Default | Purpose |
|---------|---------|---------|
| `ollamaEndpoint` | `http://localhost:11434` | Ollama API URL |
| `ollamaModel` | `llama3.2:1b` | Model for keyword expansion |
| `embeddingModel` | `nomic-embed-text:latest` | Model for embeddings |
| `ollamaTimeout` | 30000 (ms) | Max time for Ollama calls |
| `aiSearchDelayMs` | 500 (ms) | Debounce before Phase 2 fires |

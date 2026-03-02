# SmrutiCortex AI Architecture

## Overview

SmrutiCortex provides two optional AI features powered by **local Ollama**. All processing happens on-device — zero cloud calls, zero telemetry.

### 1. AI Keyword Expansion

**One LLM call per search** expands the query into synonyms and related terms.

- Query `"war"` → `["war", "battle", "combat", "conflict", "military"]`
- Results matching ANY expanded term get a **+20% score boost**
- Model: `llama3.2:1b` (configurable, any Ollama generation model works)
- Endpoint: `POST /api/generate` with JSON-only prompt

### 2. Semantic Search (Embeddings)

**Vector embeddings** find pages by meaning, not just keywords.

- Generates 768-dimension vectors for page content
- Cosine similarity scoring between query and page embeddings
- Persisted to IndexedDB (~4KB per page)
- Model: `nomic-embed-text` (configurable, any Ollama embedding model works)
- Endpoint: `POST /api/embed`
- Scorer weight: **0.4** in the 9-scorer pipeline

---

## Safety Layers

Every AI operation passes through multiple guard rails before reaching Ollama:

```
User Search Query
    │
    ├── Input Validation
    │   └── 200-char query limit (keyword expansion)
    │   └── 8,192-char text limit (embedding generation)
    │
    ├── Circuit Breaker
    │   └── 3 consecutive failures → trip
    │   └── 60-second cooldown → auto-reset
    │   └── Any success resets counter
    │
    ├── Memory Pressure Guard
    │   └── 512MB hard cap on extension JS heap
    │   └── Blocks ALL AI operations when exceeded
    │
    ├── Concurrent Request Limiter
    │   └── 1 Ollama slot at a time (semaphore)
    │   └── Prevents request storms
    │
    ├── Embedding Generation Caps
    │   └── Max 10 embeddings per search
    │   └── 5-second time budget per search
    │
    ├── Timeout
    │   └── Configurable (default 30s, max 120s)
    │   └── Even "infinite" (-1) capped at 120s
    │
    └── Graceful Degradation
        └── Falls back to pure keyword search
        └── Extension ALWAYS works without Ollama
```

### Circuit Breaker State Machine

```
CLOSED ──(3 failures)──► OPEN ──(60s elapsed)──► HALF-OPEN ──(success)──► CLOSED
                                                      │
                                                  (failure)
                                                      │
                                                      ▼
                                                    OPEN
```

- **CLOSED**: Normal operation. Failures increment counter.
- **OPEN**: All AI requests immediately return fallback. No Ollama calls.
- **HALF-OPEN**: After cooldown, allows ONE retry. Success → CLOSED, failure → OPEN.

---

## Persistent Keyword Cache

AI keyword expansions are cached in `chrome.storage.local` for long-term reuse:

| Property | Value |
|----------|-------|
| Storage key | `aiKeywordCache` |
| Max entries | 5,000 |
| TTL | 7 days |
| Eviction | LRU by hit count (bottom 10% removed) |
| Persistence | Debounced 2-second writes |
| Estimated size | ~1MB for 5,000 entries |

### Prefix Matching

When no exact match exists, the cache checks for **prefix matches**:

- Cached: `"github api"` → `["github", "api", "rest", "endpoints", "repository"]`
- User types: `"git"` → prefix matches `"github api"` → returns cached keywords
- Returns the **most-hit** prefix match (highest usage = most relevant)

This means the extension gets **faster over time** — common queries and their prefixes resolve from cache without any Ollama call.

---

## Required Models

| Feature | Model | Pull Command | Size | Purpose |
|---------|-------|-------------|------|---------|
| Keyword Expansion | `llama3.2:1b` ★ | `ollama pull llama3.2:1b` | 1.3 GB | Text generation for synonyms |
| Semantic Search | `nomic-embed-text` ★ | `ollama pull nomic-embed-text` | 274 MB | Vector embeddings |

### Alternative Models

**For keyword expansion** (any generation-capable model):
| Model | Size | Notes |
|-------|------|-------|
| `llama3.2:1b` ★ | 1.3 GB | Fast, good for simple tasks |
| `llama3.2:3b` ★ | 2.0 GB | Best balance of speed and quality |
| `mistral:7b` ★ | 4.1 GB | High quality, slower |
| `gemma2:2b` | 1.6 GB | Google's model |
| `phi3:mini` | 2.3 GB | Microsoft's model |
| `qwen2.5:1.5b` | 1.0 GB | Alibaba's model |

**For semantic search** (embedding-only models):
| Model | Size | Notes |
|-------|------|-------|
| `nomic-embed-text` ★ | 274 MB | Best balance of size and quality |
| `all-minilm` ★ | 46 MB | Lightest, fastest |
| `mxbai-embed-large` ★ | 670 MB | Highest quality |
| `snowflake-arctic-embed` | 669 MB | Retrieval-optimized |

### CORS Setup (Required)

Ollama blocks cross-origin requests by default. Set the environment variable:

```bash
# Windows
setx OLLAMA_ORIGINS "*"

# Mac/Linux
export OLLAMA_ORIGINS="*"

# Docker
docker run -e OLLAMA_ORIGINS="*" ...
```

Then restart Ollama.

---

## File Reference

| File | Purpose |
|------|---------|
| `src/background/ai-keyword-expander.ts` | LLM-based query expansion with prompt engineering |
| `src/background/ai-keyword-cache.ts` | Persistent keyword cache (chrome.storage.local) |
| `src/background/ollama-service.ts` | Ollama HTTP client, circuit breaker, memory guard, semaphore |
| `src/background/search/scorers/embedding-scorer.ts` | Cosine similarity scoring for embeddings |
| `src/background/search/scorer-manager.ts` | 9-scorer pipeline with dynamic embedding weight |
| `src/background/search/search-engine.ts` | Search orchestration, embedding generation caps |
| `src/background/resilience.ts` | Health monitoring, self-healing, retry with backoff |
| `src/core/settings.ts` | Schema-validated settings with defaults |

---

## Embedding Data Flow

```
1. User searches "machine learning"
2. search-engine.ts: expandQueryKeywords("machine learning")
   → ai-keyword-cache.ts: exact match? prefix match?
   → ai-keyword-expander.ts: call Ollama /api/generate
   → Result: ["machine", "learning", "ml", "ai", "neural", "deep"]
   → Cache result for 7 days

3. search-engine.ts: generateEmbedding("machine learning")
   → ollama-service.ts: POST /api/embed
   → Result: [0.123, -0.456, ...] (768 dimensions)

4. For each result item (max 10 per search, 5s budget):
   → If no embedding: generateItemEmbedding(item)
   → Save embedding to IndexedDB
   → Compute cosine similarity vs query embedding
   → Weight: 0.4 in total score

5. Score = Σ(scorer_weight × scorer_score) for all 9 scorers
6. Sort by score, return top results
7. Clean up: item.embedding = undefined (release memory)
```

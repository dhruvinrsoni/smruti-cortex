---
name: search-engine
description: Vivek Search scoring algorithm, tokenizer, graduated matching, and search orchestration
metadata:
  project: smruti-cortex
  version: "8.0"
---

# Search Engine (Vivek Search)

## Architecture

Search is orchestrated by `search-engine.ts` which calls into a modular scorer pipeline.

```
User query
  -> tokenize(query)
  -> synonym expansion (query-expansion.ts)
  -> [optional] AI keyword expansion (ai-keyword-expander.ts)
  -> [optional] query embedding (ollama-service.ts)
  -> score all items via 9-scorer pipeline
  -> post-score boosters (literal match, graduated title match, AI match)
  -> intent-priority sort -> diversity filter -> domain cap -> top 100
```

## Key Files

| File | Purpose |
|------|---------|
| `src/background/search/search-engine.ts` | Main orchestrator: `runSearch()` |
| `src/background/search/tokenizer.ts` | `tokenize()`, `classifyMatch()` (EXACT > PREFIX > SUBSTRING > NONE) |
| `src/background/search/scorer-manager.ts` | 9-scorer pipeline + `getAllScorers()` |
| `src/background/search/scorers/*.ts` | Individual scorers: title, url, recency, visitcount, meta, embedding |
| `src/background/search/diversity-filter.ts` | URL normalization, duplicate removal |
| `src/background/search/query-expansion.ts` | Local synonym map (no AI) |
| `src/background/search/search-cache.ts` | LRU cache with TTL (5 min, 100 entries) |
| `src/background/database.ts` | IndexedDB layer with in-memory cache for `getAllIndexedItems()` |

## Scorer Pipeline (9 scorers)

| Scorer | Weight | Signal |
|--------|--------|--------|
| `multiTokenMatch` | 0.35 | Multi-token coverage with graduated quality |
| `title` | 0.35 | Title relevance (position, consecutive, composition) |
| `crossDimensional` | 0.15 | Tokens matching across different fields |
| `url` | 0.12 | URL/hostname/path matching |
| `meta` | 0.10 | Meta description + keywords |
| `embedding` | 0.40/0.0 | Cosine similarity (only when embeddings enabled) |
| `recency` | dynamic | Time decay |
| `visitCount` | dynamic | Visit frequency |
| `domainFamiliarity` | 0.05 | Domain visit history (pre-computed map) |

## Match Classification (tokenizer.ts)

Graduated system replaces binary `includes()`:

- **EXACT** (1.0) -- word-boundary match: "app" in "App-My-Hub"
- **PREFIX** (0.75) -- start of word: "iss" in "Issue"
- **SUBSTRING** (0.4) -- inside word: "aviga" in "Navigator"
- **NONE** (0.0) -- no match

Regex is cached per token to avoid recompilation across 3000+ items.

## Performance

- Items cached in memory after first IndexedDB read (invalidated on writes)
- Domain visit counts pre-computed once per search (Map lookup, not O(n^2) filter)
- `originalTokens` pre-tokenized once and passed via `ScorerContext`
- Search cache (LRU) returns instant results for repeated queries

## Adding a New Scorer

1. Create `src/background/search/scorers/my-scorer.ts`
2. Export a `Scorer` object: `{ name, weight, score(item, query, allItems?, context?) }`
3. Import and add to the array in `scorer-manager.ts` `getAllScorers()`
4. Use `context?.originalTokens` (not `tokenize(query)`) for performance

## ScorerContext

```typescript
interface ScorerContext {
  expandedTokens?: string[];          // Original + AI-expanded keywords
  aiExpanded?: boolean;
  queryEmbedding?: number[];          // For embedding scorer
  originalTokens?: string[];          // Pre-tokenized query (use this!)
  domainVisitCounts?: Map<string, number>;  // Pre-computed domain stats
}
```

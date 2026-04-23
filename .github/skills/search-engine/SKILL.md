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
- **SUBSTRING** (0.4) -- inside word: "aviga" in "Navigator" **or** boundary-flex hit at a letter↔digit transition (e.g., `module42` vs `module 42`, `id1234` vs `ID-1234`)
- **NONE** (0.0) -- no match

Regex is cached per token to avoid recompilation across 3000+ items.

## Boundary-Flex Matching Contract (locked: `search-core-boundary-flex-v1`)

> **This is a change-control zone. Modifications require CODEOWNER review and may require a new ADR.**

`classifyMatch` accepts, at letter↔digit transitions inside the query token only, **one** non-alphanumeric separator character. Classified as `SUBSTRING` (0.4), never `EXACT`/`PREFIX`. Applies only when plain `text.includes(token)` already failed (strictly additive).

**Wiring.** `search-engine.ts` routes all five token-inclusion gates (`originalMatchCount`, `hasAiMatch`, `originalMatchedInHaystack`, `allOriginalTokensMatch`) through `matchesToken(token, haystack)` → `classifyMatch(token, haystack) !== NONE`. The **sixth** `haystack.includes(q)` site (full raw query literal) is deliberately untouched.

**Forbidden future relaxations** (see `docs/adr/0001-search-matching-contract.md`):

- No letter↔letter boundary relaxation (`foobar` must NOT flex to `foo bar`).
- No digit↔digit boundary relaxation.
- No multi-character separator chains (`module -- 42` stays unmatched).
- No alphanumeric middle separator (`moduleXX42` stays unmatched).
- No stemming / plural folding inside `classifyMatch`.
- No promotion of flex hits above `SUBSTRING`.

**Before touching `tokenizer.ts` or `search-engine.ts`:**

1. Read `docs/adr/0001-search-matching-contract.md`.
2. Keep `src/background/search/__tests__/tokenizer-golden.test.ts` green — every row flip requires explicit justification in the PR description.
3. Run `npm test && npm run build:prod && npx playwright test e2e/ranking-boundary-flex.spec.ts`.
4. Get sign-off from the `@dhruvinrsoni` search-core CODEOWNER.

**Diagnostic surface.** `src/background/ranking-report.ts` emits a per-token **Field Hits** column (`tracker[t,u,h] module42[t]`) and a top-of-report **partial-match banner** whenever no result covers all query tokens. Both respect `maskingLevel`. Use these to confirm boundary-flex decisions from a user-generated bug report without needing to reproduce the index.

**Revert:** `git revert` commits tagged `search-core-boundary-flex-v1`. Full procedure in the ADR.

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

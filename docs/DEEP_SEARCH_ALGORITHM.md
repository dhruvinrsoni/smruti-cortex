# SmrutiCortex Deep Search™ Algorithm

> **Version**: 1.0 — Introduced in SmrutiCortex v8.0  
> **Status**: Production  
> **Authors**: SmrutiCortex Team

---

## Overview

Deep Search is SmrutiCortex's multi-parameter, graduated relevance ranking algorithm that scores browser history results across **9 weighted dimensions** with **graduated match classification** — moving beyond binary substring matching to deliver Google-like search quality for local browser history.

### Key Innovation

Traditional browser history search uses binary matching: a token either matches or it doesn't. Deep Search introduces **graduated match classification** — distinguishing between exact keyword matches, prefix matches, and substring matches — to deliver dramatically better ranking for partial and multi-word queries.

---

## Table of Contents

<details>
<summary><strong>1. Match Classification System</strong></summary>

### 1.1 Match Types

Every query token is classified against each text field using a 4-tier hierarchy:

| Match Type | Score Weight | Description | Example |
|------------|-------------|-------------|---------|
| **EXACT** | 1.0 | Token matches at word boundaries | `rar` in `RAR-My-All` |
| **PREFIX** | 0.75 | Token matches start of a word | `iss` in `Issue Navigator` |
| **SUBSTRING** | 0.4 | Token appears inside a word | `aviga` in `Navigator` |
| **NONE** | 0.0 | No match found | `xyz` in `Issue Navigator` |

### 1.2 Classification Logic

```
classifyMatch(token, text):
  1. If text does NOT contain token → NONE
  2. If token matches at word boundary → EXACT
     Regex: (^|[^a-z0-9])TOKEN([^a-z0-9]|$)
  3. If token matches at start of a word → PREFIX
     Regex: (^|[^a-z0-9])TOKEN
  4. Otherwise → SUBSTRING (contained but mid-word)
```

### 1.3 Graduated Match Score

For a set of tokens against text:

$$\text{graduatedScore} = \frac{\sum_{i=1}^{n} w(\text{matchType}_i)}{n}$$

Where $w$ is the match weight function mapping MatchType → [0, 1].

**Example**: Query `rar my iss` against title `[RAR-My-All] Issue Navigator`:
- `rar` → EXACT (1.0)
- `my` → EXACT (1.0)  
- `iss` → PREFIX of "Issue" (0.75)
- Graduated score = $(1.0 + 1.0 + 0.75) / 3 = 0.917$

</details>

<details>
<summary><strong>2. Scoring Pipeline Architecture</strong></summary>

### 2.1 Scorer Weights

| Scorer | Weight | Description |
|--------|--------|-------------|
| **multiTokenMatch** | 0.35 | Cross-content graduated token coverage |
| **title** | 0.35 | Title relevance with position + phrase + composition |
| **recency** | 0.20 | Exponential time decay (30-day half-life) |
| **crossDimensional** | 0.15 | Cross-field keyword distribution |
| **visitCount** | 0.15 | Logarithmic visit frequency |
| **url** | 0.12 | URL path + hostname graduated matching |
| **meta** | 0.10 | Meta description/keywords graduated matching |
| **domainFamiliarity** | 0.05 | User behavior domain preference |
| **embedding** | 0.0/0.4 | AI semantic similarity (when enabled) |

**Total base weight**: ~1.47 (without AI) — scores are additive, not normalized to 1.0.

### 2.2 Scoring Flow

```
Query → Tokenize → Synonym Expand → [AI Expand] →
  For each IndexedItem:
    1. Pre-filter: haystack includes() gate (inclusive)
    2. Compute intent signals: title+url coverage, split-field detection
    3. Score: Run all 9 scorers with graduated classification
    4. Post-boost: Literal match (×1.5), graduated title quality, consecutive tokens, 
                   combined title+url boost (×1.40-1.60 for full coverage)
    5. Filter: Score threshold + strict matching + bookmark gate
  → Sort by intent priority → coverage → quality → score
  → Diversity filter → Domain cap → Top 100
```

### 2.3 Intent-Priority Ranking

For multi-token queries (2+ keywords), results are sorted by **intent priority** before score:

| Priority Tier | Condition | Example |
|---------------|-----------|---------|
| **Tier 3** | All tokens in title+URL, split across fields | `zaar-api` in URL + `console` in title |
| **Tier 2** | All tokens in title+URL, same field | `rar my all` all in title |
| **Tier 1** | ≥75% tokens in title+URL | 2 of 3 tokens matched |
| **Tier 0** | < 75% coverage | Partial matches, recency-driven results |

**Rationale**: User-specified multi-keyword queries are deliberate intent signals. A search for `zaar-api console` means the user wants a page with BOTH keywords, not just high-recency GitHub pages that happen to score well on frequency.

</details>

<details>
<summary><strong>3. Title Scorer — Deep Search Enhanced</strong></summary>

### 3.1 Signals

The title scorer computes 6 signals:

1. **Graduated match quality (expanded tokens)** — 30% of base
2. **Graduated match quality (original tokens)** — 70% of base
3. **Position bonus** — Matches earlier in title score higher (up to +0.15)
4. **Consecutive token bonus** — Phrase-like matches (up to +0.20)
5. **Composition bonus** — Quality distribution of matches:
   - All exact: +0.25
   - Mixed exact + partial: +0.10 to +0.22
   - All prefix: +0.08
6. **Starts-with bonus** — Title begins with query token (+0.08)

### 3.2 Formula

$$\text{titleScore} = 0.3 \times G_{\text{expanded}} + 0.7 \times G_{\text{original}} + P_{\text{position}} + C_{\text{consecutive}} + B_{\text{composition}} + S_{\text{startsWith}}$$

Capped at 1.0.

### 3.3 Example: "rar my iss" vs "[RAR-My-All] Issue Navigator"

| Signal | Value | Note |
|--------|-------|------|
| $G_{\text{original}}$ | 0.917 | (1.0 + 1.0 + 0.75) / 3 |
| $G_{\text{expanded}}$ | 0.917 | Same (no AI) |
| Position bonus | ~0.12 | Matches near start |
| Consecutive bonus | ~0.13 | "rar" → "my" consecutive |
| Composition bonus | ~0.18 | 2 exact + 1 prefix |
| Starts-with bonus | 0.00 | Title starts with "[" |
| **Total** | **~0.98** | Capped at 1.0 |

</details>

<details>
<summary><strong>4. Multi-Token Match Scorer — Deep Search Enhanced</strong></summary>

### 4.1 Purpose

Ensures multi-word queries heavily prioritize results matching ALL query terms. Uses graduated scoring so partial matches (prefix/substring) still earn proportional credit.

### 4.2 Formula

$$\text{score} = G^{1.3} + B_{\text{composition}} + C_{\text{consecutive}}$$

Where:
- $G$ = `graduatedMatchScore(tokens, haystack)` — quality-weighted coverage
- Composition bonus: up to +0.30 for all exact, proportional for mixed
- Consecutive bonus: up to +0.12 for phrase matches

### 4.3 Key Behavior

| Query | Title | Match Types | Score |
|-------|-------|-------------|-------|
| `rar my all` | [RAR-My-All] Issue Navigator | 3× EXACT | ~0.98 |
| `rar my iss` | [RAR-My-All] Issue Navigator | 2× EXACT + 1× PREFIX | ~0.85 |
| `rar my xyz` | [RAR-My-All] Issue Navigator | 2× EXACT + 1× NONE | ~0.42 |

</details>

<details>
<summary><strong>5. Post-Score Boosters</strong></summary>

### 5.1 Literal Match Boost

When the raw query string appears as a literal substring:

$$\text{score} \times 1.5$$

### 5.2 Graduated Title Quality Boost

Replaces the old binary "all exact = ×1.4" with graduated quality:

| Condition | Multiplier |
|-----------|-----------|
| All tokens EXACT in title | ×1.45 |
| Mixed exact + partial, all matched | ×(1.0 + quality × 0.40) |
| All prefix/substring, all matched | ×(1.0 + quality × 0.25) |
| All substring matches | ×1.10 |
| Partial coverage | ×(1.0 + graduated × 0.15) |

Where $\text{quality} = \frac{\sum w(\text{matchType}_i)}{n}$

### 5.3 Combined Title+URL Intent Boost

For multi-token queries (2+ keywords), applies graduated boosting based on combined `title + url` coverage:

| Coverage | Split Field? | Multiplier | Example |
|----------|-------------|-----------|---------|
| 100% | Yes | ×1.60 | `zaar-api` in URL + `console` in title |
| 100% | No | ×1.40 | `rar my all` all in title |
| ≥75% | — | ×1.15 | 2 of 3 tokens matched |

**Split Field Detection**: When at least one token appears only in the title and another only in the URL, the query is treated as cross-field intent (strongest boost).

### 5.4 Consecutive Token Boost

When query tokens appear consecutively in the title:

$$\text{score} \times (1.0 + \frac{\text{consecutivePairs}}{\text{maxPairs}} \times 0.10)$$

### 5.5 AI Match Boost

When match comes from AI-expanded keywords:

$$\text{score} \times 1.2$$

</details>

<details>
<summary><strong>6. Query Expansion</strong></summary>

### 6.1 Local Synonym Expansion

Fast, zero-latency synonym lookup with ~40 categories:
- `settings` → `preferences, options, config, configuration`
- `delete` → `remove, erase, trash, discard`
- `error` → `bug, issue, problem, fault, exception`

### 6.2 AI Keyword Expansion (Optional)

When Ollama is enabled, a single LLM call expands the query:
- Input: `"rar my iss"`
- Output: `["rar", "my", "iss", "issue", "jira", "tracker"]`

### 6.3 Semantic Embedding Search (Optional)

Cosine similarity between query embedding and item embedding vectors.
Weight: 0.4 when enabled, 0.0 when disabled.

</details>

<details>
<summary><strong>7. Performance Characteristics</strong></summary>

### 7.1 Time Complexity

| Operation | Complexity | Typical Time |
|-----------|-----------|-------------|
| Tokenization | O(n) per query | < 0.1ms |
| Match classification | O(t × f) per item | < 0.01ms/item |
| Full scoring pipeline | O(items × scorers × tokens) | < 30ms for 10K items |
| Synonym expansion | O(t) lookup | < 0.1ms |
| AI expansion | 1 LLM call | 50-200ms |
| Total (keyword only) | — | < 50ms |

Where t = tokens, f = fields, items = indexed history count.

### 7.2 Caching

Results are cached by normalized query string. Cache is invalidated on new indexing events.

### 7.3 Pre-filtering

Before scoring, items are gate-checked with fast `includes()` to skip obviously non-matching items. This keeps the expensive graduated scoring focused on candidates that have at least some token overlap.

</details>

<details>
<summary><strong>8. Comparison: Before vs After Deep Search</strong></summary>

### 8.1 Binary Matching (Before)

```
"rar my iss" → tokenize → ["rar", "my", "iss"]
Each scorer: token.includes() → match/no-match (binary)
Score = matchCount / totalTokens = 3/3 = 1.0 (same as exact match!)
Problem: "rar" in "library" scores same as "rar" in "RAR-My-All"
Problem: "iss" substring gets same credit as "issue" exact match
```

### 8.2 Graduated Classification (Deep Search)

```
"rar my iss" → tokenize → ["rar", "my", "iss"]
classifyMatch("rar", title) → EXACT (1.0)
classifyMatch("my", title)  → EXACT (1.0)
classifyMatch("iss", title) → PREFIX (0.75)
graduatedScore = (1.0 + 1.0 + 0.75) / 3 = 0.917

vs "rar" in "library" → SUBSTRING (0.4) — much lower!
```

### 8.3 Real-World Impact

| Query | Result | Before | After Deep Search |
|-------|--------|--------|-------------------|
| `rar my iss` | [RAR-My-All] Issue Navigator | Rank ~3-5 | Rank 1 (intent tier 2) |
| `rar my all` | [RAR-My-All] Issue Navigator | Rank ~3-5 | Rank 1 (intent tier 2) |
| `zaar-api console` | console.cloud.google.com/…/zaar-api | Rank ~3-5 | Rank 1 (intent tier 3, split-field) |
| `github pull` | GitHub Pull Requests | Mixed with "hubspot" | Properly ranked (intent tier 2) |

**Key Wins**:
- Multi-token queries with deliberate intent now dominate over recency/frequency noise
- Split-field coverage (e.g., one keyword in URL, another in title) gets maximum priority
- Graduated matching still gives partial credit for prefix/substring matches

</details>

<details>
<summary><strong>9. Future Roadmap</strong></summary>

### 9.1 Planned Enhancements

- [ ] **Fuzzy matching tier**: Levenshtein distance ≤ 2 as MatchType.FUZZY (0.2 weight)
- [ ] **Bigram/trigram indexing**: Pre-computed n-gram index for O(1) substring lookup
- [ ] **Learning-to-rank**: Click-through rate feedback to auto-tune scorer weights
- [ ] **Personalized decay curve**: Per-domain recency half-life based on visit patterns
- [ ] **Query intent classification**: Detect navigational vs. informational queries
- [ ] **Title structure parsing**: Detect `[Project] Page - Site` patterns for field-aware scoring

### 9.2 Weight Tuning

Scorer weights can be tuned via A/B testing with click-through metrics. Current weights are hand-tuned based on representative query sets.

### 9.3 Extensibility

New scorers can be added by:
1. Creating a file in `src/background/search/scorers/`
2. Implementing the `Scorer` interface with `name`, `weight`, `score()`
3. Registering in `scorer-manager.ts` via `getAllScorers()`

All scorers receive `ScorerContext` with expanded tokens and query embedding.

</details>

---

## Technical Reference

### Key Source Files

| File | Purpose |
|------|---------|
| `src/background/search/tokenizer.ts` | Token splitting + match classification |
| `src/background/search/search-engine.ts` | Main search orchestrator + post-boosters |
| `src/background/search/scorer-manager.ts` | Scoring pipeline + inline scorers |
| `src/background/search/scorers/title-scorer.ts` | Graduated title relevance |
| `src/background/search/scorers/url-scorer.ts` | URL path/hostname scoring |
| `src/background/search/scorers/meta-scorer.ts` | Meta description/keywords |
| `src/background/search/scorers/recency-scorer.ts` | Time-based decay |
| `src/background/search/scorers/visitcount-scorer.ts` | Visit frequency |
| `src/core/scorer-types.ts` | Scorer interface + ScorerContext |

### Exported API

```typescript
// Token classification
classifyMatch(token: string, text: string): MatchType
classifyTokenMatches(tokens: string[], text: string): MatchType[]
graduatedMatchScore(tokens: string[], text: string): number

// Position & phrase analysis
matchPosition(token: string, text: string): number
countConsecutiveMatches(tokens: string[], text: string): number

// Legacy (backward compatible)
isExactKeywordMatch(token: string, text: string): boolean
countExactKeywordMatches(tokens: string[], text: string): number
```

---

*Deep Search™ — Intelligent browser history search, ranked like you'd expect.*

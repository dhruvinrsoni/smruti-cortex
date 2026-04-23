# Vivek Search Algorithm (विवेक)

**The intelligent ranking engine behind SmrutiCortex.**

> **Vivek (विवेक)** — Sanskrit for "discernment" or "wisdom"
>
> **Smruti** (memory) + **Cortex** (brain) + **Vivek** (wisdom) = wise memory recall

---

## Why Vivek Search?

Standard browser history search is binary — either a URL contains your keyword or it doesn't. That's like searching Google with `ctrl+F`. Vivek Search goes far beyond:

- **Graduated matching** — "app" is an EXACT match in "App-My-Hub" (1.0), "iss" is a PREFIX of "Issue" (0.75), "aviga" is a SUBSTRING of "Navigator" (0.4). Not binary.
- **9 weighted scorers** — Title, URL, recency, frequency, cross-dimensional, meta, domain familiarity, multi-token coverage, and AI semantic similarity.
- **Intent-driven ranking** — Multi-token queries like `app my iss` prioritize results where ALL tokens match across title+URL, not just the most recently visited.
- **AI expansion** — Optionally expands "war" → `["war", "battle", "combat", "conflict"]` via local Ollama.
- **Semantic search** — Finds pages by meaning, not just keywords, using vector embeddings.

All of this runs in **< 50ms** for keyword search, **150-800ms** with AI.

---

## How It Works (High-Level)

```
Query → Tokenize → Expand (synonyms + optional AI) → Score (9 scorers) → Boost → Rank → Diversify → Top 100 Results
```

**Step by step:**

1. **Tokenize** — Split query into lowercase tokens, preserving dots/dashes/slashes for URL matching
2. **Expand** — Add built-in synonyms (50+ tech terms) and optionally AI-generated synonyms via Ollama
3. **Score** — Run each indexed item through 9 weighted scorers to compute a relevance score
4. **Boost** — Apply post-score multipliers for literal matches, phrase matches, multi-token coverage
5. **Rank** — Sort by intent priority (multi-token coverage), then by score
6. **Diversify** — Deduplicate URLs, cap domains at 10 results each
7. **Return** — Top 100 results

---

## Graduated Match Classification

The foundation of Vivek Search. Every token is classified against text using a 4-tier system:

| Level | Weight | Detection | Example |
|-------|--------|-----------|---------|
| **EXACT** | 1.0 | Word boundary match: `(^\|[^a-z0-9])token([^a-z0-9]\|$)` | "app" in "**App**-My-Hub" |
| **PREFIX** | 0.75 | Token starts a word: `(^\|[^a-z0-9])token` | "iss" in "**Iss**ue Navigator" |
| **SUBSTRING** | 0.4 | Token appears inside a word: `includes()` | "aviga" in "N**aviga**tor" |
| **NONE** | 0.0 | No match | "xyz" in "App-My-Hub" |

**Real example:** Query `app my iss` against "App-My-Hub Issue Navigator":
- "app" → EXACT (1.0) — word boundary match
- "my" → EXACT (1.0) — word boundary match
- "iss" → PREFIX (0.75) — starts "Issue"
- **Graduated score:** (1.0 + 1.0 + 0.75) / 3 = **0.917**

This replaces the old binary `includes()` matching used by every scorer.

---

## Boundary-Flex Matching (contract: `search-core-boundary-flex-v1`)

Graduated match classification still starts with a plain substring check — but plain substring alone misses the single most common real-world history shape: **alphanumeric identifiers that travel without a separator in the query but carry one in the indexed content.**

**Synthetic worked example.**

- Indexed item title: `[ID-1234] Module 42 Review — Acme Tracker`
- Indexed item URL:   `https://tracker.example.com/ticket/ID-1234`
- User query:          `tracker module42`

Without boundary-flex, the haystack contains `module 42` (space between letters and digits). A plain `includes('module42')` returns `false`. The target scores 1/2, falls into the same bucket as visit-hot siblings on the same domain, and gets buried below the per-domain cap. The item the user is indexing for silently disappears.

### Contract (locked)

The tokenizer's `classifyMatch` tries, **only after** plain substring fails, to match the query token with **a single non-alphanumeric separator permitted at each letter↔digit transition inside the token**. Matches surfaced this way are always classified `SUBSTRING` (0.4), never `EXACT` or `PREFIX`.

| Query token  | Content                            | Result               |
|--------------|------------------------------------|----------------------|
| `module42`   | `module42 review`                  | EXACT (1.0)          |
| `module42`   | `module 42`                        | **SUBSTRING (0.4)**  |
| `module42`   | `Module-42` / `module_42` / `module.42` / `module/42` | **SUBSTRING (0.4)** |
| `id1234`     | `ID-1234`                          | **SUBSTRING (0.4)**  |
| `v2rc1`      | `v2 rc1`                           | **SUBSTRING (0.4)**  |
| `module42`   | `module -- 42` (multi-char sep)    | NONE                 |
| `module42`   | `moduleXX42` (alphanumeric sep)    | NONE                 |
| `foobar`     | `foo bar` (no letter↔digit)        | NONE                 |

### Why this shape and no other

The flex regex inserts `[^a-z0-9]?` at every letter↔digit transition inside the token — `module42` compiles to `/module[^a-z0-9]?42/`. This is a **precisely bounded** relaxation:

- **Only at letter↔digit transitions.** `foobar` has no transition, so the flex regex is never built (cached `null`). Pure-prose queries are completely unaffected.
- **At most one character of separation.** `module -- 42` is not a match. The false-positive surface area is bounded at O(1) per token per item.
- **Always classified `SUBSTRING` (0.4).** Clean word-boundary matches remain `EXACT` (1.0) and always outrank flex matches in the tiered sort.

### Blast radius

Boundary-flex lives inside `classifyMatch`, so every scorer inherits it automatically. Inside `search-engine.ts` the same contract gates token inclusion into `originalMatchCount` — the field that drives **tier 0** of the final sort. With the contract in place, a 2/2 boundary-flex match on the target reliably beats 1/2 visit-hot matches on its domain siblings.

### Forbidden future relaxations

Enforced by ADR + golden regression suite + CODEOWNERS review:

- No letter↔letter boundary relaxation.
- No digit↔digit boundary relaxation.
- No multi-character separator chains.
- No stemming / plural folding / transliteration inside `classifyMatch`.
- No promotion of boundary-flex hits above `SUBSTRING`.

### Traceability

- **Contract tag:** `search-core-boundary-flex-v1`
- **ADR:**   `docs/adr/0001-search-matching-contract.md`
- **Golden:** `src/background/search/__tests__/tokenizer-golden.test.ts`
- **E2E:**   `e2e/ranking-boundary-flex.spec.ts`
- **Report:** `src/background/ranking-report.ts` now emits a **Field Hits** column (per-token `[t,u,h,m]` map) and a top-of-report **partial-match banner** so the matcher's decision is directly auditable from a user-generated bug report.

To revert the contract: `git revert <sha>` on commits A1 + A2. See the ADR for the full revert procedure.

---

## The 9-Scorer Pipeline

Each indexed item is scored by 9 independent scorers. Scores are weighted and summed.

| # | Scorer | Weight | What It Measures |
|---|--------|--------|------------------|
| 1 | **Multi-Token Match** | 0.35 | How well multi-keyword queries match across all fields |
| 2 | **Title** | 0.35 | Title relevance with graduated matching, position, and phrase detection |
| 3 | **Recency** | 0.20 | How recently the page was visited |
| 4 | **Cross-Dimensional** | 0.15 | Whether different tokens match in different fields (title vs URL vs meta) |
| 5 | **Visit Count** | 0.15 | How frequently the page was visited |
| 6 | **URL** | 0.12 | URL/hostname/path relevance |
| 7 | **Meta** | 0.10 | Meta description and keywords relevance |
| 8 | **Domain Familiarity** | 0.05 | Subtle bias toward frequently-visited domains |
| 9 | **Semantic** | 0.40* | AI embedding cosine similarity (*dynamic — 0.0 when disabled) |

### Scorer Details

<details>
<summary><strong>Multi-Token Match (0.35)</strong> — The most important scorer for multi-word queries</summary>

Measures how many of your search tokens match across all searchable fields (title, URL, hostname, description, bookmark folders).

- **Graduated coverage** — Uses match classification weights, not binary counts
- **Exponential reward** — Coverage raised to power 1.3 (rewards full matches disproportionately)
- **Composition bonus** — Extra weight when tokens are EXACT vs PREFIX vs SUBSTRING
- **Consecutive pair bonus** — Rewards phrase-like patterns (tokens appearing together)

Single-token queries get a simplified score (graduated match quality only).
</details>

<details>
<summary><strong>Title Scorer (0.35)</strong> — 6 signals combined</summary>

1. **Graduated match quality** — Average match weight across all tokens
2. **Position bonus** — Tokens matching earlier in the title score higher (normalized 0–1)
3. **Consecutive token bonus** — Phrase-like matches rewarded (e.g., "react native" appearing together)
4. **Composition analysis** — All-exact tokens score higher than mixed, which scores higher than all-substring
5. **Starts-with bonus** — Title literally starting with a search token gets extra weight
6. **Original token priority** — Matches on user's original tokens weighted higher than AI-expanded synonyms
</details>

<details>
<summary><strong>Recency (0.20)</strong> — Exponential time decay</summary>

Formula: `exp(-days / 30)`

- Visited today: ~1.0
- 1 week ago: ~0.79
- 1 month ago: ~0.37
- 3 months ago: ~0.05

Recent pages naturally float up, but strong title/URL matches can override recency.
</details>

<details>
<summary><strong>Cross-Dimensional (0.15)</strong> — Rewards breadth of match</summary>

Measures whether search tokens match across different dimensions:
- Title
- URL/hostname
- Meta description/keywords

A query like `dev-api console` matching "dev-api" in the URL and "console" in the title scores higher than both matching in the title alone. This signals stronger user intent.
</details>

<details>
<summary><strong>Visit Count (0.15)</strong> — Logarithmic frequency boost</summary>

Formula: `min(1, log(count + 1) / log(20))`

- 1 visit: 0.23
- 5 visits: 0.60
- 10 visits: 0.77
- 20+ visits: 1.0 (capped)

Frequently visited pages get a moderate boost, but logarithmic scaling prevents visit-count flooding.
</details>

<details>
<summary><strong>URL Scorer (0.12)</strong> — Hostname + path matching</summary>

Three components:
1. **Hostname match** (0.3× weight) — Graduated matching against the hostname
2. **Path match** (0.2× weight) — Graduated matching against the URL path
3. **Full URL match** (remaining weight) — Graduated matching against the complete URL

Original tokens (not AI-expanded) get extra weight in URL matching.
</details>

<details>
<summary><strong>Meta Scorer (0.10)</strong> — Description & keywords</summary>

Graduated scoring against page meta description and meta keywords. Original tokens prioritized over AI-expanded synonyms.
</details>

<details>
<summary><strong>Domain Familiarity (0.05)</strong> — Subtle domain bias</summary>

Logarithmic scaling based on how many indexed pages share the same domain. Domains you visit frequently get a tiny boost. Capped at 0.2 to prevent domain flooding.
</details>

<details>
<summary><strong>Semantic Scorer (0.40 dynamic)</strong> — AI embedding similarity</summary>

When enabled, computes cosine similarity between the query embedding and item embedding:

```
similarity = (A·B) / (||A|| × ||B||)
```

Score range: 0.0 to 1.0. Weight is 0.40 when enabled, 0.0 when disabled.
This allows finding "machine learning tutorials" when searching "ML guides" — meaning-based, not keyword-based.

**Toggling semantic weight.** Two paths change `embeddingsEnabled`:

1. **Settings → Semantic Search** — the canonical toggle.
2. **`🧠 Semantic` toolbar chip (opt-in)** — pinnable from Settings → Toolbar. The chip is prerequisite-gated on `ollamaEnabled` via the `requires` field in `ToolbarToggleDef`: when AI is off, the chip renders greyed out and clicks surface a toast instead of flipping the setting, so users can't persist a "semantic on, Ollama off" configuration that would silently produce zero embeddings.
</details>

---

## Post-Score Boosters

After all 9 scorers run, multiplicative boosters reward strong signals. These stack.

| Booster | Condition | Multiplier |
|---------|-----------|------------|
| **Literal substring** | Raw query found verbatim in text | 1.50× |
| **All exact in title** | Every token has EXACT match in title | 1.45× |
| **Mixed quality** | 2+ exact + some prefix/substring | 1.0 + (exactRatio × 0.40) |
| **Prefix-dominant** | All prefix or prefix+substring | 1.0 + (qualityRatio × 0.25) |
| **All substring** | All matches are substring only | 1.10× |
| **Consecutive tokens** | Phrase-like matching detected | 1.0 + (pairs/maxPairs × 0.10) |
| **Split field** | Different tokens match in title AND URL | 1.20× |
| **Strong multi-token** | 2+ tokens, 100% coverage, split fields | 1.60× |
| **Strong multi-token** | 2+ tokens, 100% coverage, same field | 1.40× |
| **Moderate multi-token** | 2+ tokens, 75%+ coverage | 1.15× |
| **AI-expanded match** | Found via AI synonyms, not original keywords | 1.20× |

**Boosters stack multiplicatively.** A result matching "javascript" exactly in title + discovered via AI synonym could get `1.45 × 1.20 = 1.74×`.

---

## Intent-Driven Sorting

After scoring, results are sorted by a deterministic cascade that prioritizes user intent over raw score:

1. **Intent priority** — Multi-token queries: results with full title+URL coverage rank first
   - Tier 3: All tokens matched, split across title AND URL (strongest intent signal)
   - Tier 2: All tokens matched in title+URL, same field
   - Tier 1: ≥75% tokens in title+URL
   - Tier 0: Partial coverage (score-driven)
2. **Title+URL coverage ratio**
3. **Split field coverage** (tokens in both title AND URL)
4. **Title+URL match quality score**
5. **Final combined score** (if all above equal)

---

## Strict Matching

**Default behavior:** Only show results that actually match your search terms.

A result matches if:
- Any search token (original or expanded) is found in the haystack (title + URL + hostname + description), OR
- The raw query string appears as a literal substring

**Bookmark special rules** — Bookmarks require stronger signals to prevent flooding:
- All original tokens must match, OR
- At least one word-boundary match, OR
- Literal substring match (3+ characters)

**Override:** Settings → "Show non-matching results" to include items with score > 0.01.

---

## Diverse Results

URL deduplication prevents the same page from appearing multiple times with different query parameters.

**Algorithm:**
1. Normalize each URL — strip query params, fragments, trailing slashes
   - `https://notion.so/page?pvs=12` → `https://notion.so/page`
   - `https://example.com/path/?utm_source=x#section` → `https://example.com/path`
2. Group results by normalized URL, keep highest-score result per group
3. Cap at 10 results per domain

**Toggle:** Settings → "Show duplicate URLs" to disable deduplication.

---

## AI Features (Optional — via Ollama)

Both AI features are **100% local, zero cloud** and require [Ollama](https://ollama.ai) running locally.

**AI Keyword Expansion** — Expands your query with synonyms. Type "war" → search also finds results containing "battle", "combat", "conflict". Dual-phase architecture: keyword results appear immediately (~150ms), AI-expanded results merge in ~500ms later. Per-keyword cache (5,000 entries, 7-day TTL) makes it faster with every search.

**Semantic Search** — Finds pages by meaning using vector embeddings. "ML tutorials" finds "machine learning guides". Embeddings are generated in the background (~10-20 items/min) and cached in IndexedDB.

Full AI architecture detail: `.github/skills/ai-ollama/SKILL.md`

---

## Safety Architecture

Every AI feature is wrapped in production-grade safety layers:

| Protection | What It Does |
|-----------|-------------|
| **Circuit Breaker** | 3 consecutive Ollama failures → all AI pauses 60s, auto-resets |
| **Memory Guard** | Blocks AI when extension memory > 512MB |
| **Concurrent Limiter** | 1 Ollama call at a time (semaphore) |
| **Embedding Caps** | Max 10 items per search, 5s time budget |
| **Input Validation** | 200-char query limit, 8KB embedding text limit |
| **Graceful Degradation** | Every AI feature falls back to keyword search |

**SmrutiCortex always works without Ollama.** AI just makes it smarter when available.

---

## Performance

| Scenario | Typical Time |
|----------|-------------|
| Cache hit | 1-5ms |
| Keyword search (10K items) | < 50ms |
| With cached AI keywords | ~150ms |
| With fresh AI expansion | 300-800ms |
| Semantic search (pre-cached embeddings) | ~50ms |

---

## Configuration

| Setting | Default | Effect |
|---------|---------|--------|
| `ollamaEnabled` | false | Enable AI keyword expansion |
| `ollamaEndpoint` | `http://localhost:11434` | Local Ollama URL |
| `ollamaModel` | `llama3.2:1b` | LLM model for keyword expansion |
| `embeddingsEnabled` | false | Enable semantic search |
| `showNonMatchingResults` | false | Include non-matching items |
| `showDuplicateUrls` | false | Disable URL deduplication |

---

## Source Files

| File | Purpose |
|------|---------|
| `src/background/search/search-engine.ts` | Core search orchestrator |
| `src/background/search/tokenizer.ts` | Tokenization + graduated match classification |
| `src/background/search/scorer-manager.ts` | 9-scorer weighted pipeline |
| `src/background/search/diversity-filter.ts` | URL dedup + domain capping |
| `src/background/search/scorers/` | Individual scorer implementations |
| `src/background/ollama-service.ts` | Ollama integration + safety layers |
| `src/background/ai-keyword-expander.ts` | AI keyword expansion + cache |
| `src/background/embedding-processor.ts` | Background embedding generation |

---

**Vivek Search — discerning search for those who remember everything... except where they put it.**

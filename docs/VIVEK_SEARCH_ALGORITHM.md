# Vivek Search Algorithm (विवेक)

**The intelligent ranking engine behind SmrutiCortex.**

> **Vivek (विवेक)** — Sanskrit for "discernment" or "wisdom"
>
> **Smruti** (memory) + **Cortex** (brain) + **Vivek** (wisdom) = wise memory recall

---

## Why Vivek Search?

Standard browser history search is binary — either a URL contains your keyword or it doesn't. That's like searching Google with `ctrl+F`. Vivek Search goes far beyond:

- **Graduated matching** — "rar" is an EXACT match in "RAR-My-All" (1.0), "iss" is a PREFIX of "Issue" (0.75), "aviga" is a SUBSTRING of "Navigator" (0.4). Not binary.
- **9 weighted scorers** — Title, URL, recency, frequency, cross-dimensional, meta, domain familiarity, multi-token coverage, and AI semantic similarity.
- **Intent-driven ranking** — Multi-token queries like `rar my iss` prioritize results where ALL tokens match across title+URL, not just the most recently visited.
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
| **EXACT** | 1.0 | Word boundary match: `(^\|[^a-z0-9])token([^a-z0-9]\|$)` | "rar" in "**RAR**-My-All" |
| **PREFIX** | 0.75 | Token starts a word: `(^\|[^a-z0-9])token` | "iss" in "**Iss**ue Navigator" |
| **SUBSTRING** | 0.4 | Token appears inside a word: `includes()` | "aviga" in "N**aviga**tor" |
| **NONE** | 0.0 | No match | "xyz" in "RAR-My-All" |

**Real example:** Query `rar my iss` against "RAR-My-All Issue Navigator":
- "rar" → EXACT (1.0) — word boundary match
- "my" → EXACT (1.0) — word boundary match
- "iss" → PREFIX (0.75) — starts "Issue"
- **Graduated score:** (1.0 + 1.0 + 0.75) / 3 = **0.917**

This replaces the old binary `includes()` matching used by every scorer.

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

A query like `zaar-api console` matching "zaar-api" in the URL and "console" in the title scores higher than both matching in the title alone. This signals stronger user intent.
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

Where A = query embedding vector, B = item embedding vector.

- Score range: 0.0 to 1.0
- Weight: 0.40 when enabled, 0.0 when disabled
- High-confidence matches (> 0.7 similarity) are logged

This allows finding "machine learning tutorials" when searching "ML guides" — meaning-based, not keyword-based.
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

This ensures that `zaar-api console` finds the page with "zaar-api" in the URL and "console" in the title before a random recently visited page that only matches "console".

---

## Strict Matching

**Default behavior:** Only show results that actually match your search terms.

A result matches if:
- Any search token (original or expanded) is found in the haystack (title + URL + hostname + description), OR
- The raw query string appears as a literal substring

**Bookmark special rules** — Bookmarks require stronger signals to prevent flooding (e.g., "github" matching ALL your GitHub bookmarks):
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
2. Group results by normalized URL
3. Keep highest-score result per group
4. Cap at 10 results per domain

**Toggle:** Settings → "Show duplicate URLs" to disable deduplication.

---

## AI Keyword Expansion (Optional — via Ollama)

Expands your search query with synonyms and related terms using a local LLM. **100% local, zero cloud.**

### How It Works

1. You type "war"
2. SmrutiCortex sends each uncached keyword to your local Ollama instance
3. Ollama returns: `["war", "battle", "combat", "conflict", "military"]`
4. Normal keyword search runs with ALL of these terms
5. Results containing "battle" or "conflict" now appear too

### Dual-Phase Architecture

To keep search feeling instant:
- **Phase 1** (~150ms) — Keyword-only results appear immediately
- **Phase 2** (~500ms later) — AI-expanded results merge in, list refreshes

You see results before AI is done thinking. AI never blocks the search.

### Per-Keyword Cache

Each word is cached independently:
- **Capacity:** 5,000 entries
- **TTL:** 7 days
- **Prefix matching:** Typing "git" reuses cached expansion for "github"
- **Storage:** `chrome.storage.local` (~1MB for 5,000 entries)

Search "github issues tracker" → `github` and `issues` reuse cache, only `tracker` calls Ollama. Gets faster with every search.

### Prompt

```
System: "You are a thesaurus API. Respond with ONLY a JSON array of strings."
User: "List 5 synonyms or related words for: "<keyword>". Include "<keyword>" as first element."
```

Temperature: 0.2 (deterministic). Max tokens: 150.

### Guardrails

- Circuit breaker: 3 consecutive Ollama failures → all AI pauses 60s
- Memory guard: Skip if extension memory > 512MB
- Semaphore: 1 Ollama call at a time
- Query limit: 200 characters max
- Graceful degradation: Falls back to keyword-only search

---

## Semantic Search with Embeddings (Optional — via Ollama)

Finds pages by **meaning**, not just keywords. "ML tutorials" finds "machine learning guides".

### How It Works

1. **Query embedding** — Your search query is converted to a vector (384-768 dimensions) by a local embedding model
2. **Item embeddings** — Each indexed page's title+URL+description is also converted to a vector
3. **Cosine similarity** — Compare query vector to every item vector
4. **Rank** — Higher similarity = more relevant

### Background Processing

Generating embeddings for thousands of pages takes time. SmrutiCortex handles this with a background processor:

- **Batch processing:** 50 items per database query
- **Speed:** ~10-20 items/minute (depends on hardware)
- **Pause/Resume:** Manual controls in Settings → AI → Embedding Management
- **Search priority:** Processor automatically pauses when you search, resumes after
- **Progress tracking:** Real-time speed, ETA, and completion percentage

### On-Demand Embeddings During Search

For items without cached embeddings:
- Max 10 items per search
- 5-second time budget
- Generated embeddings saved to IndexedDB for future searches
- Released from memory after scoring

### Setup

```bash
# 1. Install Ollama: https://ollama.ai
# 2. Pull embedding model
ollama pull nomic-embed-text:latest

# 3. Enable in Settings → AI → Semantic Search
```

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
| Background embedding generation | ~10-20 items/min |

---

## Configuration

| Setting | Default | Effect |
|---------|---------|--------|
| `ollamaEnabled` | false | Enable AI keyword expansion |
| `ollamaEndpoint` | `http://localhost:11434` | Local Ollama URL |
| `ollamaModel` | `llama3.2:1b` | LLM model for keyword expansion |
| `ollamaTimeout` | 30000ms | AI call timeout |
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

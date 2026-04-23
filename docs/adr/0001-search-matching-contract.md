# ADR 0001: Search Matching Contract (Boundary-Flex at Letter↔Digit Transitions)

- **Status:** Accepted
- **Date:** 2026-04-13
- **Contract tag:** `search-core-boundary-flex-v1`
- **Owners:** search-core CODEOWNER (see `.github/CODEOWNERS`)
- **Regression firewall:** `src/background/search/__tests__/tokenizer-golden.test.ts`

---

## 1. Context

SmrutiCortex is a Chrome MV3 extension whose entire user value proposition is: **"type a few keywords, get the right tab instantly from thousands of history items"**. Every query in the product reduces to one of two matching primitives:

1. `classifyMatch(token, text)` in `src/background/search/tokenizer.ts` — the four-tier gatekeeper (`EXACT` → `PREFIX` → `SUBSTRING` → `NONE`) that every single scorer routes through.
2. `haystack.includes(token)` in `src/background/search/search-engine.ts` — five token-inclusion gates that decide `originalMatchCount`, which drives **tier 0** of the final sort (2/2 always beats 1/2, always).

Before this contract, both primitives treated the query token as an **opaque substring**. That works for prose (`react hooks`) but silently fails for the most common real-world browser-history shape: **alphanumeric identifiers that travel without separators in the query but carry a separator in page content**.

### Concrete symptom

- Indexed item title: `[ID-1234] Module 42 Review — Acme Tracker`
- Indexed item URL:   `https://tracker.example.com/ticket/ID-1234`
- User query:          `tracker module42`

Haystack contains `module 42` (space between letters and digits). `haystack.includes('module42')` returns `false`. The target scores 1/2, falls into the same bucket as ~50 visit-hot siblings on the same domain, and gets buried below the `maxPerDomain` cap. The user — who indexed the exact item we need — cannot find it.

This pattern is **not** a rare edge case. It covers:

- Ticket / issue IDs: `ID-1234`, `BUG-42`, `REQ-999`
- Version strings: `v2rc1`, `ios15`, `python3`, `node22`
- Product codes: `module42`, `build7`, `rev3beta2`
- Release candidates: `v2.0rc1`, `1.26rc2`

The rest of the pipeline is correct. Sort tiers already reward 2/2 over 1/2, then `intentPriority`, then `splitFieldCoverage`. **The matcher just never declared the target a 2/2 match.**

---

## 2. Decision

**Add boundary-flex matching to `classifyMatch`, at letter↔digit transitions inside the query token, single separator maximum, classified as `SUBSTRING` (0.4).**

### Contract (locked by golden suite and this ADR)

1. **Trigger:** the query token contains at least one letter↔digit or digit↔letter transition (`/[a-z]\d|\d[a-z]/`).
2. **Flex unit:** one — and exactly one — non-alphanumeric character (`[^a-z0-9]`) may appear at each transition point in the content.
3. **Classification:** any match surfaced by boundary-flex (and only boundary-flex) is classified `MatchType.SUBSTRING` (weight 0.4). Clean word-boundary matches remain `EXACT` (1.0). Prefix matches remain `PREFIX` (0.75).
4. **Additive only:** boundary-flex is attempted **only after** plain `text.includes(lowerToken)` returns false. It cannot demote an existing `EXACT` / `PREFIX` / `SUBSTRING` to a worse tier.

### Worked examples (all synthetic, RFC-2606-safe)

| Query token  | Content                          | Previous | New contract         |
|--------------|----------------------------------|----------|----------------------|
| `module42`   | `module42 review`                | EXACT    | EXACT (unchanged)    |
| `module42`   | `module 42`                      | NONE     | **SUBSTRING**        |
| `module42`   | `Module-42`                      | NONE     | **SUBSTRING**        |
| `module42`   | `module_42` / `module.42` / `module/42` | NONE | **SUBSTRING**  |
| `module42`   | `module -- 42` (multi-char sep)  | NONE     | NONE (unchanged)     |
| `module42`   | `moduleXX42` (alphanumeric sep)  | NONE     | NONE (unchanged)     |
| `id1234`     | `ID-1234`                        | NONE     | **SUBSTRING**        |
| `v2rc1`      | `v2 rc1`                         | NONE     | **SUBSTRING**        |
| `foobar`     | `foo bar` (no letter↔digit)      | NONE     | NONE (unchanged)     |
| `foobar`     | `foo_bar`                        | NONE     | NONE (unchanged)     |

### Regex shape

Token `module42` compiles (once, cached) to `/module[^a-z0-9]?42/` on the lowercased token. The cache is a `Map<string, RegExp | null>` next to the existing `regexCache`, capped at 200 entries with clear-on-overflow. `null` is cached for tokens with **no** letter↔digit transition so we never recompute.

### Gating sites in `search-engine.ts`

All five token-inclusion call sites that previously used `haystack.includes(token)` now route through a new helper `matchesToken(token, haystack)` which returns `classifyMatch(token, haystack) !== MatchType.NONE`. The **sixth** `haystack.includes(q)` site — which matches the **full raw query string**, not a single token — is deliberately untouched (different semantics, literal-substring booster).

---

## 3. Forbidden future relaxations

The following are **explicitly out of scope** for this contract and any future PR introducing them **must** open a new ADR superseding this one. Reviewers (CODEOWNERS) are expected to reject PRs that breach these invariants without a new ADR:

1. **No letter↔letter boundary relaxation.** `foobar` must NOT flex-match `foo bar`. Reason: catastrophic over-matching on English prose.
2. **No digit↔digit boundary relaxation.** `1234` must NOT flex-match `12 34`. Reason: false matches on page numbers, dates, pricing.
3. **No multi-character separator chains.** `module42` must NOT match `module -- 42`. One separator max, always. Reason: keeps the flex class auditable and bounds false-positive probability at O(1) per token.
4. **No alphanumeric separator.** `module42` must NOT match `moduleXX42`. Reason: the contract is about broken transitions, not wildcard middles.
5. **No stemming / plural folding / transliteration inside `classifyMatch`.** Those belong in a dedicated normalization layer above the tokenizer, with their own ADR.
6. **No promotion of boundary-flex hits above `SUBSTRING`.** Clean word-boundary matches must always outrank flex matches. Reason: the tiered sort and the `EXACT vs SUBSTRING` booster gradient assume this.

---

## 4. Consequences

### Positive

- **Core UX restored** for the defining query class (multi-token queries with one alphanumeric identifier + one prose word).
- **No schema / storage / embedding changes.** Zero migration.
- **Strictly additive at the primitive level.** Items previously `NONE` can only go up — no item loses a match, no scorer produces smaller scores.
- **Tier-0 sort naturally rewards** newly-promoted 2/2 items over clean 1/2 items, without any tuning.
- **Transparent to users.** The only visible change is that the item they were looking for now appears at the top.

### Negative / trade-offs

- **Theoretical false-positive:** token `module42` newly matches content `Module: 42 items`. Classified `SUBSTRING` (0.4); any clean `EXACT` (1.0) match always outranks it. The tiered sort protects correctness.
- **Regex cache grows** by up to 200 entries (tokens with letter↔digit transitions). Memory footprint is bounded and negligible.
- **Adds one branch** to the hot path of `classifyMatch`. The branch is skipped entirely for tokens with no letter↔digit transition (cached as `null`).

### Neutral

- Pure-prose queries (`react hooks`, `how to deploy`): unaffected.
- Single-token queries: unaffected in practice (the bug required multiple tokens to manifest via `originalMatchCount`).
- Embeddings / AI expansion: unaffected (they operate on normalized prose, not on alphanumeric identifier shape).

---

## 5. Alternatives considered and rejected

1. **Tokenizer splits `module42` into `module` + `42` upfront.**
   Rejected: would over-match prose items (`42 ways to learn modules`), would require adjacency logic at the scorer layer, and would break the contract that `originalTokens` mirrors the user's typed tokens 1:1.

2. **Relax `text.includes` globally by stripping all non-alphanumerics.**
   Rejected: catastrophic false-positive rate. `foobar` would match `foo bar`, `for the bar`, etc. No way to reason about ranking.

3. **Fuzzy matching (Levenshtein / n-gram) at the engine gate.**
   Rejected: expensive (O(n·m) per token per item over 3,000+ items), introduces stochasticity that breaks deterministic tests, and overshoots the actual symptom by orders of magnitude.

4. **Domain-specific rules per URL shape (tracker vs wiki vs code host).**
   Rejected: couples the matcher to a growing list of special cases; still doesn't fix the title side of the problem; violates single-source-of-truth for match classification.

Boundary-flex at letter↔digit transitions is the **minimum** change that fixes the symptom without admitting any of the forbidden relaxations above.

---

## 6. Revert procedure

If the contract causes a regression in production:

```bash
# Find the locked commit (tagged post-merge):
git show search-core-boundary-flex-v1

# Revert the tokenizer change:
git revert <sha-of-commit-A1>

# Revert the engine wiring:
git revert <sha-of-commit-A2>

# Verify:
npm test
npm run build:prod
npx playwright test e2e/ranking-boundary-flex.spec.ts

# Ship:
node scripts/release.mjs patch
```

**Symptoms that would warrant a revert:**

- Over-matching on numerical prose (watch: ranking reports with unexpected `SUBSTRING` hits on items whose titles contain `N items`, `page 42`, etc.).
- Unexpected re-ranking of queries that previously worked well — specifically, clean `EXACT` queries losing their top slot.
- Measurable perf regression in `classifyMatch` (unlikely — branch is cached and short-circuits on the common path).

**Symptoms that would NOT warrant a revert:**

- A previously-missing item now appearing for a query that previously returned nothing (that's the feature).
- A visit-hot sibling dropping below a semantically-exact target (that's the feature).

---

## 7. Verification checklist

Any PR touching `tokenizer.ts`, `search-engine.ts`, or the golden suite **must** confirm:

- [ ] `npm test` — all unit tests green, including `tokenizer-golden.test.ts`.
- [ ] `npm run build:prod` — clean build.
- [ ] `npx playwright test e2e/ranking-boundary-flex.spec.ts` — 2/2 tests green.
- [ ] If any golden row changes, the PR description explains **why**, and updates this ADR if the contract itself is being changed.
- [ ] CODEOWNERS review obtained for any file under `src/background/search/` or `docs/adr/`.

---

## 8. References

- Source of the contract: `src/background/search/tokenizer.ts` (file-header banner)
- Gating sites: `src/background/search/search-engine.ts` (file-header banner)
- Regression firewall: `src/background/search/__tests__/tokenizer-golden.test.ts`
- E2E lock: `e2e/ranking-boundary-flex.spec.ts`
- Ranking report diagnostics: `src/background/ranking-report.ts` (field-hit column + partial-match banner)
- Algorithm overview: `docs/VIVEK_SEARCH_ALGORITHM.md` § Boundary-Flex Matching
- Skill doc: `.github/skills/search-engine/SKILL.md` § Boundary-Flex Matching Contract
- Governance: `.github/CODEOWNERS`, `CHANGELOG.md` § Core Changes (High-Impact)

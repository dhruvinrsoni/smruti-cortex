# Search Quality Controls — v4.0+

SmrutiCortex v4.0 introduces intelligent search quality controls to provide **relevant**, **diverse**, and **high-quality** results.

---

## 🎯 Overview

Two key features work together to improve search result quality:

1. **Strict Matching Mode** — Only show results containing your search terms
2. **Diversity Filter** — Remove duplicate URLs with different query parameters
3. **Literal Substring Boost** — Prioritize exact string matches

---

## 1. Strict Matching Mode

### What It Does

By default, SmrutiCortex only shows results that **contain your search terms** (either as tokens or literal substrings). This eliminates irrelevant suggestions and noise.

**Example:** Searching "war" only shows pages with "war" in the title/URL.

### Why It Matters

**Before (v3.0):**
```
Search: "war"
Results:
1. LinkedIn profile
2. WhatsApp chat
3. Google Search for war ✓
4. Random page about cars
```

**After (v4.0 with strict matching):**
```
Search: "war"
Results:
1. Google Search for war ✓
2. Article about warfare ✓
3. "Star Wars" movie page ✓
```

### How It Works

The search engine checks each result against two criteria:
- **Token Match**: Search term appears as a token (word boundary)
- **Literal Substring Match**: Search term appears anywhere in URL/title (case-insensitive)

If **either** criterion matches, the result is shown. Otherwise, it's filtered out.

### Configuration

**Default:** ON (strict matching enabled)

**Toggle:** Settings → "Show non-matching results"
- OFF (default) = Strict matching — only show results with query matches
- ON = Show all results above minimum score threshold

### Technical Details

```typescript
// Pseudo-code
const hasTokenMatch = tokens.some(token => query.includes(token));
const hasLiteralMatch = haystack.includes(query); // case-insensitive
const hasAnyMatch = hasTokenMatch || hasLiteralMatch;

if (showNonMatchingResults) {
    // Show if score > threshold
    shouldInclude = score > threshold;
} else {
    // Show only if score > threshold AND has match
    shouldInclude = score > threshold && hasAnyMatch;
}
```

---

## 2. Diversity Filter

### What It Does

Automatically **filters duplicate URLs** with different query parameters to provide better variety in results.

**Example:** Notion pages with `?pvs=12`, `?pvs=25`, `?pvs=30` → shows only one (highest scoring)

### Why It Matters

**Before (v3.0):**
```
Search: "war"
Results:
1. Notion: Project A?pvs=12
2. Google Search for war
3. Notion: Project A?pvs=25  ← DUPLICATE!
4. Notion: Project A?pvs=30  ← DUPLICATE!
```

**After (v4.0 with diversity filter):**
```
Search: "war"
Results:
1. Notion: Project A?pvs=12 (highest score)
2. Google Search for war
3. GitHub repository
4. Article about warfare
```

### How It Works

The diversity filter **normalizes URLs** by:
1. Stripping query parameters (`?key=value`)
2. Removing URL fragments (`#section`)
3. Removing trailing slashes
4. Converting to lowercase

Then it groups results by normalized URL and **keeps only the highest-scoring variant**.

### Configuration

**Default:** ON (diversity enabled, duplicates filtered)

**Toggle:** Settings → "Show duplicate URLs"
- OFF (default) = Diversity ON — filter duplicates
- ON = Show all URL variants

### Technical Details

```typescript
// Pseudo-code
function normalizeUrl(url: string): string {
    const parsed = new URL(url);
    // Keep protocol, host, pathname only
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`
        .toLowerCase()
        .replace(/\/$/, ''); // remove trailing slash
}

function applyDiversityFilter(results: ScoredItem[]): ScoredItem[] {
    const groups = new Map<string, ScoredItem>();
    
    for (const result of results) {
        const normalized = normalizeUrl(result.url);
        const existing = groups.get(normalized);
        
        // Keep highest scoring variant
        if (!existing || result.score > existing.score) {
            groups.set(normalized, result);
        }
    }
    
    return Array.from(groups.values());
}
```

### Use Cases

**When to keep diversity ON (default):**
- General browsing history search
- Want to see variety in results
- Notion pages with different workspace views
- URLs with tracking parameters (UTM codes)

**When to turn diversity OFF:**
- Need to find a specific URL variant
- Want to see all query parameter combinations
- Debugging or analyzing URL patterns

---

## 3. Literal Substring Boost

### What It Does

Results containing your **exact search term** (case-insensitive) in the URL or title get a **50% score boost**.

**Example:** Searching "war" ranks `google.com/search?q=war` higher than pages matching only via tokenization.

### Why It Matters

Ensures that URLs/titles with your exact search term are **prioritized over weaker matches**.

**Before (v3.0):**
```
Search: "war"
Results:
1. Article about battles (token match)
2. Wikipedia: warfare (token match)
3. google.com/search?q=war (token match)  ← should be higher!
```

**After (v4.0 with literal boost):**
```
Search: "war"
Results:
1. google.com/search?q=war (literal boost +50%)  ✓
2. Article about "war" (literal boost +50%)  ✓
3. Wikipedia: warfare (token match only)
```

### How It Works

The search engine performs a **case-insensitive substring check** on both URL and title:

```typescript
// Pseudo-code
const haystack = (url + ' ' + title).toLowerCase();
const query = searchQuery.toLowerCase();

if (haystack.includes(query)) {
    score *= 1.5; // 50% boost
}
```

### Configuration

**Always ON** — This is not configurable as it's a core ranking improvement.

---

## 📊 Combined Effect

All three features work together for optimal results:

**Search: "war"**

1. **Strict Matching** filters out: LinkedIn, WhatsApp, unrelated pages
2. **Diversity Filter** removes: Duplicate Notion URLs with different `?pvs` params
3. **Literal Substring Boost** prioritizes: URLs/titles with "war" string

**Result:** Clean, relevant, diverse results with exact matches ranked highest.

---

## 🎮 Usage Examples

### Example 1: Finding a Specific Google Search

**Query:** `"search?q=war"`

**Behavior:**
- Strict matching: Shows only URLs containing "search?q=war"
- Literal boost: Exact matches get 50% boost
- Diversity filter: Removes duplicate Google search URLs

**Result:** Finds the exact Google search URL quickly

---

### Example 2: General Exploration

**Query:** `"react hooks"`

**Behavior:**
- Strict matching: Shows only pages with "react" OR "hooks"
- Diversity filter: Shows variety (docs, articles, tutorials, not 5x same page)
- Literal boost: Pages with exact "react hooks" phrase rank higher

**Result:** Diverse, relevant results prioritizing exact matches

---

### Example 3: Notion Page Variants

**Query:** `"project planning"`

**Default (diversity ON):**
- Shows one "Project Planning" Notion page (highest score)
- Filters out `?pvs=12`, `?pvs=25`, `?pvs=30` variants

**With diversity OFF:**
- Shows all Notion page variants
- User can pick specific workspace view

---

## ⚙️ Settings Location

Access controls in **popup → Settings (gear icon) → Search Result Diversity**:

- ☐ **Show non-matching results** — Include results without query matches
- ☐ **Show duplicate URLs** — Display same URLs with different query params

Both are **unchecked by default** for optimal quality.

---

## 🧪 Testing

To verify these features work:

1. **Strict Matching Test**
   - Search: `"xyz123notinhistory"`
   - Expected: No results (unless you actually visited such page)
   - Toggle "Show non-matching results" → See all results

2. **Diversity Filter Test**
   - Visit same page with different query params (e.g., Notion `?pvs=12`, `?pvs=25`)
   - Search for that page
   - Expected: Only one result shown
   - Toggle "Show duplicate URLs" → See all variants

3. **Literal Boost Test**
   - Search: `"war"`
   - Expected: URLs containing "war" rank higher than token matches only
   - Verify: Google search URL with "war" appears near top

---

## 📐 Architecture

### Code Location

- **Strict Matching:** `src/background/search/search-engine.ts` — `hasLiteralMatch` check
- **Diversity Filter:** `src/background/search/diversity-filter.ts` — URL normalization
- **Literal Boost:** `src/background/search/search-engine.ts` — `score *= 1.5` for matches
- **Settings:** `src/core/settings.ts` — `showNonMatchingResults`, `showDuplicateUrls`

### Test Coverage

- **Diversity Filter:** 19 unit tests in `src/background/__tests__/diversity-filter.test.ts`
- **Search Engine:** Integration tests validate strict matching and literal boost

---

## 🚀 Performance Impact

**Minimal overhead:**

- **Strict Matching:** Single string includes check — O(n) per result
- **Diversity Filter:** Map-based grouping — O(n) after scoring
- **Literal Boost:** Same string check as strict matching — no extra cost

**Total impact:** < 5ms for 1000 results

---

## 📝 Developer Notes

### Adding New Quality Controls

Follow the established pattern:

1. Add setting to `src/core/settings.ts` with schema validation
2. Implement logic in `src/background/search/search-engine.ts` or separate module
3. Add toggle to `src/popup/popup.html` settings modal
4. Wire up event handler in `src/popup/popup.ts`
5. Add unit tests to `src/background/__tests__/`
6. Update documentation (this file, README, FAQ, HOW_TO)

### Design Principles

- **Default to quality:** Best settings for most users should be default
- **Configurable for power users:** Toggles for edge cases
- **Performance first:** Quality controls must not slow search
- **Test coverage:** All quality logic must have unit tests

---

*Last updated: December 2025 | SmrutiCortex v4.0*

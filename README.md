<div align="center">
  <img src="docs/assets/icon-128.png" alt="SmrutiCortex" width="80">
  <h1>SmrutiCortex</h1>
  <p><strong>Ultra-fast browser history search. Find any page instantly.</strong></p>
  <p><em>Smruti (स्मृति)</em> — Sanskrit for "memory" · <em>Cortex</em> — The brain's intelligence center</p>

  [![Build](https://github.com/dhruvinrsoni/smruti-cortex/actions/workflows/build.yml/badge.svg)](https://github.com/dhruvinrsoni/smruti-cortex/actions/workflows/build.yml)
  [![Quality Report](https://github.com/dhruvinrsoni/smruti-cortex/actions/workflows/nfr-report.yml/badge.svg)](https://github.com/dhruvinrsoni/smruti-cortex/actions/workflows/nfr-report.yml)
  [![License: BSL 1.1](https://img.shields.io/badge/License-BSL%201.1-blue.svg)](LICENSE)
  [![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-green.svg)](https://developer.chrome.com/docs/extensions/mv3/)
  [![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Add%20to%20Chrome-blue.svg)](https://chromewebstore.google.com/detail/ecnkiihcifbfnhjblicfbppplobiicoi)
  [![Tests](https://img.shields.io/badge/Tests-1%2C252%20unit%20%7C%2021%20E2E-brightgreen.svg)](#-test-infrastructure)
  [![Coverage](https://img.shields.io/badge/Coverage-83%25%20lines-yellow.svg)](#-test-infrastructure)

  <br>
</div>

---

## 🧬 Three Layers of Memory

SmrutiCortex is built on three complementary ideas from neuroscience and computing:

| Layer | Concept | What It Does |
|-------|---------|--------------|
| **Engram** | A memory trace — the physical record of an experience stored in the brain | Your browsing history, captured and indexed locally in IndexedDB. Every page you visit leaves an engram. |
| **Lexical** | Word-based recall — finding memories by their literal text signatures | The Vivek Search algorithm: tokenizes your query, scores results by exact match → prefix → substring across title, URL, and metadata |
| **Neural** | Pattern-based recall — finding memories by meaning, not just words | Optional semantic search via local Ollama embeddings: converts text to 768-dimensional vectors, finds conceptually related results even when the exact words don't match |

Together they form a complete memory system: **engrams** are stored, **lexical** search finds what you remember, **neural** search finds what you meant.

---

## ✨ Why SmrutiCortex?

Browser history search is slow. SmrutiCortex indexes everything locally and retrieves any URL in milliseconds. Like "Everything" for Windows, but for your browser.

**3 seconds:** Type, Enter, Done. ⚡

---

## 🔐 Privacy First

**100% local. Zero telemetry. No cloud sync.**

- All data in IndexedDB on your device
- Optional favicon loading (Google API) - disable in Settings
- Sensitive-site blacklist (banks, password managers) - no metadata extraction
- Local AI only (Ollama) - no cloud calls
- Open source — audit anytime
- One-click data deletion

**You control everything.**

---

## 🚀 Features

| Feature | Description |
|---------|-------------|
| ⚡ **Instant Search** | Results < 50ms as you type |
| ⌨️ **Keyboard-First** | `Ctrl+Shift+S` global shortcut |
| 🎯 **Vivek Search** | Graduated multi-parameter ranking (exact > prefix > substring) |
| 🎯 **Strict Matching** | Only show results containing your search terms (default) |
| 🎲 **Diverse Results** | Filters duplicate URLs for variety (default ON) |
| ⭐ **Bookmark Search** | Index and search bookmarks with ★ indicator |
| 🔍 **Query Expansion** | Find related terms with synonym matching |
| 🤖 **AI Search** | Optional keyword expansion via local Ollama — 100% private, zero cloud |
| 🔄 **Dual-Phase Search** | Keyword results in ~150ms, AI synonym expansion runs in parallel — never blocks |
| 🏷️ **Search Telemetry** | Live status badges: `Keyword Match [LEXICAL]`, `AI Recalled [ENGRAM]`, `AI Expanded [NEURAL]` |
| 🧠 **Semantic Search** | Find by meaning with AI embeddings — local only |
| 🎛️ **Command Palette** | Prefix-based modes: `/` commands, `>` power, `@` tabs, `#` bookmarks, `??` web search, `?` help |
| 🌐 **Web Search (`??`)** | Search Google, YouTube, GitHub, GCP, Jira, Confluence from the overlay |
| 🔧 **Advanced Browser Commands** | ~45 opt-in tab/window/group/data commands (requires optional permissions) |
| 🛡️ **Self-Healing** | Auto-recovery from errors, health monitoring |
| 📊 **Performance Monitor** | Real-time search timing and cache stats |
| 🔧 **Diagnostics Export** | Export system info for bug reports |
| 🖼️ **Favicon Caching** | Local cache with 30-day expiry |
| 🌐 **Cross-Browser** | Chrome, Edge, Firefox (MV3) support |
| 🔒 **Privacy Controls** | Favicon toggle, sensitive-site blacklist |
| 💾 **Data Management** | Storage quota, rebuild, clear & rebuild |
| 🔍 **Omnibox** | Type `sc ` in address bar |
| 📋 **Copy Links** | `Ctrl+C` for HTML, `Ctrl+M` for markdown |
| 🎨 **Clean UI** | Minimal, distraction-free |

---

## 📦 Installation

```bash
# Clone and build
git clone https://github.com/dhruvinrsoni/smruti-cortex.git
cd smruti-cortex
npm install
npm run build

# Load in Chrome
# 1. Open chrome://extensions
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select dist/ folder
```

---

## 🎮 Usage

**Search:**
- Click icon or press `Ctrl+Shift+S`
- Type anything
- Hit `Enter` to open

**Keyboard Shortcuts:**
- `Enter` — Open result
- `Ctrl+Enter` — New tab
- `Shift+Enter` — Background tab
- `Arrow Keys` — Navigate
- `Esc` — Clear
- `Ctrl+C` — Copy as rich HTML link (paste into Word, Outlook, Teams)
- `Ctrl+M` — Copy markdown link

**Quick Access:**
- Type `sc ` in address bar + query

**Command Palette** (in quick-search overlay, optionally in popup):

| Prefix | Mode | What It Does |
|--------|------|-------------|
| `/` | Commands | Everyday actions: toggle settings, page actions, navigation |
| `>` | Power | Admin: rebuild index, clear data, diagnostics, factory reset |
| `@` | Tabs | Switch between open tabs and recently closed |
| `#` | Bookmarks | Search and open bookmarks with folder paths |
| `??` | Web Search | Google, YouTube, GitHub, GCP, Jira (`?? j`), Confluence (`?? c`) |
| `?` | Help | Shows all available prefix modes |

Enable/disable modes in Settings → Command Palette. Advanced Browser Commands (~45 tab/window/group commands) available via Settings → General after accepting optional permissions.

**Search Quality Controls (Vivek Search):**
- **Graduated Match Classification**: Exact keyword > prefix > substring matching (not binary)
  - `app my iss` finds "[App-My-Hub] Issue Navigator" because "app" and "my" are exact, "iss" is a prefix of "Issue"
- **9-Scorer Pipeline**: Title, URL, recency, frequency, cross-dimensional, meta, domain familiarity, multi-token, AI embedding
- **Strict Matching** (default ON): Only shows results containing your search terms
  - Toggle OFF: Settings → "Show non-matching results"
- **Diverse Results** (default ON): Filters duplicate URLs with different query parameters
  - Toggle OFF: Settings → "Show duplicate URLs"
- **Literal Substring Boost**: Results with exact query string get 50% score boost
- **Phrase Matching**: Consecutive token detection rewards query terms appearing together
- See [`.github/skills/search-engine/SKILL.md`](.github/skills/search-engine/SKILL.md) for full algorithm details

---

## 🛠️ Development

### Daily Commands

| Command | When to use |
|---------|-------------|
| `git commit` | Pre-commit hook runs lint + build + tests (~20s). That's the safety net. |
| `npm test` | Iterate on unit tests (fast, ~5s focused run with `-- <pattern>` args). |
| `npm run verify` | Paranoid "did I break anything?" check before opening a PR. |
| `npm run ship <patch\|minor\|major>` | Full release: verify gate, bump, changelog, commit, tag, push, GitHub Release, zip. Drag-drop the printed zip into the CWS dashboard. |
| `npm run store:check` | Post-release: confirm CWS listing reflects the new version. |

Emergency release override: `npm run ship patch -- --skip-e2e` — skips only E2E; prints a warning and records `[ship-override]` in the commit.

<details>
<summary><strong>Advanced / occasional commands</strong></summary>

| Command | Purpose |
|---------|---------|
| `npm run lint` | ESLint check |
| `npm run build:prod` | Production build (minified) |
| `npm run build` | Dev build (source maps) |
| `npm run coverage` | Unit tests + v8 coverage report |
| `npm run preflight` | Full pre-release verification pipeline |
| `npm run store:init -- <version>` | Scaffold store submission doc from previous |
| `npm run store-prep` | Print Chrome Web Store submission text |
| `npm run package` | Create store-ready zip |
| `npm run test:e2e` | Build + run Playwright E2E tests |

The daily commands above call these internally; these are the escape hatches.

`verify` → `preflight` → `ship` is a strict hierarchy: each layer includes the one below it. `verify` and `preflight` are read-only; only `ship` writes.
</details>

**Project Structure:**
```
src/
├── background/      # Service worker, indexing, search engine
├── content_scripts/ # Page metadata extraction, quick-search overlay
├── popup/           # Search UI
├── core/            # Settings, logger, constants
└── shared/          # Command registry, web search, UI abstractions
```

### 🤖 AI Search (Optional)

**Two AI features for maximum search power:**

#### 1. AI Keyword Expansion (Fast)
**Local AI keyword expansion** via [Ollama](https://ollama.ai). 100% local, no cloud.

**How:** Type "war" → AI expands to `["war", "battle", "combat", "conflict"]` → keyword-matches URLs containing any of these.

**Dual-phase:** Keyword results appear instantly (~150ms). AI expansion runs in parallel — you see results before AI is done thinking.

**Per-keyword cache:** Each word is cached independently. Type "github issues tracker" → `github` reuses cached expansion, only `tracker` calls Ollama. Gets faster with every search.

**Setup:**
```bash
# 1. Install Ollama: https://ollama.ai
# 2. Pull model
ollama pull llama3.2:1b

# 3. Enable CORS (REQUIRED)
# Windows: setx OLLAMA_ORIGINS "*" (restart Ollama)
# Linux/Mac: export OLLAMA_ORIGINS="*"
```

**Enable:** Settings → AI Integration → Enable AI search
**Timeout:** Default 30s, set -1 for infinite (Settings → AI Integration)

#### 2. Semantic Search with Embeddings (NEW)
**Find pages by meaning**, not just keywords. Uses AI to understand content.

**Example:** Search "ML tutorials" → finds "machine learning guides", "neural network courses"

**Setup:**
```bash
# 1. Install Ollama + keyword expansion setup above
# 2. Pull embedding model
ollama pull nomic-embed-text:latest

# 3. Enable in Settings → Semantic Search
```

**How it works:**
- Background processor generates embeddings for all indexed pages automatically
- Pause/resume controls in Settings → AI → Embedding Management
- Compares meaning using vector similarity
- Finds conceptually related pages, not just keyword matches
- Search always gets priority — embedding generation pauses during search

**Performance:**
- Background embedding: ~1-3 items/second (depends on hardware)
- Search with cached embeddings: ~50ms
- Storage: ~4KB per page

### 🛡️ AI Safety Architecture

Production-grade safety layers protect your browser — every AI feature degrades gracefully:

| Protection | What It Does |
|-----------|-------------|
| **Circuit Breaker** | 3 consecutive Ollama failures → all AI pauses 60s. Auto-resets on cooldown. |
| **Memory Guard** | Blocks AI when extension memory exceeds 512MB. |
| **Concurrent Limiter** | 1 Ollama call at a time. Prevents resource contention. |
| **Background Processor** | Systematically generates embeddings with pause/resume UI. Yields to search automatically. |
| **Persistent Cache** | 5,000 per-keyword expansions survive restarts. Prefix matching. Gets faster with every search. |
| **Search Telemetry** | Every result shows its source: `Keyword Match [LEXICAL]` · `AI Recalled [ENGRAM]` · `AI Expanded [NEURAL]` |
| **Input Validation** | 200-char query limit, 8KB embedding text limit. |
| **Graceful Degradation** | Every AI feature falls back to keyword search. Extension always works without Ollama. |

#### Status Labels You'll See

**Search Telemetry Badges** (appear below the search bar after each search):

| Badge | Color | Meaning |
|-------|-------|---------|
| `Keyword Match [LEXICAL]` | 🟢 Green | Standard keyword search — results matched your typed words |
| `AI Expanded +N [NEURAL]` | 🔵 Blue | Live AI expansion — Ollama generated N extra synonyms right now |
| `AI Recalled +N [ENGRAM]` | 🟡 Yellow | Cached AI — N synonyms recalled from previous searches (instant, no Ollama call) |
| `AI Active [NEURAL]` | 🔵 Blue | AI is enabled and ready, but exact match found — no extra keywords needed |
| `AI Offline [OLLAMA]` | 🔴 Red | Ollama is not running or unreachable — keyword search still works |
| `🧠 Semantic active` | 🟣 Purple | Semantic search is comparing page meanings via embeddings |
| `🧠 Semantic (+N cached)` | 🟣 Purple | Semantic search active, N new embeddings were generated and cached |
| `🧠 Semantic error` | 🔴 Red | Semantic search failed (usually Ollama issue) |
| `🔴 Circuit breaker open` | 🔴 Red | Too many Ollama failures — AI paused for 60s cooldown (see below) |

**Embedding Processor States** (visible in Settings → AI → Embedding Management):

| State | Color | Meaning |
|-------|-------|---------|
| `Running` | 🟢 Green | Actively generating embeddings in background |
| `Paused` | 🟡 Yellow | User paused via ⏸ button — click ▶ Resume to continue |
| `Completed` | 🔵 Blue | All indexed pages have embeddings — semantic search is at full power |
| `Error` | 🔴 Red | Something went wrong (details shown next to state) |
| `Idle` | ⚪ Default | Not started — click ▶ Generate All to begin |

**Console/DevTools Labels** (for developers — visible in service worker console):

| Log Message | What It Means |
|-------------|---------------|
| `🔴 Circuit breaker TRIPPED after 3 consecutive failures` | Ollama failed 3 times in a row. All AI calls pause for 60 seconds, then auto-retry. |
| `🟢 Circuit breaker reset` | A successful Ollama call after failures — everything back to normal. |
| `🟡 Circuit breaker cooldown elapsed, allowing retry` | 60-second cooldown finished — SmrutiCortex will try Ollama again. |
| `🔒 Request rejected: 1/1 slots in use` | Another Ollama request is already in progress. This one was skipped (not an error — normal queuing). |
| `🔴 MEMORY PRESSURE: NMB used (limit: 512MB)` | Extension memory is high. AI features paused to keep browser responsive. |

<details>
<summary><strong>What These Terms Mean (Plain Language)</strong></summary>

- **Circuit Breaker** — If Ollama fails 3 times in a row, SmrutiCortex stops calling it for 60 seconds to avoid wasting resources. After 60 seconds, it tries again. If the next call succeeds, everything resets to normal.

- **Memory Guard** — If SmrutiCortex uses more than 512MB, AI features pause automatically to keep your browser responsive. Normal search always works.

- **Concurrent Limiter** — Ollama processes one request at a time internally. SmrutiCortex enforces one-at-a-time to keep things fast and efficient.

- **Background Embedding Processor** — Generates embeddings for all indexed pages in the background. Pause/resume from Settings → AI → Embedding Management. Search always gets priority.

- **Graceful Degradation** — If Ollama isn't running or fails, SmrutiCortex falls back to keyword-only search. The extension always works — AI just makes it smarter when available.
</details>

#### Required Models

| Feature | Model | Command | Size |
|---------|-------|---------|------|
| AI Keyword Expansion | `llama3.2:1b` ★ | `ollama pull llama3.2:1b` | 1.3 GB |
| Semantic Search | `nomic-embed-text:latest` ★ | `ollama pull nomic-embed-text:latest` | 274 MB |

> **Important:** You must manually pull models before enabling features. SmrutiCortex cannot download models — Ollama manages model downloads.

---

## 🧪 Test Infrastructure

**1,252 unit tests** (Vitest) + **21 E2E tests** (Playwright) across 50 files. 83%+ line coverage.

| Layer | Framework | Tests | What It Covers |
|-------|-----------|-------|---------------|
| **Unit** | Vitest + jsdom | 1,252 | All 9 scorers, search engine, tokenizer, settings, logger, database, indexing, Ollama, commands, web search, data masking, diagnostics, service worker messages |
| **E2E** | Playwright | 21 | Popup UI (load, search, settings, performance), feature tour (full walkthrough + skip), quick-search overlay (content script + service worker messaging), service worker health |
| **Shared Framework** | `src/__test-utils__/` | — | Composable Chrome API mocks, Logger mock, Settings mock, factory functions, lifecycle helpers — zero test duplication |

```bash
npm test                                    # Unit tests (~60s)
npm run test:e2e                            # E2E tests (build + Playwright, ~50s)
npx vitest run --coverage --pool=forks      # Unit tests with coverage report
node scripts/e2e-slowmo.mjs                 # E2E in slow-motion (see docs/E2E_TESTING.md)
```

> Full E2E guide: [docs/E2E_TESTING.md](docs/E2E_TESTING.md) — architecture, patterns, fixtures, content script isolated world, troubleshooting.

---

## 📚 Documentation

| Doc | Purpose |
|-----|---------|
| [CHROME_WEB_STORE.md](CHROME_WEB_STORE.md) | Store submission guide + privacy policy |
| [CHANGELOG.md](CHANGELOG.md) | Full version history |
| [docs/VIVEK_SEARCH_ALGORITHM.md](docs/VIVEK_SEARCH_ALGORITHM.md) | How Vivek Search works — algorithm, scoring, AI |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Contributor workflow — lifecycle, smoke tests, semver |
| [docs/E2E_TESTING.md](docs/E2E_TESTING.md) | Playwright E2E — architecture, fixtures, commands, troubleshooting |

---

## 🤝 Contributing

1. Fork repo
2. Create feature branch
3. Make changes
4. **Pre-commit hook automatically runs build:prod + tests (~20s)**
   - If checks pass: commit proceeds
   - If checks fail: you'll be prompted to continue or abort
5. Submit PR

**Keep it minimal.** No unnecessary code.

---

## 📄 License

[Business Source License 1.1](LICENSE) — Free for non-commercial, personal, educational, and evaluation use. Converts to Apache-2.0 on April 1, 2030.

---

## 💡 Philosophy

**Minimalism:** Every line of code must justify its existence.

**Privacy:** Your data never leaves your device.

**Speed:** < 50ms response time or bust.

**Open:** Transparent, auditable, hackable.

---

**Made for power users who remember everything... except where they put it.**

[Report Bug](https://github.com/dhruvinrsoni/smruti-cortex/issues) · [Request Feature](https://github.com/dhruvinrsoni/smruti-cortex/issues)


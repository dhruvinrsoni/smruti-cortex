# SmrutiCortex 🧠

**Ultra-fast browser history search. Find any page instantly.**

[![Build](https://github.com/dhruvinrsoni/smruti-cortex/actions/workflows/build.yml/badge.svg)](https://github.com/dhruvinrsoni/smruti-cortex/actions/workflows/build.yml)
[![Quality Report](https://github.com/dhruvinrsoni/smruti-cortex/actions/workflows/nfr-report.yml/badge.svg)](https://github.com/dhruvinrsoni/smruti-cortex/actions/workflows/nfr-report.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-green.svg)](https://developer.chrome.com/docs/extensions/mv3/)
[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Add%20to%20Chrome-blue.svg)](https://chromewebstore.google.com/detail/ecnkiihcifbfnhjblicfbppplobiicoi)

> **Smruti (स्मृति)** — Sanskrit for "memory" | **Cortex** — The brain's intelligence center

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

**Search Quality Controls (Vivek Search):**
- **Graduated Match Classification**: Exact keyword > prefix > substring matching (not binary)
  - `rar my iss` finds "[RAR-My-All] Issue Navigator" because "rar" and "my" are exact, "iss" is a prefix of "Issue"
- **9-Scorer Pipeline**: Title, URL, recency, frequency, cross-dimensional, meta, domain familiarity, multi-token, AI embedding
- **Strict Matching** (default ON): Only shows results containing your search terms
  - Toggle OFF: Settings → "Show non-matching results"
- **Diverse Results** (default ON): Filters duplicate URLs with different query parameters
  - Toggle OFF: Settings → "Show duplicate URLs"
- **Literal Substring Boost**: Results with exact query string get 50% score boost
- **Phrase Matching**: Consecutive token detection rewards query terms appearing together
- See [Vivek Search Algorithm docs](docs/VIVEK_SEARCH_ALGORITHM.md) for full details

---

## 🛠️ Development

```bash
# Build
npm run build        # Development (with source maps)
npm run build:prod   # Production (minified)

# Quality
npm run lint         # Check code
npm run test         # Run tests
npm run coverage     # Run tests with coverage report

# Quality report workflow (non-blocking quality indicator)
# See GitHub Actions -> "Quality Report" for shareable summary and artifacts

# Pre-commit hooks (automatic)
# Husky automatically runs builds before each commit
# If builds fail, you'll be prompted to continue or abort

# Package
npm run package      # Create store-ready zip

# Docker (alternative build method)
npm run docker-compose-build  # Build in container
npm run docker-compose-dev    # Watch mode in container
npm run docker-compose-test   # Test in container
npm run docker-validate       # Validate Docker setup (auto-cleanup)
npm run docker-clean          # Manual cleanup volumes/containers
```

**Docker Build (Optional):**
Build without installing Node.js locally:
```bash
# Prerequisites: Docker Desktop or Docker Engine
npm run docker-validate       # Full validation with auto-cleanup

# Or build directly
npm run docker-compose-build  # Produces dist/ using containerized build

# Manual cleanup if needed
npm run docker-clean

# Or use docker-compose directly
docker-compose run --rm build
```

See [docs/DOCKER.md](docs/DOCKER.md) for full Docker workflow including devcontainer and CI.

**Project Structure:****
```
src/
├── background/      # Service worker, indexing, search engine
├── content_scripts/ # Page metadata extraction
├── popup/           # Search UI
├── core/            # Shared utilities
└── shared/          # UI abstractions
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

**📖 Full guide:** See [SEMANTIC_SEARCH.md](docs/SEMANTIC_SEARCH.md)

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

#### What These Terms Mean (Plain Language)

- **Circuit Breaker** — If Ollama fails 3 times in a row, SmrutiCortex stops calling it for 60 seconds to avoid wasting resources. After 60 seconds, it tries again. If the next call succeeds, everything resets to normal. This prevents the extension from endlessly hammering a broken or offline Ollama instance.

- **Memory Guard** — Chrome extensions share your computer's memory. If SmrutiCortex uses more than 512MB (rare, but possible with very large histories), AI features pause automatically to keep your browser responsive. Normal search always works.

- **Concurrent Limiter (Semaphore)** — Ollama processes one request at a time internally. Sending multiple requests simultaneously just wastes memory. SmrutiCortex enforces one-at-a-time to keep things fast and efficient.

- **Background Embedding Processor** — When semantic search is enabled, SmrutiCortex generates embeddings for all your indexed pages in the background. You can see progress, pause, or resume from Settings → AI → Embedding Management. When you search, the processor automatically pauses to give search priority, then resumes when your search is done.

- **Graceful Degradation** — If Ollama isn't running, isn't installed, or any AI feature fails, SmrutiCortex seamlessly falls back to keyword-only search. The extension always works — AI just makes it smarter when available.

#### Required Models

| Feature | Model | Command | Size |
|---------|-------|---------|------|
| AI Keyword Expansion | `llama3.2:1b` ★ | `ollama pull llama3.2:1b` | 1.3 GB |
| Semantic Search | `nomic-embed-text:latest` ★ | `ollama pull nomic-embed-text:latest` | 274 MB |

> **Important:** You must manually pull models before enabling features. SmrutiCortex cannot download models — Ollama manages model downloads.

**📖 Full architecture:** See [AI_ARCHITECTURE.md](docs/AI_ARCHITECTURE.md)

### 🔍 Quality Checks

```bash
npm run lint        # ESLint code quality
npm run test        # Run 44 unit tests
npm run build       # Verify build
```

**Before committing:** Run all three commands above.

---

## 📚 Documentation

| Doc | Purpose |
|-----|---------|
| [CHROME_WEB_STORE.md](CHROME_WEB_STORE.md) | Store submission guide |
| [TESTING_and_DEBUG_GUIDE.md](docs/TESTING_and_DEBUG_GUIDE.md) | Build, test, debug |
| [ROADMAP.md](docs/ROADMAP.md) | Roadmap |

---

## 🤝 Contributing

1. Fork repo
2. Create feature branch
3. Make changes
4. **Pre-commit hooks automatically run `npm run build` and `npm run build:prod`**
   - If builds pass: commit proceeds
   - If builds fail: you'll be prompted to continue or abort
5. Submit PR

**Keep it minimal.** No unnecessary code.

---

## 📄 License

Apache-2.0 — See [LICENSE](LICENSE)

---

## 💡 Philosophy

**Minimalism:** Every line of code must justify its existence.

**Privacy:** Your data never leaves your device.

**Speed:** < 50ms response time or bust.

**Open:** Transparent, auditable, hackable.

---

**Made for power users who remember everything... except where they put it.**

[Report Bug](https://github.com/dhruvinrsoni/SmrutiCortex/issues) · [Request Feature](https://github.com/dhruvinrsoni/SmrutiCortex/issues)


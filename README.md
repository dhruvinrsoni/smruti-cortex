# SmrutiCortex 🧠

**Ultra-fast browser history search. Find any page instantly.**

[![Build](https://github.com/dhruvinrsoni/smruti-cortex/actions/workflows/build.yml/badge.svg)](https://github.com/dhruvinrsoni/smruti-cortex/actions/workflows/build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-green.svg)](https://developer.chrome.com/docs/extensions/mv3/)
[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Add%20to%20Chrome-blue.svg)](https://chromewebstore.google.com/detail/ecnkiihcifbfnhjblicfbppplobiicoi)

> **Smruti (स्मृति)** — Sanskrit for "memory" | **Cortex** — The brain's intelligence center

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
| 🎯 **Smart Ranking** | Recency + frequency + literal substring scoring |
| 🎯 **Strict Matching** | Only show results containing your search terms (default) |
| 🎲 **Diverse Results** | Filters duplicate URLs for variety (default ON) |
| ⭐ **Bookmark Search** | Index and search bookmarks with ★ indicator |
| 🔍 **Query Expansion** | Find related terms with synonym matching |
| 🤖 **AI Search** | Optional keyword expansion via local Ollama |
| 🧠 **Semantic Search** | Find by meaning with AI embeddings (NEW) |
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

**Search Quality Controls:**
- **Strict Matching** (default ON): Only shows results containing your search terms
  - Toggle OFF: Settings → "Show non-matching results"
  - Ensures relevant results, no random suggestions
- **Diverse Results** (default ON): Filters duplicate URLs with different query parameters
  - Toggle OFF: Settings → "Show duplicate URLs"
  - Example: Notion page with `?pvs=12` vs `?pvs=25` shows only once
- **Literal Substring Boost**: Results with exact query string get 50% score boost
  - Ensures URLs containing your search term rank higher

---

## 🛠️ Development

```bash
# Build
npm run build        # Development (with source maps)
npm run build:prod   # Production (minified)

# Quality
npm run lint         # Check code
npm run test         # Run tests

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

**How:** Type "war" → AI expands to ["war", "battle", "combat", "conflict"] → finds matching URLs.

ONE LLM call per search. Fast and smart.

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
ollama pull nomic-embed-text

# 3. Enable in Settings → Semantic Search
```

**How it works:**
- Generates embeddings on-demand during search (cached for speed)
- Compares meaning using vector similarity
- Finds conceptually related pages, not just keyword matches

**Performance:**
- First search per page: 200-500ms (generates embedding)
- Subsequent searches: ~50ms (uses cached embedding)
- Storage: ~4KB per page

**📖 Full guide:** See [SEMANTIC_SEARCH.md](docs/SEMANTIC_SEARCH.md)

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
| [TESTING_and_DEBUG_GUIDE.md](TESTING_and_DEBUG_GUIDE.md) | Build, test, debug |
| [GENERAL_TODO.md](GENERAL_TODO.md) | Roadmap |

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

MIT — See [LICENSE](LICENSE)

---

## 💡 Philosophy

**Minimalism:** Every line of code must justify its existence.

**Privacy:** Your data never leaves your device.

**Speed:** < 50ms response time or bust.

**Open:** Transparent, auditable, hackable.

---

**Made for power users who remember everything... except where they put it.**

[Report Bug](https://github.com/dhruvinrsoni/SmrutiCortex/issues) · [Request Feature](https://github.com/dhruvinrsoni/SmrutiCortex/issues)


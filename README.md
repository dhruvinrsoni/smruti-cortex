# SmrutiCortex 🧠

**Ultra-fast browser history search. Find any page instantly.**

[![Build](https://github.com/dhruvinrsoni/SmrutiCortex/actions/workflows/build.yml/badge.svg)](https://github.com/dhruvinrsoni/SmrutiCortex/actions/workflows/build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-green.svg)](https://developer.chrome.com/docs/extensions/mv3/)

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

# Package
npm run package      # Create store-ready zip
```

**Project Structure:**
```
src/
├── background/      # Service worker, indexing, search engine
├── content_scripts/ # Page metadata extraction
├── popup/           # Search UI
├── core/            # Shared utilities
└── shared/          # UI abstractions
```

### 🤖 AI Search (Optional)

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
4. Run `npm run lint && npm run test`
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


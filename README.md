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

- All data stored in IndexedDB on your device
- No external servers, no tracking, no analytics
- Open source — inspect the code anytime
- Delete all data anytime

**You own your data.**

---

## 🚀 Features

| Feature | Description |
|---------|-------------|
| ⚡ **Instant Search** | Results < 50ms as you type |
| ⌨️ **Keyboard-First** | `Ctrl+Shift+S` global shortcut |
| 🎯 **Smart Ranking** | Recency + frequency scoring |
| 🤖 **AI Search** | Optional semantic search via local Ollama |
| 🔍 **Omnibox** | Type `sc ` in address bar |
| 📋 **Copy Links** | `Ctrl+M` for markdown |
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
- `Ctrl+M` — Copy markdown link

**Quick Access:**
- Type `sc ` in address bar + query

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

### 🤖 AI Search Setup (Optional)

SmrutiCortex supports **AI-powered keyword expansion** using local [Ollama](https://ollama.ai). This is 100% local — no cloud, no tracking.

**How it works:**
1. You type: "war"
2. AI expands to: ["war", "battle", "fight", "combat", "conflict", "military"]
3. Fast keyword matching finds URLs with ANY of these terms

This is ONE LLM call per search, not 600+ embedding generations. Fast and smart.

**Setup:**
```bash
# 1. Install Ollama (https://ollama.ai)
# 2. Pull a generation model (for keyword expansion)
ollama pull llama3.2:1b

# 3. Enable CORS for Chrome extension (REQUIRED)
# Windows (PowerShell - run as admin):
setx OLLAMA_ORIGINS "*"
# Then restart Ollama

# Linux/Mac:
export OLLAMA_ORIGINS="*"
# Or add to ~/.bashrc / ~/.zshrc

# Docker:
docker run -e OLLAMA_ORIGINS="*" -p 11434:11434 ollama/ollama
```

**Timeout Settings:**
- Default: 30 seconds (first model load takes 5-15s)
- Set to `-1` for infinite timeout (recommended for AI workloads)
- Settings → AI Integration → Timeout

**Enable in SmrutiCortex:** Settings → AI Integration → Enable AI search

**Test coverage report** is generated in `coverage/` folder after running `npm run test:coverage`. Open `coverage/index.html` in a browser to see detailed coverage.

### 🔍 Linting & Code Quality

**ESLint** catches bugs and enforces consistent code style:

```bash
# Check for issues
npm run lint

# Auto-fix what's fixable
npm run lint:fix
```

**Linting rules:**
- TypeScript best practices
- No unused variables
- Consistent formatting
- Chrome extension API usage patterns

### 🤖 Local Workflow (Before Committing)

Run these commands before pushing code to ensure quality:

```bash
npm run lint        # Check code quality
npm run test        # Run tests
npm run build       # Verify it builds
```

If everything passes, you're good to commit!

### Debug Checklist
1. **Extension loads** without errors in `chrome://extensions`
2. **Service worker** shows "Ready" in background console
3. **Database initializes** and shows indexing progress
4. **Popup opens** and input field is focused
5. **Search works** and returns relevant results
6. **Debug toggle** controls console output

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


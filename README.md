# SmrutiCortex 🧠

[![Build](https://github.com/dhruvinrsoni/SmrutiCortex/actions/workflows/build.yml/badge.svg)](https://github.com/dhruvinrsoni/SmrutiCortex/actions/workflows/build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-green.svg)](https://developer.chrome.com/docs/extensions/mv3/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)

**Ultra-fast, intelligent, Everything-like browser history search engine.**

SmrutiCortex indexes your browsing memory and retrieves any URL instantly. 100% local, privacy-first.

> **Smruti (स्मृति)** — Sanskrit for "memory" | **Cortex** — The brain's intelligence center

---

## 📖 Table of Contents

- [Features](#-features)
- [Installation](#-installation)
- [Usage](#-usage)
- [Documentation](#-documentation)
- [Development](#-development)
- [Contributing](#-contributing)
- [License](#-license)

---

## ✨ Features

### 🎨 **Two UI Implementations**

SmrutiCortex provides **two distinct user interfaces** that share the same powerful search engine:

#### 1. **Inline Overlay** (Ultra-Fast, Content Script)
- **Speed**: < 50ms response time
- **Trigger**: Press `Ctrl+Shift+S` on any regular web page
- **Technology**: Content script with closed Shadow DOM
- **Appearance**: Sleek centered modal floating over the current page
- **Use case**: Primary interface for instant search while browsing

#### 2. **Extension Popup** (Traditional, Feature-Rich)  
- **Speed**: 200-800ms (Chrome popup attachment overhead)
- **Trigger**: Click toolbar icon OR `Ctrl+Shift+S` on special pages (chrome://, newtab, about:)
- **Technology**: Standard Chrome extension popup
- **Appearance**: 
  - Popup mode: 600x600px dropdown from toolbar icon
  - Tab mode: Centered card with backdrop when opened in a browser tab
- **Use case**: Settings, bookmarking, and fallback for pages where content scripts cannot run

**Shared Architecture**: Both UIs use the same `/src/shared/search-ui-base.ts` abstraction layer following SOLID/DRY principles. Updates to search behavior, highlighting, or keyboard navigation automatically apply to both implementations.

### 🚀 **Lightning-Fast Search**
- **Instant results** as you type
- **Intelligent ranking** using multiple scoring algorithms
- **Browser history fallback** when local index is unavailable
- **Real-time indexing** of new visits

### 🎯 **Smart Navigation**
- **First result auto-focus** - Type and hit Enter immediately
- **Keyboard-first design** with full arrow key navigation
- **Modifier key support** - Ctrl+Enter (new tab), Shift+Enter (background)
- **Global keyboard shortcut** - Ctrl+Shift+S for ultra-fast inline overlay
- **Omnibox integration** - Type `sc ` in address bar for quick access

### 🔧 **Developer-Friendly Debug**
- **Toggle debug logging** with persistent checkbox
- **Comprehensive logging** across all components
- **Development build** with readable source maps
- **Console-based debugging** for all extension parts

### 🏗️ **Architecture**
- **Manifest V3** Chrome extension
- **IndexedDB** for local data storage
- **Modular scorer system** for ranking algorithms
- **Service worker** background processing
- **TypeScript** for type safety

## 📦 Installation

### Prerequisites
- Node.js 18+ and npm
- Chrome or Edge browser (Chromium-based)

### Build & Install
```bash
# Clone the repository
git clone https://github.com/dhruvinrsoni/smruti-cortex.git
cd smruti-cortex

# Install dependencies
npm install

# Build the extension
npm run build
```

### Load in Browser
1. Open Chrome and go to `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `dist/` folder from the project
5. The SmrutiCortex icon should appear in your toolbar

## 🎮 Usage

### Basic Search
1. Click the SmrutiCortex icon in your toolbar
2. Start typing - results appear instantly
3. First result is automatically focused
4. Press Enter to open, or use arrow keys to navigate

### Keyboard Shortcuts
- **Enter**: Open selected result
- **Ctrl+Enter**: Open in new tab
- **Shift+Enter**: Open in background tab
- **Arrow Up/Down**: Navigate results
- **Escape**: Clear search and refocus input
- **M**: Copy markdown link to clipboard
- **Ctrl+Shift+S**: Ultra-fast inline search overlay ⚡

### Quick Access
- **Inline Overlay** (Fastest): Press `Ctrl+Shift+S` on any page for instant search
- **Omnibox**: Type `sc ` in address bar, then your search query
- **Toolbar**: Click the brain icon 🧠

### 🚀 Ultra-Fast Inline Search
The **Ctrl+Shift+S** shortcut opens an **instant inline overlay** directly on the current page. This bypasses Chrome's service worker wake-up delays, providing truly instant response:
- **Zero delay** - Content script runs in page context, no service worker needed
- **Sleek dark UI** - Minimal, distraction-free overlay
- **Full keyboard navigation** - Arrow keys, Enter, Escape
- **Same powerful search** - Uses the same scoring engine

### Debug Features
- **Debug Toggle**: Check/uncheck the "Debug" box in popup header
- **Console Logs**: All debug info appears in DevTools console
- **Persistent Setting**: Debug preference saves across sessions

## 🏛️ Project Structure

```
src/
├── background/           # Service worker & background scripts
│   ├── database.ts       # IndexedDB operations
│   ├── indexing.ts       # History ingestion logic
│   ├── messaging.ts      # Inter-script communication
│   ├── schema.ts         # Data type definitions
│   ├── search/           # Search engine components
│   │   ├── scorer-manager.ts
│   │   ├── search-engine.ts
│   │   └── scorers/      # Ranking algorithms
│   └── service-worker.ts # Main background script
├── content_scripts/      # Page content extraction
├── core/                 # Shared utilities
└── popup/                # Extension popup UI
    ├── popup.html        # Popup structure
    ├── popup.ts          # Popup logic
    └── popup.css         # Popup styling
```

## 🔧 Development

### Available Scripts
```bash
npm run build        # Development build (readable, with source maps)
npm run build:prod   # Production build (minified)
npm run lint         # Run ESLint
npm run test         # Run unit tests
npm run package      # Create store-ready zip
npm run clean        # Remove build artifacts
```

### Debug Checklist
1. **Extension loads** without errors in `chrome://extensions`
2. **Service worker** shows "Ready" in background console
3. **Database initializes** and shows indexing progress
4. **Popup opens** and input field is focused
5. **Search works** and returns relevant results
6. **Debug toggle** controls console output

### Common Issues
- **Popup not loading**: Check `dist/popup/popup.html` exists
- **No search results**: Wait for initial indexing to complete
- **Debug logs missing**: Ensure debug toggle is checked
- **Build fails**: Run `npm install` and check Node.js version

See [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for more solutions.

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [HOW_TO.md](docs/HOW_TO.md) | Complete user guide |
| [FAQ.md](docs/FAQ.md) | Frequently asked questions |
| [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Debug guide and solutions |
| [CONTRIBUTING.md](docs/CONTRIBUTING.md) | How to contribute |
| [DEVELOPER_ONBOARDING.md](docs/DEVELOPER_ONBOARDING.md) | Architecture overview |
| [STORE_DEPLOYMENT.md](docs/STORE_DEPLOYMENT.md) | Chrome/Edge store submission |
| [BRANDING.md](docs/BRANDING.md) | Visual identity guidelines |
| [TESTING_and_DEBUG_GUIDE.md](TESTING_and_DEBUG_GUIDE.md) | Testing procedures |

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](docs/CONTRIBUTING.md) for details.

Quick start:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`npm test`) and lint (`npm run lint`)
5. Submit a pull request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- Inspired by [Everything](https://www.voidtools.com/) search engine for Windows
- Built with TypeScript, IndexedDB, and Chrome Extension APIs

---

<div align="center">

**Made with ❤️ for power users who remember everything... except where they put it.**

[Report Bug](https://github.com/dhruvinrsoni/SmrutiCortex/issues) · [Request Feature](https://github.com/dhruvinrsoni/SmrutiCortex/issues) · [Discussions](https://github.com/dhruvinrsoni/SmrutiCortex/discussions)

</div>

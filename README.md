# SmritiCortex 🧠

Ultra-fast, intelligent, Everything-like browser history search engine. SmritiCortex indexes your browsing memory and retrieves any URL instantly.

## ✨ Features

### 🚀 **Lightning-Fast Search**
- **Instant results** as you type
- **Intelligent ranking** using multiple scoring algorithms
- **Browser history fallback** when local index is unavailable
- **Real-time indexing** of new visits

### 🎯 **Smart Navigation**
- **First result auto-focus** - Type and hit Enter immediately
- **Keyboard-first design** with full arrow key navigation
- **Modifier key support** - Ctrl+Enter (new tab), Shift+Enter (background)
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
git clone https://github.com/dhruvinrsoni/smriti-cortex.git
cd smriti-cortex

# Install dependencies
npm install

# Build for development (recommended for testing)
npm run build:dev

# Or build for production
npm run build
```

### Load in Browser
1. Open Chrome and go to `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `dist/` folder from the project
5. The SmritiCortex icon should appear in your toolbar

## 🎮 Usage

### Basic Search
1. Click the SmritiCortex icon in your toolbar
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

### Quick Access
- **Omnibox**: Type `sc ` in address bar, then your search query
- **Toolbar**: Click the brain icon 🧠

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
npm run build:dev    # Development build (readable, with source maps)
npm run build        # Production build (minified)
npm run clean        # Remove build artifacts
npm run lint         # Run ESLint
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

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly with debug logging enabled
5. Submit a pull request

## 📄 License

See LICENSE file for details.

## 🙏 Acknowledgments

- **Smriti (स्मृति)**: Sanskrit for "memory"
- **Cortex**: Human brain's intelligence center
- Inspired by Everything search engine for Windows

---

**Made with ❤️ for power users who remember everything... except where they put it.**

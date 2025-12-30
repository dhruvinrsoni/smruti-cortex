# TESTING & DEBUG GUIDE — SmrutiCortex

This document is the single place for developers and maintainers to build, load, test, and debug SmrutiCortex locally. It includes steps for common issues and verification checks.

---

## Prerequisites
- Node.js (LTS recommended: 18.x or later)
- npm (comes with Node)
- Chrome or Edge (Chromium) for MV3 testing
- Optional: Firefox (some MV3 features may need adjustments)
- Recommended: Visual Studio Code (or similar)

---

## Local dev workflow summary
1. Clone repository
2. `npm install`
3. `npm run build`
4. Load unpacked extension into Chrome via `chrome://extensions`
5. Use extension and follow debug checklist

---

## npm scripts (what they do)
- `npm run build` — development build (non-minified) with source maps to `dist/`
- `npm run clean` — remove `dist/` artifacts
- `npm run lint` — run ESLint
- `npm run test` — run unit tests (if available)

> Full `package.json` with these scripts is provided in root.

---

## Building the extension
```bash
# from repo root
npm install
npm run build
```

---

## Loading & Testing

### Load Extension
1. Open `chrome://extensions`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select the `dist/` folder
5. SmrutiCortex icon (🧠) appears in toolbar

### Basic Functionality Test
1. **Extension loads** without errors
2. **Click icon** - popup opens with search input
3. **Type query** - results appear instantly
4. **First result focused** automatically
5. **Enter key** opens result
6. **Log level buttons** show current selection (INFO by default)

---

### Debug Features

### Log Level Settings
- **Location**: Settings modal (click gear icon → Log Level section)
- **Function**: Controls logging verbosity with four levels:
  - **ERROR**: Only critical errors - production use
  - **INFO**: Errors + important events (default) - production/general use
  - **DEBUG**: Info + detailed debugging - development use
  - **TRACE**: Maximum verbosity - AI layer details, all message passing, request/response payloads
- **Persistence**: Setting saves across browser sessions
- **Scope**: Controls logs from popup, service worker, messaging, search engine, and AI layer (Ollama)

### AI Layer Transparency (TRACE Level)
When TRACE is enabled, the Ollama AI service logs:
- Full configuration on initialization
- Every API request with URL, method, body size
- Response status and parsing details
- Embedding dimensions and sample values
- Performance metrics (throughput, timing)
- **Privacy note**: All AI processing is LOCAL via Ollama - no cloud calls

### Debug Checklist
1. **Open Settings** via gear icon and select desired log level
2. **Open DevTools** (F12) → Console tab
3. **Service Worker logs**:
   - `[INFO] Initializing service worker…`
   - `[DEBUG] Database opened successfully` (if DEBUG/TRACE selected)
   - `[INFO] Service worker ready.`
4. **Search logs** (when typing):
   - `[DEBUG] doSearch called with: [query]` (if DEBUG/TRACE selected)
   - `[DEBUG] Search response received` (if DEBUG/TRACE selected)
   - `[DEBUG] Setting results: X items` (if DEBUG/TRACE selected)
5. **Popup logs**:
   - `[DEBUG] Window load event fired` (if DEBUG/TRACE selected)
   - `[DEBUG] renderResults called` (if DEBUG/TRACE selected)

### Log Level Controls
- **Click any button** to instantly change log level
- **Visual feedback**: Selected button becomes dark, others stay light
- **INFO is default**: Balanced logging for normal usage
- **DEBUG for development**: Detailed information for troubleshooting
- **TRACE for deep debugging**: Maximum verbosity
- **ERROR for production**: Minimal logging, only critical issues

---

## Testing Scenarios

### Search Functionality
```bash
# Test queries
- Single word: "github"
- Multiple words: "chrome extensions"
- Special chars: "c++ tutorial"
- Empty query: Should show no results
- Long query: "how to build chrome extensions with typescript"
```

### v4.0 Features
- **Self-Healing**: Clear All Data → auto-rebuilds on next init
- **Health Status**: Green/yellow/red indicator in Settings
- **Storage Quota**: Shows used/total/percentage/items
- **Privacy**: Favicon toggle, sensitive-site blacklist
- **AI Search**: Enable Ollama, test keyword expansion

### Keyboard Navigation
- **Arrow Up/Down**: Navigate results
- **Enter**: Open result
- **Ctrl+Enter**: New tab
- **Shift+Enter**: Background tab
- **Escape**: Clear and refocus
- **M**: Copy markdown

### Omnibox Integration
1. Click address bar
2. Type `sc ` (space required)
3. Type search query
4. Results appear in dropdown

### Performance Testing
- **Cold start**: First search after extension load
- **Warm search**: Subsequent searches
- **Large history**: Test with 1000+ history items
- **Memory usage**: Monitor in `chrome://extensions`

---

## Troubleshooting

### Extension Won't Load
- **Symptom**: Red error icon or missing from toolbar
- **Fix**: Rebuild with `npm run build`, check `chrome://extensions` errors

### No Search Results
- **Symptom**: Typing shows no results
- **Fix**: Wait for initial indexing, check health status in Settings
- **Self-Healing**: Extension auto-recovers from empty index

### Popup Not Opening
- **Symptom**: Clicking icon does nothing
- **Fix**: Check `dist/popup/popup.html` exists, reload extension

### Build Errors
- **Symptom**: `npm run build` fails
- **Fix**: Node.js 18+, run `npm install`, check TypeScript errors

---

## Performance Benchmarks

### Expected Performance
- **Initial load**: < 2 seconds
- **First search**: < 500ms (after indexing)
- **Subsequent searches**: < 100ms
- **Memory usage**: < 50MB for 10k history items
- **Health checks**: Every 60 seconds (auto-heal if needed)

### Monitoring
- **DevTools**: Performance tab for runtime metrics
- **Console**: Search timing logs (use DEBUG level)
- **Settings**: Health indicator, storage quota display

---

## Release Checklist

### Pre-Release
- [ ] `npm run build` (development build with source maps)
- [ ] Test all v4.0 features: self-healing, privacy controls, AI search
- [ ] Run all 44 unit tests: `npm run test`
- [ ] Verify health monitoring works (green indicator)
- [ ] Test on clean browser profile
- [ ] Default log level: INFO (production-ready)

### Post-Release
- [ ] Monitor Chrome Web Store reviews
- [ ] Check for runtime errors in production
- [ ] Monitor self-healing effectiveness
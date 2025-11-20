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

### Log Level Buttons
- **Location**: Rounded button group in popup header next to title
- **Function**: Controls logging verbosity with four colored buttons:
  - **ERROR** (Red): Only critical errors
  - **INFO** (Blue): Errors + important events (default)
  - **DEBUG** (Green): Info + detailed debugging
  - **TRACE** (Amber): Debug + very verbose tracing
- **Visual Design**: Rounded rectangle container with light-colored buttons that turn dark when selected
- **Persistence**: Setting saves across browser sessions
- **Scope**: Controls logs from popup, service worker, messaging, and search engine

### Debug Checklist
1. **Open popup** and click desired log level button (INFO is default)
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
- **Check**: `chrome://extensions` for error messages
- **Fix**: Rebuild with `npm run build`
- **Verify**: `dist/` folder contains all files

### No Search Results
- **Symptom**: Typing shows no results
- **Check**: Debug logs show "Retrieved items from DB: 0"
- **Fix**: Wait for initial indexing (check console for completion)
- **Verify**: Browser history API permissions granted

### Popup Not Opening
- **Symptom**: Clicking icon does nothing
- **Check**: Console for "popup.js" errors
- **Fix**: Check `dist/popup/popup.html` exists
- **Verify**: Manifest points to correct popup path

### Log Level Buttons Not Working
- **Symptom**: Clicking buttons doesn't change console output or visual state
- **Check**: Console shows level change confirmation: "Log level changed to: DEBUG"
- **Fix**: Reload extension after changing setting
- **Verify**: Selected button appears dark, others light; setting persists across browser restarts and popup openings

### Build Errors
- **Symptom**: `npm run build` fails
- **Check**: Node.js version (must be 18+)
- **Fix**: `npm install` and check for TypeScript errors
- **Verify**: All source files compile successfully

---

## Performance Benchmarks

### Expected Performance
- **Initial load**: < 2 seconds
- **First search**: < 500ms (after indexing)
- **Subsequent searches**: < 100ms
- **Memory usage**: < 50MB for 10k history items

### Monitoring
- **DevTools**: Performance tab for runtime metrics
- **Console**: Search timing logs
- **Task Manager**: Chrome extension memory usage

---

## Release Checklist

### Pre-Release
- [ ] `npm run build` (development build with source maps)
- [ ] Test all functionality with development build
- [ ] Set default log level to INFO for production (not DEBUG)
- [ ] Verify manifest.json is valid
- [ ] Test on clean browser profile

### Post-Release
- [ ] Monitor Chrome Web Store reviews
- [ ] Check for runtime errors in production
- [ ] Prepare hotfix process if needed
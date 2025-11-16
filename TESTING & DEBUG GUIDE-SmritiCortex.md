# TESTING & DEBUG GUIDE — SmritiCortex

This document is the single place for developers and maintainers to build, load, test, and debug SmritiCortex locally. It includes steps for common issues and verification checks.

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
3. `npm run build:dev` (or `npm run build` for production)
4. Load unpacked extension into Chrome via `chrome://extensions`
5. Use extension and follow debug checklist

---

## npm scripts (what they do)
- `npm run build` — production build (minified) to `dist/`
- `npm run build:dev` — development build (non-minified) with source maps
- `npm run clean` — remove `dist/` artifacts
- `npm run lint` — run ESLint
- `npm run test` — run unit tests (if available)

> Full `package.json` with these scripts is provided in root.

---

## Building the extension
```bash
# from repo root
npm install
npm run build:dev  # Recommended for development
```

---

## Loading & Testing

### Load Extension
1. Open `chrome://extensions`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select the `dist/` folder
5. SmritiCortex icon (🧠) appears in toolbar

### Basic Functionality Test
1. **Extension loads** without errors
2. **Click icon** - popup opens with search input
3. **Type query** - results appear instantly
4. **First result focused** automatically
5. **Enter key** opens result
6. **Debug toggle** controls console logging

---

## Debug Features

### Debug Toggle
- **Location**: Checkbox in popup header next to title
- **Function**: Enables/disables all debug console logs
- **Persistence**: Setting saves across browser sessions
- **Scope**: Controls logs from popup, service worker, messaging, and search engine

### Debug Checklist
1. **Open popup** and check "Debug" box
2. **Open DevTools** (F12) → Console tab
3. **Service Worker logs**:
   - `[DEBUG] Service worker script starting`
   - `[DEBUG] Database opened successfully`
   - `[DEBUG] Service worker ready`
4. **Search logs** (when typing):
   - `[DEBUG] doSearch called with: [query]`
   - `[DEBUG] Search response received`
   - `[DEBUG] Setting results: X items`
5. **Popup logs**:
   - `[DEBUG] Popup script starting execution`
   - `[DEBUG] Elements retrieved`
   - `[DEBUG] renderResults called`

### Debug Commands
- **Uncheck debug** to disable all logs
- **Check debug** to enable comprehensive logging
- **Console filtering**: Use "DEBUG" filter in DevTools

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
- **Fix**: Rebuild with `npm run build:dev`
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

### Debug Toggle Not Working
- **Symptom**: Checking box doesn't change logs
- **Check**: Console shows "Debug logging enabled/disabled"
- **Fix**: Reload extension after changing setting
- **Verify**: Setting persists across browser restarts

### Build Errors
- **Symptom**: `npm run build:dev` fails
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
- [ ] `npm run build` (production build)
- [ ] Test all functionality with production build
- [ ] Disable debug logging by default
- [ ] Verify manifest.json is valid
- [ ] Test on clean browser profile

### Post-Release
- [ ] Monitor Chrome Web Store reviews
- [ ] Check for runtime errors in production
- [ ] Prepare hotfix process if needed
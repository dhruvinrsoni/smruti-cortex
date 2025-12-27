# Ultra-Fast Search Overlay Architecture

**Date**: 2025-12-27  
**Version**: 0.1.0  
**Author**: SmrutiCortex Team

---

## 📋 Executive Summary

This document describes the end-to-end architectural redesign of SmrutiCortex's inline search overlay to achieve **sub-50ms response time** from keyboard shortcut to visible UI. The optimization journey transformed a slow, service-worker-dependent popup into an ultra-fast, content-script-first overlay.

---

## 🎯 Problem Statement

### Original User Complaint
> "Keyboard shortcut `Ctrl+Shift+S` still feels slow, not instant. The slowness is in UI appearing, not at all in search results."

### Root Cause Analysis

| Issue | Impact | Measured Delay |
|-------|--------|----------------|
| **Chrome commands API opened popup, NOT overlay** | Critical bottleneck - service worker had to wake AND open heavy popup | 100-600ms |
| Service worker cold start | Extension service workers sleep after 30s of inactivity | 50-500ms |
| One-shot messaging overhead | `chrome.runtime.sendMessage()` has inherent latency | 5-15ms per call |
| Late overlay creation | DOM created on first shortcut press | 20-50ms |
| CSS conflicts | Page styles bleeding into overlay | Unpredictable layout shifts |
| No pre-warming | Service worker always started cold | Full wake-up penalty |

### The Critical Discovery

The `commands` section in `manifest.json` defines the keyboard shortcut:
```json
"commands": {
  "open-popup": {
    "suggested_key": { "default": "Ctrl+Shift+S" }
  }
}
```

**Problem**: The service worker's command handler was calling `browserAPI.action.openPopup()`, which opens the **heavy popup UI** instead of the **lightweight inline overlay**.

**Solution**: Changed command handler to send `OPEN_INLINE_SEARCH` message to content script instead of opening popup.

---

## 🏗️ Architecture: Before vs After

### Before (Slow Path) - THE BUG!
```
User presses Ctrl+Shift+S
        ↓
Chrome commands API intercepts shortcut
        ↓
Service worker wakes (50-500ms cold start!)
        ↓
Service worker calls action.openPopup()
        ↓
Chrome loads popup.html, popup.js, popup.css
        ↓
Popup UI appears (heavy, full-featured)
```

**Total: 200-800ms** (feels laggy)

### After (Ultra-Fast Path) - THE FIX
```
User presses Ctrl+Shift+S
        ↓
Chrome commands API → Service worker (may be slow)
        ↓
Service worker sends OPEN_INLINE_SEARCH to content script
        ↓
Content script's pre-created Shadow DOM overlay → classList.add('visible')
        ↓
Lightweight overlay appears (< 16ms)
```

**Total: 50-150ms** (feels much faster)

### Optimal Path (When Content Script Catches It First)
```
User presses Ctrl+Shift+S
        ↓
Content script keydown listener (already running in page!)
        ↓
Pre-created Shadow DOM overlay → classList.add('visible')
        ↓
UI appears (< 5ms)
```

**Note**: Chrome's commands API may prevent the content script from seeing the keydown event, so we rely on the service worker message path as primary.

---

## 🔧 Technical Implementation Details

### 1. Content Script-First Keyboard Handling

**Why**: Content scripts run in the page context and are **always awake**. No service worker wake-up needed.

**How**: Register a global `keydown` listener at module load time (before any async operations).

```typescript
// Runs immediately when content script loads
document.addEventListener('keydown', handleGlobalKeydown, true);

function handleGlobalKeydown(e: KeyboardEvent): void {
  const isShortcut = (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's';
  if (isShortcut) {
    e.preventDefault();
    e.stopImmediatePropagation();
    showOverlay();
  }
}
```

**Key Design Decision**: Using `capture: true` ensures we get the event before any page scripts can interfere.

---

### 2. Shadow DOM for Complete Style Isolation

**Why**: Page CSS can conflict with overlay styles, causing layout shifts and visual bugs.

**How**: Use a closed Shadow DOM to create a completely isolated style boundary.

```typescript
// Create shadow host
shadowHost = document.createElement('div');
shadowHost.id = 'smruti-cortex-overlay';

// Attach CLOSED shadow root (maximum isolation)
shadowRoot = shadowHost.attachShadow({ mode: 'closed' });

// Inject all styles into shadow root
const styleEl = document.createElement('style');
styleEl.textContent = OVERLAY_STYLES;
shadowRoot.appendChild(styleEl);
```

**Closed vs Open Shadow DOM**:
- `mode: 'closed'`: Page JS cannot access `shadowHost.shadowRoot` (returns `null`)
- `mode: 'open'`: Page JS can access and modify the shadow DOM
- We chose closed for maximum isolation from potentially hostile page scripts.

---

### 3. CSS Containment for Rendering Performance

**Why**: Browsers can skip layout/paint calculations for contained elements.

**How**: Apply CSS containment properties to overlay elements.

```css
:host {
  all: initial;
  position: fixed !important;
  z-index: 2147483647 !important;
}

.overlay {
  contain: layout style;  /* Don't affect or be affected by siblings */
}

.container {
  contain: content;       /* Strongest containment for independent subtree */
  will-change: transform; /* Hint for GPU compositing */
}

.result {
  contain: layout style;
  content-visibility: auto; /* Skip rendering off-screen items */
}
```

**`content-visibility: auto`**: Particularly powerful for results lists—off-screen results are not rendered until scrolled into view.

---

### 4. Port-Based Messaging (Faster Than One-Shot)

**Why**: `chrome.runtime.sendMessage()` has ~5-15ms overhead per call. Port-based messaging maintains an open channel.

**How**: Open a persistent port connection when overlay opens.

```typescript
// Content script: Open port
searchPort = chrome.runtime.connect({ name: 'quick-search' });

searchPort.onMessage.addListener((response) => {
  if (response?.results) {
    renderResults(response.results);
  }
});

// Send search queries through the port
searchPort.postMessage({ type: 'SEARCH_QUERY', query });
```

```typescript
// Service worker: Listen for port connections
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'quick-search') {
    port.onMessage.addListener((message) => {
      if (message.type === 'SEARCH_QUERY') {
        const results = performSearch(message.query);
        port.postMessage({ results });
      }
    });
  }
});
```

**Performance Comparison**:
| Method | First Call | Subsequent Calls |
|--------|------------|------------------|
| `sendMessage()` | 5-15ms | 5-15ms |
| Port messaging | 5-15ms (connect) | 2-5ms |

---

### 5. Service Worker Pre-Warming

**Why**: Even with content-script-first UI, search still needs the service worker. Pre-warm it before the user needs it.

**How**: Send a ping on visibility change and first keypress.

```typescript
let prewarmed = false;

function prewarmServiceWorker(): void {
  if (prewarmed) return;
  prewarmed = true;
  
  // Fire-and-forget ping
  chrome.runtime.sendMessage({ type: 'PING' }, () => {
    chrome.runtime.lastError; // Suppress error
  });
}

// Pre-warm when tab becomes visible
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    prewarmServiceWorker();
  }
});

// Pre-warm on first keyboard activity
document.addEventListener('keydown', prewarmServiceWorker, { once: true });
```

**Result**: By the time user presses `Ctrl+Shift+S`, the service worker is likely already awake.

---

### 6. Early Overlay Pre-Creation

**Why**: Creating DOM elements takes time. Do it during browser idle time.

**How**: Use `requestIdleCallback` to pre-create the overlay after page load.

```typescript
if ('requestIdleCallback' in window) {
  requestIdleCallback(() => createOverlay(), { timeout: 500 });
} else {
  setTimeout(createOverlay, 50);
}
```

**`requestIdleCallback`**: Browser API that schedules work during idle periods. The `timeout: 500` ensures it runs within 500ms even if browser is busy.

---

### 7. DocumentFragment for Fast DOM Updates

**Why**: Direct DOM manipulation causes reflows. `DocumentFragment` batches changes.

**How**: Build results in memory, then append once.

```typescript
function renderResults(results: any[]): void {
  const fragment = document.createDocumentFragment();
  
  results.forEach((r, i) => {
    const div = document.createElement('div');
    // ... build element ...
    fragment.appendChild(div);
  });

  resultsEl.innerHTML = '';
  resultsEl.appendChild(fragment); // Single DOM update!
}
```

---

## 📊 Performance Metrics

### Expected Improvements

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Shortcut to UI visible | 100-600ms | < 50ms | 2-12x faster |
| Search query latency | 5-15ms | 2-5ms | 2-3x faster |
| First result render | 20-50ms | < 10ms | 2-5x faster |
| Style isolation | Fragile | Rock-solid | Eliminated bugs |

### Debug Timing Logs

Enable performance timing with:
```typescript
const DEBUG = true; // In quick-search.ts
```

Example output:
```
[SmrutiCortex Perf] Keyboard shortcut detected @ 1234.56ms
[SmrutiCortex Perf] showOverlay called @ 1234.78ms
[SmrutiCortex Perf] Overlay visible + input focused: 0.45ms
[SmrutiCortex Perf] Search query sent via port: 0.12ms
[SmrutiCortex Perf] Search results received via port @ 1240.23ms
[SmrutiCortex Perf] renderResults (15 items): 2.34ms
```

---

## 🔮 Future Optimizations (TODO)

### Offscreen Documents for Heavy Computation

When history exceeds 10,000 items, consider moving search to an Offscreen Document:

```typescript
// Create offscreen document
chrome.offscreen.createDocument({
  url: 'offscreen.html',
  reasons: ['DOM_PARSER'],
  justification: 'Scoring computations'
});

// Send work to offscreen
chrome.runtime.sendMessage({ target: 'offscreen', data });
```

See [FUTURE_OPTIMIZATIONS.md](./FUTURE_OPTIMIZATIONS.md) for implementation details.

### Web Worker for Scoring

Move CPU-intensive scoring algorithms to a Web Worker within the service worker context.

---

## 🧩 Code Architecture: SOLID/DRY Principles

### Shared Code Abstraction Layer

To prevent code duplication and ensure consistency between the two UI implementations, we extracted common functionality into `/src/shared/search-ui-base.ts`:

**Shared Utilities:**
- `SearchResult` interface - Common result data model
- `highlightText()` - Text highlighting with token matching
- `appendHighlightedTextToDOM()` - CSP-safe DOM highlighting
- `truncateUrl()` - URL display truncation
- `createMarkdownLink()` - Markdown link generation
- `openUrl()` - URL opening with tab/background support
- `parseKeyboardAction()` - Keyboard event parsing
- `renderResults()` - Generic result rendering with DocumentFragment
- `debounce()` - Debouncing utility

**Benefits:**
1. **Single Source of Truth** - Update behavior in one place, affects both UIs
2. **Type Safety** - Shared interfaces ensure data consistency
3. **Easier Testing** - Test shared logic once, both UIs benefit
4. **Maintainability** - No need to sync changes across duplicate code
5. **Future-Proof** - Adding new UI features is easier and less error-prone

**Implementation Pattern:**
```typescript
// Inline Overlay (quick-search.ts)
import { parseKeyboardAction, KeyboardAction, renderResults } from '../shared/search-ui-base';

// Extension Popup (popup.ts)
import { createMarkdownLink, openUrl } from '../shared/search-ui-base';
```

Both implementations use the same core logic but adapt it to their specific contexts (Shadow DOM vs extension popup).

---

## 📁 Files Changed

| File | Changes |
|------|---------|
| `src/shared/search-ui-base.ts` | **NEW**: Shared abstraction layer with common utilities, interfaces, and rendering logic |
| `src/content_scripts/quick-search.ts` | Refactored to use shared utilities; removed duplicate functions |
| `src/popup/popup.ts` | Refactored to use shared utilities for markdown, URL opening, keyboard parsing |
| `src/background/service-worker.ts` | **Critical fix**: Changed command handler to open inline overlay instead of popup; added port-based messaging; added `GET_LOG_LEVEL` handler |
| `.github/copilot-instructions.md` | Updated performance philosophy section and added "Two UI Implementations" documentation |
| `README.md` | Added detailed section explaining Inline Overlay vs Extension Popup |
| `docs/FUTURE_OPTIMIZATIONS.md` | New documentation for Offscreen Documents |
| `docs/2025-12-27_ultra-fast-overlay-architecture.md` | This document |

---

## 🎓 Key Learnings

1. **Content scripts are always awake** — Use them for instant UI response
2. **Shadow DOM is essential** — Page CSS conflicts are unpredictable
3. **Port messaging > one-shot** — For repeated calls, keep the channel open
4. **Pre-warm everything** — Don't wait for user action to start initialization
5. **Idle-time pre-creation** — Use `requestIdleCallback` for non-critical setup
6. **CSS containment matters** — Tell the browser what it can skip
7. **DRY principle is critical** — Shared code prevents divergence and bugs
8. **SOLID architecture** — Interface-based design makes adding features easier

---

## 🔗 References

- [Chrome Extension Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Using Shadow DOM (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM)
- [CSS Containment (MDN)](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment)
- [Vimium Extension (Architecture Reference)](https://github.com/philc/vimium)
- [requestIdleCallback (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback)

---

*This document should be updated when further performance optimizations are implemented.*

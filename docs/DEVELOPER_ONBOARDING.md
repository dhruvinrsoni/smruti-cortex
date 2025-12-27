# Developer Onboarding Guide

Welcome to SmrutiCortex development! This guide provides a comprehensive overview of the architecture, patterns, and codebase to get you productive quickly.

---

## 📋 Table of Contents

- [Architecture Overview](#architecture-overview)
- [Core Components](#core-components)
- [Data Flow](#data-flow)
- [Key Patterns](#key-patterns)
- [Adding Features](#adding-features)
- [Debugging Tips](#debugging-tips)
- [Common Gotchas](#common-gotchas)

---

## Architecture Overview

SmrutiCortex is a **Chrome Manifest V3 extension** with a focus on performance and modularity.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      User Interfaces                         │
├──────────────────────────┬──────────────────────────────────┤
│     Inline Overlay       │       Extension Popup            │
│   (Content Script)       │    (Popup HTML/CSS/TS)           │
│   quick-search.ts        │       popup.ts                   │
│     < 50ms startup       │     200-800ms startup            │
└──────────────────────────┴──────────────────────────────────┘
                │                        │
                └───────────┬────────────┘
                            │
                    chrome.runtime messaging
                            │
┌───────────────────────────┴─────────────────────────────────┐
│                    Service Worker                            │
│                  service-worker.ts                           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Database   │  │  Indexing   │  │   Search Engine     │  │
│  │ database.ts │  │ indexing.ts │  │ search-engine.ts    │  │
│  └─────────────┘  └─────────────┘  │   └── scorers/*     │  │
│        │                │          └─────────────────────┘  │
│        └────────────────┴───────────────────┐               │
│                                             │               │
│                    IndexedDB                │               │
│                (SmrutiCortexDB)             │               │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Location | Responsibility |
|-----------|----------|----------------|
| Service Worker | `background/service-worker.ts` | Lifecycle, messaging hub |
| Database | `background/database.ts` | IndexedDB CRUD operations |
| Indexing | `background/indexing.ts` | History ingestion, real-time updates |
| Search Engine | `background/search/` | Query processing, result ranking |
| Popup | `popup/popup.ts` | Extension popup UI |
| Quick Search | `content_scripts/quick-search.ts` | Inline overlay UI |
| Shared | `shared/search-ui-base.ts` | Common UI abstractions |

---

## Core Components

### 1. Database (`database.ts`)

IndexedDB wrapper for local storage.

```typescript
// Key operations
await openDatabase();
await storeItem(item: IndexedItem);
const items = await getAllItems();
await deleteItem(url: string);
```

**Schema** (from `schema.ts`):
```typescript
interface IndexedItem {
  url: string;           // Primary key
  title: string;
  visitCount: number;
  lastVisitTime: number;
  typedCount: number;
  metadata?: {           // From content script
    description?: string;
    keywords?: string;
    ogTitle?: string;
  };
}
```

### 2. Search Engine (`search/`)

Modular scoring-based search system.

```
search/
├── search-engine.ts    # Main search orchestrator
├── scorer-manager.ts   # Manages scorer registry
├── tokenizer.ts        # Query tokenization
└── scorers/
    ├── index.ts        # Scorer exports
    ├── title-scorer.ts
    ├── url-scorer.ts
    ├── recency-scorer.ts
    ├── visitcount-scorer.ts
    └── meta-scorer.ts
```

**How Search Works:**

1. Query is tokenized
2. All indexed items are retrieved
3. Each scorer calculates a score (0-1)
4. Scores are weighted and combined
5. Results are sorted by total score
6. Top N results are returned

### 3. Scorer System

Each scorer implements a simple interface:

```typescript
interface Scorer {
  name: string;
  weight: number;
  score(item: IndexedItem, query: string, tokens: string[]): number;
}
```

**Built-in Scorers:**

| Scorer | Weight | Logic |
|--------|--------|-------|
| Title | 0.35 | Substring match in title |
| URL | 0.25 | Substring match in URL |
| Recency | 0.20 | Decay based on last visit |
| Visit Count | 0.10 | Frequency normalization |
| Meta | 0.10 | Match in metadata fields |

### 4. Content Scripts

**Extractor (`extractor.ts`):**
- Runs on page load
- Extracts meta tags, Open Graph data
- Sends metadata to service worker

**Quick Search (`quick-search.ts`):**
- Inline overlay triggered by keyboard shortcut
- Uses closed Shadow DOM for style isolation
- Communicates via chrome.runtime ports

### 5. Shared Abstractions (`shared/`)

DRY utilities shared between popup and overlay:

```typescript
// search-ui-base.ts
export function truncateUrl(url: string, maxLength: number): string;
export function highlightText(text: string, query: string): string;
export function createMarkdownLink(title: string, url: string): string;
export function parseKeyboardAction(event: KeyboardEvent): KeyboardAction;
export function escapeRegex(str: string): string;
```

---

## Data Flow

### Search Request Flow

```
User types query
       │
       ▼
┌──────────────────┐
│ UI (Popup/       │
│ Overlay)         │
└────────┬─────────┘
         │ chrome.runtime.sendMessage
         ▼
┌──────────────────┐
│ Service Worker   │
│ messaging.ts     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Search Engine    │
│ search-engine.ts │
└────────┬─────────┘
         │ getAllItems()
         ▼
┌──────────────────┐
│ Database         │
│ (IndexedDB)      │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Score & Rank     │
│ (Scorer Manager) │
└────────┬─────────┘
         │
         ▼
   Return results
```

### Indexing Flow

```
Page visited (chrome.history event)
       │
       ▼
┌──────────────────┐
│ Service Worker   │
│ Listener         │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Indexing         │
│ indexing.ts      │
└────────┬─────────┘
         │ storeItem()
         ▼
┌──────────────────┐
│ Database         │
│ (IndexedDB)      │
└──────────────────┘
```

---

## Key Patterns

### 1. Messaging Pattern

All communication uses chrome.runtime messaging:

```typescript
// Sending (from UI)
const response = await chrome.runtime.sendMessage({
  type: 'SEARCH',
  query: 'example'
});

// Receiving (in service worker)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SEARCH') {
    handleSearch(message.query).then(sendResponse);
    return true; // Keep channel open for async
  }
});
```

### 2. Port-Based Communication

For search-as-you-type, we use persistent ports:

```typescript
// Client
const port = chrome.runtime.connect({ name: 'search' });
port.postMessage({ query: 'test' });
port.onMessage.addListener((results) => {
  // Handle results
});

// Service Worker
chrome.runtime.onConnect.addListener((port) => {
  port.onMessage.addListener(async (msg) => {
    const results = await search(msg.query);
    port.postMessage(results);
  });
});
```

### 3. Shadow DOM Isolation

The inline overlay uses closed Shadow DOM:

```typescript
const host = document.createElement('div');
const shadow = host.attachShadow({ mode: 'closed' });

// Inject styles and HTML into shadow root
shadow.innerHTML = `
  <style>/* Isolated styles */</style>
  <div class="overlay">...</div>
`;

document.body.appendChild(host);
```

### 4. Module-Level Listeners

For fast startup, listeners are registered at module load:

```typescript
// ✅ Good - registered immediately
chrome.commands.onCommand.addListener(handleCommand);
chrome.runtime.onMessage.addListener(handleMessage);

// Then do async init
async function init() {
  await openDatabase();
  // ...
}
init();
```

---

## Adding Features

### Adding a New Scorer

1. **Create the scorer file:**

```typescript
// src/background/search/scorers/domain-scorer.ts
import { Scorer, IndexedItem } from '../../../core/scorer-types';

export const domainScorer: Scorer = {
  name: 'domain',
  weight: 0.15,
  
  score(item: IndexedItem, query: string, tokens: string[]): number {
    const domain = new URL(item.url).hostname;
    // Your scoring logic
    return domain.includes(query.toLowerCase()) ? 1 : 0;
  }
};
```

2. **Register in `scorers/index.ts`:**

```typescript
export { domainScorer } from './domain-scorer';
```

3. **Add to scorer manager** (if not auto-registered).

### Adding a UI Feature

1. **For popup:** Modify `popup.ts` and `popup.html`
2. **For overlay:** Modify `quick-search.ts`
3. **For shared logic:** Add to `shared/search-ui-base.ts`

### Adding a Message Type

1. **Define type** in messaging types
2. **Handle in service worker:**
```typescript
case 'NEW_MESSAGE_TYPE':
  // Handle
  break;
```
3. **Send from UI:**
```typescript
chrome.runtime.sendMessage({ type: 'NEW_MESSAGE_TYPE', data });
```

---

## Debugging Tips

### Enable Debug Logging

1. Open popup → Settings → Select DEBUG level
2. Open DevTools (F12) → Console

### Inspect Service Worker

1. `chrome://extensions`
2. Find SmrutiCortex
3. Click "Service worker" link

### Inspect IndexedDB

1. DevTools → Application → IndexedDB
2. Expand SmrutiCortexDB
3. Click on stores to view data

### Common Debug Commands

```javascript
// Check if content script loaded
window.__SMRUTI_QUICK_SEARCH_LOADED__

// Get database contents
const request = indexedDB.open('SmrutiCortexDB');
request.onsuccess = () => {
  const db = request.result;
  const tx = db.transaction('items', 'readonly');
  const store = tx.objectStore('items');
  store.getAll().onsuccess = (e) => console.log(e.target.result);
};
```

---

## Common Gotchas

### 1. Service Worker Goes to Sleep

MV3 service workers can terminate. Solutions:
- Use alarms for periodic tasks
- Design for statelessness
- Reinitialize on wake

### 2. Content Scripts on Special Pages

Content scripts don't run on:
- `chrome://` pages
- `edge://` pages
- `about:` pages
- Other extensions' pages

The popup automatically handles these.

### 3. IndexedDB Transactions Auto-Close

```typescript
// ❌ Wrong - transaction may close
const tx = db.transaction('items');
await someAsyncOperation();  // Transaction closed!
tx.objectStore('items').get(key);  // Error!

// ✅ Correct - complete within same tick
const tx = db.transaction('items');
const store = tx.objectStore('items');
const request = store.get(key);
```

### 4. Popup Closes on Focus Loss

The popup closes when clicking outside. For debugging:
- Use DevTools → "don't close on focus loss" option
- Or open popup as tab for persistent debugging

### 5. CSS Leakage in Content Scripts

Always use Shadow DOM or prefix classes:
```css
/* ❌ May conflict */
.overlay { ... }

/* ✅ Namespaced */
.smruti-overlay { ... }
```

---

## Next Steps

1. **Read the code** - Start with `service-worker.ts`
2. **Run with debug** - Enable logging and explore
3. **Pick an issue** - Find a `good first issue`
4. **Ask questions** - Open a Discussion

Welcome to the team! 🧠

---

*Last updated: December 2025 | SmrutiCortex v2.0*

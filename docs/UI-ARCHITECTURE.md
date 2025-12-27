# SmrutiCortex UI Architecture

**Date**: 2025-12-27  
**Version**: 1.0.0  
**Purpose**: Document the two-UI architecture and shared code design

---

## 🏗️ Architecture Overview

SmrutiCortex implements **two distinct user interfaces** that share common code through a SOLID/DRY abstraction layer:

```
┌─────────────────────────────────────────────────────────────┐
│                    User Interactions                         │
├──────────────────────┬──────────────────────────────────────┤
│  Ctrl+Shift+S on     │  Toolbar click OR                    │
│  regular pages       │  Ctrl+Shift+S on special pages       │
└──────────┬───────────┴───────────┬──────────────────────────┘
           │                       │
           ▼                       ▼
┌──────────────────────┐  ┌──────────────────────────────────┐
│  Inline Overlay      │  │  Extension Popup                 │
│  (Content Script)    │  │  (Traditional Popup)             │
├──────────────────────┤  ├──────────────────────────────────┤
│ • Shadow DOM         │  │ • Popup Mode (toolbar dropdown)  │
│ • < 50ms response    │  │ • Tab Mode (centered card)       │
│ • Closed isolation   │  │ • 200-800ms response             │
│ • Always active      │  │ • Settings, bookmarking          │
└──────────┬───────────┘  └───────────┬──────────────────────┘
           │                          │
           │                          │
           └──────────┬───────────────┘
                      │
                      ▼
           ┌──────────────────────┐
           │  Shared Layer        │
           │ search-ui-base.ts    │
           ├──────────────────────┤
           │ • SearchResult model │
           │ • highlightText()    │
           │ • renderResults()    │
           │ • parseKeyboardAction│
           │ • openUrl()          │
           │ • createMarkdownLink │
           │ • truncateUrl()      │
           └──────────┬───────────┘
                      │
                      ▼
           ┌──────────────────────┐
           │  Service Worker      │
           │ search-engine.ts     │
           ├──────────────────────┤
           │ • Port messaging     │
           │ • Search execution   │
           │ • IndexedDB queries  │
           └──────────────────────┘
```

---

## 📊 Comparison Table

| Feature | Inline Overlay | Extension Popup |
|---------|----------------|-----------------|
| **File** | `quick-search.ts` | `popup.ts` |
| **Trigger** | `Ctrl+Shift+S` on regular pages | Toolbar click, special pages |
| **Speed** | < 50ms | 200-800ms |
| **Technology** | Content script + Shadow DOM | Chrome extension popup |
| **Context** | Page context (always active) | Extension context |
| **Appearance** | Centered modal overlay | Dropdown or tab view |
| **CSS Isolation** | Closed Shadow DOM | Extension page |
| **Use Case** | Primary, instant search | Settings, fallback, bookmarking |

---

## 🧩 Shared Code Design (SOLID/DRY)

### Problem We Solved

**Before refactoring:**
- Duplicate highlighting logic in 2 files
- Duplicate keyboard handling in 2 files  
- Duplicate URL opening logic in 2 files
- Duplicate markdown copy logic in 2 files
- **Risk**: Update one, forget the other → bugs!

**After refactoring:**
- Single source of truth: `/src/shared/search-ui-base.ts`
- Both UIs import and use shared utilities
- Update once, both UIs benefit
- Type-safe interfaces ensure consistency

### Shared Utilities

```typescript
// src/shared/search-ui-base.ts

export interface SearchResult {
  url: string;
  title: string;
  hostname?: string;
  visitCount: number;
  lastVisit: number;
}

export enum KeyboardAction {
  OPEN = 'open',
  OPEN_NEW_TAB = 'open_new_tab',
  COPY_MARKDOWN = 'copy_markdown',
  // ... more actions
}

// Shared functions used by both UIs:
export function highlightText(text: string, tokens: string[]): TextSegment[]
export function appendHighlightedTextToDOM(parent: HTMLElement, ...)
export function parseKeyboardAction(e: KeyboardEvent): KeyboardAction | null
export function createMarkdownLink(result: SearchResult): string
export function openUrl(url: string, newTab?: boolean, background?: boolean)
export function renderResults(results: SearchResult[], ...): DocumentFragment
```

### Usage Example

**Inline Overlay (quick-search.ts):**
```typescript
import { parseKeyboardAction, KeyboardAction, renderResults } from '../shared/search-ui-base';

function handleKeydown(e: KeyboardEvent) {
  const action = parseKeyboardAction(e); // Shared parsing
  if (action === KeyboardAction.COPY_MARKDOWN) {
    copyMarkdownLink(selectedIndex); // Uses shared createMarkdownLink()
  }
}
```

**Extension Popup (popup.ts):**
```typescript
import { createMarkdownLink, openUrl } from '../shared/search-ui-base';

function openResult(index: number, event?: MouseEvent) {
  const item = results[index];
  openUrl(item.url, isCtrl, isShift); // Shared URL opening
}
```

---

## 🎯 Benefits of This Architecture

### 1. **Maintainability**
- Single file to update for shared behavior
- No need to sync changes across multiple files
- Reduces cognitive load for developers

### 2. **Type Safety**
- Shared `SearchResult` interface ensures data consistency
- TypeScript catches mismatches at compile time
- Refactoring is safer with IDE support

### 3. **Testability**
- Test shared utilities once
- Both UIs automatically benefit from tests
- Mock shared layer for UI-specific tests

### 4. **Consistency**
- Both UIs behave identically for keyboard shortcuts
- Same highlighting algorithm everywhere
- Same URL opening behavior

### 5. **Future-Proof**
- Adding a third UI (e.g., sidebar) is easier
- New features added to shared layer benefit all UIs
- Technical debt is minimized

---

## 🔄 Development Workflow

### When to Update Shared Code

Update `/src/shared/search-ui-base.ts` when:
- Adding new keyboard shortcuts
- Changing highlighting behavior
- Modifying URL opening logic
- Adding new result rendering features
- Changing markdown format

### When to Update UI-Specific Code

Update `quick-search.ts` or `popup.ts` when:
- Changing UI styling (Shadow DOM CSS vs popup CSS)
- Modifying UI layout (overlay vs popup structure)
- Adding UI-specific features (settings modal in popup)
- Changing performance optimizations (pre-warming, etc.)

---

## 🧪 Testing Strategy

### Shared Code Tests (Recommended)
```bash
# Test shared utilities
npm run test:shared

# Test files:
- src/shared/__tests__/search-ui-base.test.ts
  - highlightText()
  - parseKeyboardAction()
  - createMarkdownLink()
  - renderResults()
```

### Integration Tests
```bash
# Test both UIs use shared code correctly
npm run test:integration

# Test scenarios:
- Keyboard shortcuts work identically in both UIs
- Highlighting appears the same
- Markdown copy produces same format
```

---

## 📚 Related Documentation

- [README.md](../README.md) - User-facing documentation
- [2025-12-27_ultra-fast-overlay-architecture.md](./2025-12-27_ultra-fast-overlay-architecture.md) - Technical deep dive
- [TESTING_and_DEBUG_GUIDE.md](../TESTING_and_DEBUG_GUIDE.md) - Testing procedures
- [.github/copilot-instructions.md](../.github/copilot-instructions.md) - Developer guidance

---

## 🎓 Key Takeaways

1. **Two UIs, One Brain**: Both implementations share the same search engine and utilities
2. **SOLID/DRY in Action**: Abstraction layer prevents code duplication
3. **Performance + Maintainability**: Inline overlay is fast, shared code keeps it maintainable
4. **Future-Proof Design**: Easy to add new UIs or features without breaking existing code
5. **Type Safety Wins**: TypeScript interfaces ensure consistency across implementations

---

**"Proofs and show offs are more important than work."**  
This architecture demonstrates:
- ✅ Professional software engineering principles
- ✅ Maintainable, scalable codebase
- ✅ Clear separation of concerns
- ✅ Future-proof extensibility
- ✅ Comprehensive documentation

---

*Last Updated: 2025-12-27*

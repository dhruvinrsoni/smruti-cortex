---
name: test-generation
description: Full rules for generating Vitest tests — mock patterns, coverage table, conventions
metadata:
  project: smruti-cortex
  version: "8.0"
---

# Test Generation

> Full instructions: `.github/copilot/test-generation-instructions.md`
> Load that file for: complete mock pattern catalog, coverage priority table, AAA template, edge case checklist.

---

## Quick Reference

**Goal:** 90–100% coverage. Only modify `*.test.ts` files — never production code.

**Test location convention:**
```
src/<area>/__tests__/<source-filename>.test.ts
```

**Template (every test file):**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../core/logger', () => ({
  Logger: { forComponent: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn() }) },
}));

import { myFunction } from '../my-module';

describe('myFunction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should <expected> when <condition>', () => {
    // Arrange / Act / Assert
  });
});
```

**Key mock patterns:**
- **Logger** — mock `Logger.forComponent` factory (returns object), not methods directly
- **Chrome APIs** — always mock; jsdom has none. Use `vi.stubGlobal('chrome', {...})`
- **Modules with side effects** — use `vi.hoisted()` + `vi.resetModules()` + dynamic `import()`
- **IndexedDB** — `import 'fake-indexeddb/auto'` or `vi.mock('../database')`

**Priority targets (HIGH):** `tokenizer.ts`, `title-scorer.ts`, `url-scorer.ts`, `scorer-manager.ts`, `settings.ts`, `search-engine.ts`, `database.ts`

**Run:** `npx vitest run` | `npx vitest run src/<area>/__tests__/<name>.test.ts`

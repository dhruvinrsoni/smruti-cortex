---
name: testing
description: Vitest configuration, chrome API mocks, test patterns and locations
metadata:
  project: smruti-cortex
  version: "8.0"
---

# Testing

## Setup

- **Runner:** Vitest with jsdom environment
- **Config:** `vitest.config.ts` at repo root
- **Run:** `npm test` (or `npx vitest run` for single pass)
- **Coverage:** `npx vitest run --coverage` (v8 provider, text/json/html reporters)

## Test File Locations

```
src/background/__tests__/
  indexing.test.ts                    # History indexing, mergeMetadata
  diversity-filter.test.ts            # URL normalization, duplicate filtering
  embedding-text.test.ts              # Embedding text builder
  ollama-service.test.ts              # Ollama client, circuit breaker
  open-inline-search.integration.test.ts  # Extension command integration

src/background/search/scorers/__tests__/
  embedding-scorer.test.ts            # Cosine similarity scorer

src/shared/__tests__/
  search-ui-base.test.ts              # Shared UI rendering, HTML escaping
```

## Chrome API Mocks

Tests run in jsdom, which has no chrome APIs. Mock them in test setup:

```typescript
// Minimal chrome mock pattern used across tests
global.chrome = {
  runtime: {
    id: 'test-extension-id',
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn() },
  },
  storage: {
    local: {
      get: vi.fn((keys, cb) => cb({})),
      set: vi.fn((items, cb) => cb()),
    },
  },
  history: { search: vi.fn() },
} as any;
```

## IndexedDB Mock

Tests use `fake-indexeddb` or manual IDB mocks:

```typescript
import 'fake-indexeddb/auto';  // Auto-polyfills indexedDB in jsdom
```

## Test Conventions

- Test files: `*.test.ts` or `*.spec.ts` (both picked up by Vitest)
- Place tests in `__tests__/` subdirectory next to the code they test
- Use `describe()` for grouping, `it()` or `test()` for individual cases
- Use `vi.fn()` for mocks, `vi.spyOn()` for spy patterns
- Avoid `any` casts where possible; type mocks properly

## Writing a New Test

1. Create `src/<area>/__tests__/my-module.test.ts`
2. Import the module under test
3. Mock chrome APIs and IndexedDB as needed
4. Test the public API surface, not internal implementation
5. Run: `npx vitest run src/<area>/__tests__/my-module.test.ts`

## Current Test Count

131 tests across 7 test files (as of v8.0).

## Full Test Generation Guide

For comprehensive test generation rules, mock pattern catalog, and coverage priority table,
see `.github/copilot/test-generation-instructions.md`.

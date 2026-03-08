# SmrutiCortex Test Generation Instructions

Strict instructions for generating unit tests for this Chrome MV3 extension repository.
Goal: **90-100% test coverage**, focusing on correctness, determinism, and simplicity.

---

## Core Principles

- **Source of Truth:** The target module under test is the sole source of truth. Base all tests strictly on its exported contract and behavior.
- **No Source Changes:** Do **NOT** modify any files except test suites (`*.test.ts`). Do **NOT** change production code, HTML, CSS, or config files.
- **Coverage:** Design tests to reach **90-100%** code coverage. This is **mandatory**.
- **Simplicity:** Write simple, focused, concise tests. Avoid unnecessary stubbing and complex setups.
- **DRY:** Minimize repetition; reuse setup and mock helpers.
- **Deterministic:** No `Date.now()` without mocking, no randomness, no real network or I/O.
- **Run and Verify:** Always run tests after creation to verify success using `npx vitest run`.

---

## Test File Conventions

### Location

Tests live in `__tests__/` subdirectories next to source code:

```
src/<area>/__tests__/<source-filename>.test.ts
```

**Examples:**

| Source File | Test File |
|-------------|-----------|
| `src/background/database.ts` | `src/background/__tests__/database.test.ts` |
| `src/background/search/tokenizer.ts` | `src/background/search/__tests__/tokenizer.test.ts` |
| `src/background/search/scorers/title-scorer.ts` | `src/background/search/scorers/__tests__/title-scorer.test.ts` |
| `src/core/settings.ts` | `src/core/__tests__/settings.test.ts` |
| `src/content_scripts/extractor.ts` | `src/content_scripts/__tests__/extractor.test.ts` |

### Naming

- Test files: `*.test.ts` (preferred) or `*.spec.ts`
- `describe` blocks: module or class name, then nested `describe` for each function/method
- `it` blocks: `'should <expected behavior> when <condition>'`
- Use `it()` not `test()`

---

## Test Structure Template

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 1. Mock dependencies BEFORE importing the module under test
vi.mock('../database', () => ({
  getIndexedItem: vi.fn(),
  saveIndexedItem: vi.fn(),
}));

vi.mock('../../core/logger', () => ({
  Logger: {
    forComponent: () => ({
      debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn(),
    }),
  },
}));

// 2. Import module under test AFTER mocks
import { myFunction } from '../my-module';
import { getIndexedItem } from '../database';

describe('myFunction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('when input is valid', () => {
    it('should return expected result', () => {
      // Arrange
      vi.mocked(getIndexedItem).mockResolvedValue(mockItem);

      // Act
      const result = await myFunction('test');

      // Assert
      expect(result).toEqual(expected);
    });
  });
});
```

---

## Arrange-Act-Assert (AAA) Pattern

Structure every `it` block using AAA:

```typescript
it('should return cached item when URL exists in database', async () => {
  // Arrange
  const mockItem = createMockItem({ url: 'https://example.com' });
  vi.mocked(getIndexedItem).mockResolvedValue(mockItem);

  // Act
  const result = await mergeMetadata('https://example.com', { title: 'Test' });

  // Assert
  expect(getIndexedItem).toHaveBeenCalledWith('https://example.com');
  expect(saveIndexedItem).toHaveBeenCalledWith(expect.objectContaining({ title: 'Test' }));
});
```

---

## Mock Patterns

### Pattern 1: `vi.mock()` with Factory (Most Common)

For mocking module dependencies at import time:

```typescript
vi.mock('../database', () => ({
  getIndexedItem: vi.fn(),
  saveIndexedItem: vi.fn(),
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}));

vi.mock('../search/tokenizer', () => ({
  tokenize: vi.fn((text: string) => text.toLowerCase().split(/\s+/).filter(t => t.length > 0)),
}));
```

### Pattern 2: Logger Mock (Required in Almost Every Test)

The `Logger.forComponent()` factory returns a logger instance. Mock it consistently:

```typescript
vi.mock('../../core/logger', () => ({
  Logger: {
    forComponent: () => ({
      debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn(),
    }),
    // Also mock static methods if the module uses Logger directly
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn(),
  },
}));
```

### Pattern 3: Chrome API Mock (Simple)

For tests needing basic Chrome APIs:

```typescript
vi.stubGlobal('chrome', {
  runtime: {
    getManifest: () => ({ version: '8.0.0', manifest_version: 3 }),
    lastError: null,
  },
  storage: {
    local: {
      get: vi.fn((_keys: unknown, cb: (r: Record<string, unknown>) => void) => cb({})),
      set: vi.fn((_items: unknown, cb?: () => void) => cb?.()),
    },
  },
  history: { search: vi.fn() },
});
```

### Pattern 4: Chrome API Deep Mock (Integration Tests)

For modules that access many Chrome APIs. Uses Proxy-based no-op to handle nested chains:

```typescript
const mocks = vi.hoisted(() => {
  const sendMessageMock = vi.fn((_tabId: number, _msg: unknown, cb: (r: unknown) => void) => {
    cb({ success: true });
  });
  const queryMock = vi.fn(async () => [{ id: 123, url: 'https://example.com' }]);

  function noOp(): any {
    return new Proxy(function() {} as any, {
      get: () => noOp(),
      apply: () => undefined,
    });
  }

  function proxied(obj: Record<string, any>): any {
    return new Proxy(obj as any, {
      get(t: any, prop: string) { return prop in t ? t[prop] : noOp(); },
    });
  }

  (globalThis as any).chrome = proxied({
    commands: proxied({
      onCommand: { addListener: (cb: (cmd: string) => void) => { /* capture cb */ } },
    }),
    tabs: proxied({ query: queryMock, sendMessage: sendMessageMock }),
    runtime: proxied({ getManifest: () => ({ manifest_version: 3 }) }),
    storage: proxied({
      local: proxied({
        get: (_keys: unknown, cb: (r: Record<string, unknown>) => void) => cb({}),
        set: noOp(),
      }),
    }),
  });

  return { sendMessageMock, queryMock };
});
```

**When to use:** Modules that register listeners at import time (e.g., `service-worker.ts`).
`vi.hoisted()` runs before ANY module imports, ensuring `globalThis.chrome` exists before module body executes.

### Pattern 5: Fetch Mock (Network/Ollama Tests)

```typescript
const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.stubGlobal('fetch', mockFetch);
});

// Helper factories for common responses
function mockTagsOk(model = 'test:latest') {
  return { ok: true, json: async () => ({ models: [{ name: model }] }) };
}

function mockEmbedOk(embedding = [0.1, 0.2, 0.3]) {
  return { ok: true, json: async () => ({ embeddings: [embedding] }) };
}

function mockFetchError(status = 500) {
  return { ok: false, status, statusText: 'Error', text: async () => 'Server error' };
}
```

### Pattern 6: `vi.mocked()` for Type-Safe Access

```typescript
import { getIndexedItem } from '../database';

// In test:
vi.mocked(getIndexedItem).mockResolvedValue(mockItem);
expect(vi.mocked(getIndexedItem)).toHaveBeenCalledWith('https://example.com');
```

### Pattern 7: Module Re-Isolation

For modules with side effects or singleton state, use `vi.resetModules()` + dynamic import:

```typescript
beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

it('should initialize fresh instance', async () => {
  const { OllamaService } = await import('../ollama-service');
  // Each test gets a fresh module instance
});
```

---

## Required Test Coverage Areas

### For Every Module:

1. **Module creation / initialization**
   ```typescript
   it('should export expected functions', () => {
     expect(myFunction).toBeDefined();
     expect(typeof myFunction).toBe('function');
   });
   ```

2. **Public functions** - Dedicated `describe` block for each:
   ```typescript
   describe('functionName', () => {
     it('should <action> when <condition>', () => { /* ... */ });
     it('should handle edge case when <condition>', () => { /* ... */ });
   });
   ```

3. **Error handling**
   ```typescript
   it('should handle error gracefully', async () => {
     vi.mocked(dependency).mockRejectedValue(new Error('fail'));
     const result = await myFunction('test');
     expect(result).toBeNull(); // or whatever the fallback is
   });
   ```

4. **Async behavior**
   ```typescript
   it('should resolve with data', async () => {
     vi.mocked(getData).mockResolvedValue(expected);
     const result = await myAsyncFunction();
     expect(result).toEqual(expected);
   });
   ```

5. **Edge cases** - null, undefined, empty string, empty array, boundary values

---

## Coverage Requirements Table

| Source File | Area | Priority | Difficulty | Key Things to Test |
|-------------|------|----------|------------|-------------------|
| `tokenizer.ts` | search | HIGH | Low | `tokenize()`, `classifyMatch()`, MatchType weights |
| `search-cache.ts` | search | HIGH | Low | get, set, eviction, TTL, clear |
| `scorer-manager.ts` | search | HIGH | Medium | `getAllScorers()`, weight sum, scorer registration |
| `title-scorer.ts` | scorers | HIGH | Medium | `score()` for exact/prefix/substring/none |
| `url-scorer.ts` | scorers | HIGH | Medium | `score()` for URL/hostname/path matching |
| `meta-scorer.ts` | scorers | HIGH | Low | `score()` for meta description + keywords |
| `recency-scorer.ts` | scorers | HIGH | Low | `score()` for time decay curve |
| `visitcount-scorer.ts` | scorers | HIGH | Low | `score()` for visit frequency |
| `settings.ts` | core | HIGH | Medium | init, getSetting, updateSetting, schema validation |
| `helpers.ts` | core | HIGH | Low | `detectBrowser()`, `browserAPI`, `isFirefox()` |
| `database.ts` | background | HIGH | Hard | IndexedDB operations, getSetting/setSetting |
| `search-engine.ts` | search | HIGH | Hard | `runSearch` orchestration, phase 1/2, scoring |
| `query-expansion.ts` | search | HIGH | Low | `expand()`, synonym map |
| `logger.ts` | core | MEDIUM | Medium | Logger class, log levels, `forComponent()` |
| `constants.ts` | core | MEDIUM | Low | Exported constant values |
| `ai-keyword-cache.ts` | background | MEDIUM | Medium | Cache hit/miss/eviction |
| `ai-keyword-expander.ts` | background | MEDIUM | Hard | LLM call, caching, error handling |
| `resilience.ts` | background | MEDIUM | Medium | Circuit breaker, retry, memory guard |
| `embedding-processor.ts` | background | MEDIUM | Hard | Background processing, batching |
| `extractor.ts` | content_scripts | MEDIUM | Medium | DOM metadata extraction |
| `favicon-cache.ts` | background | LOW | Medium | Cache operations |
| `performance-monitor.ts` | background | LOW | Medium | Timing, metrics |
| `diagnostics.ts` | background | LOW | Medium | Diagnostic info collection |
| `search-debug.ts` | background | LOW | Medium | Debug utilities |
| `popup.ts` | popup | LOW | Hard | Large file (108KB), test utility functions only |
| `quick-search.ts` | content_scripts | LOW | Hard | Large file (92KB), test utility functions only |

---

## Shared Mock Helper Patterns

Use these factory functions in tests that share common data shapes:

### IndexedItem Factory

```typescript
function createMockItem(overrides?: Partial<IndexedItem>): IndexedItem {
  return {
    url: 'https://example.com',
    title: 'Test Page',
    hostname: 'example.com',
    metaDescription: '',
    metaKeywords: [],
    visitCount: 1,
    lastVisit: Date.now(),
    tokens: ['test', 'page'],
    ...overrides,
  };
}
```

### ScoredItem Factory

```typescript
function createMockScoredItem(url: string, title: string, score: number): ScoredItem {
  return {
    item: createMockItem({ url, title, hostname: new URL(url).hostname }),
    finalScore: score,
  };
}
```

### Fetch Response Factory

```typescript
function createMockResponse(body: unknown, ok = true, status = 200): Partial<Response> {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}
```

---

## Working Modes

### Mode 1: Single File

Generate tests for one source file:
1. Read the source file to understand its exports and behavior
2. Create `src/<area>/__tests__/<name>.test.ts`
3. Run: `npx vitest run src/<area>/__tests__/<name>.test.ts`

### Mode 2: Folder

Process all untested files in a directory:
1. List all `*.ts` source files in the folder (exclude `index.ts`, existing test files)
2. Check which already have tests in `__tests__/`
3. Generate tests for untested files
4. Run: `npx vitest run src/<area>/__tests__/`

### Mode 3: Repository-Wide

Systematic coverage improvement:
1. Run `npx vitest run --coverage` to get current metrics
2. Use the Coverage Requirements Table to prioritize
3. Generate HIGH priority first, then MEDIUM, then LOW
4. Verify with `npx vitest run --coverage`

### Mode 4: Update Existing

Improve coverage of already-tested files:
1. Read existing test file and source file
2. Identify uncovered branches/paths from coverage report
3. Add new `describe`/`it` blocks (never remove existing tests)
4. Run: `npx vitest run src/<area>/__tests__/<name>.test.ts`

---

## Coverage Metrics

| Metric | Minimum | Target |
|--------|---------|--------|
| Statements | 90% | 100% |
| Branches | 90% | 100% |
| Functions | 90% | 100% |
| Lines | 90% | 100% |

---

## Edge Cases to Always Test

- **Null/Undefined:** `null`, `undefined`, missing properties
- **Empty Collections:** `[]`, `{}`, `''`
- **Boundary Values:** 0, -1, `Number.MAX_SAFE_INTEGER`, string length limits
- **Error Paths:** Thrown errors, rejected promises, network failures
- **Async Behavior:** Resolved, rejected, timed out (use `vi.useFakeTimers()`)
- **Chrome API Errors:** `chrome.runtime.lastError` patterns
- **Type Coercion:** Number as string, boolean as string, `NaN`

---

## Non-Refactoring Policy

**Do NOT:**
- Modify production/business logic files
- Add exports to source files to "make them testable"
- Change function signatures or module structure
- Add IDs or selectors to HTML templates for testing
- Install new dependencies without explicit approval

**Do INSTEAD:**
- Test through the public API (exported functions/classes)
- If a function is not exported, test it through its exported consumer
- Use existing mocking patterns to isolate dependencies
- Accept that some internal-only code has indirect coverage

---

## Running Tests

| Command | Purpose |
|---------|---------|
| `npm test` | Run all tests once |
| `npm run test:watch` | Watch mode (re-runs on file change) |
| `npx vitest run <path>` | Run specific test file |
| `npx vitest run --coverage` | Run with v8 coverage report |
| `npx vitest run src/background/__tests__/` | Run all tests in a folder |

---

## Common Gotchas

1. **`chrome.storage.local.get` uses callbacks**, not Promises. Mock with:
   ```typescript
   get: vi.fn((_keys: unknown, cb: (r: Record<string, unknown>) => void) => cb({}))
   ```

2. **`vi.mock()` is hoisted** to top of file, but `vi.stubGlobal()` is NOT. Order matters: `vi.mock()` first, then `vi.stubGlobal()` in `beforeEach` or at top level.

3. **Modules with side effects** (e.g., `service-worker.ts` registers listeners at import). Use `vi.hoisted()` + `vi.resetModules()` + dynamic `import()`.

4. **jsdom has NO Chrome APIs.** Every test needing `chrome.*` must mock it.

5. **`Logger.forComponent()` returns a new instance.** Mock the factory, not individual methods.

6. **`indexedDB` does not exist in jsdom.** Either use `fake-indexeddb/auto` or `vi.mock('../database')`.

7. **Large UI files** (`popup.ts` at 108KB, `quick-search.ts` at 92KB) are DOM-heavy. Test their exported utility functions, not entire DOM lifecycle. Low ROI in jsdom.

8. **`vi.resetModules()`** invalidates all `vi.mock()` registrations. Re-register mocks or use dynamic `import()` after reset.

---

## Summary Checklist

- Only create/modify `*.test.ts` files
- No changes to production code
- 90-100% coverage (mandatory)
- Use `vi.mock()` and `vi.fn()` for mocking
- Follow AAA pattern in all tests
- Test all public functions
- Test error scenarios and edge cases
- Clean up with `beforeEach`/`afterEach`
- Run `npx vitest run` to verify
- Use existing patterns from this document

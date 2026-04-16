# E2E Testing — Playwright for Chrome MV3 Extensions

SmrutiCortex uses **Playwright** for end-to-end testing of the Chrome MV3 extension. This document is a complete reference for the architecture, fixture design, troubleshooting, and patterns used — written to be reusable by anyone building E2E tests for Chrome extensions.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Fixture Design](#fixture-design--the-extensionts-core)
- [The withSlowMo Pattern](#the-withslowmo-pattern)
- [Service Worker Lifecycle and Timer Cleanup](#service-worker-lifecycle-and-timer-cleanup)
- [Test Inventory](#test-inventory)
- [Test Data Strategy](#test-data-strategy)
- [Content Scripts and the Isolated World](#content-scripts-and-the-isolated-world)
- [Fast vs Slow-Mo](#fast-vs-slow-mo)
- [Commands Reference](#commands-reference)
- [Writing New Tests](#writing-new-tests)
- [Troubleshooting](#troubleshooting)
- [Network Dependency](#network-dependency)
- [CI Considerations](#ci-considerations)

---

## Architecture Overview

```
e2e/
├── fixtures/
│   └── extension.ts               # Custom Playwright fixtures (browser, tour skip, page lifecycle, withSlowMo)
├── 01-tour.spec.ts                # Feature tour validation (runs FIRST, alphabetical ordering)
├── popup-smoke.spec.ts            # Popup UI: layout, search, settings modal, perf modal, hash routing, data actions
├── popup-appearance.spec.ts       # Theme switching, display mode (list/cards), match highlighting
├── keyboard.spec.ts               # Keyboard navigation: Esc, arrows, Enter, Tab
├── quick-search-smoke.spec.ts     # Quick-search overlay: content script, Shadow DOM, functional search
├── search-with-history.spec.ts    # History indexing + search with real developer sites
└── empty-state.spec.ts            # Empty state: recent searches, recently visited sections
```

### Why Playwright for Chrome Extensions?

Chrome extensions can't run in headless mode (Chromium limitation for MV3). Playwright supports `chromium.launchPersistentContext()` with `--load-extension` flags, making it the only modern framework that can:

1. Load an **unpacked extension** into a real Chrome instance
2. Access the **service worker** programmatically (`context.serviceWorkers()`)
3. Navigate to `chrome-extension://<id>/popup/popup.html` directly
4. Interact with **Shadow DOM** content scripts on live web pages
5. Evaluate code inside the service worker or content script contexts

---

## Fixture Design — The `extension.ts` Core

The fixture (`e2e/fixtures/extension.ts`) is the heart of E2E testing. It provides three fixtures with two different scopes:

```
┌─────────────────────────────────────────────────────────────┐
│  Worker Scope (one per test file)                           │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ extensionContext  — BrowserContext with extension loaded│ │
│  │ extensionId       — the extension's unique chrome ID   │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Test Scope (one per test)                              │ │
│  │ ┌──────────────────────────────────────────────────┐   │ │
│  │ │ extPage — fresh tab, auto-closed after test      │   │ │
│  │ │          wrapped with withSlowMo if SLOW_MO > 0  │   │ │
│  │ └──────────────────────────────────────────────────┘   │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Why Worker-Scoped Browser Context?

Each test file launches **one** Chrome instance (not one per test). Tests share the browser and open/close tabs.

```
Worker lifecycle (per test file):
  ┌─ Launch Chrome with extension ─────────────┐
  │  ┌─ Test 1: open tab → assert → close tab ─┤
  │  ├─ Test 2: open tab → assert → close tab ─┤
  │  ├─ Test N: open tab → assert → close tab ─┤
  │  └─ ...                                     │
  └─ Teardown: clear SW timers → close Chrome ──┘
```

**Why not per-test browser?** Launching Chrome for each test causes:
- Resource exhaustion (multiple Chrome instances competing for GPU/memory)
- 2-5x slower execution
- Extension re-installation overhead on every test

### Tour Auto-Dismissal (the `@BeforeAll` Pattern)

The popup auto-launches a 6-step feature tour on first visit (checks `chrome.storage.local` for `tourCompleted`). In a fresh Playwright browser, storage is empty, so the tour **always** fires. The tour creates overlay elements at **z-index 99999** that intercept all clicks — breaking every popup test.

**Solution:** The fixture marks `tourCompleted: true` via the service worker immediately after browser launch:

```typescript
await bg.evaluate(async () => {
  await chrome.storage.local.set({ tourCompleted: true });
});
```

This acts as JUnit's `@BeforeAll` — runs once per browser context, before any test. The tour itself is validated in `01-tour.spec.ts`, which explicitly resets the flag.

### Test-Scoped Pages (the `@BeforeEach` / `@AfterEach` Pattern)

Each test gets a fresh tab via the `extPage` fixture. The tab is automatically closed after the test:

```typescript
extPage: async ({ extensionContext }, use) => {
  const raw = await extensionContext.newPage();
  const page = SLOW_MO > 0 ? withSlowMo(raw, SLOW_MO) : raw;
  await use(page);
  await raw.close();  // @AfterEach — always closes, even on failure
},
```

---

## The `withSlowMo` Pattern

This is a custom solution to a Playwright architectural limitation that is not documented anywhere.

### The Problem

Playwright's built-in `slowMo` option (passed to `launchPersistentContext()`) adds a **synchronous delay** to every Chrome DevTools Protocol (CDP) command dispatched through its internal `_doSlowMo()` function in `node_modules/playwright-core/lib/server/dispatchers/dispatcher.js`.

When `ctx.close()` is called, Playwright sends dozens of internal CDP commands (detach targets, stop workers, close pages). With `slowMo=400` and 20+ accumulated test targets, the close operation **blocks Node's event loop entirely** — meaning `setTimeout`, `Promise.race`, and even `process.exit()` cannot fire.

### Why 1 Test Works But 26 Tests Hang

With 1 test, Chrome has few internal CDP targets to close — the blocking is brief. With 26 tests, Chrome accumulates more targets (page handles, service worker evaluations, history entries), and the close takes long enough to trigger an indefinite block.

### The Solution

`slowMo` is **never** passed to `launchPersistentContext()`. Instead:

1. **`withSlowMo()`** adds `page.waitForTimeout(ms)` before each **Page**-level action (`goto`, `reload`, `page.click`, …).

2. **Locator actions** — Almost all SmrutiCortex tests use `page.locator('#x').click()` / `.fill()`, not `page.click(selector)`. Those call methods on **Locator**, so patching `Page` alone produces **no visible slowdown**. When `SLOW_MO > 0`, the fixture patches **`Locator.prototype`** once (click, fill, hover, etc.): each action waits `ms` before running. This keeps `expect(locator)` working (Playwright rejects Proxied locators).

This gives the same visual debugging experience (watch the browser step through actions) but leaves `ctx.close()` completely unaffected — it runs at full speed with no event loop blocking.

### How to Use It

**Recommended (works everywhere, including Windows):** use the helper script so `SLOW_MO` is set inside Node — no shell variable quirks.

```bash
node scripts/e2e-slowmo.mjs               # default 400ms pause before each action
node scripts/e2e-slowmo.mjs 800           # 800ms for stronger visibility
node scripts/e2e-slowmo.mjs 400 e2e/01-tour.spec.ts   # slow-mo + single spec
```

Build first if `dist/` is stale: `npm run build:prod && node scripts/e2e-slowmo.mjs`

Manual env (if you prefer):

```bash
SLOW_MO=400 npx playwright test          # Linux/Mac / Git Bash
$env:SLOW_MO=400; npx playwright test    # PowerShell
set SLOW_MO=400 && npx playwright test   # cmd.exe
```

See [Fast vs Slow-Mo](#fast-vs-slow-mo) for a quick comparison table and troubleshooting if slow-mo doesn't feel visible.

### Key Takeaway

**Never pass `slowMo` directly to `launchPersistentContext()` for Chrome extension testing.** Use the page-level wrapper approach instead. This applies to any extension with active service worker timers (which is most production extensions).

---

## Service Worker Lifecycle and Timer Cleanup

### The Problem

Chrome's MV3 service workers have a lifecycle: they stay alive while there are active handles (timers, fetch events, message listeners). SmrutiCortex's service worker uses `setInterval()` for performance monitoring and index status polling. These timers prevent Chrome from shutting down when Playwright calls `ctx.close()`.

### The Fix

The fixture teardown clears **all** service worker timers before closing the browser. The technique exploits the fact that `setInterval()` returns sequentially increasing integer IDs:

```typescript
// Allocate one timer to discover the highest ID, then clear everything
await sws[0].evaluate(() => {
  const id = setInterval(() => {}, 1e9) as unknown as number;
  for (let i = 1; i <= id; i++) {
    clearInterval(i);
    clearTimeout(i);
  }
});
```

### Full Teardown Sequence

```typescript
// 1. Clear all service worker timers
const sws = ctx.serviceWorkers();
if (sws.length > 0) {
  await sws[0].evaluate(() => { /* clear all timers */ }).catch(() => {});
}

// 2. Close all open pages
for (const p of ctx.pages()) {
  await p.close().catch(() => {});
}

// 3. Close the browser context (now fast — no timers blocking)
await ctx.close().catch(() => {});

// 4. Clean up the temp profile directory
fs.rmSync(userDataDir, { recursive: true, force: true });
```

Each step is wrapped in `.catch(() => {})` or `try/catch` because the service worker or pages may already be gone if Chrome shut down early.

---

## Test Inventory

| Spec File | Tests | Area | What It Validates |
|-----------|-------|------|-------------------|
| `01-tour.spec.ts` | 3 | Tour | Full 6-step walkthrough, skip button, no-relaunch guard |
| `popup-smoke.spec.ts` | 18 | Popup | Layout, search, settings modal (8 tabs), perf modal, hash routing, data actions |
| `popup-appearance.spec.ts` | 3 | Popup | Theme switching, display mode (list/cards), match highlighting |
| `keyboard.spec.ts` | 4 | Popup | Esc clear, arrow navigation, Enter opens tab, ArrowUp returns to input |
| `quick-search-smoke.spec.ts` | 6 | Overlay | Content script message, Shadow DOM overlay, search in overlay, Esc close, settings link |
| `search-with-history.spec.ts` | 5 | Search | Browse 6 real sites, rebuild index, live search, sort, multi-term, clear |
| `empty-state.spec.ts` | 2 | Popup | Recent history section, recent searches section |

**Total: ~41 tests** across 7 spec files.

---

## Test Data Strategy

### Real URLs for History Tests

The `search-with-history.spec.ts` file uses 6 globally-accessible developer sites:

| URL | Expected Search Term | Why This Site |
|-----|---------------------|---------------|
| `github.com` | `github` | Every developer's daily driver |
| `stackoverflow.com` | `stackoverflow` | Distinct multi-word title, heavy page |
| `developer.mozilla.org` | `mozilla` | MDN — canonical web reference |
| `news.ycombinator.com` | `hacker` | Title says "Hacker News" — tests title tokenization |
| `en.wikipedia.org` | `wikipedia` | Stable, fast, unique tokens |
| `google.com` | `google` | Universal, always resolves |

**Why real URLs instead of `example.com`?** The extension indexes `title + URL` via its tokenizer. Real sites produce diverse, realistic tokens that exercise the actual search pipeline. `example.com` has a single-word title and no real content — it wouldn't catch tokenization or scoring regressions.

### `domcontentloaded` vs `load`

History tests use `waitUntil: 'domcontentloaded'` instead of `'load'`:

- `domcontentloaded` fires when the HTML is parsed and the `<title>` is set — this is all Chrome needs to record the history entry
- `load` waits for every sub-resource (images, scripts, fonts), which can time out on heavy sites like StackOverflow (15s+ load times)

### Dwell Time

Each visit includes an 800ms `waitForTimeout` after navigation. This gives Chrome time to flush the history entry to its internal SQLite database before the indexer reads `chrome.history.search()`.

### CI Guard with `test.skip()`

On some CI environments (or very fresh profiles), Chrome's history API may not capture visits from a temporary profile. The tests guard against this:

```typescript
if (!searchResult?.results?.length) {
  await popupPage.close();
  test.skip();  // Skip gracefully — don't fail CI
  return;
}
```

---

## Content Scripts and the Isolated World

Chrome MV3 content scripts run in an **isolated world** — a separate JavaScript context from the page's main world:

```
Main World (page.evaluate sees this)     Isolated World (content script runs here)
┌─────────────────────────────────┐     ┌─────────────────────────────────┐
│  window.myVar = "page"          │     │  window.__SMRUTI_QUICK_SEARCH_  │
│  // page.evaluate CAN see this  │     │  // page.evaluate CANNOT see    │
└─────────────────────────────────┘     └─────────────────────────────────┘
                                BUT: DOM is SHARED
                    ┌───────────────────────────────────┐
                    │  #smruti-cortex-overlay  ← VISIBLE│
                    │  to both worlds and to Playwright  │
                    └───────────────────────────────────┘
```

**What works:**
- `page.locator('#smruti-cortex-overlay')` — DOM elements created by the content script are visible
- `background.evaluate(...)` — Evaluate code inside the service worker context
- `chrome.tabs.sendMessage(...)` from the service worker to trigger content script actions

**What doesn't work:**
- `page.evaluate(() => window.__SMRUTI_QUICK_SEARCH_LOADED__)` — Returns `undefined` because the flag lives in the isolated world

### Shadow DOM Testing

The quick-search overlay uses Shadow DOM for style isolation. To interact with elements inside it:

```typescript
// Option 1: Evaluate inside the shadow root
const hasInput = await page.evaluate(() => {
  const host = document.querySelector('#smruti-cortex-overlay');
  return host?.shadowRoot?.querySelector('.search-input') !== null;
});

// Option 2: Use Playwright's built-in shadow piercing (for visibility checks)
await expect(page.locator('#smruti-cortex-overlay')).toBeAttached();
```

---

## Fast vs Slow-Mo

By default, E2E tests run at full Playwright speed — no artificial delays. Slow-mo is **opt-in** for visual debugging.

| Scenario | Command | Speed |
|----------|---------|-------|
| Full-speed E2E | `npx playwright test` | ~30s |
| Full-speed E2E (with build) | `npm run test:e2e` | ~60s |
| Slow-mo (400ms default) | `node scripts/e2e-slowmo.mjs` | ~5min |
| Slow-mo (custom ms) | `node scripts/e2e-slowmo.mjs 800` | ~8min |
| Slow-mo + single spec | `node scripts/e2e-slowmo.mjs 400 e2e/popup-smoke.spec.ts` | varies |

### How `npm run verify` runs E2E

`verify.mjs` runs E2E at full speed by default. Two flags control E2E behavior:

- `npm run verify -- --no-e2e` — skip E2E entirely (fast, ~2min)
- `npm run verify -- --e2e-slowmo` — run E2E with slow-mo (visual debugging, ~8min)

Without either flag, verify uses plain `npx playwright test` (~4min total).

### Slow-mo not visible?

If slow-mo appears to have no effect:

1. **Using `npm run test:e2e` instead of slow-mo script** — `test:e2e` runs at full speed. Use `node scripts/e2e-slowmo.mjs` for slow-mo.
2. **On an older revision** — before commit `853df39`, only `Page`-level methods were patched. Since tests use `page.locator().click()` (Locator methods), the delays had no effect. The current fixture patches `Locator.prototype` directly.
3. **Delay too low** — 400ms can feel quick with many tests. Try `node scripts/e2e-slowmo.mjs 800` or `1000`.

See [The withSlowMo Pattern](#the-withslowmo-pattern) for the full technical explanation.

---

## Commands Reference

### Run All E2E Tests

```bash
npx playwright test
```

### Run with Visual Slow-Motion

```bash
node scripts/e2e-slowmo.mjs               # default 400ms, assumes dist/ exists
node scripts/e2e-slowmo.mjs 800           # stronger visibility — 800ms between actions
node scripts/e2e-slowmo.mjs 400 e2e/popup-smoke.spec.ts   # slow-mo on a single spec
node scripts/e2e-slowmo.mjs -h            # show usage help
```

If you need to build first, run `npm run build:prod` before the slow-mo command.

### Run a Specific Test File

```bash
npx playwright test e2e/popup-smoke.spec.ts
npx playwright test e2e/01-tour.spec.ts
```

### Run a Single Test by Name

```bash
npx playwright test -g "Esc clears"
npx playwright test -g "completes all 6 steps"
```

### Debug a Failing Test (Step-by-Step)

```bash
npx playwright test --debug
```

Opens Playwright Inspector: a GUI debugger where you can step through each action, inspect locators, and see the browser state.

### View the HTML Report

```bash
npx playwright show-report
```

Opens a detailed HTML report with screenshots, traces, and timing for every test.

### View Failure Traces

```bash
npx playwright show-trace test-results/<test-name>/trace.zip
```

### Run Specific Test Group

```bash
npx playwright test -g "Keyboard"
npx playwright test -g "Settings"
npx playwright test -g "Quick-search"
```

---

## Prerequisite: Build First

E2E tests load the extension from `dist/`. Always build before running:

```bash
npm run build:prod && npx playwright test
```

Or use the npm shortcut:

```bash
npm run test:e2e
```

---

## Writing New Tests

### 1. Add to an Existing File

For popup-related tests, add to `popup-smoke.spec.ts`:

```typescript
test('my new popup test', async ({ extPage: page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  // ... assertions
});
```

### 2. Create a New Test File

```typescript
import { test, expect } from './fixtures/extension';

test.describe('My feature tests', () => {
  test('feature works', async ({ extPage: page, extensionId }) => {
    // extPage gives you a fresh tab (auto-closed after test)
    // extensionId gives you the extension's unique ID
    // extensionContext gives you the full browser context (for service worker access)
  });
});
```

### 3. Access the Service Worker

```typescript
test('service worker does X', async ({ extensionContext }) => {
  const bg = extensionContext.serviceWorkers()[0];
  const result = await bg.evaluate(async () => {
    return await chrome.storage.local.get('someKey');
  });
  expect(result).toHaveProperty('someKey', 'expectedValue');
});
```

### 4. Test Content Script Effects

```typescript
test('content script creates overlay', async ({ extPage: page, extensionContext }) => {
  await page.goto('https://example.com', { waitUntil: 'load' });

  // Wait for content script to be ready (poll via SW message)
  const bg = extensionContext.serviceWorkers()[0];
  await bg.evaluate(async (url: string) => {
    const tabs = await chrome.tabs.query({ url });
    for (let i = 0; i < 15; i++) {
      const r = await new Promise(resolve => {
        chrome.tabs.sendMessage(tabs[0].id!, { type: 'OPEN_INLINE_SEARCH' }, resolve);
      });
      if (r?.success) return;
      await new Promise(r => setTimeout(r, 200));
    }
  }, 'https://example.com/*');

  await expect(page.locator('#smruti-cortex-overlay')).toBeAttached({ timeout: 5000 });
});
```

---

## Troubleshooting

### Tests Hang After All Pass (Process Never Exits)

This is the most critical operational issue with Playwright + Chrome extensions. The symptom: all tests print `ok`, but no summary line appears and the Node process never exits.

**Root cause chain (three layers):**

1. **Service worker timers keep Chrome alive.** See [Service Worker Lifecycle and Timer Cleanup](#service-worker-lifecycle-and-timer-cleanup).
2. **Playwright's built-in `slowMo` blocks the event loop.** See [The withSlowMo Pattern](#the-withslowmo-pattern).
3. **Orphaned Chrome processes compound the problem.** Each interrupted/hung test run leaves behind Playwright Chromium processes.

**The fix is already implemented** in `e2e/fixtures/extension.ts`. If you still get a hang after an interrupted run, clean up orphaned processes (see below).

### Tour Overlay Blocks Clicks

**Cause:** Fresh browser has no `tourCompleted` in storage → tour fires → z-index 99999 overlay intercepts all clicks.

**Fix:** Already handled by the fixture. If you create a custom fixture, remember to set `tourCompleted: true`.

### `page.evaluate` Can't See Content Script Variables

**Cause:** Chrome MV3 isolated world. Content script JS is in a separate context from `page.evaluate`.

**Fix:** Test DOM effects (`page.locator()`) or use service worker messaging (`bg.evaluate()`) instead.

### Chrome Processes Leak After Interrupted Run

> **WARNING:** Never use `Get-Process -Name "chrome*" | Stop-Process -Force`. This kills ALL Chrome processes including your personal browser and PWA windows.

Playwright uses its own Chromium binary at `%LOCALAPPDATA%\ms-playwright\chromium-*\` (separate from `C:\Program Files\Google\Chrome\`). The fixture creates an isolated temp profile (`smruti-cortex-e2e-*`) so it never touches your personal Chrome data.

**Full cleanup (safe — only kills Playwright's Chromium, not your Chrome):**

```bash
# PowerShell — kill orphaned Playwright Chromium + clean temp profiles
Get-Process chrome | Where-Object { $_.Path -like '*ms-playwright*' } | Stop-Process -Force
Remove-Item "$env:TEMP\smruti-cortex-e2e-*" -Recurse -Force

# Linux/Mac
pkill -f "ms-playwright" ; rm -rf /tmp/smruti-cortex-e2e-*
```

If you only want to kill the Playwright test runner:

```bash
# PowerShell — kill by PID (shown in terminal output)
Stop-Process -Id <PID> -Force

# Linux/Mac
pkill -f "playwright test"
```

---

## Network Dependency

Several tests navigate to real websites:

| Test File | Sites | Why |
|-----------|-------|-----|
| `quick-search-smoke.spec.ts` | `example.com` | Content scripts only inject on `http(s)://` pages (not `chrome-extension://` or `about:blank`) |
| `search-with-history.spec.ts` | `github.com`, `stackoverflow.com`, `developer.mozilla.org`, `news.ycombinator.com`, `en.wikipedia.org`, `google.com` | Populates Chrome's history DB with real developer-browsing data |

All sites are globally accessible and stable. `example.com` is IANA's reserved domain. The others are top-100 sites with near-100% uptime.

**Implication:** E2E tests require internet access. If offline, content-script and history tests will fail but popup-only tests will still pass (they use `chrome-extension://` URLs).

---

## CI Considerations

- Chrome extensions **require headed mode** (`headless: false`). CI runners need a display server (Xvfb on Linux).
- `workers: 1` is mandatory — extensions share a single browser state.
- Build time (~30s) + test time (~20-30s) = ~50-60s total for `npm run test:e2e`.
- HTML report is generated in `playwright-report/` — archive as a CI artifact.
- History tests may skip on CI if Chrome's temp profile doesn't flush history entries. This is expected behavior, not a failure.

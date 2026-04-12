# E2E Testing — Playwright for Chrome Extensions

SmrutiCortex uses **Playwright** for end-to-end testing of the Chrome MV3 extension. This document covers the architecture, patterns, and operational commands for running, debugging, and extending E2E tests.

---

## Architecture Overview

```
e2e/
├── fixtures/
│   └── extension.ts           # Custom Playwright fixtures (browser launch, tour skip, page lifecycle)
├── 01-tour.spec.ts            # Feature tour validation (runs FIRST, alphabetical ordering)
├── popup-smoke.spec.ts        # Popup UI: load, search, settings, performance modal
├── quick-search-smoke.spec.ts # Quick-search overlay, service worker health
└── search-with-history.spec.ts # History indexing + search with real developer sites
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

The fixture is the heart of E2E testing. It solves three Chrome extension challenges:

### 1. Worker-Scoped Browser Context

Each test file launches **one** Chrome instance (not one per test). Tests share the browser and open/close tabs.

```
Worker lifecycle (per test file):
  ┌─ Launch Chrome with extension ─────────────┐
  │  ┌─ Test 1: open tab → assert → close tab ─┤
  │  ├─ Test 2: open tab → assert → close tab ─┤
  │  ├─ Test N: open tab → assert → close tab ─┤
  │  └─ ...                                     │
  └─ Close Chrome ──────────────────────────────┘
```

**Why not per-test browser?** Launching Chrome for each test causes:
- Resource exhaustion (multiple Chrome instances competing for GPU/memory)
- Hanging `context.close()` calls when the extension has active intervals (e.g., performance monitor polling)
- 2-5x slower execution

### 2. Tour Auto-Dismissal (`@BeforeAll` Pattern)

The popup auto-launches a feature tour on first visit (checks `chrome.storage.local` for `tourCompleted`). In a fresh Playwright browser, storage is empty, so the tour **always** fires.

The tour creates overlay elements at **z-index 99999** that intercept all UI clicks — breaking every popup test.

**Solution:** The fixture marks `tourCompleted: true` via the service worker immediately after browser launch:

```typescript
// Inside extensionContext fixture (worker-scoped)
await bg.evaluate(async () => {
  await chrome.storage.local.set({ tourCompleted: true });
});
```

This acts as JUnit's `@BeforeAll` — runs once per browser context, before any test.

### 3. Test-Scoped Pages (`@BeforeEach` Pattern)

Each test gets a fresh tab via the `extPage` fixture. The tab is automatically closed after the test:

```typescript
extPage: async ({ extensionContext }, use) => {
  const page = await extensionContext.newPage();  // @BeforeEach
  await use(page);
  await page.close();                              // @AfterEach
},
```

---

## Test Files — What Each One Covers

### `01-tour.spec.ts` — Feature Tour (3 tests)

Runs **first** (alphabetical `01-` prefix). Validates the tour lifecycle before other tests skip it.

| Test | What It Verifies |
|------|-----------------|
| Full walkthrough | Tour auto-launches, all 6 steps are clickable (Next → Done), tour elements removed after Done |
| Skip button | Skip button dismisses tour immediately, marks `tourCompleted: true` |
| Already completed | When `tourCompleted` is already set, tour never appears (verified after 1000ms wait) |

**Key pattern:** The tour test *resets* the `tourCompleted` flag before navigating:

```typescript
await bg.evaluate(async () => {
  await chrome.storage.local.remove('tourCompleted');
});
```

### `popup-smoke.spec.ts` — Popup UI (15 tests)

| Group | Tests | What It Verifies |
|-------|-------|-----------------|
| Page load | 4 | Brand text, logo, subtitle, footer hints, sort dropdown, tour button |
| Search input | 3 | Text entry, clear button visibility, clear resets, autofocus attribute |
| Settings modal | 7 | Open/close, 8 tab buttons, default tab, tab switching, Advanced diagnostics, Data management |
| Performance modal | 1 | Opens from Advanced tab, shows metrics, closes cleanly |

### `search-with-history.spec.ts` — Real-World Search (5 tests)

Exercises the **full indexing → search pipeline** with globally-accessible developer sites. This is the closest to a real user's browsing → search flow.

| Test | What It Verifies |
|------|-----------------|
| Browse + rebuild + verify | Visits 6 developer sites (GitHub, StackOverflow, MDN, Hacker News, Wikipedia, Google), triggers `REBUILD_INDEX`, confirms search returns results |
| Live search results | Types a query in the popup input, verifies `<li>` result items render |
| Sort switching | Toggles Best Match → Most Recent → Alphabetical → Best Match, results persist |
| Multi-term search | Searches for 3 different terms (stackoverflow, mozilla, wikipedia), each yields results |
| Clear button | Fill + clear resets input value and button visibility |

**Test data philosophy:** The URLs were chosen to match a developer's daily browsing pattern. Each has a **distinct title** (tokenized differently by the extension) and a **globally stable URL** that resolves anywhere. The extension indexes `title + url` via `tokenize()`, so these sites produce rich, searchable tokens.

**Timing strategy:** Each site visit uses `waitUntil: 'load'` + 800ms dwell time to ensure Chrome's history DB flushes the entry before the indexer reads `chrome.history.search()`. The `REBUILD_INDEX` message is synchronous (callback fires when indexing completes), so no additional wait is needed after rebuild.

### `quick-search-smoke.spec.ts` — Quick-Search & Service Worker (3 tests)

| Group | Tests | What It Verifies |
|-------|-------|-----------------|
| Content script | 1 | Service worker can reach content script via `chrome.tabs.sendMessage` |
| Overlay lifecycle | 1 | `OPEN_INLINE_SEARCH` message causes `#smruti-cortex-overlay` to attach to DOM |
| Service worker health | 1 | `PING` message from popup returns `{ status: 'ok' }` |

---

## Content Scripts and the Isolated World

Chrome MV3 content scripts run in an **isolated world** — a separate JavaScript context from the page's main world. This has critical testing implications:

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

---

## Commands Reference

### Run All E2E Tests

```bash
npx playwright test
```

### Run with Visual Slow-Motion (Watch Mode)

```bash
# Set SLOW_MO environment variable (milliseconds between each action)
SLOW_MO=400 npx playwright test          # Linux/Mac
$env:SLOW_MO=400; npx playwright test    # PowerShell
set SLOW_MO=400 && npx playwright test   # cmd.exe
```

### Run a Specific Test File

```bash
npx playwright test e2e/popup-smoke.spec.ts
npx playwright test e2e/01-tour.spec.ts
```

### Run a Single Test by Name

```bash
npx playwright test -g "renders brand"
npx playwright test -g "tour auto-launches"
```

### Debug a Failing Test (Step-by-Step)

```bash
npx playwright test --debug
```

This opens Playwright Inspector: a GUI debugger where you can step through each action, inspect locators, and see the browser state.

### View the HTML Report

```bash
npx playwright show-report
```

Opens a detailed HTML report with screenshots, traces, and timing for every test. Reports are generated in `playwright-report/`.

### View Failure Traces

When a test fails, Playwright captures a trace file. View it with:

```bash
npx playwright show-trace test-results/<test-name>/trace.zip
```

### Run Specific Test Group

```bash
npx playwright test -g "settings modal"
npx playwright test -g "Quick-search"
npx playwright test -g "Service worker"
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
    // This runs inside the service worker context
    return await chrome.storage.local.get('someKey');
  });
  expect(result).toHaveProperty('someKey', 'expectedValue');
});
```

### 4. Test Content Script Effects

```typescript
test('content script creates DOM element', async ({ extPage: page, extensionContext }) => {
  await page.goto('https://example.com', { waitUntil: 'load' });
  await page.waitForTimeout(1500); // Wait for content script injection

  // Trigger via service worker
  const bg = extensionContext.serviceWorkers()[0];
  await bg.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: 'https://example.com/*' });
    await chrome.tabs.sendMessage(tabs[0].id!, { type: 'OPEN_INLINE_SEARCH' });
  });

  // Verify DOM effect (shared between main world and isolated world)
  await expect(page.locator('#smruti-cortex-overlay')).toBeAttached({ timeout: 5000 });
});
```

---

## Troubleshooting

### Tests Hang After All Pass (Process Never Exits)

This is the most critical operational issue with Playwright + Chrome extensions. The symptom is: all tests print `ok`, but no summary line appears and the Node process never exits.

**Root cause chain (three layers):**

1. **Service worker timers keep Chrome alive.** The extension's service worker runs `setInterval()` for performance monitoring and index status polling. Chrome's service worker lifecycle won't terminate the SW while active timers exist, which prevents Chrome from shutting down when Playwright calls `ctx.close()`.

2. **Playwright's built-in `slowMo` blocks the event loop.** When `slowMo` is passed to `launchPersistentContext()`, Playwright adds a synchronous delay to every CDP (Chrome DevTools Protocol) command dispatched through its internal `_doSlowMo()` in the dispatcher layer (`node_modules/playwright-core/lib/server/dispatchers/dispatcher.js`). During `ctx.close()`, Playwright sends dozens of internal CDP commands (detach targets, stop workers, close pages). With `slowMo=400` and 20+ accumulated test targets, the close operation **blocks Node's event loop entirely** — meaning `setTimeout`, `Promise.race`, and even `process.exit()` cannot fire.

3. **Orphaned Chrome processes compound the problem.** Each interrupted/hung test run leaves behind Playwright Chromium processes. These accumulate over debugging sessions and consume system resources, making subsequent runs more likely to hang.

**Why 1 test works but 26 tests hang:** With 1 test, Chrome has few internal CDP targets to close — the blocking is brief. With 26 tests, Chrome accumulates more targets (page handles, service worker evaluations, history entries), and the close takes long enough to trigger an indefinite block.

**The fix (implemented in `e2e/fixtures/extension.ts`):**

SlowMo is **not** passed to Playwright's `launchPersistentContext()`. Instead, the `withSlowMo()` wrapper adds `page.waitForTimeout(ms)` before each user-visible action (click, fill, goto, etc.) on the `extPage` fixture. This gives the same visual debugging experience but leaves `ctx.close()` completely unaffected — it runs at full speed.

Additionally, the fixture teardown clears all service worker timers before closing:

```typescript
await sws[0].evaluate(() => {
  const id = setInterval(() => {}, 1e9) as unknown as number;
  for (let i = 1; i <= id; i++) { clearInterval(i); clearTimeout(i); }
});
```

**If you still get a hang after an interrupted run:**

```bash
# Kill orphaned Playwright Chromium processes (NOT your personal Chrome)
Get-Process chrome | Where-Object { $_.Path -like '*ms-playwright*' } | Stop-Process -Force

# Clean temp profiles
Remove-Item "$env:TEMP\smruti-cortex-e2e-*" -Recurse -Force
```

**Key takeaway:** Never pass `slowMo` directly to `launchPersistentContext()` for Chrome extension testing. Use the page-level wrapper approach instead.

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

If you only want to kill the Playwright test runner (which auto-closes its Chromium):

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
- Build time (~30s) + test time (~20s) = ~50s total for `npm run test:e2e`.
- HTML report is generated in `playwright-report/` — archive as a CI artifact.

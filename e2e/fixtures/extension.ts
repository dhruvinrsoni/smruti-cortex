import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

const EXTENSION_PATH = path.resolve(__dirname, '../../dist');
// Set SLOW_MO=400 (or any ms value) to watch tests step-by-step.
// Prefer: npm run test:e2e:slowmo (sets SLOW_MO reliably on Windows).
// Implemented as page-level delays (not Playwright's built-in slowMo)
// because built-in slowMo blocks ctx.close() indefinitely with 20+ tests.
const SLOW_MO = Number(process.env.SLOW_MO) || 0;

/**
 * Wrap a Page so that user-visible actions (click, fill, goto, …) pause
 * for SLOW_MO milliseconds before executing. This gives the same visual
 * effect as Playwright's built-in slowMo but doesn't affect ctx.close().
 */
function withSlowMo(page: Page, ms: number): Page {
  const methods = [
    'click', 'dblclick', 'fill', 'type', 'press', 'check', 'uncheck',
    'selectOption', 'hover', 'goto', 'goBack', 'goForward', 'reload',
  ] as const;
  for (const name of methods) {
    const orig = (page as any)[name].bind(page);
    (page as any)[name] = async (...args: any[]) => {
      await page.waitForTimeout(ms);
      return orig(...args);
    };
  }
  return page;
}

/**
 * Worker-scoped fixtures: ONE browser launches per worker (not per test).
 * Each test gets its own page (tab) via the `extPage` fixture.
 *
 * Uses a dedicated temp profile directory (smruti-cortex-e2e-*) so the
 * Playwright Chromium instance is fully isolated from the user's personal
 * Chrome browser and PWAs.
 *
 * Tour dismissal: marks `tourCompleted: true` in chrome.storage immediately
 * after launch so the popup's auto-tour never blocks UI interactions.
 * The tour itself is tested in `01-tour.spec.ts` which resets the flag.
 */
export const test = base.extend<
  { extPage: Page },
  { extensionContext: BrowserContext; extensionId: string }
>({
  // eslint-disable-next-line no-empty-pattern
  extensionContext: [async ({}, use) => {
    // Dedicated temp profile — never touches the user's personal Chrome data
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smruti-cortex-e2e-'));

    const ctx = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      // slowMo is NOT passed here — see withSlowMo() wrapper above.
      // Playwright's built-in slowMo blocks ctx.close() indefinitely
      // when the extension's service worker has active timers.
      args: [
        '--no-first-run',
        '--no-default-browser-check',
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    // Wait for the service worker to be available
    let [bg] = ctx.serviceWorkers();
    if (!bg) bg = await ctx.waitForEvent('serviceworker');

    // @BeforeAll — dismiss tour so it never blocks popup UI tests
    await bg.evaluate(async () => {
      await (globalThis as any).chrome.storage.local.set({ tourCompleted: true });
    });

    await use(ctx);

    // ── Teardown ──
    // Clear service worker timers (perf monitor, index status polling)
    // so Chrome's service worker lifecycle allows shutdown.
    try {
      const sws = ctx.serviceWorkers();
      if (sws.length > 0) {
        await sws[0].evaluate(() => {
          const id = setInterval(() => {}, 1e9) as unknown as number;
          for (let i = 1; i <= id; i++) {
            clearInterval(i);
            clearTimeout(i);
          }
        }).catch(() => {});
      }
    } catch { /* SW may be gone */ }

    for (const p of ctx.pages()) {
      await p.close().catch(() => {});
    }

    await ctx.close().catch(() => {});

    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* non-critical */ }
  }, { scope: 'worker' }],

  extensionId: [async ({ extensionContext }, use) => {
    let [background] = extensionContext.serviceWorkers();
    if (!background) {
      background = await extensionContext.waitForEvent('serviceworker');
    }
    const extensionId = background.url().split('/')[2];
    await use(extensionId);
  }, { scope: 'worker' }],

  // Test-scoped: each test gets a fresh tab, closed automatically after.
  // When SLOW_MO is set, the page is wrapped so actions pause visually.
  extPage: async ({ extensionContext }, use) => {
    const raw = await extensionContext.newPage();
    const page = SLOW_MO > 0 ? withSlowMo(raw, SLOW_MO) : raw;
    await use(page);
    await raw.close();
  },
});

export const expect = test.expect;

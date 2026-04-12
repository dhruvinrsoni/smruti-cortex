import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

const EXTENSION_PATH = path.resolve(__dirname, '../../dist');
// Set SLOW_MO=400 (or any ms value) to watch tests step-by-step
const SLOW_MO = Number(process.env.SLOW_MO) || 0;

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
      ...(SLOW_MO > 0 && { slowMo: SLOW_MO }),
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

    // ── Teardown: prevent ctx.close() from hanging indefinitely ──
    // Root cause: the extension's service worker keeps active setInterval()
    // handles (performance monitor polling, index status checks). Chrome's
    // service worker lifecycle won't shut down while intervals are alive,
    // which blocks ctx.close() forever. Fix: clear them before closing.
    try {
      const sws = ctx.serviceWorkers();
      if (sws.length > 0) {
        await sws[0].evaluate(() => {
          const id = setInterval(() => {}, 1e9) as unknown as number;
          for (let i = 1; i <= id; i++) clearInterval(i);
        });
      }
    } catch { /* browser may already be gone */ }

    // Close all pages explicitly before closing the browser context
    for (const page of ctx.pages()) {
      await page.close().catch(() => {});
    }

    // Hard timeout: if ctx.close() still hangs (e.g. Chrome DevTools
    // protocol stalls), bail out after 5s so the process can exit
    await Promise.race([
      ctx.close(),
      new Promise<void>((resolve) => setTimeout(resolve, 5000)),
    ]);

    // Best-effort cleanup — Windows may hold file locks briefly after Chrome exits
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

  // Test-scoped: each test gets a fresh tab, closed automatically after
  extPage: async ({ extensionContext }, use) => {
    const page = await extensionContext.newPage();
    await use(page);
    await page.close();
  },
});

export const expect = test.expect;

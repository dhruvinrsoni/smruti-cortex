import { browserAPI } from '../../core/helpers';
import { Logger, errorMeta } from '../../core/logger';

const logger = Logger.forComponent('CommandsListener');

export function sendMessageWithTimeout<T = unknown>(tabId: number, message: unknown, timeoutMs: number = 500): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Content script response timeout'));
    }, timeoutMs);
    browserAPI.tabs.sendMessage(tabId, message, (response: T) => {
      clearTimeout(timer);
      if (browserAPI.runtime.lastError) {
        reject(new Error(browserAPI.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

export async function reinjectContentScript(tabId: number): Promise<boolean> {
  try {
    await (browserAPI as typeof chrome).scripting.executeScript({
      target: { tabId },
      files: ['content_scripts/quick-search.js'],
    });
    return true;
  } catch (err) {
    logger.debug('reinjectContentScript', 'executeScript failed (restricted tab, permission denied, etc.)', { tabId, ...errorMeta(err) });
    return false;
  }
}

let commandsListenerRegistered = false;

export function registerCommandsListenerEarly(): void {
  if (commandsListenerRegistered) {return;}
  if (browserAPI.commands && browserAPI.commands.onCommand && typeof browserAPI.commands.onCommand.addListener === 'function') {
    browserAPI.commands.onCommand.addListener(async (command) => {
      if (command === 'open-popup') {
        const t0 = performance.now();
        logger.debug('onCommand', '🚀 Keyboard shortcut triggered');
        try {
          const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
          if (tab?.id && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('edge://') && !tab.url.startsWith('about:') && !tab.url.startsWith('chrome-extension://') && !tab.url.startsWith('moz-extension://')) {
            try {
              const response = await sendMessageWithTimeout<{ success?: boolean }>(tab.id, { type: 'OPEN_INLINE_SEARCH' }, 300);
              if (response?.success) {
                logger.debug('onCommand', `✅ Quick-search opened in ${(performance.now() - t0).toFixed(1)}ms`);
                return;
              }
            } catch (tier2Err) {
              logger.debug('onCommand', 'Tier 2 (direct sendMessage) failed, trying re-injection', errorMeta(tier2Err));
            }
            try {
              const injected = await reinjectContentScript(tab.id);
              if (injected) {
                await new Promise(r => setTimeout(r, 150));
                const retryResponse = await sendMessageWithTimeout<{ success?: boolean }>(tab.id, { type: 'OPEN_INLINE_SEARCH' }, 400);
                if (retryResponse?.success) {
                  logger.info('onCommand', `✅ Quick-search opened after re-injection in ${(performance.now() - t0).toFixed(1)}ms`);
                  return;
                }
              }
            } catch (tier3Err) {
              logger.debug('onCommand', 'Tier 3 (re-inject + sendMessage) failed, falling back to popup', errorMeta(tier3Err));
            }
            logger.info('onCommand', 'Quick-search unavailable, opening popup');
            await (browserAPI.action as any).openPopup(); // eslint-disable-line @typescript-eslint/no-explicit-any
            logger.info('onCommand', `✅ Popup opened (fallback) in ${(performance.now() - t0).toFixed(1)}ms`);
          } else {
            logger.info('onCommand', `Special page detected (${tab?.url?.slice(0, 30)}...), using popup`);
            await (browserAPI.action as any).openPopup(); // eslint-disable-line @typescript-eslint/no-explicit-any
            logger.info('onCommand', `✅ Popup opened in ${(performance.now() - t0).toFixed(1)}ms`);
          }
        } catch (e) {
          logger.warn('onCommand', 'All tiers failed, attempting last-resort popup', errorMeta(e));
          try {
            await (browserAPI.action as any).openPopup(); // eslint-disable-line @typescript-eslint/no-explicit-any
          } catch (popupErr) {
            logger.error('onCommand', 'Last-resort popup also failed — keyboard shortcut dead', errorMeta(popupErr));
          }
        }
      }
    });
    commandsListenerRegistered = true;
  }
}

// ── Battery-aware keep-alive ────────────────────────────────────────
//
// Rationale: the previous design registered three parallel alarms
// (`keep-alive-1/2/3` at 0.5 / 1 / 2 min) that ran forever regardless
// of whether the user was actively using the browser. Under the 30 s
// cadence of `keep-alive-1` the other two added no measurable uptime
// gain but multiplied the number of SW wakes per hour — a tangible
// battery cost on laptops that sit idle for hours at a time.
//
// New model: one alarm (`keep-alive-main`) whose period is adjusted
// based on observed user activity.
//
// - While the user is active (any tab event, runtime message, or
//   `chrome.idle` active transition within the last 30 min), the alarm
//   ticks every 30 s — same as before, so evictions are unchanged on
//   the hot path.
// - After 30 min without any interaction, the alarm downshifts to a
//   5 min cadence. This is ~10x fewer SW wakes per hour. The warm
//   history cache (see `src/shared/recent-history-cache.ts`) covers
//   the evictions that may now happen during long idle stretches, so
//   the user-visible first paint stays instant.
// - On any new interaction the alarm snaps back to 30 s immediately.
//
// Using a single alarm name (rather than creating/clearing separate
// names) leans on Chrome's documented behavior that `alarms.create`
// with an existing name replaces the alarm in place — no explicit
// clear required, which also dodges the races that `clear` + `create`
// can produce.

const KEEP_ALIVE_MAIN = 'keep-alive-main';
const KEEP_ALIVE_ACTIVE_PERIOD_MIN = 0.5;
const KEEP_ALIVE_IDLE_PERIOD_MIN = 5;
const KEEP_ALIVE_IDLE_THRESHOLD_MS = 30 * 60 * 1000;

let lastUserInteractionAt = Date.now();
let currentAlarmMode: 'active' | 'idle' = 'active';

/**
 * Set the main keep-alive cadence. Idempotent: no-op when already in
 * the requested mode. Called by the alarm handler when user idle time
 * crosses the threshold, and by `recordUserInteraction()` when the
 * user comes back.
 */
function setAlarmMode(mode: 'active' | 'idle'): void {
  if (currentAlarmMode === mode) {return;}
  currentAlarmMode = mode;
  const period = mode === 'active'
    ? KEEP_ALIVE_ACTIVE_PERIOD_MIN
    : KEEP_ALIVE_IDLE_PERIOD_MIN;
  browserAPI.alarms.create(KEEP_ALIVE_MAIN, {
    delayInMinutes: period,
    periodInMinutes: period,
  });
  logger.debug(
    'keepAlive',
    `Switched keep-alive to ${mode} cadence (${period} min)`,
  );
}

/**
 * Record that the user is actively interacting with the browser.
 * Bumps the interaction timestamp and, if we had previously downshifted
 * to the idle cadence, immediately swaps back to the 30 s cadence so
 * the SW stays warm for the next user action.
 *
 * Exported so that other lifecycle listeners (idle → active, popup /
 * quick-search messages arriving at the SW) can feed the same signal.
 */
export function recordUserInteraction(): void {
  lastUserInteractionAt = Date.now();
  if (currentAlarmMode === 'idle') {
    setAlarmMode('active');
  }
}

export function keepServiceWorkerAlive(): void {
  lastUserInteractionAt = Date.now();
  currentAlarmMode = 'active';

  // Clear any legacy alarms left behind by older versions of this
  // extension that registered three parallel keep-alives. These ticks
  // would otherwise continue forever post-update, since Chrome persists
  // alarms across extension upgrades. `alarms.clear` is a no-op on
  // names that do not exist.
  try {
    browserAPI.alarms.clear?.('keep-alive-1');
    browserAPI.alarms.clear?.('keep-alive-2');
    browserAPI.alarms.clear?.('keep-alive-3');
  } catch { /* not available in every test environment */ }

  browserAPI.alarms.create(KEEP_ALIVE_MAIN, {
    delayInMinutes: KEEP_ALIVE_ACTIVE_PERIOD_MIN,
    periodInMinutes: KEEP_ALIVE_ACTIVE_PERIOD_MIN,
  });

  browserAPI.alarms.onAlarm.addListener((alarm) => {
    if (!alarm.name.startsWith('keep-alive')) {return;}
    // Startup/install seed alarms are handled by their own fixed cadence
    // and do not participate in the active/idle switch.
    if (alarm.name !== KEEP_ALIVE_MAIN) {return;}
    const idleMs = Date.now() - lastUserInteractionAt;
    if (currentAlarmMode === 'active' && idleMs > KEEP_ALIVE_IDLE_THRESHOLD_MS) {
      setAlarmMode('idle');
    }
    // active → active and idle → idle paths are intentional no-ops:
    // - active → active: the alarm's job is just to keep the SW up.
    // - idle → idle: staying dormant; `recordUserInteraction()` is
    //   what switches back, not the alarm tick itself.
  });

  browserAPI.runtime.onStartup.addListener(() => {
    lastUserInteractionAt = Date.now();
    browserAPI.alarms.create('keep-alive-restart', { delayInMinutes: 0.1, periodInMinutes: 0.5 });
  });
  browserAPI.runtime.onInstalled.addListener(() => {
    lastUserInteractionAt = Date.now();
    browserAPI.alarms.create('keep-alive-install', { delayInMinutes: 0.1, periodInMinutes: 0.5 });
  });

  // Any tab switch or URL change is a real user interaction — feed it
  // into the idle/active state machine. Previously these were no-ops
  // that existed only as a side-effect way of keeping the SW alive.
  browserAPI.tabs.onActivated.addListener(() => { recordUserInteraction(); });
  browserAPI.tabs.onUpdated.addListener(() => { recordUserInteraction(); });
}

/**
 * Test-only hooks. Module state (`lastUserInteractionAt`,
 * `currentAlarmMode`) is otherwise encapsulated.
 */
export const __testing = {
  KEEP_ALIVE_MAIN,
  KEEP_ALIVE_ACTIVE_PERIOD_MIN,
  KEEP_ALIVE_IDLE_PERIOD_MIN,
  KEEP_ALIVE_IDLE_THRESHOLD_MS,
  getLastUserInteractionAt: () => lastUserInteractionAt,
  getCurrentAlarmMode: () => currentAlarmMode,
  setLastUserInteractionAt: (t: number) => { lastUserInteractionAt = t; },
  resetKeepAliveState: () => {
    lastUserInteractionAt = Date.now();
    currentAlarmMode = 'active';
  },
};

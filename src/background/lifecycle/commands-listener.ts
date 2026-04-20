import { browserAPI } from '../../core/helpers';
import { Logger } from '../../core/logger';

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
  } catch {
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
            } catch { /* Tier 2 */ }
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
            } catch { /* Tier 3 */ }
            logger.info('onCommand', 'Quick-search unavailable, opening popup');
            await (browserAPI.action as any).openPopup(); // eslint-disable-line @typescript-eslint/no-explicit-any
            logger.info('onCommand', `✅ Popup opened (fallback) in ${(performance.now() - t0).toFixed(1)}ms`);
          } else {
            logger.info('onCommand', `Special page detected (${tab?.url?.slice(0, 30)}...), using popup`);
            await (browserAPI.action as any).openPopup(); // eslint-disable-line @typescript-eslint/no-explicit-any
            logger.info('onCommand', `✅ Popup opened in ${(performance.now() - t0).toFixed(1)}ms`);
          }
        } catch (e) {
          const errorMsg = (e as Error).message || 'Unknown error';
          logger.info('onCommand', `All tiers failed (${errorMsg}), last-resort popup`);
          try {
            await (browserAPI.action as any).openPopup(); // eslint-disable-line @typescript-eslint/no-explicit-any
          } catch { /* best effort */ }
        }
      }
    });
    commandsListenerRegistered = true;
  }
}

export function keepServiceWorkerAlive(): void {
  browserAPI.alarms.create('keep-alive-1', { delayInMinutes: 0.5, periodInMinutes: 0.5 });
  browserAPI.alarms.create('keep-alive-2', { delayInMinutes: 1, periodInMinutes: 1 });
  browserAPI.alarms.create('keep-alive-3', { delayInMinutes: 2, periodInMinutes: 2 });
  browserAPI.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name.startsWith('keep-alive')) { /* noop — keeps SW alive */ }
  });
  browserAPI.runtime.onStartup.addListener(() => {
    browserAPI.alarms.create('keep-alive-restart', { delayInMinutes: 0.1, periodInMinutes: 0.5 });
  });
  browserAPI.runtime.onInstalled.addListener(() => {
    browserAPI.alarms.create('keep-alive-install', { delayInMinutes: 0.1, periodInMinutes: 0.5 });
  });
  browserAPI.tabs.onActivated.addListener(() => { /* keeps SW alive */ });
  browserAPI.tabs.onUpdated.addListener(() => { /* keeps SW alive */ });
}

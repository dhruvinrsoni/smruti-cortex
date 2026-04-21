import { runSearch } from '../search/search-engine';
import { browserAPI } from '../../core/helpers';
import { Logger, errorMeta } from '../../core/logger';

const logger = Logger.forComponent('PortMessaging');

export interface PortMessagingDeps {
  isInitialized: () => boolean;
  getInitPromise: () => Promise<void> | null;
  /**
   * Mirrors the `sendMessage` wake path: when the service worker is not yet
   * initialized and there is no active init promise (e.g. after post-hibernate
   * eviction), ensureReady() triggers init/self-heal so the port path can
   * actually recover instead of responding "Service worker not ready".
   * Returns true when the SW is healthy and ready to handle requests.
   */
  ensureReady: () => Promise<boolean>;
}

export function setupPortBasedMessaging(deps: PortMessagingDeps): void {
  browserAPI.runtime.onConnect.addListener((port) => {
    if (port.name === 'quick-search') {
      logger.debug('onConnect', 'Quick-search port connected');
      let portDisconnected = false;
      const PORT_RATE_LIMIT = 30;
      const PORT_RATE_WINDOW_MS = 1000;
      let portSearchCount = 0;
      let portRateWindowStart = Date.now();

      port.onMessage.addListener(async (msg) => {
        // Liveness probe: short-circuit before the init gate so the content
        // script can measure round-trip health (and force a wake) while the
        // SW is still booting. Must never do any heavy work.
        if (msg?.type === 'PING') {
          try { port.postMessage({ type: 'PONG', t: msg.t }); } catch { /* port closed */ }
          return;
        }

        if (msg.type === 'SEARCH_QUERY') {
          const now = Date.now();
          if (now - portRateWindowStart > PORT_RATE_WINDOW_MS) {
            portSearchCount = 0;
            portRateWindowStart = now;
          }
          if (++portSearchCount > PORT_RATE_LIMIT) {
            logger.debug('portMessage', `Rate limited: ${portSearchCount} searches in window`);
            try { port.postMessage({ error: 'Rate limited', query: msg.query }); } catch { /* port closed */ }
            return;
          }
          const t0 = performance.now();
          const portQuery = typeof msg.query === 'string' ? msg.query.slice(0, 500) : '';
          logger.debug('portMessage', `Quick-search query: "${portQuery}"`);
          if (!deps.isInitialized()) {
            const initPromise = deps.getInitPromise();
            if (initPromise) {
              try { await initPromise; } catch {
                const healed = await deps.ensureReady();
                if (!healed) {
                  try { port.postMessage({ error: 'Service worker not ready' }); } catch { /* port closed */ }
                  return;
                }
              }
            } else {
              // Symmetric with the runtime.onMessage path: if there is no
              // active init promise (typical after hibernate eviction), try
              // to recover via ensureReady() which may kick off init or
              // self-heal a half-stuck SW.
              const healed = await deps.ensureReady();
              if (!healed) {
                try { port.postMessage({ error: 'Service worker not ready' }); } catch { /* port closed */ }
                return;
              }
            }
          }
          try {
            const { getLastAIStatus } = await import('../search/search-engine');
            const results = await runSearch(portQuery, { skipAI: !!msg.skipAI });
            const aiStatus = getLastAIStatus();
            logger.debug('portMessage', `Search completed in ${(performance.now() - t0).toFixed(2)}ms, results: ${results.length}`);
            if (!portDisconnected) {
              try { port.postMessage({ results, aiStatus, query: portQuery, skipAI: !!msg.skipAI }); } catch { /* port closed */ }
            }
          } catch (error) {
            logger.error('portMessage', 'Search error:', errorMeta(error));
            if (!portDisconnected) {
              try { port.postMessage({ error: (error as Error).message, query: portQuery, skipAI: !!msg.skipAI }); } catch { /* port closed */ }
            }
          }
        }
      });
      port.onDisconnect.addListener(() => {
        portDisconnected = true;
        logger.debug('onDisconnect', 'Quick-search port disconnected');
      });
    }
  });
}

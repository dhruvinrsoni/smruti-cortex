import { runSearch, abortActiveSearch } from '../search/search-engine';
import { embeddingProcessor } from '../embedding-processor';
import { browserAPI } from '../../core/helpers';
import { Logger, errorMeta } from '../../core/logger';
import { safePortPost } from '../../shared/runtime-messaging';

const logger = Logger.forComponent('PortMessaging');

const activePorts = new Set<chrome.runtime.Port>();

/** Push a message to every currently-connected quick-search port. */
export function broadcastToActivePorts(message: object): void {
    for (const port of activePorts) {
        safePortPost(port, message);
    }
}

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
      activePorts.add(port);
      let portDisconnected = false;
      // Sliding-window rate limit. A fixed window with a hard boundary can be
      // exploited to submit 2 * PORT_RATE_LIMIT in a tiny slice straddling the
      // boundary (e.g. 60 at t=900ms then 60 at t=1100ms). A ring of recent
      // send timestamps gives true per-N-ms semantics and makes the safety
      // wall honest.
      //
      // Cap was raised from 30 to 60 to match observed worst-case legitimate
      // bursts (fast paste + IME composition commit + Phase 1 / Phase 2
      // double-dispatch). The client-side dispatch guard in
      // quick-search-utils.ts already collapses same-intent duplicates, so
      // this cap should never fire for well-behaved clients.
      const PORT_RATE_LIMIT = 60;
      const PORT_RATE_WINDOW_MS = 1000;
      const portRecentTimestamps: number[] = [];
      // Dropped-streak tracking so we can aggregate over a saturation burst
      // into a single debug log on recovery, instead of one log per dropped
      // request. Saturated streaks longer than the window will still only
      // log once (on exit), preventing console spam.
      let portRateStreakDropped = 0;
      let portRateStreakStart: number | null = null;

      port.onMessage.addListener(async (msg) => {
        // Liveness probe: short-circuit before the init gate so the content
        // script can measure round-trip health (and force a wake) while the
        // SW is still booting. Must never do any heavy work.
        if (msg?.type === 'PING') {
          safePortPost(port, { type: 'PONG', t: msg.t });
          return;
        }

        // Cancel the currently in-flight search. Used by the UI when the user
        // toggles AI/Semantic OFF mid-search so the Ollama slot is freed
        // immediately rather than waiting for the existing Phase 2 to time out.
        // Idempotent; never replies.
        if (msg?.type === 'CANCEL_SEARCH') {
          embeddingProcessor.noteUserActivity();
          abortActiveSearch();
          return;
        }

        if (msg.type === 'SEARCH_QUERY') {
          embeddingProcessor.noteUserActivity();
          const now = Date.now();
          const cutoff = now - PORT_RATE_WINDOW_MS;
          while (portRecentTimestamps.length > 0 && portRecentTimestamps[0] <= cutoff) {
            portRecentTimestamps.shift();
          }
          if (portRecentTimestamps.length >= PORT_RATE_LIMIT) {
            if (portRateStreakStart === null) {
              portRateStreakStart = now;
            }
            portRateStreakDropped++;
            safePortPost(port, { error: 'Rate limited', query: msg.query });
            return;
          }
          if (portRateStreakStart !== null) {
            logger.debug(
              'portMessage',
              `Rate limit streak ended: dropped ${portRateStreakDropped} requests over ${now - portRateStreakStart}ms`,
            );
            portRateStreakDropped = 0;
            portRateStreakStart = null;
          }
          portRecentTimestamps.push(now);
          const t0 = performance.now();
          const portQuery = typeof msg.query === 'string' ? msg.query.slice(0, 500) : '';
          logger.debug('portMessage', `Quick-search query: "${portQuery}"`);
          if (!deps.isInitialized()) {
            const initPromise = deps.getInitPromise();
            if (initPromise) {
              try { await initPromise; } catch {
                const healed = await deps.ensureReady();
                if (!healed) {
                  safePortPost(port, { error: 'Service worker not ready' });
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
                safePortPost(port, { error: 'Service worker not ready' });
                return;
              }
            }
          }
          // Layer 2: echo back the client-supplied epoch so a slow Phase 2
          // for an earlier toggle/setting state can be dropped client-side
          // (the client bumps the epoch on AI/Semantic flip).
          const requestEpoch = typeof msg.epoch === 'number' ? msg.epoch : 0;
          try {
            const { getLastAIStatus } = await import('../search/search-engine');
            const results = await runSearch(portQuery, { skipAI: !!msg.skipAI });
            const aiStatus = getLastAIStatus();
            logger.debug('portMessage', `Search completed in ${(performance.now() - t0).toFixed(2)}ms, results: ${results.length}`);
            if (!portDisconnected) {
              safePortPost(port, { results, aiStatus, query: portQuery, skipAI: !!msg.skipAI, epoch: requestEpoch });
            }
          } catch (error) {
            logger.error('portMessage', 'Search error:', errorMeta(error));
            if (!portDisconnected) {
              safePortPost(port, { error: (error as Error).message, query: portQuery, skipAI: !!msg.skipAI, epoch: requestEpoch });
            }
          }
        }
      });
      port.onDisconnect.addListener(() => {
        portDisconnected = true;
        activePorts.delete(port);
        logger.debug('onDisconnect', 'Quick-search port disconnected');
      });
    }
  });
}

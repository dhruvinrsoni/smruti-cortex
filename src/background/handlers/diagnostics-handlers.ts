 
import { MessageHandlerRegistry } from './registry';
import { Logger, errorMeta } from '../../core/logger';
import { SettingsManager } from '../../core/settings';

const log = Logger.forComponent('DiagnosticsHandlers');

export function registerDiagnosticsPreInitHandlers(registry: MessageHandlerRegistry): void {
  registry.register('GET_PERFORMANCE_METRICS', async (_msg, _sender, sendResponse) => {
    log.debug('handle', 'GET_PERFORMANCE_METRICS requested');
    try {
      const { getPerformanceMetrics, formatMetricsForDisplay } = await import('../performance-monitor');
      const { getStorageQuotaInfo } = await import('../database');
      const [metrics, storageInfo] = await Promise.all([
        getPerformanceMetrics(),
        getStorageQuotaInfo().catch(() => null),
      ]);
      const storage = storageInfo
        ? { usedFormatted: storageInfo.usedFormatted, totalFormatted: storageInfo.totalFormatted }
        : undefined;
      const formatted = formatMetricsForDisplay(metrics, storage);
      sendResponse({ status: 'OK', metrics, formatted });
    } catch (error) {
      log.error('handle', 'GET_PERFORMANCE_METRICS failed:', errorMeta(error));
      sendResponse({ status: 'ERROR', message: (error as Error).message });
    }
  });

  registry.register('RESET_PERFORMANCE_METRICS', async (_msg, _sender, sendResponse) => {
    log.info('handle', 'RESET_PERFORMANCE_METRICS requested');
    try {
      const { performanceTracker } = await import('../performance-monitor');
      await performanceTracker.reset();
      sendResponse({ status: 'OK' });
    } catch (error) {
      log.error('handle', 'RESET_PERFORMANCE_METRICS failed:', errorMeta(error));
      sendResponse({ status: 'ERROR', message: (error as Error).message });
    }
  });

  registry.register('EXPORT_DIAGNOSTICS', async (_msg, _sender, sendResponse) => {
    log.info('handle', '📋 EXPORT_DIAGNOSTICS requested');
    try {
      const { exportDiagnosticsAsJson } = await import('../diagnostics');
      const diagnosticsJson = await exportDiagnosticsAsJson();
      log.info('handle', '✅ EXPORT_DIAGNOSTICS completed');
      sendResponse({ status: 'OK', data: diagnosticsJson });
    } catch (error) {
      log.error('handle', 'EXPORT_DIAGNOSTICS failed:', errorMeta(error));
      sendResponse({ status: 'ERROR', message: (error as Error).message });
    }
  });

  registry.register('GET_SEARCH_ANALYTICS', async (_msg, _sender, sendResponse) => {
    try {
      const { getSearchAnalytics } = await import('../diagnostics');
      const analytics = getSearchAnalytics();
      sendResponse({ status: 'OK', analytics });
    } catch (error) {
      sendResponse({ status: 'ERROR', message: (error as Error).message });
    }
  });

  registry.register('EXPORT_SEARCH_DEBUG', async (_msg, _sender, sendResponse) => {
    try {
      const { getSearchHistory } = await import('../diagnostics');
      const history = getSearchHistory();
      const data = JSON.stringify({ history, exportTimestamp: Date.now() }, null, 2);
      sendResponse({ status: 'OK', data });
    } catch (error) {
      sendResponse({ status: 'ERROR', message: (error as Error).message });
    }
  });

  registry.register('GET_SEARCH_DEBUG_ENABLED', async (_msg, _sender, sendResponse) => {
    try {
      const { isSearchDebugEnabled } = await import('../diagnostics');
      const enabled = isSearchDebugEnabled();
      sendResponse({ status: 'OK', enabled });
    } catch (error) {
      sendResponse({ status: 'ERROR', message: (error as Error).message });
    }
  });

  registry.register('SET_SEARCH_DEBUG_ENABLED', async (msg, _sender, sendResponse) => {
    try {
      const { setSearchDebugEnabled } = await import('../diagnostics');
      await setSearchDebugEnabled(msg.enabled ?? false);
      sendResponse({ status: 'OK' });
    } catch (error) {
      sendResponse({ status: 'ERROR', message: (error as Error).message });
    }
  });

  registry.register('CLEAR_SEARCH_DEBUG', async (_msg, _sender, sendResponse) => {
    try {
      const { searchDebugService } = await import('../search-debug');
      searchDebugService.clearHistory();
      sendResponse({ status: 'OK' });
    } catch (error) {
      sendResponse({ status: 'ERROR', message: (error as Error).message });
    }
  });

  registry.register('CLEAR_RECENT_SEARCHES', async (_msg, _sender, sendResponse) => {
    try {
      await chrome.storage.local.remove('recentSearches');
      sendResponse({ status: 'OK' });
    } catch (error) {
      sendResponse({ status: 'ERROR', message: (error as Error).message });
    }
  });

  registry.register('GENERATE_RANKING_REPORT', async (msg, _sender, sendResponse) => {
    log.info('handle', '📋 GENERATE_RANKING_REPORT requested');
    try {
      const { generateRankingReport, createGitHubIssue, buildGitHubIssueUrl } = await import('../ranking-report');
      const report = generateRankingReport({
        maskingLevel: msg.maskingLevel || 'partial',
        userNote: msg.userNote,
      });
      if (!report) {
        sendResponse({ status: 'ERROR', message: 'No search snapshot available. Run a search first.' });
        return;
      }
      if (msg.method === 'api') {
        try {
          const issueUrl = await createGitHubIssue(report);
          sendResponse({ status: 'OK', method: 'api', issueUrl, reportBody: report.body });
        } catch (apiErr) {
          const fallbackUrl = buildGitHubIssueUrl(report);
          sendResponse({ status: 'OK', method: 'url', issueUrl: fallbackUrl, reportBody: report.body, apiError: (apiErr as Error).message });
        }
      } else {
        const issueUrl = buildGitHubIssueUrl(report);
        sendResponse({ status: 'OK', method: 'url', issueUrl, reportBody: report.body });
      }
    } catch (error) {
      log.error('handle', 'GENERATE_RANKING_REPORT failed:', errorMeta(error));
      sendResponse({ status: 'ERROR', message: (error as Error).message });
    }
  });
}

export function registerDiagnosticsPostInitHandlers(registry: MessageHandlerRegistry): void {
  registry.register('RUN_TROUBLESHOOTER', async (_msg, _sender, sendResponse) => {
    log.info('handle', '🩺 RUN_TROUBLESHOOTER requested');
    try {
      const overallStart = performance.now();
      const steps: Array<{ id: string; label: string; status: string; detail: string; durationMs: number }> = [];

      const runStep = async (
        id: string,
        label: string,
        fn: () => Promise<{ status: string; detail: string }>,
      ) => {
        const t0 = performance.now();
        try {
          const r = await fn();
          steps.push({ id, label, ...r, durationMs: Math.round(performance.now() - t0) });
        } catch (err) {
          steps.push({ id, label, status: 'fail', detail: (err as Error).message, durationMs: Math.round(performance.now() - t0) });
        }
      };

      // 1. Service Worker
      await runStep('sw-alive', 'Service Worker', async () => ({ status: 'pass', detail: 'Running' }));

      // 2. Database
      await runStep('db-open', 'Database', async () => {
        const { openDatabase } = await import('../database');
        const { recoverFromCorruption } = await import('../resilience');
        try {
          await openDatabase();
          return { status: 'pass', detail: 'Open, healthy' };
        } catch {
          const recovered = await recoverFromCorruption();
          return recovered
            ? { status: 'healed', detail: 'Recovered from corruption' }
            : { status: 'fail', detail: 'Database inaccessible' };
        }
      });

      // 3. Search Index
      await runStep('index-health', 'Search Index', async () => {
        const { getAllIndexedItems } = await import('../database');
        const { selfHeal } = await import('../resilience');
        const items = await getAllIndexedItems();
        if (items.length > 0) {
          return { status: 'pass', detail: `${items.length.toLocaleString()} items indexed` };
        }
        await selfHeal('Troubleshooter');
        const after = await getAllIndexedItems();
        return after.length > 0
          ? { status: 'healed', detail: `Rebuilt — ${after.length.toLocaleString()} items indexed` }
          : { status: 'fail', detail: 'Index empty after rebuild' };
      });

      // 4. Search Cache
      await runStep('search-cache', 'Search Cache', async () => {
        const { clearSearchCache } = await import('../search/search-cache');
        clearSearchCache();
        return { status: 'pass', detail: 'Cleared' };
      });

      // 5. Favicon Cache
      await runStep('favicon-cache', 'Favicon Cache', async () => {
        const { getFaviconCacheStats, clearExpiredFavicons } = await import('../favicon-cache');
        const stats = await getFaviconCacheStats();
        const cleared = await clearExpiredFavicons();
        const detail = cleared > 0
          ? `${stats.count} entries, cleared ${cleared} expired`
          : `${stats.count} entries`;
        return { status: cleared > 0 ? 'healed' : 'pass', detail };
      });

      // 6. AI / Embeddings
      await runStep('embeddings', 'AI / Embeddings', async () => {
        const embeddingsEnabled = SettingsManager.getSetting('embeddingsEnabled');
        if (!embeddingsEnabled) {
          return { status: 'skipped', detail: 'Disabled' };
        }
        const { embeddingProcessor } = await import('../embedding-processor');
        const progress = embeddingProcessor.getProgress();
        if (progress.state === 'error') {
          await embeddingProcessor.start();
          return { status: 'healed', detail: 'Restarted from error state' };
        }
        const pct = progress.total > 0
          ? Math.round((progress.withEmbeddings / progress.total) * 100)
          : 0;
        return { status: 'pass', detail: `${progress.state} (${pct}%)` };
      });

      // 7. Ollama Connectivity
      await runStep('ollama', 'Ollama Connectivity', async () => {
        const ollamaEnabled = SettingsManager.getSetting('ollamaEnabled');
        if (!ollamaEnabled) {
          return { status: 'skipped', detail: 'Disabled' };
        }
        const { isCircuitBreakerOpen } = await import('../ollama-service');
        return isCircuitBreakerOpen()
          ? { status: 'fail', detail: 'Circuit breaker open (cooling down)' }
          : { status: 'pass', detail: 'Connected' };
      });

      const hasHealed = steps.some(s => s.status === 'healed');
      const hasFail = steps.some(s => s.status === 'fail');
      const overallStatus = hasFail ? 'issues-remain' : hasHealed ? 'healed' : 'healthy';

      sendResponse({
        status: 'OK',
        data: {
          steps,
          overallStatus,
          totalDurationMs: Math.round(performance.now() - overallStart),
        },
      });
    } catch (error) {
      log.error('handle', 'RUN_TROUBLESHOOTER failed:', errorMeta(error));
      sendResponse({ status: 'ERROR', message: (error as Error).message });
    }
  });
}

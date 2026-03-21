/**
 * quick-search.ts
 * Ultra-fast inline search overlay that bypasses service worker wake-up delays.
 * 
 * Architecture: Uses shared search-ui-base.ts for DRY compliance.
 * Performance Optimizations:
 * - Shadow DOM for complete style isolation (no CSS conflicts)
 * - CSS containment for faster rendering
 * - Port-based messaging for faster search-as-you-type
 * - Service worker pre-warming on visibility change
 * - Early overlay pre-creation
 * - Performance timing logs at debug level
 */

/* eslint-disable no-inner-declarations */
// ^ Functions intentionally nested inside conditional blocks to guard against double-injection

import {
  type SearchResult,
  type FocusableGroup,
  type AIStatus,
  KeyboardAction,
  createMarkdownLink,
  copyHtmlLinkToClipboard,
  handleCyclicTabNavigation,
  parseKeyboardAction,
  renderResults as renderResultsShared,
  sortResults,
  tokenizeQuery,
  highlightHtml,
  renderAIStatus as renderAIStatusShared,
} from '../shared/search-ui-base';

import { type AppSettings, DisplayMode } from '../core/settings';

// Extend window interface for our extension
declare global {
  interface Window {
    __SMRUTI_QUICK_SEARCH_LOADED__?: boolean;
  }
}

// Prevent double-injection
if (!window.__SMRUTI_QUICK_SEARCH_LOADED__) {
  window.__SMRUTI_QUICK_SEARCH_LOADED__ = true;

  // ===== CONFIGURATION =====
  const OVERLAY_ID = 'smruti-cortex-overlay';
  const DEBOUNCE_MS = 150; // Wait for user to pause typing before searching (prevents flicker)
  const MAX_RESULTS = 15;
  
  // Log level constants (matches Logger.LogLevel)
  const LOG_LEVEL = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
    TRACE: 4
  };
  
  // Dynamic log level - fetched from settings
  let currentLogLevel = LOG_LEVEL.INFO;

  // ===== STRUCTURED LOGGING =====
  // All logs go through these helpers so they respect the dynamic log level
  const log = {
    error: (tag: string, ...args: unknown[]) => {
      if (currentLogLevel >= LOG_LEVEL.ERROR) { console.error(`[SmrutiCortex:${tag}]`, ...args); }
    },
    warn: (tag: string, ...args: unknown[]) => {
      if (currentLogLevel >= LOG_LEVEL.WARN) { console.warn(`[SmrutiCortex:${tag}]`, ...args); }
    },
    info: (tag: string, ...args: unknown[]) => {
      if (currentLogLevel >= LOG_LEVEL.INFO) { console.info(`[SmrutiCortex:${tag}]`, ...args); }
    },
    debug: (tag: string, ...args: unknown[]) => {
      if (currentLogLevel >= LOG_LEVEL.DEBUG) { console.debug(`[SmrutiCortex:${tag}]`, ...args); }
    },
    trace: (tag: string, ...args: unknown[]) => {
      if (currentLogLevel >= LOG_LEVEL.TRACE) { console.debug(`[SmrutiCortex:${tag}]`, ...args); }
    },
  };

  // ===== PERFORMANCE TIMING =====
  const perfLog = (label: string, startTime?: number) => {
    if (currentLogLevel < LOG_LEVEL.DEBUG) {return;}
    if (startTime !== undefined) {
      console.debug(`[SmrutiCortex Perf] ${label}: ${(performance.now() - startTime).toFixed(2)}ms`);
    } else {
      console.debug(`[SmrutiCortex Perf] ${label} @ ${performance.now().toFixed(2)}ms`);
    }
  };

  // ===== STATE =====
  let shadowHost: HTMLDivElement | null = null;
  let shadowRoot: ShadowRoot | null = null;
  let overlayEl: HTMLDivElement | null = null;
  let inputEl: HTMLInputElement | null = null;
  let resultsEl: HTMLDivElement | null = null;
  let settingsBtn: HTMLButtonElement | null = null;
  let selectedIndex = 0;
  let currentResults: SearchResult[] = [];
  let debounceTimer: number | null = null;
  let qsFocusTimer: number | null = null;  // Delayed focus to results (cancelled on new typing)
  let overlayFocusInterval: ReturnType<typeof setInterval> | null = null; // Tracked to prevent leaks
  let overlayFocusTimeouts: ReturnType<typeof setTimeout>[] = [];         // Tracked backup timeouts
  let searchPort: chrome.runtime.Port | null = null;
  let prewarmed = false;
  let cachedSettings: AppSettings | null = null;
  let searchDebounceMs = DEBOUNCE_MS;
  let aiDebounceTimer: number | null = null; // Separate longer debounce for AI expansion
  let aiSearchPending = false; // True from handleInput until Phase 2 response arrives (or AI disabled)
  let hidePortCloseTimer: number | null = null;
  let spinnerEl: HTMLDivElement | null = null;
  let aiStatusBarEl: HTMLDivElement | null = null;
  let currentAIExpandedTokens: string[] = [];
  let spinnerTimeoutTimer: number | null = null; // Safety timeout to prevent stuck spinner
  const SPINNER_TIMEOUT_MS = 15_000; // Hide spinner after 15s if no response
  // Helper: returns the currently focused element inside our shadow root if any
  function getFocusedElement(): Element | null {
    try {
      if (shadowRoot) {
        const focused = shadowRoot.querySelector(':focus') as Element | null;
        if (focused) { return focused; }
      }
    } catch {
      // ignore
    }
    return document.activeElement;
  }

  // Helper: Check if extension context is still valid
  function isExtensionContextValid(): boolean {
    try {
      return !!(chrome?.runtime?.id);
    } catch {
      return false;
    }
  }

  // Track context invalidation recovery attempts
  let contextRecoveryAttempts = 0;
  const MAX_CONTEXT_RECOVERY_ATTEMPTS = 3;
  const CONTEXT_RECOVERY_DELAY = 500; // ms

  // Helper: Attempt to recover from context invalidation
  async function attemptContextRecovery(): Promise<boolean> {
    if (contextRecoveryAttempts >= MAX_CONTEXT_RECOVERY_ATTEMPTS) {
      return false;
    }
    
    contextRecoveryAttempts++;
    
    // Wait before checking again (exponential backoff)
    const delay = CONTEXT_RECOVERY_DELAY * Math.pow(2, contextRecoveryAttempts - 1);
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Check if context is now valid
    if (isExtensionContextValid()) {
      contextRecoveryAttempts = 0; // Reset on success
      // Try to reopen search port
      if (!searchPort) {
        openSearchPort();
      }
      return true;
    }
    
    return false;
  }

  // Helper: Sanitize query string to prevent issues with special characters or malformed URLs
  function sanitizeQuery(query: string): string {
    if (!query) {return '';}
    // Trim whitespace
    let sanitized = query.trim();
    // Remove control characters (non-printable ASCII and DEL)
    sanitized = sanitized.split('').filter(ch => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code !== 127;
    }).join('');
    // Limit length to prevent abuse
    if (sanitized.length > 500) {
      sanitized = sanitized.substring(0, 500);
    }
    return sanitized;
  }

  // ===== STYLES (inlined for instant loading, with CSS containment) =====
  // Supports both light and dark themes via prefers-color-scheme
  const OVERLAY_STYLES = `
    :host {
      all: initial;
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      z-index: 2147483647 !important;
      pointer-events: none;
      color-scheme: light dark;
    }
    :host(.visible) {
      pointer-events: auto;
    }
    * {
      box-sizing: border-box;
    }
    
    /* CSS Variables for theming */
    :host {
      --bg-overlay: rgba(0, 0, 0, 0.5);
      --bg-container: #ffffff;
      --bg-header: #f8f9fa;
      --bg-hover: #e9ecef;
      --bg-kbd: #e9ecef;
      --border-color: #dee2e6;
      --text-primary: #212529;
      --text-secondary: #6c757d;
      --text-url: #6c757d;
      --accent-color: #0d6efd;
      --highlight-bg: #fff3cd;
      --highlight-text: #664d03;
      --highlight-ai-bg: #dcfce7;
      --highlight-ai-text: #14532d;
    }

    @media (prefers-color-scheme: dark) {
      :host {
        --bg-overlay: rgba(0, 0, 0, 0.6);
        --bg-container: #1e1e2e;
        --bg-header: #181825;
        --bg-hover: #313244;
        --bg-kbd: #313244;
        --border-color: #313244;
        --text-primary: #cdd6f4;
        --text-secondary: #a6adc8;
        --text-url: #6c7086;
        --accent-color: #89b4fa;
        --highlight-bg: #fab387;
        --highlight-text: #1e1e2e;
        --highlight-ai-bg: #14532d;
        --highlight-ai-text: #dcfce7;
      }
    }
    
    .overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: var(--bg-overlay);
      display: none;
      justify-content: center;
      align-items: flex-start;
      padding-top: 10vh;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      contain: layout style;
    }
    .overlay.visible {
      display: flex;
    }
    .container {
      width: 600px;
      max-width: 90vw;
      background: var(--bg-container);
      border-radius: 12px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      overflow: hidden;
      contain: content;
      will-change: transform;
    }
    .header {
      display: flex;
      align-items: center;
      padding: 16px;
      background: var(--bg-header);
      border-bottom: 1px solid var(--border-color);
    }
    .logo {
      width: 28px;
      height: 28px;
      margin-right: 12px;
      display: block;
      flex-shrink: 0;
      object-fit: contain;
    }
    .search-input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      font-size: 18px;
      color: var(--text-primary);
      caret-color: var(--accent-color);
    }
    .search-input::placeholder {
      color: var(--text-secondary);
    }
    .sort-btn {
      background: var(--bg-kbd);
      border: 1px solid var(--border-color);
      cursor: pointer;
      padding: 6px 10px;
      margin-left: 8px;
      border-radius: 6px;
      color: var(--text-primary);
      font-size: 16px;
      line-height: 1;
      transition: background 0.15s, border-color 0.2s;
      min-width: 32px;
      text-align: center;
    }
    .sort-btn:hover {
      background: var(--bg-hover);
      border-color: var(--accent-color);
    }
    .sort-btn:focus {
      outline: none;
      border-color: var(--accent-color);
      box-shadow: 0 0 0 2px rgba(13, 110, 253, 0.1);
    }
    .kbd {
      background: var(--bg-kbd);
      color: var(--text-secondary);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      margin-left: 8px;
    }
    .settings-btn {
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 6px;
      margin-left: 8px;
      border-radius: 4px;
      color: var(--text-secondary);
      font-size: 16px;
      line-height: 1;
      transition: background 0.15s, color 0.15s;
    }
    .settings-btn:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
    .results {
      max-height: 60vh;
      overflow-y: auto;
      padding: 8px 0;
      contain: content;
    }
    /* Card view: 3-row grid with horizontal scroll (mirrors popup card layout) */
    .results.cards {
      display: grid;
      grid-template-rows: repeat(3, auto);
      grid-auto-flow: column;
      grid-auto-columns: clamp(150px, 28vw, 210px);
      overflow-x: auto;
      overflow-y: auto;
      gap: 10px;
      max-height: 50vh;
      padding: 8px;
      contain: layout style;
    }
    .results.cards .result-card {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px 10px;
      border-radius: 8px;
      cursor: pointer;
      border: 1px solid var(--border-color);
      background: var(--bg-container);
      transition: all 0.2s ease;
      overflow: hidden;
    }
    .results.cards .result-card:hover,
    .results.cards .result-card.selected {
      background: var(--bg-hover);
      border-color: var(--accent-color);
      box-shadow: 0 0 0 2px rgba(13, 110, 253, 0.2);
    }
    .results.cards .result-card:focus {
      outline: 2px solid var(--accent-color);
      outline-offset: -2px;
    }
    .results.cards .card-favicon {
      width: 20px;
      height: 20px;
      border-radius: 4px;
      background: #24333f;
      display: block;
      flex-shrink: 0;
      margin-bottom: 2px;
    }
    .results.cards .card-details {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      width: 100%;
      gap: 2px;
    }
    .results.cards .card-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.4;
    }
    .results.cards .card-url {
      font-size: 11px;
      color: var(--text-url);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
      line-height: 1.3;
    }
    .result {
      display: flex;
      flex-direction: column;
      padding: 10px 16px;
      cursor: pointer;
      border-left: 3px solid transparent;
      contain: layout style;
      content-visibility: auto;
    }
    .result:hover,
    .result.selected {
      background: var(--bg-hover);
      border-left-color: var(--accent-color);
    }
    .result-title {
      color: var(--text-primary);
      font-size: 14px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 2px;
    }
    .result-url {
      color: var(--text-url);
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    /* Favicon sizing: list and card parity with popup */
    .results .favicon { width: 16px; height: 16px; border-radius: 3px; background:#24333f; flex-shrink:0; margin-right:8px; }
    .results .card-favicon { width: 32px; height: 32px; border-radius: 6px; background:#24333f; display:block; margin-bottom:4px; }
    /* Bookmark indicator and folder styles shared with popup */
    .bookmark-indicator { color: var(--accent-color); font-size: 16px; font-weight: 600; margin-right: 6px; vertical-align: middle; }
    .bookmark-folder { font-size: 0.85em; color: #6b7280; margin-left: 8px; }
    .highlight {
      background: var(--highlight-bg);
      color: var(--highlight-text);
      border-radius: 2px;
      padding: 0 2px;
    }
    .highlight-ai {
      background: var(--highlight-ai-bg);
      color: var(--highlight-ai-text);
      border-radius: 2px;
      padding: 0 2px;
    }
    .empty {
      padding: 24px;
      text-align: center;
      color: var(--text-secondary);
    }
    .toast {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--bg-hover);
      color: var(--text-primary);
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 13px;
      opacity: 0;
      transition: opacity 0.2s;
      pointer-events: none;
    }
    .toast.show {
      opacity: 1;
    }
    .footer {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      padding: 10px 16px;
      background: var(--bg-header);
      border-top: 1px solid var(--border-color);
      font-size: 11px;
      color: var(--text-secondary);
    }
    .footer span {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .footer kbd {
      background: var(--bg-kbd);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: inherit;
    }
    .help-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--bg-kbd);
      color: var(--text-secondary);
      text-decoration: none;
      font-size: 12px;
      font-weight: 600;
      margin-left: auto;
      transition: all 0.15s ease;
    }
    .help-link:hover {
      background: var(--accent-color);
      color: var(--bg-container);
    }
    /* Loading spinner shown during AI-powered searches */
    .search-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid var(--border-color);
      border-top-color: var(--accent-color);
      border-radius: 50%;
      animation: sc-spin 0.7s linear infinite;
      margin-left: 8px;
      flex-shrink: 0;
      display: none;
    }
    .search-spinner.active {
      display: block;
    }
    @keyframes sc-spin {
      to { transform: rotate(360deg); }
    }
    /* AI status bar below the header */
    .ai-status-bar {
      padding: 3px 16px;
      font-size: 11px;
      color: var(--text-secondary);
      background: var(--bg-header);
      border-bottom: 1px solid var(--border-color);
      display: none;
      align-items: center;
      gap: 8px;
      overflow: hidden;
      white-space: nowrap;
    }
    .ai-status-bar.visible {
      display: flex;
    }
    .ai-status-bar .ai-badge {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 600;
    }
    .ai-badge.ai-active {
      background: rgba(16, 185, 129, 0.15);
      color: #10b981;
    }
    .ai-badge.ai-cache {
      background: rgba(59, 130, 246, 0.15);
      color: #3b82f6;
    }
    .ai-badge.ai-error {
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
    }
    .ai-badge.ai-semantic {
      background: rgba(139, 92, 246, 0.15);
      color: #8b5cf6;
    }
    .ai-badge.ai-lexical {
      background: rgba(100, 116, 139, 0.12);
      color: #64748b;
      letter-spacing: 0.04em;
    }
    .ai-status-bar .ai-time {
      margin-left: auto;
      opacity: 0.7;
    }
  `;

  // ===== FETCH LOG LEVEL FROM SETTINGS =====
  function fetchLogLevel(): void {
    if (!chrome.runtime?.id) {
      // Extension context invalidated
      return;
    }
    try {
      chrome.runtime.sendMessage({ type: 'GET_LOG_LEVEL' }, (response) => {
        if (chrome.runtime.lastError) {
          // Ignore - use default
          return;
        }
        if (typeof response?.logLevel === 'number') {
          currentLogLevel = response.logLevel;
          log.debug('logLevel', `Log level set to ${currentLogLevel}`);
        }
      });
    } catch {
      // Extension context may be invalid
    }
  }

  // Fetch settings (non-blocking). This populates `cachedSettings` and adjusts debounce.
  function fetchSettings(): void {
    if (!chrome.runtime?.id) {
      // Extension context invalidated
      return;
    }
    try {
      chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (resp) => {
        try {
          const settings = resp?.settings || {};
          cachedSettings = settings;
          try {
            updateSelectAllBadge(Boolean(settings?.selectAllOnFocus));
          } catch { /* ignore */ }
          try {
            if (shadowHost) { shadowHost.dataset.selectAll = String(Boolean(settings?.selectAllOnFocus)); }
          } catch { /* ignore */ }
          // Search debounce is intentionally separate from focusDelayMs
          // focusDelayMs controls auto-focus to results, not search delay
          searchDebounceMs = DEBOUNCE_MS;
          log.debug('settings', 'Fetched settings, searchDebounceMs=', searchDebounceMs);
          // Re-render results with updated display mode (popup parity)
          if (currentResults.length > 0) {
            try { renderResults(currentResults); } catch { /* ignore */ }
          }
        } catch {
          // ignore
        }
      });
    } catch {
      // ignore
    }
  }

  // ===== SERVICE WORKER PRE-WARMING =====
  function prewarmServiceWorker(): void {
    if (prewarmed || !chrome.runtime?.id) {return;}
    prewarmed = true;
    const t0 = performance.now();
    try {
      chrome.runtime.sendMessage({ type: 'PING' }, () => {
        perfLog('Service worker pre-warm response', t0);
        if (chrome.runtime.lastError) {
          // Ignore - just warming up
        }
      });
    } catch {
      // Extension context may be invalid
    }
  }

  // ===== PORT-BASED MESSAGING =====
  function openSearchPort(): void {
    // Don't try to reconnect if port already exists
    if (searchPort) {return;}
    
    // Check extension context validity first
    if (!isExtensionContextValid()) {
      log.warn('port', 'Cannot open port: extension context invalidated');
      return;
    }
    
    const t0 = performance.now();
    try {
      searchPort = chrome.runtime.connect({ name: 'quick-search' });
      perfLog('Search port opened', t0);
      
      searchPort.onMessage.addListener((response) => {
        // Handle error responses from service worker
        if (response?.error) {
          log.warn('port', 'Error response from service worker:', response.error);
          aiSearchPending = false;
          hideSpinner();
          // Don't render error as results — just clear spinner and log it
          // The error badge will show via aiStatus if it's an AI error
          return;
        }

        if (response?.results) {
          // Staleness guard: ignore responses for old queries
          // Compare both sides lowercased to avoid case mismatch
          const currentInputQuery = (inputEl?.value?.trim() || '').toLowerCase();
          const responseQuery = (response.query || '').toLowerCase();
          if (responseQuery && responseQuery !== currentInputQuery) {
            log.debug('port', `Ignoring stale response for "${responseQuery}" (current: "${currentInputQuery}")`);
            return;
          }

          const isPhase1 = response.skipAI === true;
          log.debug('port', `Search results received (${isPhase1 ? 'Phase 1 LEXICAL' : 'Phase 2 AI'}): ${response.results.length} results`);

          currentResults = response.results.slice(0, cachedSettings?.maxResults ?? MAX_RESULTS);

          // Apply current sort setting from cached settings
          const currentSort = cachedSettings?.sortBy || 'best-match';
          sortResults(currentResults, currentSort);

          currentAIExpandedTokens = response.aiStatus?.aiExpandedKeywords ?? [];
          selectedIndex = currentResults.length > 0 ? 0 : -1;
          renderResults(currentResults);

          // Loading state logic:
          // - Phase 1 response + AI still pending → keep spinner, skip AI status
          // - Phase 2 response (or Phase 1 with no AI) → hide spinner, show AI status
          if (isPhase1 && aiSearchPending) {
            log.debug('port', 'Phase 1 done, AI Phase 2 still pending — showing spinner');
            showSpinner(); // Show spinner NOW — Phase 1 results are already rendered above
          } else {
            log.debug('port', 'Final response — hiding spinner, rendering AI status');
            aiSearchPending = false;
            hideSpinner();
            renderAIStatus(response.aiStatus);
          }
        }
      });

      searchPort.onDisconnect.addListener(() => {
        const lastError = chrome.runtime.lastError;
        // bfcache navigation causes port closure - this is expected and not an error
        if (isExtensionContextValid()) {
          if (lastError) {
            log.warn('port', 'Port disconnected with error:', lastError.message);
          } else {
            log.debug('port', 'Port disconnected (normal)');
          }
        }

        // Clean up pending state — port is gone, no more responses coming
        if (aiSearchPending) {
          log.info('port', 'Port disconnected while AI search pending — clearing pending state');
          aiSearchPending = false;
          hideSpinner();
        }

        searchPort = null;
        
        // If context is still valid, automatically try to reconnect after a delay
        if (isExtensionContextValid()) {
          setTimeout(() => {
            if (!searchPort && isExtensionContextValid()) {
              log.debug('port', 'Auto-reconnecting search port');
              openSearchPort();
            }
          }, 500);
        }
      });
    } catch (e) {
      log.error('port', 'Failed to open search port:', (e as Error).message);
      searchPort = null;
    }
  }

  function closeSearchPort(): void {
    if (searchPort) {
      searchPort.disconnect();
      searchPort = null;
    }
  }

  // ===== TOAST NOTIFICATION =====
  let toastEl: HTMLDivElement | null = null;
  let toastTimeout: number | null = null;
  let selectAllBadge: HTMLElement | null = null;
  
  function showToast(message: string): void {
    if (!toastEl) {return;}
    toastEl.textContent = message;
    toastEl.classList.add('show');
    if (toastTimeout) {clearTimeout(toastTimeout);}
    toastTimeout = window.setTimeout(() => {
      toastEl?.classList.remove('show');
    }, 1500);
  }

  function updateSelectAllBadge(enabled: boolean): void {
    try {
      if (!selectAllBadge) { return; }
      if (enabled) {
        selectAllBadge.textContent = 'Aa';
        selectAllBadge.title = 'Select All On Focus is enabled — tabbing back selects all text';
        selectAllBadge.setAttribute('aria-label', 'Select All On Focus enabled');
        selectAllBadge.style.background = 'var(--accent-color)';
        selectAllBadge.style.color = 'var(--bg-container)';
      } else {
        selectAllBadge.textContent = 'Aa|';
        selectAllBadge.title = 'Select All On Focus is disabled — tabbing back places caret';
        selectAllBadge.setAttribute('aria-label', 'Select All On Focus disabled');
        selectAllBadge.style.background = 'var(--bg-kbd)';
        selectAllBadge.style.color = 'var(--text-secondary)';
      }
    } catch {
      // ignore
    }
  }

  // ===== CREATE OVERLAY WITH SHADOW DOM (CSP-safe, no innerHTML) =====
  function createOverlay(): void {
    if (shadowHost) {return;}
    
    const t0 = performance.now();

    // Create shadow host
    shadowHost = document.createElement('div');
    shadowHost.id = OVERLAY_ID;
    
    // Attach closed shadow root (complete isolation)
    shadowRoot = shadowHost.attachShadow({ mode: 'closed' });
    // Expose simple dataset flag so external tests or page scripts can
    // detect whether selectAllOnFocus is enabled. This is safe even with
    // a closed shadow root because dataset is on the host element.
    try {
      shadowHost.dataset.selectAll = String(Boolean(cachedSettings?.selectAllOnFocus));
    } catch { /* ignore */ }
    
    // Inject styles into shadow root
    const styleEl = document.createElement('style');
    styleEl.textContent = OVERLAY_STYLES;
    shadowRoot.appendChild(styleEl);

    // Create overlay structure using DOM APIs (CSP-safe)
    overlayEl = document.createElement('div');
    overlayEl.className = 'overlay';
    
    // Container
    const container = document.createElement('div');
    container.className = 'container';
    
    // Header
    const header = document.createElement('div');
    header.className = 'header';
    
    const logo = document.createElement('img');
    logo.className = 'logo';
    logo.src = chrome.runtime.getURL('../assets/icon-48.svg');
    logo.alt = 'SmrutiCortex';
    
    inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.className = 'search-input';
    inputEl.placeholder = 'Search your browsing history...';
    inputEl.autocomplete = 'off';
    inputEl.spellcheck = false;
    inputEl.tabIndex = 0; // Ensure focusable
    
    // Sort button (cycles through options on click)
    const sortBtn = document.createElement('button');
    sortBtn.className = 'sort-btn';
    sortBtn.tabIndex = 0;
    
    const sortOptions = [
      { value: 'best-match', label: '🎯', title: 'Best Match' },
      { value: 'most-recent', label: '🕒', title: 'Most Recent' },
      { value: 'most-visited', label: '🔥', title: 'Most Visited' },
      { value: 'alphabetical', label: '🔤', title: 'Alphabetical' }
    ];
    
    let currentSortIndex = 0;
    // Read sort preference from cached settings (synced with popup via SettingsManager)
    {
      const savedSort = cachedSettings?.sortBy || 'best-match';
      currentSortIndex = sortOptions.findIndex(opt => opt.value === savedSort);
      if (currentSortIndex === -1) {currentSortIndex = 0;}
    }
    
    const updateSortButton = () => {
      const opt = sortOptions[currentSortIndex];
      sortBtn.textContent = opt.label;
      sortBtn.title = `Sort: ${opt.title} (click to cycle)`;
    };
    updateSortButton();
    
    sortBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentSortIndex = (currentSortIndex + 1) % sortOptions.length;
      const newSort = sortOptions[currentSortIndex].value;
      // Persist sort preference via settings (synced with popup)
      try {
        chrome.runtime.sendMessage({ type: 'SETTINGS_CHANGED', settings: { sortBy: newSort } });
        if (cachedSettings) { cachedSettings.sortBy = newSort as any; } // eslint-disable-line @typescript-eslint/no-explicit-any
      } catch {
        // Extension context may be invalid
      }
      updateSortButton();
      
      // Re-sort current results without re-searching
      if (currentResults.length > 0) {
        sortResults(currentResults, newSort);
        selectedIndex = currentResults.length ? 0 : -1;
        renderResults(currentResults);
      }
    });
    
    // Small badge to indicate when "Select All On Focus" is enabled
    selectAllBadge = document.createElement('span');
    selectAllBadge.className = 'select-all-badge';
    selectAllBadge.title = 'When enabled, tabbing back to the input selects all text for quick replace';
    selectAllBadge.setAttribute('aria-label', 'Select All On Focus enabled');
    selectAllBadge.textContent = '\u2713';
    selectAllBadge.style.display = 'inline-flex';
    selectAllBadge.style.marginLeft = '8px';
    selectAllBadge.style.fontSize = '12px';
    selectAllBadge.style.padding = '0 8px';
    selectAllBadge.style.borderRadius = '999px';
    selectAllBadge.style.background = 'var(--accent-color)';
    selectAllBadge.style.color = 'var(--bg-container)';
    selectAllBadge.style.minWidth = '22px';
    selectAllBadge.style.height = '20px';
    selectAllBadge.style.display = 'inline-flex';
    selectAllBadge.style.alignItems = 'center';
    selectAllBadge.style.justifyContent = 'center';
    selectAllBadge.style.fontWeight = '600';
    
    // Settings button - opens the full popup
    settingsBtn = document.createElement('button');
    settingsBtn.className = 'settings-btn';
    settingsBtn.title = 'Open settings';
    settingsBtn.tabIndex = 0; // Make focusable
    
    const settingsIcon = document.createElement('img');
    settingsIcon.src = chrome.runtime.getURL('../assets/icon-settings.svg');
    settingsIcon.alt = 'Settings';
    settingsIcon.style.width = '16px';
    settingsIcon.style.height = '16px';
    settingsIcon.style.display = 'block';
    settingsBtn.appendChild(settingsIcon);
    
    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!chrome.runtime?.id) {
        log.warn('settings', 'Cannot open settings: extension context invalidated');
        return;
      }
      // Open the extension popup page in a new tab
      chrome.runtime.sendMessage({ type: 'OPEN_SETTINGS' });
      hideOverlay();
    });
    
    // Loading spinner (shown during AI-powered searches)
    spinnerEl = document.createElement('div');
    spinnerEl.className = 'search-spinner';

    header.appendChild(logo);
    header.appendChild(inputEl);
    header.appendChild(spinnerEl);
    header.appendChild(sortBtn);
    header.appendChild(selectAllBadge);
    header.appendChild(settingsBtn);

    // AI status bar (below header, shows AI feedback)
    aiStatusBarEl = document.createElement('div');
    aiStatusBarEl.className = 'ai-status-bar';

    // Results
    resultsEl = document.createElement('div');
    resultsEl.className = 'results';

    // Redirect vertical wheel scroll to horizontal when in card view
    resultsEl.addEventListener('wheel', (e) => {
      if (resultsEl?.classList.contains('cards') && !e.shiftKey) {
        const delta = e.deltaY || e.deltaX;
        if (delta !== 0) {
          e.preventDefault();
          if (resultsEl) { resultsEl.scrollLeft += delta; }
        }
      }
    }, { passive: false });

    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty';
    emptyDiv.textContent = 'Type to search your history...';
    resultsEl.appendChild(emptyDiv);
    
    // Footer with all shortcuts
    const footer = document.createElement('div');
    footer.className = 'footer';
    
    const shortcuts = [
      ['↑↓', 'Navigate'],
      ['Enter', 'Open'],
      ['→', 'New tab'],
      ['Ctrl+M', 'Copy'],
      ['Ctrl+C', 'Copy HTML'],
      ['ESC', 'Close']
    ];
    
    shortcuts.forEach(([key, label]) => {
      const span = document.createElement('span');
      const kbd = document.createElement('kbd');
      kbd.textContent = key;
      span.appendChild(kbd);
      span.appendChild(document.createTextNode(` ${label}`));
      footer.appendChild(span);
    });

    // Help/tour link
    const helpLink = document.createElement('a');
    helpLink.href = 'https://dhruvinrsoni.github.io/smruti-cortex/tour.html';
    helpLink.target = '_blank';
    helpLink.rel = 'noopener';
    helpLink.textContent = '?';
    helpLink.title = 'Feature tour & help';
    helpLink.className = 'help-link';
    footer.appendChild(helpLink);

    container.appendChild(header);
    container.appendChild(aiStatusBarEl);
    container.appendChild(resultsEl);
    container.appendChild(footer);
    overlayEl.appendChild(container);
    
    // Toast for copy feedback
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    overlayEl.appendChild(toastEl);

    shadowRoot.appendChild(overlayEl);

    // Event listeners
    overlayEl.addEventListener('click', (e) => {
      if (e.target === overlayEl) {hideOverlay();}
    });
    
    // Capture-phase keyboard handling for overlay.
    // DISABLED: Global handler now handles all key routing
    // overlayEl.addEventListener('keydown', (e) => {
    //   // Always allow Tab to flow to browser for native focus movement
    //   if (e.key === 'Tab') { return; }

    //   // Only act when overlay is visible
    //   if (!isOverlayVisible()) { return; }

    //   // If the input is focused, let its handlers process the event
    //   if (document.activeElement === inputEl) { return; }

    //   // For other focused elements (results, settings), handle navigation keys here
    //   // Debug: log key and active element
    //   if (currentLogLevel >= LOG_LEVEL.DEBUG) {
    //     try {
    //       console.debug('[SmrutiCortex] Overlay keydown:', { key: e.key, active: document.activeElement, selectedIndex });
    //     } catch (err) {}
    //   }
    //   let action = parseKeyboardAction(e);
    //   // Fallback mapping in case parseKeyboardAction returns null for some edge keys
    //   if (!action) {
    //     if (e.key === 'Enter') action = KeyboardAction.OPEN;
    //     else if (e.key === 'ArrowDown') action = KeyboardAction.NAVIGATE_DOWN;
    //     else if (e.key === 'ArrowUp') action = KeyboardAction.NAVIGATE_UP;
    //     else if (e.key === 'ArrowRight') action = KeyboardAction.OPEN_NEW_TAB;
    //   }
    //   if (!action) { return; }

    //   // Prevent page-level defaults and route to key handler
    //   e.preventDefault();
    //   e.stopPropagation();
    //   e.stopImmediatePropagation();

    //   // Re-use the same logic as input's keydown handler
    //   handleKeydown(e);
    // }, true); // Use capture phase
    
    // Maintain focus behaviour on mousedown
    // Only force focus when clicking the backdrop (overlay background).
    // Do NOT force-focus when clicking interactive elements (results, settings, input).
    overlayEl.addEventListener('mousedown', (e) => {
      const target = e.target as Element | null;
      if (!target) { return; }

      // If clicking on the overlay backdrop itself (outside the container), close overlay.
      if (target === overlayEl) {
        // Allow the click handler above to close; do not refocus.
        return;
      }

      // If click landed directly on a non-interactive area inside overlay (rare),
      // prefer focusing the input. But avoid forcing focus for interactive elements.
      const tag = target.tagName?.toLowerCase();
      const isInteractive = tag === 'input' || tag === 'button' || tag === 'a' || target.classList?.contains('result') || target.closest && Boolean(target.closest('button, a, input'));
      if (!isInteractive) {
        setTimeout(() => inputEl?.focus(), 0);
      }
    });
    
    inputEl.addEventListener('input', handleInput);
    inputEl.addEventListener('keydown', handleKeydown);
    
    // Debug focus issues
    inputEl.addEventListener('focus', () => {
      log.debug('focus', 'Input focused');
    });
    // Remove aggressive refocus from blur — prefer native focus behavior and Tab navigation.
    // Keep a light debug hook for visibility only.
    inputEl.addEventListener('blur', (e) => {
      log.debug('focus', 'Input blurred. relatedTarget:', (e as FocusEvent).relatedTarget);
    });

    perfLog('Overlay created with Shadow DOM (in-memory, not yet attached)', t0);
    // Fetch settings now to configure debounce and focus behavior
    fetchSettings();
  }

  // ===== SHOW/HIDE =====
  function showOverlay(): void {
    const t0 = performance.now();
    log.debug('overlay', 'showOverlay called');

    if (!shadowHost) {
      const t1 = performance.now();
      createOverlay();
      perfLog('createOverlay (on-demand)', t1);
    }
    
    if (!shadowHost || !overlayEl || !inputEl) {return;}

    // Attach to DOM only when showing (prevents leak into MHTML/print saves)
    if (!shadowHost.isConnected) {
      document.documentElement.appendChild(shadowHost);
    }

    // Cancel any pending port close from a previous hideOverlay
    if (hidePortCloseTimer) {
      clearTimeout(hidePortCloseTimer);
      hidePortCloseTimer = null;
    }

    // Show overlay FIRST
    shadowHost.classList.add('visible');
    overlayEl.classList.add('visible');
    // Refresh settings each time overlay is shown so UI (badge, focus behavior)
    // reflects the most recent user preferences even if the overlay was pre-created
    try {
      // Apply cached settings immediately if available
      updateSelectAllBadge(Boolean(cachedSettings?.selectAllOnFocus));
    } catch { /* ignore */ }
    // Then fetch latest settings asynchronously (will update badge when done)
    fetchSettings();
    
    // Reset state
    inputEl.value = '';
    currentResults = [];
    selectedIndex = 0;
    
    // Load recent history as smart default (instead of empty state)
    loadRecentHistory();
    
    // NUCLEAR OPTION: Force blur current element (omnibox) then focus aggressively
    // Strategy 1: Blur active element (likely the omnibox with selected text)
    try {
      if (document.activeElement && document.activeElement !== inputEl) {
        (document.activeElement as HTMLElement).blur();
      }
    } catch { /* ignore */ }
    
    // Strategy 2: Immediate synchronous focus
    inputEl.focus();
    inputEl.setSelectionRange(0, 0);
    perfLog('Input focused immediately', t0);
    
    // Strategy 3: Continuous focus attempts with setInterval (nuclear option for selected text in omnibox)
    // Clear any previous interval/timeouts from a prior showOverlay call to prevent leaks
    if (overlayFocusInterval) {clearInterval(overlayFocusInterval); overlayFocusInterval = null;}
    overlayFocusTimeouts.forEach(t => clearTimeout(t));
    overlayFocusTimeouts = [];

    let focusAttempts = 0;
    const maxAttempts = 20; // Try for up to 1 second (20 * 50ms)
    overlayFocusInterval = setInterval(() => {
      focusAttempts++;

      if (focusAttempts >= maxAttempts) {
        if (overlayFocusInterval) {clearInterval(overlayFocusInterval); overlayFocusInterval = null;}
        return;
      }
      if (document.activeElement === inputEl || shadowRoot?.activeElement === inputEl) {
        if (overlayFocusInterval) {clearInterval(overlayFocusInterval); overlayFocusInterval = null;}
        return;
      }
      if (!isOverlayVisible()) {
        if (overlayFocusInterval) {clearInterval(overlayFocusInterval); overlayFocusInterval = null;}
        return;
      }

      try {
        if (document.activeElement && document.activeElement !== inputEl) {
          (document.activeElement as HTMLElement).blur();
        }
      } catch { /* ignore */ }

      inputEl.focus();
      inputEl.setSelectionRange(0, 0);
    }, 50);

    // Strategy 4: Backup timeouts at key intervals (tracked for cleanup)
    [0, 100, 200, 300, 500, 800].forEach(delay => {
      const tid = setTimeout(() => {
        if (inputEl && isOverlayVisible() && document.activeElement !== inputEl && shadowRoot?.activeElement !== inputEl) {
          try {
            if (document.activeElement && document.activeElement !== inputEl) {
              (document.activeElement as HTMLElement).blur();
            }
          } catch { /* ignore */ }
          inputEl.focus();
          inputEl.setSelectionRange(0, 0);
        }
      }, delay);
      overlayFocusTimeouts.push(tid);
    });

    // Open port for faster messaging (only if extension context is valid)
    if (chrome.runtime?.id) {
      openSearchPort();
    }
  }

  function hideOverlay(): void {
    if (!shadowHost || !overlayEl) {return;}

    log.debug('overlay', 'Hiding overlay');
    shadowHost.classList.remove('visible');
    overlayEl.classList.remove('visible');

    // Detach from DOM so the overlay is never serialized into MHTML/print saves.
    // JS references (shadowHost, shadowRoot, inputEl, etc.) are kept for instant re-show.
    if (shadowHost.parentNode) {
      shadowHost.parentNode.removeChild(shadowHost);
    }

    if (inputEl) {inputEl.blur();}
    aiSearchPending = false;
    hideSpinner();
    renderAIStatus(null);
    // Clear any pending debounce timers (prevents stale searches after close)
    if (debounceTimer) {clearTimeout(debounceTimer); debounceTimer = null;}
    if (aiDebounceTimer) {clearTimeout(aiDebounceTimer); aiDebounceTimer = null;}

    // Close port after a delay (in case user reopens quickly)
    // Timer is cancelled in showOverlay if user reopens
    hidePortCloseTimer = window.setTimeout(closeSearchPort, 1000) as unknown as number;
  }

  function isOverlayVisible(): boolean {
    return shadowHost?.classList.contains('visible') ?? false;
  }

  // ===== SEARCH =====
  function handleInput(): void {
    if (debounceTimer) {clearTimeout(debounceTimer);}
    if (aiDebounceTimer) {clearTimeout(aiDebounceTimer); aiDebounceTimer = null;}
    if (qsFocusTimer) {clearTimeout(qsFocusTimer); qsFocusTimer = null;} // Cancel pending focus shift

    // Early check: If extension context is already invalid, attempt recovery immediately
    if (!isExtensionContextValid()) {
      log.warn('handleInput', 'Extension context invalid — attempting recovery');
      attemptContextRecovery().then(recovered => {
        if (recovered) {
          log.info('handleInput', 'Context recovered successfully');
          // Continue with search after recovery
          const query = inputEl?.value?.trim() || '';
          if (query.length > 0) {
            performSearch(query, true);
          }
        } else {
          // Show error after failed recovery attempts
          renderErrorResults(
            '🔄 Extension was updated. Please reload this page to continue searching.',
            () => window.location.reload()
          );
        }
      }).catch(() => {
        renderErrorResults(
          '🔄 Extension was updated. Please reload this page to continue searching.',
          () => window.location.reload()
        );
      });
      return;
    }

    // Determine AI state for this search cycle
    const aiEnabled = cachedSettings?.ollamaEnabled ?? false;
    aiSearchPending = aiEnabled; // Track: AI response still expected for this query
    log.trace('handleInput', `Input changed, aiEnabled=${aiEnabled}, aiSearchPending=${aiSearchPending}`);

    // Don't show spinner yet — Phase 1 results render first.
    // Spinner only appears after Phase 1 completes if AI is still pending.
    // Clear previous AI status (new search starting)
    renderAIStatus(null);

    // Phase 1: Fast non-AI search (short debounce)
    debounceTimer = window.setTimeout(() => {
      const query = inputEl?.value?.trim() || '';
      if (query.length === 0) {
        // Load recent history when query is cleared
        log.debug('handleInput', 'Query empty — loading recent history');
        aiSearchPending = false;
        hideSpinner();
        loadRecentHistory();
        return;
      }
      log.debug('handleInput', `Phase 1 (LEXICAL) firing for "${query}"`);
      performSearch(query, true); // skipAI=true for instant results
    }, searchDebounceMs);

    // Phase 2: AI expansion (longer debounce — waits for user to finish typing)
    // Delay is user-configurable via aiSearchDelayMs setting (default 500ms)
    if (aiEnabled) {
      const aiDelayMs = cachedSettings?.aiSearchDelayMs ?? 500;
      aiDebounceTimer = window.setTimeout(() => {
        aiDebounceTimer = null;
        const query = inputEl?.value?.trim() || '';
        if (query.length === 0) {
          log.debug('handleInput', 'Phase 2 skipped — query empty');
          aiSearchPending = false;
          hideSpinner();
          return;
        }
        perfLog(`AI Phase 2 triggered for: "${query}" (delay: ${aiDelayMs}ms)`);
        performSearch(query, false); // skipAI=false for full AI expansion
      }, aiDelayMs);
    }
  }

  // ===== LOADING SPINNER & AI STATUS =====
  function showSpinner(): void {
    if (spinnerEl) {spinnerEl.classList.add('active');}
    log.trace('spinner', 'Spinner shown');
    // Start safety timeout — hides spinner if no response arrives
    clearSpinnerTimeout();
    spinnerTimeoutTimer = window.setTimeout(() => {
      log.warn('spinner', `Spinner timeout after ${SPINNER_TIMEOUT_MS}ms — hiding stuck spinner`);
      aiSearchPending = false;
      hideSpinner();
    }, SPINNER_TIMEOUT_MS);
  }

  function hideSpinner(): void {
    if (spinnerEl) {spinnerEl.classList.remove('active');}
    clearSpinnerTimeout();
    log.trace('spinner', 'Spinner hidden');
  }

  function clearSpinnerTimeout(): void {
    if (spinnerTimeoutTimer) {
      clearTimeout(spinnerTimeoutTimer);
      spinnerTimeoutTimer = null;
    }
  }

  // Thin wrapper — delegates to shared renderAIStatus with this overlay's container
  function renderAIStatus(aiStatus: AIStatus | null | undefined): void {
    log.debug('aiStatus', 'Rendering AI status:', aiStatus ? {
      aiKeywords: aiStatus.aiKeywords,
      semantic: aiStatus.semantic,
      expandedCount: aiStatus.expandedCount,
      searchTimeMs: aiStatus.searchTimeMs,
    } : 'cleared');
    renderAIStatusShared(aiStatusBarEl, aiStatus);
  }

  // Load recent history (smart default results when query is empty)
  async function loadRecentHistory(): Promise<void> {
    const t0 = performance.now();
    perfLog('loadRecentHistory called');

    // Check extension context validity
    if (!isExtensionContextValid()) {
      perfLog('Extension context invalid - showing error');
      currentResults = [];
      renderErrorResults(
        '🔄 Extension was updated. Please reload this page to continue.',
        () => window.location.reload()
      );
      return;
    }

    try {
      // Get default result count from cached settings (or use 50 as fallback)
      const defaultResultCount = cachedSettings?.defaultResultCount ?? 50;
      
      // Request recent history from service worker
      const response = await new Promise<{ results?: SearchResult[] }>((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'GET_RECENT_HISTORY', limit: defaultResultCount },
          (resp) => {
            if (chrome.runtime.lastError) {
              perfLog('GET_RECENT_HISTORY error: ' + chrome.runtime.lastError.message);
              resolve({ results: [] });
            } else {
              resolve(resp || { results: [] });
            }
          }
        );
      });

      let recentItems: SearchResult[] = response.results || [];
      
      // Apply current sort setting (if available from cached settings)
      const sortBy = cachedSettings?.sortBy || 'most-recent';
      recentItems = sortResults(recentItems, sortBy as any); // eslint-disable-line @typescript-eslint/no-explicit-any
      
      currentResults = recentItems;
      // Don't auto-select first result — keep focus on input so user can retype.
      // User can Tab or ArrowDown to navigate results when ready.
      selectedIndex = -1;
      renderResults(recentItems);
      
      perfLog('loadRecentHistory completed', t0);
      perfLog(`Loaded ${recentItems.length} recent items`);
    } catch (error) {
      log.warn('loadRecentHistory', 'Failed to load recent history:', (error as Error).message);
      currentResults = [];
      renderResults([]);
    }
  }

  function performSearch(query: string, skipAI: boolean = false): void {
    log.debug('performSearch', `query="${query}" skipAI=${skipAI}`);

    // Sanitize query to prevent issues with special characters
    const sanitizedQuery = sanitizeQuery(query);
    if (!sanitizedQuery) {
      // Empty query after sanitization - load recent history (smart default results)
      log.debug('performSearch', 'Query empty after sanitization — loading recent history');
      aiSearchPending = false;
      hideSpinner();
      renderAIStatus(null);
      loadRecentHistory();
      return;
    }

    // Spinner is NOT shown here — it's managed by response handlers.
    // Phase 1 results render without spinner; spinner appears only when AI is pending.

    // Check extension context validity first
    if (!isExtensionContextValid()) {
      log.warn('performSearch', 'Extension context invalid — attempting recovery');
      currentResults = [];

      // Attempt silent recovery first
      attemptContextRecovery().then(recovered => {
        if (recovered) {
          log.info('performSearch', 'Context recovered — retrying search');
          showToast('Extension reconnected');
          // Retry the search
          performSearch(query);
        } else {
          log.error('performSearch', 'Context recovery failed after all attempts');
          renderErrorResults(
            '🔄 Extension was updated. Please reload this page to continue searching.',
            () => window.location.reload()
          );
        }
      }).catch(() => {
        log.error('performSearch', 'Context recovery threw an error');
        renderErrorResults(
          '🔄 Extension was updated. Please reload this page to continue searching.',
          () => window.location.reload()
        );
      });
      return;
    }

    // Use port if available (faster), otherwise fallback to sendMessage
    if (searchPort) {
      try {
        searchPort.postMessage({ type: 'SEARCH_QUERY', query: sanitizedQuery, source: 'inline', skipAI });
        log.debug('performSearch', `Query sent via port: "${sanitizedQuery}" (skipAI=${skipAI})`);
        // Check for runtime errors after async operation
        if (chrome.runtime.lastError) {
          log.warn('performSearch', 'Port message error (likely bfcache):', chrome.runtime.lastError.message);
          searchPort = null;
          openSearchPort();
          return;
        }
      } catch (err) {
        log.warn('performSearch', 'Failed to send via port, reconnecting:', (err as Error).message);
        searchPort = null;
        openSearchPort();
        // Try once more with new port
        if (searchPort) {
          try {
            searchPort.postMessage({ type: 'SEARCH_QUERY', query: sanitizedQuery, source: 'inline', skipAI });
            log.debug('performSearch', 'Query sent via reconnected port');
            // Check for runtime errors after async operation
            if (chrome.runtime.lastError) {
              log.warn('performSearch', 'Reconnected port error:', chrome.runtime.lastError.message);
              searchPort = null;
            }
            return;
          } catch (e) {
            log.warn('performSearch', 'Reconnected port also failed:', (e as Error).message);
          }
        }
        // Fall through to sendMessage fallback
      }
    }

    // Fallback to one-shot sendMessage if no port
    if (!searchPort) {
      log.info('performSearch', 'Using sendMessage fallback (no port)');

      // Attempt one-shot sendMessage and handle errors
      try {
        chrome.runtime.sendMessage(
          { type: 'SEARCH_QUERY', query: sanitizedQuery, source: 'inline', skipAI },
          (response) => {
            if (chrome.runtime.lastError) {
              aiSearchPending = false;
              hideSpinner();
              log.error('performSearch', 'sendMessage error:', chrome.runtime.lastError.message);
              currentResults = [];
              renderErrorResults(
                'Search failed: ' + chrome.runtime.lastError.message,
                () => {
                  // Try to reconnect and search again
                  openSearchPort();
                  setTimeout(() => performSearch(query), 300);
                }
              );
              return;
            }
            if (response?.error) {
              // Service worker returned an error (e.g., SyntaxError, init failure)
              log.warn('performSearch', 'Service worker error response:', response.error);
              aiSearchPending = false;
              hideSpinner();
              return;
            }
            if (response?.results) {
              // Staleness guard: ignore responses for old queries
              // Compare both sides lowercased to avoid case mismatch
              const currentInputQuery = (inputEl?.value?.trim() || '').toLowerCase();
              const responseQuery = (response.query || '').toLowerCase();
              if (responseQuery && responseQuery !== currentInputQuery) {
                log.debug('sendMessage', `Ignoring stale response for "${responseQuery}" (current: "${currentInputQuery}")`);
                return;
              }

              const isPhase1 = response.skipAI === true;
              log.debug('sendMessage', `Results received (${isPhase1 ? 'Phase 1 LEXICAL' : 'Phase 2 AI'}): ${response.results.length} results`);

              currentResults = response.results.slice(0, cachedSettings?.maxResults ?? MAX_RESULTS);

              // Apply current sort setting from cached settings
              const currentSort = cachedSettings?.sortBy || 'best-match';
              sortResults(currentResults, currentSort);

              currentAIExpandedTokens = response.aiStatus?.aiExpandedKeywords ?? [];
              selectedIndex = currentResults.length > 0 ? 0 : -1;
              renderResults(currentResults);

              // Loading state: same logic as port handler
              if (isPhase1 && aiSearchPending) {
                log.debug('sendMessage', 'Phase 1 done, AI Phase 2 still pending — showing spinner');
                showSpinner(); // Show spinner NOW — Phase 1 results are already rendered above
              } else {
                log.debug('sendMessage', 'Final response — hiding spinner, rendering AI status');
                aiSearchPending = false;
                hideSpinner();
                renderAIStatus(response.aiStatus);
              }
            }
          }
        );
      } catch (e) {
        aiSearchPending = false;
        hideSpinner();
        log.error('performSearch', 'sendMessage threw:', (e as Error).message);
        currentResults = [];
        const errorMsg = e instanceof Error ? e.message : 'Unknown error';
        renderErrorResults(
          `Search failed: ${errorMsg}. This may be due to page restrictions.`,
          () => {
            // Attempt to reconnect
            if (isExtensionContextValid()) {
              openSearchPort();
              showToast('Attempting reconnect...');
            } else {
              showToast('Extension context lost. Please reload the page.');
            }
          }
        );
      }
    }
  }

  // ===== HIGHLIGHT HELPER — thin wrapper over shared highlightHtml =====
  function highlightText(text: string, tokens: string[], aiTokens: string[] = []): string {
    return highlightHtml(
      text, tokens, aiTokens,
      m => `<span class="highlight">${m}</span>`,
      m => `<span class="highlight-ai">${m}</span>`
    );
  }

  // ===== RENDER RESULTS (card + list mode, mirrors popup.ts renderResults) =====
  function renderResults(results: SearchResult[]): void {
    if (!resultsEl) {return;}
    const t0 = performance.now();

    const isCards = cachedSettings?.displayMode === DisplayMode.CARDS;
    resultsEl.className = isCards ? 'results cards' : 'results';

    // Clear existing results
    while (resultsEl.firstChild) {
      resultsEl.removeChild(resultsEl.firstChild);
    }

    const query = inputEl?.value?.trim() || '';
    const tokens = tokenizeQuery(query);
    const emptyMessage = query ? 'No results found' : 'Type to search your history...';

    if (results.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'empty';
      emptyDiv.textContent = emptyMessage;
      resultsEl.appendChild(emptyDiv);
      perfLog('renderResults (empty)', t0);
      return;
    }

    if (isCards) {
      // Card rendering — mirrors popup.ts card branch
      const loadFavicons = cachedSettings?.loadFavicons !== false; // default: true
      results.forEach((item, idx) => {
        const card = document.createElement('div');
        card.className = 'result-card';
        card.tabIndex = 0;
        card.dataset.index = String(idx);
        if (idx === selectedIndex) { card.classList.add('selected'); }

        const fav = document.createElement('img');
        fav.className = 'card-favicon';
        const qsFavFallback = chrome.runtime.getURL('../assets/icon-favicon-fallback.svg');
        fav.src = qsFavFallback;
        fav.onerror = () => { fav.src = qsFavFallback; };
        if (loadFavicons) {
          try {
            const hostname = new URL(item.url).hostname;
            chrome.runtime.sendMessage({ type: 'GET_FAVICON', hostname }, (resp) => {
              if (chrome.runtime.lastError) { return; }
              if (resp?.dataUrl) { fav.src = resp.dataUrl; }
            });
          } catch { /* ignore */ }
        }

        const details = document.createElement('div');
        details.className = 'card-details';

        const title = document.createElement('div');
        title.className = 'card-title';
        const bookmarkIndicator = item.isBookmark ? '<span class="bookmark-indicator" title="Bookmarked">★</span> ' : '';
        title.innerHTML = bookmarkIndicator + highlightText(item.title || item.url, tokens, currentAIExpandedTokens);
        details.appendChild(title);

        if (item.bookmarkFolders && item.bookmarkFolders.length > 0) {
          const folder = document.createElement('div');
          folder.className = 'bookmark-folder';
          folder.textContent = '📁 ' + item.bookmarkFolders.join(' › ');
          details.appendChild(folder);
        }

        const url = document.createElement('div');
        url.className = 'card-url';
        url.innerHTML = highlightText(item.url, tokens, currentAIExpandedTokens);
        details.appendChild(url);

        card.appendChild(fav);
        card.appendChild(details);

        card.addEventListener('click', (e) => {
          e.stopPropagation();
          openResult(idx, true);
        });

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        resultsEl!.appendChild(card);
      });
    } else {
      // List rendering — use shared function (DRY principle)
      const fragment = renderResultsShared(results, tokens, {
        selectedIndex,
        emptyMessage,
        resultClassName: 'result',
        selectedClassName: 'selected',
        titleClassName: 'result-title',
        urlClassName: 'result-url',
        highlightClassName: 'highlight',
        emptyClassName: 'empty',
        aiTokens: currentAIExpandedTokens,
        aiHighlightClassName: 'highlight-ai',
        onResultClick: (index, _result, _ctrlOrMeta) => {
          openResult(index, true);
        }
      });
      resultsEl.appendChild(fragment);

      // Make list items focusable for keyboard navigation
      resultsEl.querySelectorAll('.result').forEach((result, index) => {
        (result as HTMLElement).tabIndex = 0;
        (result as HTMLElement).dataset.index = String(index);
      });
    }

    // Post-render: focus first result after focusDelayMs — ONLY for search results, not recent history.
    // When selectedIndex === -1, user is browsing default results or cleared the input → don't steal focus.
    const renderSelectedSnapshot = selectedIndex;
    const focusDelay = typeof cachedSettings?.focusDelayMs === 'number'
      ? Math.max(0, Math.min(2000, cachedSettings.focusDelayMs))
      : 450; // Default 450ms
    if (results.length > 0 && focusDelay > 0 && renderSelectedSnapshot >= 0) {
      if (qsFocusTimer) {clearTimeout(qsFocusTimer);}
      qsFocusTimer = window.setTimeout(() => {
        qsFocusTimer = null;
        // If user navigated or typed since render, skip — stale focus
        if (selectedIndex !== renderSelectedSnapshot) {return;}
        const itemSel = resultsEl?.classList.contains('cards') ? '.result-card' : '.result';
        const first = resultsEl?.querySelector(itemSel) as HTMLElement | null;
        if (first) {
          updateSelection();
          try { first.focus(); } catch { /* ignore */ }
        }
      }, focusDelay) as unknown as number;
    }

    perfLog(`renderResults (${results.length} items, ${isCards ? 'cards' : 'list'})`, t0);
  }

  // ===== RENDER ERROR MESSAGE =====
  function renderErrorResults(message: string, reconnect?: () => void): void {
    if (!resultsEl) {return;}
    
    // Clear existing results
    while (resultsEl.firstChild) {
      resultsEl.removeChild(resultsEl.firstChild);
    }

    const errorDiv = document.createElement('div');
    errorDiv.className = 'empty';
    errorDiv.textContent = message;
    errorDiv.style.color = 'var(--text-danger, #ef4444)';
    errorDiv.style.padding = '20px';
    errorDiv.style.textAlign = 'center';
    errorDiv.style.lineHeight = '1.5';
    resultsEl.appendChild(errorDiv);
    
    if (reconnect) {
      const btn = document.createElement('button');
      btn.className = 'reconnect-btn';
      btn.textContent = '🔄 Try to Reconnect';
      btn.style.marginTop = '12px';
      btn.style.padding = '8px 16px';
      btn.style.background = 'var(--bg-hover, #f0f0f0)';
      btn.style.border = '1px solid var(--border, #ccc)';
      btn.style.borderRadius = '6px';
      btn.style.cursor = 'pointer';
      btn.style.fontSize = '14px';
      btn.style.fontWeight = '500';
      btn.style.display = 'inline-block';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (btn.disabled) {return;}
        try {
          btn.disabled = true;
          btn.textContent = '⏳ Reconnecting...';
          btn.style.opacity = '0.6';
          reconnect();
          // Re-enable after a delay if still showing
          setTimeout(() => {
            if (btn.parentElement) {
              btn.disabled = false;
              btn.textContent = '🔄 Try Again';
              btn.style.opacity = '1';
            }
          }, 2000);
        } catch (err) {
          btn.disabled = false;
          btn.textContent = '❌ Failed - Try Again';
          btn.style.opacity = '1';
          log.error('reconnect', 'Reconnect failed:', (err as Error).message);
        }
      });
      resultsEl.appendChild(btn);
      
      // Add helpful tip
      const tipDiv = document.createElement('div');
      tipDiv.style.marginTop = '16px';
      tipDiv.style.fontSize = '12px';
      tipDiv.style.color = 'var(--text-secondary, #666)';
      tipDiv.textContent = 'Tip: If this persists, try reloading the page (F5) or reinstalling the extension.';
      resultsEl.appendChild(tipDiv);
    }
  }

  // ===== COPY TO CLIPBOARD (using shared utility) =====
  function copyMarkdownLink(index: number): void {
    const result = currentResults[index];
    if (!result?.url) {return;}
    
    const markdown = createMarkdownLink(result);
    
    navigator.clipboard.writeText(markdown).then(() => {
      showToast('Copied markdown link!');
    }).catch(() => {
      showToast('Failed to copy');
    });
  }

  function copyHtmlLink(index: number): void {
    const result = currentResults[index];
    if (!result?.url) {return;}
    
    copyHtmlLinkToClipboard(result).then(() => {
      showToast('Copied HTML link!');
    }).catch(() => {
      showToast('Copied (text only)');
    });
  }

  // ===== TAB NAVIGATION =====
  // Generic, extensible, fully cyclic tab navigation using shared utility
  function handleTabNavigation(backward: boolean): void {
    if (!inputEl || !resultsEl || !settingsBtn) { return; }

    // REVERSED ORDER: input → settings → results
    // This makes Tab from results go back to input (most common use case)
    const focusGroups: FocusableGroup[] = [
      {
        name: 'input',
        element: inputEl,
        onFocus: () => {
          inputEl?.focus();
          // Apply select-all behavior based on settings
          try {
            const selectAllOnFocus = Boolean(cachedSettings?.selectAllOnFocus);
            if (selectAllOnFocus && inputEl) {
              inputEl.setSelectionRange(0, inputEl.value.length);
            }
          } catch { /* ignore */ }
        }
      },
      {
        name: 'settings',
        element: settingsBtn
      },
      {
        name: 'results',
        element: null, // Custom handling
        onFocus: () => {
          // Focus the selected result or first result (card or list aware)
          if (currentResults.length > 0) {
            const isCards = resultsEl?.classList.contains('cards');
            const itemSel = isCards ? '.result-card' : '.result';
            const selectedResult = resultsEl?.querySelector(`${itemSel}.selected`) as HTMLElement;
            if (selectedResult) {
              selectedResult.focus();
            } else {
              const firstResult = resultsEl?.querySelector(itemSel) as HTMLElement;
              if (firstResult) {
                selectedIndex = 0;
                updateSelection();
                firstResult.focus();
              }
            }
          }
        },
        shouldSkip: () => currentResults.length === 0 // Skip if no results
      }
    ];

    // Determine current focused group
    const getCurrentGroupIndex = (): number => {
      const currentFocused = getFocusedElement() as HTMLElement;

      if (currentFocused === inputEl) {return 0;}
      if (currentFocused === settingsBtn) {return 1;}
      if (currentFocused && (
        currentFocused.classList?.contains('result') ||
        currentFocused.classList?.contains('result-card')
      )) {return 2;}

      return -1; // Unknown/not focused
    };

    // Use shared cyclic navigation
    handleCyclicTabNavigation(focusGroups, getCurrentGroupIndex, backward);
  }
  function handleKeydown(e: KeyboardEvent): void {
    // Check if input is focused - if so, only intercept specific navigation keys
    const focused = getFocusedElement() as HTMLElement | null;
    const isInputFocused = focused === inputEl;
    
    if (isInputFocused) {
      // In input: only handle Escape, ArrowDown, Enter, Tab, Shift+Tab
      // Allow ALL other keys (including Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+Z, Ctrl+Backspace, etc.) to work normally
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        hideOverlay();
        return;
      }
      if (e.key === 'Enter' && currentResults.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        const idx = selectedIndex >= 0 ? selectedIndex : 0;
        openResult(idx, !e.shiftKey);
        return;
      }
      if (e.key === 'ArrowDown' && currentResults.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        selectedIndex = 0;
        updateSelection();
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        handleTabNavigation(e.shiftKey);
        return;
      }
      // All other keys (including Ctrl+A, Ctrl+Backspace, Ctrl+Z, Ctrl+V, text editing, etc.) work normally
      // DO NOT stopPropagation here - let browser handle text editing shortcuts
      return;
    }
    
    // Not in input - stop propagation for result navigation
    e.stopPropagation();
    
    // Parse action and handle result navigation
    const action = parseKeyboardAction(e);
    if (!action) {return;}
    
    // Determine if a result element currently has focus and derive its index
    let focusedIndex: number | null = null;
    if (focused && focused.dataset?.index) {
      const idx = parseInt(focused.dataset.index, 10);
      if (!Number.isNaN(idx)) { focusedIndex = idx; }
    }
    
    e.preventDefault();
    
    switch (action) {
      case KeyboardAction.CLOSE:
        hideOverlay();
        break;
      
      case KeyboardAction.CLEAR:
        if (inputEl) {
          inputEl.value = '';
          inputEl.focus();
          currentResults = [];
          renderResults([]);
        }
        break;
      
      case KeyboardAction.NAVIGATE_DOWN:
        if (currentResults.length > 0) {
          if (focusedIndex !== null) {
            // If a result is focused, move relative to it
            selectedIndex = (focusedIndex + 1) % currentResults.length;
          } else {
            selectedIndex = (selectedIndex + 1) % currentResults.length;
          }
          updateSelection();
        }
        break;
      
      case KeyboardAction.NAVIGATE_UP:
        if (currentResults.length > 0) {
          if (focusedIndex !== null) {
            selectedIndex = (focusedIndex - 1 + currentResults.length) % currentResults.length;
          } else {
            selectedIndex = (selectedIndex - 1 + currentResults.length) % currentResults.length;
          }
          updateSelection();
        }
        break;
      
      case KeyboardAction.OPEN_NEW_TAB:
        if (currentResults.length > 0) {
          const idx = focusedIndex !== null ? focusedIndex : selectedIndex;
          if (idx >= 0) { openResult(idx, true, false); }
        }
        break;
      
      case KeyboardAction.OPEN_BACKGROUND_TAB:
        if (currentResults.length > 0) {
          const idx = focusedIndex !== null ? focusedIndex : selectedIndex;
          if (idx >= 0) { openResult(idx, true, true); }
        }
        break;
      
      case KeyboardAction.OPEN:
        if (currentResults.length > 0) {
          const idx = focusedIndex !== null ? focusedIndex : selectedIndex;
          if (idx >= 0) { openResult(idx, false, false); }
        }
        break;
      
      case KeyboardAction.COPY_MARKDOWN:
        if (currentResults.length > 0) {
          const idx = focusedIndex !== null ? focusedIndex : selectedIndex;
          if (idx >= 0) { copyMarkdownLink(idx); }
        }
        break;
      
      case KeyboardAction.COPY_HTML:
        if (currentResults.length > 0) {
          const idx = focusedIndex !== null ? focusedIndex : selectedIndex;
          if (idx >= 0) { copyHtmlLink(idx); }
        }
        break;
      
      case KeyboardAction.TAB_FORWARD:
        handleTabNavigation(false); // Forward tab
        break;
      
      case KeyboardAction.TAB_BACKWARD:
        handleTabNavigation(true); // Backward tab (Shift+Tab)
        break;
    }
  }

  function updateSelection(): void {
    if (!resultsEl) {return;}
    const isCards = resultsEl.classList.contains('cards');
    const itemSel = isCards ? '.result-card' : '.result';
    resultsEl.querySelectorAll(itemSel).forEach((el, i) => {
      el.classList.toggle('selected', i === selectedIndex);
    });
    // Scroll selected item into view (inline:nearest handles horizontal card scroll)
    const selected = resultsEl.querySelector(`${itemSel}.selected`);
    selected?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    // If a result is selected and currently not focused, move focus to it so arrow keys operate there
    if (selected && document.activeElement !== selected) {
      try {
        (selected as HTMLElement).focus();
      } catch {
        // ignore focus errors
      }
    }
  }

  function openResult(index: number, newTab: boolean, _background: boolean = false): void {
    const result = currentResults[index];
    if (!result?.url) {return;}

    hideOverlay();

    // Use shared openUrl utility - but inline overlay runs in page context, so use window APIs
    if (newTab) {
      window.open(result.url, '_blank');
    } else {
      window.location.href = result.url;
    }
  }

  // ===== GLOBAL KEYBOARD LISTENER =====
  function handleGlobalKeydown(e: KeyboardEvent): void {
    // COMPLETE KEYBOARD TAKEOVER when overlay is visible
    if (isOverlayVisible()) {
      // Intercept Tab/Shift+Tab to keep focus cycling inside the overlay
      if (e.key === 'Tab') {
        // Prevent the browser from moving focus outside the overlay
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        // Route to our Tab navigation handler (Shift+Tab => backward)
        handleTabNavigation(e.shiftKey);
        return;
      }

      // Always handle Escape to close overlay regardless of focused element
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        hideOverlay();
        return;
      }
      // Route keys based on currently focused element within the overlay
      const focusedElement = getFocusedElement();


      // If the input is focused, we must still prevent the underlying page from
      // receiving the key but we need to preserve (or emulate) native input shortcuts
      // like Ctrl+A/C/V. Prevent the event from reaching the page and route to
      // our controlled input handler which will emulate native behaviour.
      if (focusedElement === inputEl) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (inputEl) { handleKeyInput(e); }
        return;
      }

      // For other overlay-focused elements (results, settings) we should intercept
      // the key and prevent the page from handling it.
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (focusedElement && (focusedElement.classList?.contains('result') || focusedElement.classList?.contains('result-card') || focusedElement === settingsBtn)) {
        // Results or settings button is focused - handle navigation/action keys
        handleKeydown(e);
      } else {
        // Nothing specific focused - focus input and allow typing behavior
        if (inputEl) {
          inputEl.focus();
          // Do not simulate typing; let native event continue. Stop propagation so page doesn't get it.
          try { e.stopPropagation(); e.stopImmediatePropagation(); } catch { /* ignore */ }
        }
      }
      return;
    }

    // Handle shortcut to open overlay
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      showOverlay(); // showOverlay now handles all focus attempts
    }
  }

  // ===== TEXT EDITING HELPERS =====
  const undoStack: string[] = [];
  const redoStack: string[] = [];

  function pushUndo(prevValue: string): void {
    undoStack.push(prevValue);
    redoStack.length = 0; // any new edit clears redo
  }

  function triggerInputEvent(): void {
    const ev = new Event('input', { bubbles: true });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    inputEl!.dispatchEvent(ev);
  }

  /** Index of start of the previous word from pos (going left) */
  function prevWordBoundary(text: string, pos: number): number {
    let i = pos;
    while (i > 0 && /\s/.test(text[i - 1])) {i--;}
    while (i > 0 && /\S/.test(text[i - 1])) {i--;}
    return i;
  }

  /** Index of end of the next word from pos (going right) */
  function nextWordBoundary(text: string, pos: number): number {
    let i = pos;
    while (i < text.length && /\S/.test(text[i])) {i++;}
    while (i < text.length && /\s/.test(text[i])) {i++;}
    return i;
  }

  // ===== DIRECT KEY INPUT HANDLING =====
  function handleKeyInput(e: KeyboardEvent): void {
    if (!inputEl) { return; }

    const key = e.key;
    const start = inputEl.selectionStart ?? 0;
    const end = inputEl.selectionEnd ?? 0;
    const val = inputEl.value;
    const len = val.length;

    // ── Modifier shortcuts (Ctrl/Cmd) ──────────────────────────────────────
    const isMod = e.ctrlKey || e.metaKey;
    if (isMod) {
      const lk = key.toLowerCase();

      // Ctrl+A => Select All
      if (lk === 'a') {
        inputEl.setSelectionRange(0, len);
        return;
      }

      // Ctrl+C => Copy selection (or HTML link if nothing selected)
      if (lk === 'c') {
        const sel = val.substring(start, end);
        if (sel.length > 0) {
          try { navigator.clipboard.writeText(sel); showToast('Copied'); } catch { showToast('Copy failed'); }
        } else if (currentResults.length > 0) {
          copyHtmlLink(selectedIndex >= 0 ? selectedIndex : 0);
        }
        return;
      }

      // Ctrl+X => Cut selection
      if (lk === 'x') {
        const sel = val.substring(start, end);
        if (sel.length > 0) {
          try { navigator.clipboard.writeText(sel); } catch { /* ignore */ }
          pushUndo(val);
          inputEl.value = val.substring(0, start) + val.substring(end);
          inputEl.setSelectionRange(start, start);
          triggerInputEvent();
        }
        return;
      }

      // Ctrl+V => Paste
      if (lk === 'v') {
        navigator.clipboard.readText().then((text) => {
          if (!inputEl) {return;}
          const s = inputEl.selectionStart ?? 0;
          const ep = inputEl.selectionEnd ?? 0;
          pushUndo(inputEl.value);
          inputEl.value = inputEl.value.substring(0, s) + text + inputEl.value.substring(ep);
          inputEl.setSelectionRange(s + text.length, s + text.length);
          triggerInputEvent();
        }).catch(() => { showToast('Paste failed'); });
        return;
      }

      // Ctrl+M => Copy markdown link
      if (lk === 'm') {
        if (currentResults.length > 0) {
          copyMarkdownLink(selectedIndex >= 0 ? selectedIndex : 0);
        }
        return;
      }

      // Ctrl+Z => Undo
      if (lk === 'z' && !e.shiftKey) {
        if (undoStack.length > 0) {
          redoStack.push(val);
          inputEl.value = undoStack.pop()!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
          inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
          triggerInputEvent();
        }
        return;
      }

      // Ctrl+Shift+Z or Ctrl+Y => Redo
      if ((lk === 'z' && e.shiftKey) || lk === 'y') {
        if (redoStack.length > 0) {
          undoStack.push(val);
          inputEl.value = redoStack.pop()!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
          inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
          triggerInputEvent();
        }
        return;
      }

      // Ctrl+Backspace => delete word before cursor
      if (key === 'Backspace') {
        if (start === end) {
          const boundary = prevWordBoundary(val, start);
          if (boundary !== start) {
            pushUndo(val);
            inputEl.value = val.substring(0, boundary) + val.substring(start);
            inputEl.setSelectionRange(boundary, boundary);
            triggerInputEvent();
          }
        } else {
          pushUndo(val);
          inputEl.value = val.substring(0, start) + val.substring(end);
          inputEl.setSelectionRange(start, start);
          triggerInputEvent();
        }
        return;
      }

      // Ctrl+Delete => delete word after cursor
      if (key === 'Delete') {
        if (start === end) {
          const boundary = nextWordBoundary(val, end);
          if (boundary !== end) {
            pushUndo(val);
            inputEl.value = val.substring(0, start) + val.substring(boundary);
            inputEl.setSelectionRange(start, start);
            triggerInputEvent();
          }
        } else {
          pushUndo(val);
          inputEl.value = val.substring(0, start) + val.substring(end);
          inputEl.setSelectionRange(start, start);
          triggerInputEvent();
        }
        return;
      }

      // Ctrl+ArrowLeft => move/extend to previous word boundary
      if (key === 'ArrowLeft') {
        const boundary = prevWordBoundary(val, start);
        if (e.shiftKey) {
          inputEl.setSelectionRange(boundary, end);
        } else {
          inputEl.setSelectionRange(boundary, boundary);
        }
        return;
      }

      // Ctrl+ArrowRight => move/extend to next word boundary
      if (key === 'ArrowRight') {
        const boundary = nextWordBoundary(val, end);
        if (e.shiftKey) {
          inputEl.setSelectionRange(start, boundary);
        } else {
          inputEl.setSelectionRange(boundary, boundary);
        }
        return;
      }

      // Ctrl+Home / Ctrl+End
      if (key === 'Home') { inputEl.setSelectionRange(0, 0); return; }
      if (key === 'End') { inputEl.setSelectionRange(len, len); return; }

      // Any other Ctrl+key: ignore (don't insert char, don't fire search)
      return;
    }

    // ── Non-modifier special keys ──────────────────────────────────────────

    if (key === 'Backspace') {
      pushUndo(val);
      if (start === end && start > 0) {
        inputEl.value = val.substring(0, start - 1) + val.substring(end);
        inputEl.setSelectionRange(start - 1, start - 1);
      } else {
        inputEl.value = val.substring(0, start) + val.substring(end);
        inputEl.setSelectionRange(start, start);
      }
      triggerInputEvent();
      return;
    }

    if (key === 'Delete') {
      pushUndo(val);
      if (start === end) {
        inputEl.value = val.substring(0, start) + val.substring(end + 1);
      } else {
        inputEl.value = val.substring(0, start) + val.substring(end);
      }
      inputEl.setSelectionRange(start, start);
      triggerInputEvent();
      return;
    }

    if (key === 'ArrowLeft') {
      if (e.shiftKey) {
        inputEl.setSelectionRange(Math.max(0, start - 1), end);
      } else if (start !== end) {
        inputEl.setSelectionRange(start, start); // collapse to start of selection
      } else {
        inputEl.setSelectionRange(Math.max(0, start - 1), Math.max(0, start - 1));
      }
      return; // cursor move — no input event
    }

    if (key === 'ArrowRight') {
      if (e.shiftKey) {
        inputEl.setSelectionRange(start, Math.min(len, end + 1));
      } else if (start !== end) {
        inputEl.setSelectionRange(end, end); // collapse to end of selection
      } else {
        inputEl.setSelectionRange(Math.min(len, end + 1), Math.min(len, end + 1));
      }
      return; // cursor move — no input event
    }

    if (key === 'Home') {
      if (e.shiftKey) {
        inputEl.setSelectionRange(0, end);
      } else {
        inputEl.setSelectionRange(0, 0);
      }
      return;
    }

    if (key === 'End') {
      if (e.shiftKey) {
        inputEl.setSelectionRange(start, len);
      } else {
        inputEl.setSelectionRange(len, len);
      }
      return;
    }

    if (key === 'Enter') {
      // Dispatch to the input's own keydown handler for result navigation
      inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      return;
    }

    // ── Regular character insertion ────────────────────────────────────────
    if (key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      pushUndo(val);
      inputEl.value = val.substring(0, start) + key + val.substring(end);
      inputEl.setSelectionRange(start + 1, start + 1);
      triggerInputEvent();
    }
    // Unrecognised key — do nothing (no input event, value unchanged)
  }

  // ===== MESSAGE LISTENER (for service worker commands) =====
  function handleMessage(
    message: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void // eslint-disable-line @typescript-eslint/no-explicit-any
  ): boolean {
    if (message?.type === 'OPEN_INLINE_SEARCH') {
      const t0 = performance.now();
      log.info('message', 'OPEN_INLINE_SEARCH received');
      showOverlay(); // showOverlay now handles all focus attempts
      perfLog('Overlay shown via message', t0);
      sendResponse({ success: true, time: performance.now() - t0 });
      return true; // Indicate async response
    }
    // Update log level when settings change
    if (message?.type === 'LOG_LEVEL_CHANGED' && typeof message?.logLevel === 'number') {
      currentLogLevel = message.logLevel;
      sendResponse({ success: true });
      return true;
    }
    // Update cached settings when background notifies of changes
    if (message?.type === 'SETTINGS_CHANGED' && message?.settings) {
      try {
        cachedSettings = { ...(cachedSettings || {}), ...message.settings };
        try {
          updateSelectAllBadge(Boolean(cachedSettings?.selectAllOnFocus));
        } catch { /* ignore */ }
        try {
          if (shadowHost) { shadowHost.dataset.selectAll = String(Boolean(cachedSettings?.selectAllOnFocus)); }
        } catch { /* ignore */ }
        // Search debounce is separate from focusDelayMs
        searchDebounceMs = DEBOUNCE_MS;
      } catch {
        // ignore
      }
      sendResponse({ success: true });
      return true;
    }
    return false; // Not handled
  }

  // ===== CLEANUP =====
  function cleanup(): void {
    log.debug('cleanup', 'Cleaning up quick-search resources');
    
    // Disconnect search port
    if (searchPort) {
      try {
        searchPort.disconnect();
        searchPort = null;
      } catch {
        // Ignore - port may already be disconnected
      }
    }
    
    // Clear any pending timers
    if (debounceTimer) {clearTimeout(debounceTimer); debounceTimer = null;}
    if (aiDebounceTimer) {clearTimeout(aiDebounceTimer); aiDebounceTimer = null;}
    if (qsFocusTimer) {clearTimeout(qsFocusTimer); qsFocusTimer = null;}
    if (overlayFocusInterval) {clearInterval(overlayFocusInterval); overlayFocusInterval = null;}
    overlayFocusTimeouts.forEach(t => clearTimeout(t));
    overlayFocusTimeouts = [];
    if (hidePortCloseTimer) {clearTimeout(hidePortCloseTimer); hidePortCloseTimer = null;}
    clearSpinnerTimeout();
    
    // Remove shadow DOM
    if (shadowHost && shadowHost.parentNode) {
      shadowHost.parentNode.removeChild(shadowHost);
      shadowHost = null;
      shadowRoot = null;
      overlayEl = null;
      inputEl = null;
      resultsEl = null;
      settingsBtn = null;
    }
    
    // Remove event listeners
    try {
      document.removeEventListener('keydown', handleGlobalKeydown, true);
      document.removeEventListener('keydown', prewarmServiceWorker, true);
      if (chrome?.runtime?.onMessage) {
        chrome.runtime.onMessage.removeListener(handleMessage);
      }
    } catch {
      // Ignore - listeners may already be removed
    }
    
    // Reset loaded flag so content script can re-initialize after extension update
    window.__SMRUTI_QUICK_SEARCH_LOADED__ = false;

    perfLog('Cleanup complete');
  }
  
  // ===== INITIALIZATION =====
  function init(): void {
    const t0 = performance.now();
    
    log.info('init', 'Quick-search initializing');
    
    // Fetch log level from settings first (async, non-blocking)
    fetchLogLevel();
    
    perfLog('Initializing quick-search');

    // Global keyboard listener (capture phase for highest priority)
    document.addEventListener('keydown', handleGlobalKeydown, true);
    
    // Pre-warm service worker on first keyboard activity
    document.addEventListener('keydown', prewarmServiceWorker, { once: true, passive: true, capture: true });
    
    // Pre-warm on visibility change (tab becomes active)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        prewarmServiceWorker();
        // Re-fetch log level in case it changed
        fetchLogLevel();
      }
    }, { passive: true });

    // Message listener from service worker
    if (chrome?.runtime?.onMessage) {
      try {
        chrome.runtime.onMessage.addListener(handleMessage);
        log.debug('init', 'Message listener registered');
      } catch (err) {
        log.error('init', 'Failed to register message listener:', (err as Error).message);
      }
    } else {
      log.warn('init', 'chrome.runtime.onMessage not available');
    }
    
    // Cleanup on page unload/navigation
    window.addEventListener('beforeunload', cleanup, { once: true, passive: true });
    window.addEventListener('pagehide', cleanup, { once: true, passive: true });
    
    // Pre-create overlay earlier for faster first show
    // Use requestIdleCallback if available, otherwise setTimeout
    if ('requestIdleCallback' in window) {
      (window as Window & { requestIdleCallback: (callback: () => void, options?: { timeout: number }) => void }).requestIdleCallback(() => createOverlay(), { timeout: 500 });
    } else {
      setTimeout(createOverlay, 50);
    }

    perfLog('Initialization complete', t0);
  }

  // Run immediately
  init();
}

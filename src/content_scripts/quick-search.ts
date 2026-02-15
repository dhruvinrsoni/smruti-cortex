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
  KeyboardAction,
  createMarkdownLink,
  copyHtmlLinkToClipboard,
  handleCyclicTabNavigation,
  parseKeyboardAction,
  renderResults as renderResultsShared,
  sortResults
} from '../shared/search-ui-base';

import { type AppSettings } from '../core/settings';

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
  const DEBOUNCE_MS = 30; // Reduced for snappier feel
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
  let searchPort: chrome.runtime.Port | null = null;
  let prewarmed = false;
  let cachedSettings: AppSettings | null = null;
  let searchDebounceMs = DEBOUNCE_MS;

  // Helper: returns the currently focused element inside our shadow root if any
  function getFocusedElement(): Element | null {
    try {
      if (shadowRoot) {
        const focused = shadowRoot.querySelector(':focus') as Element | null;
        if (focused) { return focused; }
      }
    } catch (e) {
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
    .highlight {
      background: var(--highlight-bg);
      color: var(--highlight-text);
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
          if (currentLogLevel >= LOG_LEVEL.DEBUG) {
            console.debug(`[SmrutiCortex] Log level set to ${currentLogLevel}`);
          }
        }
      });
    } catch (e) {
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
          } catch (e) { /* ignore */ }
          try {
            if (shadowHost) { shadowHost.dataset.selectAll = String(Boolean(settings?.selectAllOnFocus)); }
          } catch (e) { /* ignore */ }
          const focusDelay = typeof settings?.focusDelayMs === 'number' ? settings.focusDelayMs : undefined;
          // If focusDelayMs is defined and >= 0, use it as search debounce (parity with popup)
          if (typeof focusDelay === 'number') {
            // Clamp to [0,2000]
            searchDebounceMs = Math.max(0, Math.min(2000, focusDelay));
          } else {
            searchDebounceMs = DEBOUNCE_MS;
          }
          if (currentLogLevel >= LOG_LEVEL.DEBUG) {
            console.debug('[SmrutiCortex] Fetched settings, focusDelayMs=', focusDelay, 'searchDebounceMs=', searchDebounceMs);
          }
        } catch (e) {
          // ignore
        }
      });
    } catch (e) {
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
      console.warn('[SmrutiCortex] Cannot open port: extension context invalidated');
      return;
    }
    
    const t0 = performance.now();
    try {
      searchPort = chrome.runtime.connect({ name: 'quick-search' });
      perfLog('Search port opened', t0);
      
      searchPort.onMessage.addListener((response) => {
        if (response?.results) {
          perfLog('Search results received via port');
          currentResults = response.results.slice(0, MAX_RESULTS);
          
          // Apply current sort setting (safe localStorage access)
          let currentSort = 'best-match';
          try {
            currentSort = localStorage.getItem('smruti-sort-by') || 'best-match';
          } catch {
            // Sandboxed context - use default
          }
          sortResults(currentResults, currentSort);
          
          selectedIndex = 0;
          renderResults(currentResults);
        }
      });

      searchPort.onDisconnect.addListener(() => {
        const lastError = chrome.runtime.lastError;
        // Only log errors if extension context is still valid
        // bfcache navigation causes port closure - this is expected and not an error
        if (isExtensionContextValid()) {
          if (lastError) {
            console.warn('[SmrutiCortex] Search port disconnected with error:', lastError.message);
          } else {
            perfLog('Search port disconnected');
          }
        }
        searchPort = null;
        
        // If context is still valid, automatically try to reconnect after a delay
        if (isExtensionContextValid()) {
          setTimeout(() => {
            if (!searchPort && isExtensionContextValid()) {
              perfLog('Auto-reconnecting search port');
              openSearchPort();
            }
          }, 500);
        }
      });
    } catch (e) {
      console.warn('[SmrutiCortex] Failed to open search port:', e);
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
    } catch (e) { /* ignore */ }
    
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
    // Safe localStorage access (fails on sandboxed pages like .mhtml)
    try {
      const savedSort = localStorage.getItem('smruti-sort-by') || 'best-match';
      currentSortIndex = sortOptions.findIndex(opt => opt.value === savedSort);
      if (currentSortIndex === -1) {currentSortIndex = 0;}
    } catch {
      // Sandboxed context - use default
      currentSortIndex = 0;
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
      try {
        localStorage.setItem('smruti-sort-by', newSort);
      } catch {
        // Sandboxed context - can't persist preference
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
        console.warn('[SmrutiCortex] Cannot open settings: extension context invalidated');
        return;
      }
      // Open the extension popup page in a new tab
      chrome.runtime.sendMessage({ type: 'OPEN_SETTINGS' });
      hideOverlay();
    });
    
    header.appendChild(logo);
    header.appendChild(inputEl);
    header.appendChild(sortBtn);
    header.appendChild(selectAllBadge);
    header.appendChild(settingsBtn);
    
    // Results
    resultsEl = document.createElement('div');
    resultsEl.className = 'results';
    
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
    
    container.appendChild(header);
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
      if (currentLogLevel >= LOG_LEVEL.DEBUG) {
        console.debug('[SmrutiCortex] Input focused');
      }
    });
    // Remove aggressive refocus from blur — prefer native focus behavior and Tab navigation.
    // Keep a light debug hook for visibility only.
    inputEl.addEventListener('blur', (e) => {
      if (currentLogLevel >= LOG_LEVEL.DEBUG) {
        console.debug('[SmrutiCortex] Input blurred (no refocus). relatedTarget:', (e as FocusEvent).relatedTarget);
      }
    });

    // Append to document
    document.documentElement.appendChild(shadowHost);

    perfLog('Overlay created with Shadow DOM', t0);
    // Fetch settings now to configure debounce and focus behavior
    fetchSettings();
  }

  // ===== SHOW/HIDE =====
  function showOverlay(): void {
    const t0 = performance.now();
    perfLog('showOverlay called');

    if (!shadowHost) {
      const t1 = performance.now();
      createOverlay();
      perfLog('createOverlay (on-demand)', t1);
    }
    
    if (!shadowHost || !overlayEl || !inputEl) {return;}

    // Show overlay FIRST
    shadowHost.classList.add('visible');
    overlayEl.classList.add('visible');
    // Refresh settings each time overlay is shown so UI (badge, focus behavior)
    // reflects the most recent user preferences even if the overlay was pre-created
    try {
      // Apply cached settings immediately if available
      updateSelectAllBadge(Boolean(cachedSettings?.selectAllOnFocus));
    } catch (e) { /* ignore */ }
    // Then fetch latest settings asynchronously (will update badge when done)
    fetchSettings();
    
    // Reset state
    inputEl.value = '';
    currentResults = [];
    selectedIndex = 0;
    renderResults([]);
    
    // NUCLEAR OPTION: Force blur current element (omnibox) then focus aggressively
    // Strategy 1: Blur active element (likely the omnibox with selected text)
    try {
      if (document.activeElement && document.activeElement !== inputEl) {
        (document.activeElement as HTMLElement).blur();
      }
    } catch (e) { /* ignore */ }
    
    // Strategy 2: Immediate synchronous focus
    inputEl.focus();
    inputEl.setSelectionRange(0, 0);
    perfLog('Input focused immediately', t0);
    
    // Strategy 3: Continuous focus attempts with setInterval (nuclear option for selected text in omnibox)
    let focusAttempts = 0;
    const maxAttempts = 20; // Try for up to 1 second (20 * 50ms)
    const focusInterval = setInterval(() => {
      focusAttempts++;
      
      // Check if we've achieved focus or maxed out attempts
      if (focusAttempts >= maxAttempts) {
        clearInterval(focusInterval);
        return;
      }
      
      // If our input has focus, stop trying
      if (document.activeElement === inputEl || shadowRoot?.activeElement === inputEl) {
        clearInterval(focusInterval);
        return;
      }
      
      // If overlay was closed, stop trying
      if (!isOverlayVisible()) {
        clearInterval(focusInterval);
        return;
      }
      
      // Force blur active element and focus our input
      try {
        if (document.activeElement && document.activeElement !== inputEl) {
          (document.activeElement as HTMLElement).blur();
        }
      } catch (e) { /* ignore */ }
      
      inputEl.focus();
      inputEl.setSelectionRange(0, 0);
    }, 50); // Every 50ms
    
    // Strategy 4: Backup timeouts at key intervals
    const focusAtIntervals = [0, 100, 200, 300, 500, 800];
    focusAtIntervals.forEach(delay => {
      setTimeout(() => {
        if (inputEl && isOverlayVisible() && document.activeElement !== inputEl && shadowRoot?.activeElement !== inputEl) {
          try {
            if (document.activeElement && document.activeElement !== inputEl) {
              (document.activeElement as HTMLElement).blur();
            }
          } catch (e) { /* ignore */ }
          inputEl.focus();
          inputEl.setSelectionRange(0, 0);
        }
      }, delay);
    });

    // Open port for faster messaging (only if extension context is valid)
    if (chrome.runtime?.id) {
      openSearchPort();
    }
  }

  function hideOverlay(): void {
    if (!shadowHost || !overlayEl) {return;}
    
    shadowHost.classList.remove('visible');
    overlayEl.classList.remove('visible');
    
    if (inputEl) {inputEl.blur();}
    
    // Close port after a delay (in case user reopens quickly)
    setTimeout(closeSearchPort, 1000);
  }

  function isOverlayVisible(): boolean {
    return shadowHost?.classList.contains('visible') ?? false;
  }

  // ===== SEARCH =====
  function handleInput(): void {
    if (debounceTimer) {clearTimeout(debounceTimer);}
    
    // Early check: If extension context is already invalid, attempt recovery immediately
    if (!isExtensionContextValid()) {
      perfLog('Extension context invalid during input - attempting silent recovery');
      attemptContextRecovery().then(recovered => {
        if (recovered) {
          perfLog('Context recovered successfully');
          // Continue with search after recovery
          const query = inputEl?.value?.trim() || '';
          if (query.length > 0) {
            performSearch(query);
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
    
    debounceTimer = window.setTimeout(() => {
      const query = inputEl?.value?.trim() || '';
      if (query.length === 0) {
        currentResults = [];
        renderResults([]);
        return;
      }
      performSearch(query);
    }, searchDebounceMs);
  }

  function performSearch(query: string): void {
    const t0 = performance.now();
    perfLog(`performSearch: "${query}"`);

    // Sanitize query to prevent issues with special characters
    const sanitizedQuery = sanitizeQuery(query);
    if (!sanitizedQuery) {
      // Empty query after sanitization - show empty state
      currentResults = [];
      renderResults([]);
      return;
    }

    // Check extension context validity first
    if (!isExtensionContextValid()) {
      perfLog('Extension context invalid during search - attempting recovery');
      currentResults = [];
      
      // Attempt silent recovery first
      attemptContextRecovery().then(recovered => {
        if (recovered) {
          perfLog('Context recovered - retrying search');
          showToast('Extension reconnected');
          // Retry the search
          performSearch(query);
        } else {
          // Show error only after recovery attempts fail
          console.warn('[SmrutiCortex] Cannot search: extension context invalidated after recovery attempts');
          renderErrorResults(
            '🔄 Extension was updated. Please reload this page to continue searching.',
            () => window.location.reload()
          );
        }
      }).catch(() => {
        console.warn('[SmrutiCortex] Context recovery failed');
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
        searchPort.postMessage({ type: 'SEARCH_QUERY', query: sanitizedQuery, source: 'inline' });
        perfLog('Search query sent via port', t0);
        // Check for runtime errors after async operation
        if (chrome.runtime.lastError) {
          console.warn('[SmrutiCortex] Port message error (likely bfcache):', chrome.runtime.lastError.message);
          searchPort = null;
          openSearchPort();
          return;
        }
      } catch (err) {
        console.warn('[SmrutiCortex] Failed to send via port, trying to reconnect:', err);
        searchPort = null;
        openSearchPort();
        // Try once more with new port
        if (searchPort) {
          try {
            searchPort.postMessage({ type: 'SEARCH_QUERY', query: sanitizedQuery, source: 'inline' });
            perfLog('Search query sent via reconnected port', t0);
            // Check for runtime errors after async operation
            if (chrome.runtime.lastError) {
              console.warn('[SmrutiCortex] Reconnected port message error:', chrome.runtime.lastError.message);
              searchPort = null;
            }
            return;
          } catch (e) { /* ignore */ }
        }
        // Fall through to sendMessage fallback
      }
    }
    
    // Fallback to one-shot sendMessage if no port
    if (!searchPort) {

      // Attempt one-shot sendMessage and handle errors
      try {
        chrome.runtime.sendMessage(
          { type: 'SEARCH_QUERY', query: sanitizedQuery, source: 'inline' },
          (response) => {
            if (chrome.runtime.lastError) {
              console.warn('[SmrutiCortex] Search error:', chrome.runtime.lastError);
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
            if (response?.results) {
              perfLog('Search results received via sendMessage', t0);
              currentResults = response.results.slice(0, MAX_RESULTS);
              
              // Apply current sort setting (safe localStorage access)
              let currentSort = 'best-match';
              try {
                currentSort = localStorage.getItem('smruti-sort-by') || 'best-match';
              } catch {
                // Sandboxed context - use default
              }
              sortResults(currentResults, currentSort);
              
              selectedIndex = 0;
              renderResults(currentResults);
            }
          }
        );
      } catch (e) {
        console.warn('[SmrutiCortex] Search request failed:', e);
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

  // ===== RENDER RESULTS (using shared render function) =====
  function renderResults(results: SearchResult[]): void {
    if (!resultsEl) {return;}
    const t0 = performance.now();

    // Clear existing results
    while (resultsEl.firstChild) {
      resultsEl.removeChild(resultsEl.firstChild);
    }

    const query = inputEl?.value?.trim().toLowerCase() || '';
    const tokens = query.split(/\s+/).filter(Boolean);
    const emptyMessage = query ? 'No results found' : 'Type to search your history...';

    // Use shared rendering function (DRY principle)
    const fragment = renderResultsShared(results, tokens, {
      selectedIndex,
      emptyMessage,
      resultClassName: 'result',
      selectedClassName: 'selected',
      titleClassName: 'result-title',
      urlClassName: 'result-url',
      highlightClassName: 'highlight',
      emptyClassName: 'empty',
      onResultClick: (index, _result, _ctrlOrMeta) => {
        openResult(index, true);
      }
    });

    resultsEl.appendChild(fragment);
    
    // Make result elements focusable for keyboard navigation
    resultsEl.querySelectorAll('.result').forEach((result, index) => {
      (result as HTMLElement).tabIndex = 0;
      (result as HTMLElement).dataset.index = String(index);
    });
    // After rendering, consider focusing the first result depending on settings (popup parity)
    (async () => {
      try {
        // Fetch settings if not cached
        if (!cachedSettings) {
          cachedSettings = await new Promise<AppSettings>((resolve) => {
            try {
              chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (resp) => {
                resolve(resp?.settings || {} as AppSettings);
              });
            } catch {
              resolve({} as AppSettings);
            }
          });
        }
        const rawDelay = typeof cachedSettings?.focusDelayMs === 'number' ? cachedSettings.focusDelayMs : 0;
        const focusDelay = Math.max(0, Math.min(2000, rawDelay || 0));
        if (results.length > 0 && focusDelay > 0) {
          // Popup behavior: focusDelayMs controls the debounce; if >0, focus the first result
          // immediately after render (use setTimeout 0 to ensure element is ready)
          setTimeout(() => {
            if (!resultsEl) { return; }
            const first = resultsEl.querySelector('.result') as HTMLElement | null;
            if (first) {
              selectedIndex = 0;
              updateSelection();
              first.focus();
            }
          }, 0);
        }
        // Final fallback: always ensure first result is focusable and focused so Enter works
        // This ensures pages that steal focus still allow Enter to operate on results.
        if (results.length > 0) {
          const first = resultsEl.querySelector('.result') as HTMLElement | null;
          if (first) {
            selectedIndex = 0;
            updateSelection();
            try { first.focus(); } catch (e) { /* ignore */ }
          }
        }
      } catch (e) {
        // ignore
      }
    })();
    
    perfLog(`renderResults (${results.length} items)`, t0);
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
          console.error('[SmrutiCortex] Reconnect failed:', err);
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
          } catch (e) { /* ignore */ }
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
          // Focus the selected result or first result
          if (currentResults.length > 0) {
            const selectedResult = resultsEl?.querySelector('.result.selected') as HTMLElement;
            if (selectedResult) {
              selectedResult.focus();
            } else {
              const firstResult = resultsEl?.querySelector('.result') as HTMLElement;
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
      if (currentFocused && currentFocused.classList?.contains('result')) {return 2;}
      
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
      // In input: only handle Escape, ArrowDown, Tab, Shift+Tab
      // Allow ALL other keys (including Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+Z, Ctrl+Backspace, etc.) to work normally
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        hideOverlay();
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
    resultsEl.querySelectorAll('.result').forEach((el, i) => {
      el.classList.toggle('selected', i === selectedIndex);
    });
    // Scroll into view
    const selected = resultsEl.querySelector('.result.selected');
    selected?.scrollIntoView({ block: 'nearest' });
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

      if (focusedElement && (focusedElement.classList?.contains('result') || focusedElement === settingsBtn)) {
        // Results or settings button is focused - handle navigation/action keys
        handleKeydown(e);
      } else {
        // Nothing specific focused - focus input and allow typing behavior
        if (inputEl) {
          inputEl.focus();
          // Do not simulate typing; let native event continue. Stop propagation so page doesn't get it.
          try { e.stopPropagation(); e.stopImmediatePropagation(); } catch (e) { /* ignore */ }
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

  // ===== DIRECT KEY INPUT HANDLING =====
  function handleKeyInput(e: KeyboardEvent): void {
    if (!inputEl) { return; }
    
    const key = e.key;
    const start = inputEl.selectionStart || 0;
    const end = inputEl.selectionEnd || 0;
    
    // Handle modifier shortcuts first (Ctrl/Cmd)
    const isMod = e.ctrlKey || e.metaKey;
    if (isMod) {
      const key = e.key.toLowerCase();
      // Ctrl/Meta + A => Select All
      if (key === 'a') {
        inputEl.setSelectionRange(0, inputEl.value.length);
        return;
      }
      // Ctrl/Meta + C => Copy selection to clipboard (or copy HTML link if no selection)
      if (key === 'c') {
        const selection = inputEl.value.substring((inputEl.selectionStart || 0), (inputEl.selectionEnd || 0));
        if (selection.length > 0) {
          // If there's text selected in the input, copy that
          try { navigator.clipboard.writeText(selection); showToast('Copied'); } catch { showToast('Copy failed'); }
        } else if (currentResults.length > 0) {
          // If no text selected but results exist, copy selected result as HTML
          const idx = selectedIndex >= 0 ? selectedIndex : 0;
          copyHtmlLink(idx);
        }
        return;
      }
      // Ctrl/Meta + X => Cut
      if (key === 'x') {
        const startS = inputEl.selectionStart || 0;
        const endS = inputEl.selectionEnd || 0;
        const selection = inputEl.value.substring(startS, endS);
        if (selection.length > 0) {
          try { navigator.clipboard.writeText(selection); } catch (e) { /* ignore */ }
          inputEl.value = inputEl.value.substring(0, startS) + inputEl.value.substring(endS);
          inputEl.setSelectionRange(startS, startS);
        }
        return;
      }
      // Ctrl/Meta + V => Paste (async clipboard read)
      if (key === 'v') {
        try {
          navigator.clipboard.readText().then((text) => {
            const s = inputEl.selectionStart || 0;
            const epos = inputEl.selectionEnd || 0;
            inputEl.value = inputEl.value.substring(0, s) + text + inputEl.value.substring(epos);
            const pos = s + text.length;
            inputEl.setSelectionRange(pos, pos);
            // Trigger input event
            const inputEvent = new Event('input', { bubbles: true });
            inputEl.dispatchEvent(inputEvent);
          }).catch(() => { showToast('Paste failed'); });
        } catch {
          showToast('Paste failed');
        }
        return;
      }
      // Ctrl/Meta + M => copy markdown for selected/active result (keep existing behavior)
      if (key === 'm') {
        // If there are results, copy currently selected result; otherwise no-op
        if (currentResults.length > 0) {
          const idx = selectedIndex >= 0 ? selectedIndex : 0;
          copyMarkdownLink(idx);
        }
        return;
      }
    }

    // Handle special keys
    if (key === 'Backspace') {
      if (start === end && start > 0) {
        // Delete single character before cursor
        inputEl.value = inputEl.value.substring(0, start - 1) + inputEl.value.substring(end);
        inputEl.selectionStart = inputEl.selectionEnd = start - 1;
      } else {
        // Delete selection
        inputEl.value = inputEl.value.substring(0, start) + inputEl.value.substring(end);
        inputEl.selectionStart = inputEl.selectionEnd = start;
      }
    } else if (key === 'Delete') {
      if (start === end) {
        // Delete single character after cursor
        inputEl.value = inputEl.value.substring(0, start) + inputEl.value.substring(end + 1);
      } else {
        // Delete selection
        inputEl.value = inputEl.value.substring(0, start) + inputEl.value.substring(end);
      }
      inputEl.selectionStart = inputEl.selectionEnd = start;
    } else if (key === 'ArrowLeft') {
      inputEl.selectionStart = inputEl.selectionEnd = Math.max(0, start - 1);
    } else if (key === 'ArrowRight') {
      inputEl.selectionStart = inputEl.selectionEnd = Math.min(inputEl.value.length, end + 1);
    } else if (key === 'Home') {
      inputEl.selectionStart = inputEl.selectionEnd = 0;
    } else if (key === 'End') {
      inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length;
    } else if (key === 'Enter') {
      // Let the input's keydown handler handle Enter
      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true
      });
      inputEl.dispatchEvent(enterEvent);
    } else if (key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      // Insert regular character
      inputEl.value = inputEl.value.substring(0, start) + key + inputEl.value.substring(end);
      inputEl.selectionStart = inputEl.selectionEnd = start + 1;
    }
    
    // Trigger input event for search
    const inputEvent = new Event('input', { bubbles: true });
    inputEl.dispatchEvent(inputEvent);
  }

  // ===== MESSAGE LISTENER (for service worker commands) =====
  function handleMessage(
    message: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void // eslint-disable-line @typescript-eslint/no-explicit-any
  ): boolean {
    if (message?.type === 'OPEN_INLINE_SEARCH') {
      const t0 = performance.now();
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
        } catch (e) { /* ignore */ }
        try {
          if (shadowHost) { shadowHost.dataset.selectAll = String(Boolean(cachedSettings?.selectAllOnFocus)); }
        } catch (e) { /* ignore */ }
        const focusDelay = typeof cachedSettings?.focusDelayMs === 'number' ? cachedSettings.focusDelayMs : undefined;
        if (typeof focusDelay === 'number') {
          searchDebounceMs = Math.max(0, Math.min(2000, focusDelay));
        }
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
    perfLog('Cleaning up quick-search resources');
    
    // Disconnect search port
    if (searchPort) {
      try {
        searchPort.disconnect();
        searchPort = null;
      } catch (e) {
        // Ignore - port may already be disconnected
      }
    }
    
    // Clear any pending timers
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    
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
    } catch (e) {
      // Ignore - listeners may already be removed
    }
    
    perfLog('Cleanup complete');
  }
  
  // ===== INITIALIZATION =====
  function init(): void {
    const t0 = performance.now();
    
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
    if (chrome?.runtime?.onMessage && chrome.runtime.id) {
      chrome.runtime.onMessage.addListener(handleMessage);
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

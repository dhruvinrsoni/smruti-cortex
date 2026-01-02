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
  KeyboardAction,
  createMarkdownLink,
  parseKeyboardAction,
  renderResults as renderResultsShared
} from '../shared/search-ui-base';

// Prevent double-injection
if (!(window as any).__SMRUTI_QUICK_SEARCH_LOADED__) {
  (window as any).__SMRUTI_QUICK_SEARCH_LOADED__ = true;

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
  let selectedIndex = 0;
  let currentResults: any[] = [];
  let debounceTimer: number | null = null;
  let searchPort: chrome.runtime.Port | null = null;
  let prewarmed = false;

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
    } catch {
      // Extension context may be invalid
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
    if (searchPort || !chrome.runtime?.id) {return;}
    const t0 = performance.now();
    try {
      searchPort = chrome.runtime.connect({ name: 'quick-search' });
      perfLog('Search port opened', t0);
      
      searchPort.onMessage.addListener((response) => {
        if (response?.results) {
          perfLog('Search results received via port');
          currentResults = response.results.slice(0, MAX_RESULTS);
          selectedIndex = 0;
          renderResults(currentResults);
        }
      });

      searchPort.onDisconnect.addListener(() => {
        perfLog('Search port disconnected');
        searchPort = null;
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
  
  function showToast(message: string): void {
    if (!toastEl) {return;}
    toastEl.textContent = message;
    toastEl.classList.add('show');
    if (toastTimeout) {clearTimeout(toastTimeout);}
    toastTimeout = window.setTimeout(() => {
      toastEl?.classList.remove('show');
    }, 1500);
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
    
    const escKbd = document.createElement('span');
    escKbd.className = 'kbd';
    escKbd.textContent = 'ESC';
    
    // Settings button - opens the full popup
    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'settings-btn';
    settingsBtn.title = 'Open settings';
    
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
    header.appendChild(escKbd);
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
    
    // Prevent keyboard events from bubbling out of the overlay
    overlayEl.addEventListener('keydown', (e) => {
      e.stopPropagation();
    }, true); // Use capture phase
    
    // Maintain focus on input when overlay is clicked
    overlayEl.addEventListener('mousedown', (e) => {
      // If clicking on non-interactive elements, refocus input
      if (e.target === overlayEl || e.target === resultsEl || 
          (e.target as Element)?.classList.contains('result')) {
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
    inputEl.addEventListener('blur', () => {
      if (currentLogLevel >= LOG_LEVEL.DEBUG) {
        console.debug('[SmrutiCortex] Input blurred');
      }
      // AGGRESSIVE: Force refocus immediately when overlay is visible
      if (isOverlayVisible()) {
        setTimeout(() => {
          if (inputEl && isOverlayVisible()) {
            inputEl.focus();
          }
        }, 0);
      }
    });

    // Append to document
    document.documentElement.appendChild(shadowHost);

    perfLog('Overlay created with Shadow DOM', t0);
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
    
    // Reset state
    inputEl.value = '';
    currentResults = [];
    selectedIndex = 0;
    renderResults([]);
    
    // AGGRESSIVE FOCUS: Focus immediately and keep focused
    inputEl.focus();
    inputEl.setSelectionRange(0, 0);
    perfLog('Input focused immediately', t0);

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
    debounceTimer = window.setTimeout(() => {
      const query = inputEl?.value?.trim() || '';
      if (query.length === 0) {
        currentResults = [];
        renderResults([]);
        return;
      }
      performSearch(query);
    }, DEBOUNCE_MS);
  }

  function performSearch(query: string): void {
    const t0 = performance.now();
    perfLog(`performSearch: "${query}"`);

    // Use port if available (faster), otherwise fallback to sendMessage
    if (searchPort) {
      searchPort.postMessage({ type: 'SEARCH_QUERY', query, source: 'inline' });
      perfLog('Search query sent via port', t0);
    } else {
      if (!chrome.runtime?.id) {
        console.warn('[SmrutiCortex] Cannot search: extension context invalidated');
        // Show error message in results
        currentResults = [];
        renderErrorResults('Extension context invalidated. Please refresh the page or reload the extension.');
        return;
      }
      try {
        chrome.runtime.sendMessage(
          { type: 'SEARCH_QUERY', query, source: 'inline' },
          (response) => {
            if (chrome.runtime.lastError) {
              console.warn('[SmrutiCortex] Search error:', chrome.runtime.lastError);
              currentResults = [];
              renderErrorResults('Search failed. Please try again.');
              return;
            }
            if (response?.results) {
              perfLog('Search results received via sendMessage', t0);
              currentResults = response.results.slice(0, MAX_RESULTS);
              selectedIndex = 0;
              renderResults(currentResults);
            }
          }
        );
      } catch (e) {
        console.warn('[SmrutiCortex] Search failed:', e);
        currentResults = [];
        renderErrorResults('Search failed. Please try again.');
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
      onResultClick: (index, _result, ctrlOrMeta) => {
        openResult(index, ctrlOrMeta);
      }
    });

    resultsEl.appendChild(fragment);
    perfLog(`renderResults (${results.length} items)`, t0);
  }

  // ===== RENDER ERROR MESSAGE =====
  function renderErrorResults(message: string): void {
    if (!resultsEl) {return;}
    
    // Clear existing results
    while (resultsEl.firstChild) {
      resultsEl.removeChild(resultsEl.firstChild);
    }

    const errorDiv = document.createElement('div');
    errorDiv.className = 'empty';
    errorDiv.textContent = message;
    errorDiv.style.color = 'var(--text-secondary)';
    resultsEl.appendChild(errorDiv);
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

  // ===== KEYBOARD NAVIGATION (using shared parseKeyboardAction) =====
  function handleKeydown(e: KeyboardEvent): void {
    const action = parseKeyboardAction(e);
    
    if (!action) {return;}
    
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
          selectedIndex = (selectedIndex + 1) % currentResults.length;
          updateSelection();
        }
        break;
      
      case KeyboardAction.NAVIGATE_UP:
        if (currentResults.length > 0) {
          selectedIndex = (selectedIndex - 1 + currentResults.length) % currentResults.length;
          updateSelection();
        }
        break;
      
      case KeyboardAction.OPEN_NEW_TAB:
        if (currentResults.length > 0 && selectedIndex >= 0) {
          openResult(selectedIndex, true, false);
        }
        break;
      
      case KeyboardAction.OPEN_BACKGROUND_TAB:
        if (currentResults.length > 0 && selectedIndex >= 0) {
          openResult(selectedIndex, true, true);
        }
        break;
      
      case KeyboardAction.OPEN:
        if (currentResults.length > 0 && selectedIndex >= 0) {
          openResult(selectedIndex, false, false);
        }
        break;
      
      case KeyboardAction.COPY_MARKDOWN:
        if (currentResults.length > 0 && selectedIndex >= 0) {
          copyMarkdownLink(selectedIndex);
        }
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
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      // Handle escape to close
      if (e.key === 'Escape') {
        hideOverlay();
        return;
      }
      
      // Handle all other keys by inserting into input
      if (inputEl) {
        handleKeyInput(e);
      }
      return;
    }
    
    // Handle shortcut to open overlay
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      showOverlay();
    }
  }

  // ===== DIRECT KEY INPUT HANDLING =====
  function handleKeyInput(e: KeyboardEvent): void {
    if (!inputEl) return;
    
    const key = e.key;
    const start = inputEl.selectionStart || 0;
    const end = inputEl.selectionEnd || 0;
    
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
    message: any,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ): boolean {
    if (message?.type === 'OPEN_INLINE_SEARCH') {
      const t0 = performance.now();
      showOverlay();
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
    return false; // Not handled
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
    
    // Pre-create overlay earlier for faster first show
    // Use requestIdleCallback if available, otherwise setTimeout
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => createOverlay(), { timeout: 500 });
    } else {
      setTimeout(createOverlay, 50);
    }

    perfLog('Initialization complete', t0);
  }

  // Run immediately
  init();
}

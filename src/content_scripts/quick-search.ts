/**
 * quick-search.ts
 * Ultra-fast inline search overlay that bypasses service worker wake-up delays.
 * Listens for keyboard shortcut directly in page context for instant response.
 */

// Prevent double-injection
if (!(window as any).__SMRUTI_QUICK_SEARCH_LOADED__) {
  (window as any).__SMRUTI_QUICK_SEARCH_LOADED__ = true;

  // ===== CONFIGURATION =====
  const OVERLAY_ID = 'smruti-cortex-overlay';
  const INPUT_ID = 'smruti-cortex-input';
  const RESULTS_ID = 'smruti-cortex-results';
  const DEBOUNCE_MS = 50;
  const MAX_RESULTS = 15;

  // ===== STATE =====
  let overlay: HTMLDivElement | null = null;
  let inputEl: HTMLInputElement | null = null;
  let resultsEl: HTMLDivElement | null = null;
  let selectedIndex = 0;
  let currentResults: any[] = [];
  let debounceTimer: number | null = null;

  // ===== STYLES (inlined for instant loading) =====
  const OVERLAY_STYLES = `
    #${OVERLAY_ID} {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 2147483647;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding-top: 10vh;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      animation: smruti-fade-in 0.08s ease-out;
    }
    #${OVERLAY_ID}.hidden {
      display: none !important;
    }
    @keyframes smruti-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .smruti-container {
      width: 600px;
      max-width: 90vw;
      background: #1e1e2e;
      border-radius: 12px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      overflow: hidden;
      animation: smruti-slide-in 0.1s ease-out;
    }
    @keyframes smruti-slide-in {
      from { transform: translateY(-20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .smruti-header {
      display: flex;
      align-items: center;
      padding: 16px;
      background: #181825;
      border-bottom: 1px solid #313244;
    }
    .smruti-logo {
      font-size: 20px;
      margin-right: 12px;
    }
    #${INPUT_ID} {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      font-size: 18px;
      color: #cdd6f4;
      caret-color: #89b4fa;
    }
    #${INPUT_ID}::placeholder {
      color: #6c7086;
    }
    .smruti-kbd {
      background: #313244;
      color: #a6adc8;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      margin-left: 8px;
    }
    #${RESULTS_ID} {
      max-height: 60vh;
      overflow-y: auto;
      padding: 8px 0;
    }
    .smruti-result {
      display: flex;
      flex-direction: column;
      padding: 10px 16px;
      cursor: pointer;
      transition: background 0.05s;
      border-left: 3px solid transparent;
    }
    .smruti-result:hover,
    .smruti-result.selected {
      background: #313244;
      border-left-color: #89b4fa;
    }
    .smruti-result-title {
      color: #cdd6f4;
      font-size: 14px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 2px;
    }
    .smruti-result-url {
      color: #6c7086;
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .smruti-highlight {
      background: #fab387;
      color: #1e1e2e;
      border-radius: 2px;
      padding: 0 2px;
    }
    .smruti-empty {
      padding: 24px;
      text-align: center;
      color: #6c7086;
    }
    .smruti-footer {
      display: flex;
      gap: 16px;
      padding: 10px 16px;
      background: #181825;
      border-top: 1px solid #313244;
      font-size: 11px;
      color: #6c7086;
    }
    .smruti-footer span {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .smruti-footer kbd {
      background: #313244;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: inherit;
    }
  `;

  // ===== CREATE OVERLAY =====
  function createOverlay(): void {
    if (document.getElementById(OVERLAY_ID)) return;

    // Inject styles
    const styleEl = document.createElement('style');
    styleEl.id = 'smruti-cortex-styles';
    styleEl.textContent = OVERLAY_STYLES;
    document.head.appendChild(styleEl);

    // Create overlay
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'hidden';
    overlay.innerHTML = `
      <div class="smruti-container">
        <div class="smruti-header">
          <span class="smruti-logo">🧠</span>
          <input type="text" id="${INPUT_ID}" placeholder="Search your browsing history..." autocomplete="off" spellcheck="false" />
          <span class="smruti-kbd">ESC</span>
        </div>
        <div id="${RESULTS_ID}">
          <div class="smruti-empty">Type to search your history...</div>
        </div>
        <div class="smruti-footer">
          <span><kbd>↑↓</kbd> Navigate</span>
          <span><kbd>Enter</kbd> Open</span>
          <span><kbd>Ctrl+Enter</kbd> New tab</span>
          <span><kbd>ESC</kbd> Close</span>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    inputEl = document.getElementById(INPUT_ID) as HTMLInputElement;
    resultsEl = document.getElementById(RESULTS_ID) as HTMLDivElement;

    // Event listeners
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) hideOverlay();
    });

    inputEl.addEventListener('input', handleInput);
    inputEl.addEventListener('keydown', handleKeydown);
  }

  // ===== SHOW/HIDE =====
  function showOverlay(): void {
    if (!overlay) createOverlay();
    if (!overlay || !inputEl) return;

    overlay.classList.remove('hidden');
    inputEl.value = '';
    inputEl.focus();
    currentResults = [];
    selectedIndex = 0;
    renderResults([]);
  }

  function hideOverlay(): void {
    if (!overlay) return;
    overlay.classList.add('hidden');
    if (inputEl) inputEl.blur();
  }

  function isOverlayVisible(): boolean {
    return overlay !== null && !overlay.classList.contains('hidden');
  }

  // ===== SEARCH =====
  function handleInput(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
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
    try {
      chrome.runtime.sendMessage(
        { type: 'SEARCH_QUERY', query, source: 'inline' },
        (response) => {
          if (chrome.runtime.lastError) {
            console.warn('[SmrutiCortex] Search error:', chrome.runtime.lastError);
            return;
          }
          if (response?.results) {
            currentResults = response.results.slice(0, MAX_RESULTS);
            selectedIndex = 0;
            renderResults(currentResults);
          }
        }
      );
    } catch (e) {
      console.warn('[SmrutiCortex] Search failed:', e);
    }
  }

  // ===== RENDER RESULTS =====
  function renderResults(results: any[]): void {
    if (!resultsEl) return;

    if (results.length === 0) {
      const query = inputEl?.value?.trim() || '';
      resultsEl.innerHTML = `<div class="smruti-empty">${
        query ? 'No results found' : 'Type to search your history...'
      }</div>`;
      return;
    }

    const query = inputEl?.value?.trim().toLowerCase() || '';
    const tokens = query.split(/\s+/).filter(Boolean);

    resultsEl.innerHTML = results.map((r, i) => {
      const title = highlightText(r.title || r.url, tokens);
      const url = highlightText(truncateUrl(r.url), tokens);
      return `
        <div class="smruti-result${i === selectedIndex ? ' selected' : ''}" data-index="${i}" data-url="${escapeHtml(r.url)}">
          <div class="smruti-result-title">${title}</div>
          <div class="smruti-result-url">${url}</div>
        </div>
      `;
    }).join('');

    // Click handlers
    resultsEl.querySelectorAll('.smruti-result').forEach((el) => {
      el.addEventListener('click', (e: Event) => {
        const mouseEvent = e as MouseEvent;
        const idx = parseInt((el as HTMLElement).dataset.index || '0', 10);
        openResult(idx, mouseEvent.ctrlKey || mouseEvent.metaKey);
      });
    });
  }

  function highlightText(text: string, tokens: string[]): string {
    if (!text || tokens.length === 0) return escapeHtml(text);
    let result = escapeHtml(text);
    tokens.forEach((token) => {
      if (token.length < 2) return;
      const regex = new RegExp(`(${escapeRegex(token)})`, 'gi');
      result = result.replace(regex, '<span class="smruti-highlight">$1</span>');
    });
    return result;
  }

  function truncateUrl(url: string): string {
    try {
      const u = new URL(url);
      const path = u.pathname + u.search;
      const maxLen = 60;
      if (path.length > maxLen) {
        return u.host + path.slice(0, maxLen - 3) + '...';
      }
      return u.host + path;
    } catch {
      return url.slice(0, 80);
    }
  }

  function escapeHtml(s: string): string {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ===== KEYBOARD NAVIGATION =====
  function handleKeydown(e: KeyboardEvent): void {
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        hideOverlay();
        break;

      case 'ArrowDown':
        e.preventDefault();
        if (currentResults.length > 0) {
          selectedIndex = (selectedIndex + 1) % currentResults.length;
          updateSelection();
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (currentResults.length > 0) {
          selectedIndex = (selectedIndex - 1 + currentResults.length) % currentResults.length;
          updateSelection();
        }
        break;

      case 'Enter':
        e.preventDefault();
        if (currentResults.length > 0) {
          openResult(selectedIndex, e.ctrlKey || e.metaKey);
        }
        break;
    }
  }

  function updateSelection(): void {
    if (!resultsEl) return;
    resultsEl.querySelectorAll('.smruti-result').forEach((el, i) => {
      el.classList.toggle('selected', i === selectedIndex);
    });
    // Scroll into view
    const selected = resultsEl.querySelector('.smruti-result.selected');
    selected?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function openResult(index: number, newTab: boolean): void {
    const result = currentResults[index];
    if (!result?.url) return;

    hideOverlay();

    if (newTab) {
      window.open(result.url, '_blank');
    } else {
      window.location.href = result.url;
    }
  }

  // ===== GLOBAL KEYBOARD LISTENER =====
  function handleGlobalKeydown(e: KeyboardEvent): void {
    // Ctrl+Shift+S (or Cmd+Shift+S on Mac)
    const isShortcut = (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's';
    
    if (isShortcut) {
      e.preventDefault();
      e.stopPropagation();
      
      if (isOverlayVisible()) {
        hideOverlay();
      } else {
        showOverlay();
      }
    }
    
    // ESC to close if visible
    if (e.key === 'Escape' && isOverlayVisible()) {
      e.preventDefault();
      hideOverlay();
    }
  }

  // ===== MESSAGE LISTENER (for popup fallback) =====
  function handleMessage(message: any): void {
    if (message?.type === 'OPEN_INLINE_SEARCH') {
      showOverlay();
    }
  }

  // ===== INITIALIZATION =====
  function init(): void {
    // Global keyboard listener (capture phase for priority)
    document.addEventListener('keydown', handleGlobalKeydown, true);
    
    // Message listener from service worker
    if (chrome?.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(handleMessage);
    }
    
    // Pre-create overlay for faster first show
    setTimeout(createOverlay, 100);
  }

  // Run immediately
  init();
}

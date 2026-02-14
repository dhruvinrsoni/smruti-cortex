// popup.ts — ultra-fast UI logic for SmrutiCortex popup
// Compiled to dist/popup/popup.js
// PERFORMANCE: This file is optimized for instant popup display
// ARCHITECTURE: Uses shared search-ui-base.ts for DRY compliance

import { BRAND_NAME } from '../core/constants';
import { Logger, LogLevel, ComponentLogger } from '../core/logger';
import { SettingsManager, DisplayMode } from '../core/settings';
import { SearchDebugEntry } from '../background/diagnostics';
import { IndexedItem } from '../background/schema';
import {
  type SearchResult,
  type FocusableGroup,
  createMarkdownLink,
  copyHtmlLinkToClipboard,
  handleCyclicTabNavigation,
  openUrl,
  parseKeyboardAction,
  KeyboardAction,
  sortResults
} from '../shared/search-ui-base';

// Lazy-loaded imports for non-critical features
let tokenize: ((query: string) => string[]) | null = null;
let clearIndexedDB: (() => Promise<void>) | null = null;

// Load tokenize lazily when needed
async function getTokenize(): Promise<(query: string) => string[]> {
  if (!tokenize) {
    const mod = await import('../background/search/tokenizer');
    tokenize = mod.tokenize;
  }
  return tokenize;
}

// Load clearIndexedDB lazily when needed (only for settings clear button)
async function getClearIndexedDB(): Promise<() => Promise<void>> {
  if (!clearIndexedDB) {
    const mod = await import('../background/database');
    clearIndexedDB = mod.clearIndexedDB;
  }
  return clearIndexedDB;
}

declare const browser: typeof chrome | undefined;

// Simple toast notification
function showToast(message: string, isError = false) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${isError ? '#ef4444' : '#10b981'};
    color: white;
    padding: 8px 16px;
    border-radius: 4px;
    z-index: 10000;
    font-size: 14px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    opacity: 0;
    transition: opacity 0.3s;
  `;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.style.opacity = '1');
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Fast initialization - prioritize speed over logging
let logger: ComponentLogger;
let settingsManager: typeof SettingsManager;

// === PERFORMANCE LOGGING: ENTRY POINT ===
// Log the moment popup script is loaded (first code run) and record timestamp
const __popupEntryTimestamp = Date.now();
try {
  // Also send to service worker for guaranteed logging
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({
      type: 'POPUP_PERF_LOG',
      stage: 'entry',
      timestamp: __popupEntryTimestamp
    });
  }
} catch (e) {
  // Ignore timing errors - not critical
}

// Global variables for event setup
let debounceSearch: (q: string) => void;
let handleKeydown: (e: KeyboardEvent) => void;
let results: SearchResult[];
let openSettingsPage: () => void;
let $: (id: string) => HTMLElement | null;

// Initialize essentials synchronously first - NO async operations blocking UI
function fastInit() {
  // Create logger synchronously (no async)
  logger = Logger.forComponent('PopupScript');

  // Start popup IMMEDIATELY - don't wait for anything
  initializePopup();

  // Initialize settings in background (non-blocking)
  // Settings will use defaults until loaded
  SettingsManager.init().catch(err => {
    console.warn('Settings init failed:', err);
  });
}

// Start immediately - this runs synchronously
fastInit();

function setupEventListeners() {
  const input = $('search-input') as HTMLInputElement;
  const resultsNode = $('results') as HTMLUListElement;
  const resultCountNode = $('result-count') as HTMLDivElement;
  const settingsButton = $('settings-button') as HTMLButtonElement;
  const sortBySelect = $('sort-by') as HTMLSelectElement;

  // Make results container focusable for keyboard navigation
  // Removed - individual result items should be focusable instead

  if (input) {
    input.addEventListener('input', (ev) => debounceSearch((ev.target as HTMLInputElement).value));
    input.addEventListener('keydown', handleKeydown);
  }
  
  // Note: Sort dropdown handler is initialized in initializePopup() where resultsLocal is in scope

  if (resultsNode) {
    // Removed - individual result items handle keyboard navigation
  }

  if (settingsButton) {
    settingsButton.addEventListener('keydown', handleKeydown);
    settingsButton.addEventListener('click', openSettingsPage);
  }
  
  // Auto-open settings if URL has #settings hash
  if (window.location.hash === '#settings') {
    setTimeout(() => {
      openSettingsPage();
    }, 100);
  }
}

function initializePopup() {
  // No logging to maximize speed

  // Fast DOM access without logging
  const $local = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

  // Assign global $
  $ = $local;

  // Get elements immediately
  const input = $local('search-input') as HTMLInputElement;
  const resultsNode = $local('results') as HTMLUListElement;
  const resultCountNode = $local('result-count') as HTMLDivElement;
  const settingsButton = $local('settings-button') as HTMLButtonElement;

  let resultsLocal: IndexedItem[] = [];
  let activeIndex = -1;
  let debounceTimer: number | undefined;
  let serviceWorkerReady = false;
  let currentQuery = '';

  // Assign global results
  results = resultsLocal;

  // Simple inline tokenizer for highlighting (avoids heavy import)
  function simpleTokenize(query: string): string[] {
    return query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
  }

  // Highlight matching parts in text
  function highlightMatches(text: string, query: string): string {
    if (!query.trim() || !SettingsManager.getSetting('highlightMatches')) {
      return text;
    }
    const tokens = simpleTokenize(query);
    let highlighted = text;
    for (const token of tokens) {
      if (token.length < 2) {continue;} // Skip very short tokens
      const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escapedToken})`, 'gi');
      highlighted = highlighted.replace(regex, '<mark>$1</mark>');
    }
    return highlighted;
  }

  /**
   * Focus input with configurable select behavior
   * If selectAllOnFocus setting is true (default), select all text for fresh typing
   * If false, just place cursor at end
   */
  function focusInputWithSelectBehavior() {
    if (!input) {return;}
    input.focus();
    const selectAll = SettingsManager.getSetting('selectAllOnFocus') ?? true;
    if (selectAll) {
      input.select();
    } else {
      // Move cursor to end
      const len = input.value.length;
      input.setSelectionRange(len, len);
    }
  }


  // Immediate focus for keyboard shortcut
  if (input) {
    input.focus();
    input.select();
    // === PERFORMANCE LOGGING: INPUT FOCUSED ===
    try {
      const focusTimestamp = Date.now();
      const elapsedMs = focusTimestamp - (typeof __popupEntryTimestamp === 'number' ? __popupEntryTimestamp : focusTimestamp);
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'POPUP_PERF_LOG',
          stage: 'input-focus',
          timestamp: focusTimestamp,
          elapsedMs
        });
      }
    } catch (e) {
      // Ignore timing errors - not critical
    }
    
    // AGGRESSIVE FOCUS: Multiple attempts to steal focus from omnibox/address bar
    // This ensures focus stays in our input even when popup is opened via keyboard shortcut from address bar
    setTimeout(() => {
      if (input) {
        input.focus();
        input.select();
      }
    }, 50);
    setTimeout(() => {
      if (input) {
        input.focus();
        input.select();
      }
    }, 150);
  }

  // Pre-render empty state immediately
  renderResults();
  
  // Sort dropdown event handler (must be after resultsLocal is declared)
  const sortBySelect = $local('sort-by') as HTMLSelectElement;
  if (sortBySelect) {
    // Load saved sort setting
    const savedSort = SettingsManager.getSetting('sortBy') || 'best-match';
    sortBySelect.value = savedSort;
    
    // Handle sort change
    sortBySelect.addEventListener('change', async () => {
      const newSort = sortBySelect.value;
      await SettingsManager.setSetting('sortBy', newSort);
      
      // Re-sort current results without re-searching
      if (resultsLocal.length > 0) {
        sortResults(resultsLocal, newSort);
        activeIndex = resultsLocal.length ? 0 : -1;
        renderResults();
      }
    });
  }

  // Fast message sending
  function sendMessage(msg: unknown): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
    return new Promise((resolve, reject) => {
      try {
        const runtime = (typeof chrome !== 'undefined' && chrome.runtime) ? chrome.runtime : (typeof browser !== 'undefined' ? browser.runtime : null);
        if (!runtime || !runtime.sendMessage) {
          resolve({ results: [] });
          return;
        }
        runtime.sendMessage(msg, (resp: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          // If we got a response, resolve it (even if lastError is set due to bfcache)
          // bfcache navigation causes port closure after response is sent
          if (resp) {
            resolve(resp);
            return;
          }
          // Only reject on actual errors (no response + lastError)
          if (chrome && chrome.runtime && chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message || 'Runtime error'));
            return;
          }
          resolve(resp);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  // Fast service worker check
  async function checkServiceWorkerStatus(): Promise<boolean> {
    if (serviceWorkerReady) {return true;}
    try {
      const resp = await sendMessage({ type: 'PING' });
      serviceWorkerReady = resp && resp.status === 'ok';
      return serviceWorkerReady;
    } catch (error) {
      return false;
    }
  }

  // Smart debounce - wait for user to stop typing before searching
  function debounceSearchLocal(q: string) {
    if (debounceTimer) {clearTimeout(debounceTimer);}
    const delay = SettingsManager.getSetting('focusDelayMs');
    // Clamp to [0, 2000] ms
    const safeDelay = typeof delay === 'number' ? Math.max(0, Math.min(delay, 2000)) : 300;
    debounceTimer = window.setTimeout(() => doSearch(q), safeDelay);
  }

  // Assign global
  debounceSearch = debounceSearchLocal;

  // Fast search
  async function doSearch(q: string) {
    currentQuery = q;
    if (!q || q.trim() === '') {
      resultsLocal = [];
      activeIndex = -1;
      renderResults();
      return;
    }

    const isServiceWorkerReady = await checkServiceWorkerStatus();
    if (!isServiceWorkerReady) {
      resultsLocal = [];
      activeIndex = -1;
      renderResults();
      resultCountNode.textContent = 'Initializing...';
      resultsNode.innerHTML = '<div style="padding:8px;color:#f59e0b;">Extension starting up...</div>';
      return;
    }

    try {
      const resp = await sendMessage({ type: 'SEARCH_QUERY', query: q });
      resultsLocal = (resp && resp.results) ? resp.results : [];
      
      // Apply current sort setting
      const sortBy = SettingsManager.getSetting('sortBy') || 'best-match';
      sortResults(resultsLocal, sortBy);
      
      activeIndex = resultsLocal.length ? 0 : -1;
      renderResults();
      // Focus the first result item if focusDelayMs > 0
      const focusDelay = SettingsManager.getSetting('focusDelayMs');
      if (typeof focusDelay === 'number' && focusDelay > 0 && resultsLocal.length > 0) {
        const displayMode = SettingsManager.getSetting('displayMode') || DisplayMode.LIST;
        const selector = displayMode === DisplayMode.CARDS ? '.result-card' : 'li';
        const firstResult = resultsNode.querySelector(selector) as HTMLElement;
        if (firstResult) {
          activeIndex = 0;
          highlightActive();
          setTimeout(() => firstResult.focus(), 0);
        }
      }
    } catch (error) {
      resultsLocal = [];
      activeIndex = -1;
      renderResults();
    }
  }

  // Fast rendering
  function renderResults() {
    const displayMode = SettingsManager.getSetting('displayMode') || DisplayMode.LIST;
    const loadFavicons = SettingsManager.getSetting('loadFavicons') ?? true; // Default: true
    resultsNode.className = displayMode === DisplayMode.CARDS ? 'results cards' : 'results list';

    resultsNode.innerHTML = '';
    resultCountNode.textContent = `${resultsLocal.length} result${resultsLocal.length === 1 ? '' : 's'}`;

    if (resultsLocal.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No matches — try different keywords';
      empty.style.padding = '8px';
      empty.style.color = 'var(--muted)';
      resultsNode.appendChild(empty);
      return;
    }

    // Fast rendering without logging
    if (displayMode === DisplayMode.CARDS) {
      resultsLocal.forEach((item, idx) => {
        const card = document.createElement('div');
        card.className = 'result-card';
        card.tabIndex = 0;
        card.dataset.index = String(idx);
        if (idx === activeIndex) {card.classList.add('active');}

        const fav = document.createElement('img');
        fav.className = 'card-favicon';
        try {
          if (loadFavicons) {
            fav.src = `https://www.google.com/s2/favicons?domain=${new URL(item.url).hostname}&sz=64`;
          } else {
            fav.src = chrome.runtime.getURL('../assets/icon-favicon-fallback.svg');
          }
        } catch {
          fav.src = chrome.runtime.getURL('../assets/icon-favicon-fallback.svg');
        }

        const details = document.createElement('div');
        details.className = 'card-details';

        const title = document.createElement('div');
        title.className = 'card-title';
        // Add bookmark indicator if item is bookmarked
        const bookmarkIndicator = item.isBookmark ? '<span class="bookmark-indicator" title="Bookmarked">★</span> ' : '';
        title.innerHTML = bookmarkIndicator + highlightMatches(item.title || item.url, currentQuery);

        details.appendChild(title);

        // Add bookmark folder path if available
        if (item.bookmarkFolders && item.bookmarkFolders.length > 0) {
          const folderPath = document.createElement('div');
          folderPath.className = 'bookmark-folder';
          folderPath.innerHTML = '📁 ' + item.bookmarkFolders.join(' › ');
          details.appendChild(folderPath);
        }

        const url = document.createElement('div');
        url.className = 'card-url';
        url.innerHTML = highlightMatches(item.url, currentQuery);

        details.appendChild(url);
        card.appendChild(fav);
        card.appendChild(details);

        card.addEventListener('click', (e) => openResult(idx, e as MouseEvent));
        card.addEventListener('keydown', handleKeydownLocal);

        resultsNode.appendChild(card);
      });
    } else {
      resultsLocal.forEach((item, idx) => {
        const li = document.createElement('li');
        li.tabIndex = 0;
        li.dataset.index = String(idx);
        if (idx === activeIndex) {li.classList.add('active');}

        const fav = document.createElement('img');
        fav.className = 'favicon';
        try {
          if (loadFavicons) {
            fav.src = `https://www.google.com/s2/favicons?domain=${new URL(item.url).hostname}&sz=64`;
          } else {
            fav.src = chrome.runtime.getURL('../assets/icon-favicon-fallback.svg');
          }
        } catch {
          fav.src = chrome.runtime.getURL('../assets/icon-favicon-fallback.svg');
        }

        const details = document.createElement('div');
        details.className = 'result-details';

        const title = document.createElement('div');
        title.className = 'result-title';
        // Add bookmark indicator if item is bookmarked
        const bookmarkIndicator = item.isBookmark ? '<span class="bookmark-indicator" title="Bookmarked">★</span> ' : '';
        title.innerHTML = bookmarkIndicator + highlightMatches(item.title || item.url, currentQuery);

        details.appendChild(title);

        // Add bookmark folder path if available
        if (item.bookmarkFolders && item.bookmarkFolders.length > 0) {
          const folderPath = document.createElement('div');
          folderPath.className = 'bookmark-folder';
          folderPath.innerHTML = '📁 ' + item.bookmarkFolders.join(' › ');
          details.appendChild(folderPath);
        }

        const url = document.createElement('div');
        url.className = 'result-url';
        url.innerHTML = highlightMatches(item.url, currentQuery);

        details.appendChild(url);
        li.appendChild(fav);
        li.appendChild(details);

        li.addEventListener('click', (e) => openResult(idx, e as MouseEvent));
        li.addEventListener('keydown', handleKeydownLocal);

        resultsNode.appendChild(li);
      });
    }
  }

  // Fast result opening (using shared openUrl utility)
  function openResult(index: number, event?: MouseEvent | KeyboardEvent) {
    const item = resultsLocal[index];
    if (!item) {return;}

    const isCtrl = (event && (event as MouseEvent).ctrlKey) || (event instanceof KeyboardEvent && event.ctrlKey);
    const isShift = (event && (event as MouseEvent).shiftKey) || (event instanceof KeyboardEvent && event.shiftKey);

    // POPUP-SPECIFIC BEHAVIOR: Always open in new tab to avoid breaking current page
    // - Plain Enter: New tab (active)
    // - Ctrl+Enter: New tab (active) - explicit
    // - Shift+Enter: New tab (background)
    const openInBackground = isShift && !isCtrl;
    openUrl(item.url, true, openInBackground);
  }

  // Fast keyboard handling
  function handleKeydownLocal(e: KeyboardEvent) {
    const currentElement = document.activeElement;
    const input = $local('search-input') as HTMLInputElement;
    const resultsNode = $local('results') as HTMLUListElement;
    const settingsButton = $local('settings-button') as HTMLButtonElement;

    let currentIndex = -1;
    if (resultsNode.contains(currentElement)) {
      const displayMode = SettingsManager.getSetting('displayMode') || DisplayMode.LIST;
      const itemSelector = displayMode === DisplayMode.CARDS ? '.result-card' : 'li';
      const currentItem = (currentElement as HTMLElement).closest(itemSelector) as HTMLElement;
      if (currentItem) {
        currentIndex = parseInt(currentItem.dataset.index || '0');
      }
    }

    // Handle Tab navigation between main components (generic cyclic navigation)
    if (e.key === 'Tab') {
      e.preventDefault();
      
      const displayMode = SettingsManager.getSetting('displayMode') || DisplayMode.LIST;
      const selector = displayMode === DisplayMode.CARDS ? '.result-card' : 'li';
      
      // Define focusable groups in tab order (extensible - add more here as needed)
      const focusGroups: FocusableGroup[] = [
        {
          name: 'input',
          element: input,
          onFocus: () => focusInputWithSelectBehavior()
        },
        {
          name: 'results',
          element: null, // Custom handling
          onFocus: () => {
            if (resultsLocal.length > 0) {
              const firstResult = resultsNode.querySelector(selector) as HTMLElement;
              if (firstResult) {
                activeIndex = 0;
                highlightActive();
                firstResult.focus();
              }
            }
          },
          shouldSkip: () => resultsLocal.length === 0 // Skip if no results
        },
        {
          name: 'settings',
          element: settingsButton
        }
      ];

      // Determine current focused group index
      const getCurrentGroupIndex = (): number => {
        if (currentElement === input) {return 0;}
        if (resultsNode.contains(currentElement)) {return 1;}
        if (currentElement === settingsButton) {return 2;}
        return -1;
      };

      // Use shared cyclic navigation
      handleCyclicTabNavigation(focusGroups, getCurrentGroupIndex, e.shiftKey);
      return;
    }

    // Handle search input specific keys
    if (currentElement === input) {
      if (e.key === 'ArrowDown' && resultsLocal.length > 0) {
        e.preventDefault();
        // Move focus to first result item if not already focused
        const displayMode = SettingsManager.getSetting('displayMode') || DisplayMode.LIST;
        const selector = displayMode === DisplayMode.CARDS ? '.result-card' : 'li';
        const firstResult = resultsNode.querySelector(selector) as HTMLElement;
        if (firstResult) {
          if (activeIndex !== 0) {
            activeIndex = 0;
            highlightActive();
            firstResult.focus();
          } else {
            // If already at first, move to second
            const results = resultsNode.querySelectorAll(selector);
            if (results.length > 1) {
              activeIndex = 1;
              highlightActive();
              (results[1] as HTMLElement).focus();
            }
          }
        }
        return;
      }
      if (e.key === 'Escape') {
        // Don't prevent default - let Escape bubble up to close the popup
        input.value = '';
        currentQuery = '';
        resultsLocal = [];
        activeIndex = -1;
        renderResults();
        // Don't focus input - let popup close naturally
        return;
      }
      // Don't intercept any other keys in input - allow normal text editing (Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+Z, Ctrl+Backspace, etc.)
      return;
    }

    // Handle settings button keys
    if (currentElement === settingsButton) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openSettingsPage();
        return;
      }
      return;
    }

    // Handle result item navigation
    if (resultsNode.contains(currentElement)) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (resultsLocal.length === 0) {return;}
        const newIndex = Math.min(resultsLocal.length - 1, currentIndex + 1);
        activeIndex = newIndex;
        highlightActive();
        // Focus the new active result item
        const displayMode = SettingsManager.getSetting('displayMode') || DisplayMode.LIST;
        const selector = displayMode === DisplayMode.CARDS ? '.result-card' : 'li';
        const results = resultsNode.querySelectorAll(selector);
        const activeResult = results[newIndex] as HTMLElement;
        if (activeResult) {
          activeResult.focus();
        }
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (resultsLocal.length === 0) {return;}
        const newIndex = Math.max(0, currentIndex - 1);
        activeIndex = newIndex;
        highlightActive();
        // Focus the new active result item
        const displayMode = SettingsManager.getSetting('displayMode') || DisplayMode.LIST;
        const selector = displayMode === DisplayMode.CARDS ? '.result-card' : 'li';
        const results = resultsNode.querySelectorAll(selector);
        const activeResult = results[newIndex] as HTMLElement;
        if (activeResult) {
          activeResult.focus();
        }
        return;
      }

      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        if (resultsLocal.length === 0) {return;}
        openResult(currentIndex, e);
        return;
      }

      if (e.key === 'Escape') {
        // Don't prevent default - let Escape bubble up to close the popup
        input.value = '';
        currentQuery = '';
        resultsLocal = [];
        activeIndex = -1;
        renderResults();
        // Don't focus input - let popup close naturally
        return;
      }
    }

    // Copy shortcuts - ONLY when a result is focused (not input)
    if (e.key.toLowerCase() === 'm' && e.ctrlKey && resultsNode.contains(currentElement)) {
      e.preventDefault();
      if (resultsLocal.length === 0 || currentIndex === -1) {return;}
      const item = resultsLocal[currentIndex];
      if (item) {
        // Use shared createMarkdownLink utility
        const markdown = createMarkdownLink(item as SearchResult);
        navigator.clipboard.writeText(markdown).then(() => {
          const prev = resultCountNode.textContent;
          resultCountNode.textContent = 'Copied!';
          setTimeout(() => resultCountNode.textContent = prev, 900);
        });
      }
      return;
    }

    if (e.key.toLowerCase() === 'c' && e.ctrlKey && resultsNode.contains(currentElement)) {
      e.preventDefault();
      if (resultsLocal.length === 0 || currentIndex === -1) {return;}
      const item = resultsLocal[currentIndex];
      if (item) {
        // Copy as rich HTML link (like MS Teams/Edge)
        copyHtmlLinkToClipboard(item as SearchResult).then(() => {
          const prev = resultCountNode.textContent;
          resultCountNode.textContent = 'Copied HTML!';
          setTimeout(() => resultCountNode.textContent = prev, 900);
        }).catch(() => {
          // Fallback message if rich text failed but plain text succeeded
          const prev = resultCountNode.textContent;
          resultCountNode.textContent = 'Copied (text only)';
          setTimeout(() => resultCountNode.textContent = prev, 900);
        });
      }
      return;
    }
  }

  // Assign global
  handleKeydown = handleKeydownLocal;

  // Fast highlighting and focusing
  function highlightActive() {
    const displayMode = SettingsManager.getSetting('displayMode') || DisplayMode.LIST;
    const selector = displayMode === DisplayMode.CARDS ? '.result-card' : 'li';
    const items = Array.from(resultsNode.querySelectorAll(selector));
    items.forEach((item) => item.classList.remove('active'));
    const active = items[activeIndex];
    if (active) {
      active.classList.add('active');
      // Don't focus individual items - keep focus on results container
      // Just scroll the active item into view if needed
      active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  // Show settings modal overlay (doesn't replace app content)
  function openSettingsPageLocal() {
    const modal = document.getElementById('settings-modal');
    if (!modal) {return;}

    // Show the modal
    modal.classList.remove('hidden');
    
    // Clear hash to prevent re-opening on refresh
    if (window.location.hash === '#settings') {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    
    // Fetch storage quota info and health status
    fetchStorageQuotaInfo();
    
    // Set up inspect link
    setupInspectLink();

    // Load current settings into form
    const currentDisplayMode = SettingsManager.getSetting('displayMode') || DisplayMode.LIST;
    const currentLogLevel = SettingsManager.getSetting('logLevel') || 2;
    const currentHighlight = SettingsManager.getSetting('highlightMatches') ?? true;
    const currentFocusDelay = SettingsManager.getSetting('focusDelayMs') ?? 300;

    const displayInputs = modal.querySelectorAll('input[name="modal-displayMode"]');
    const logInputs = modal.querySelectorAll('input[name="modal-logLevel"]');

    displayInputs.forEach(input => {
      (input as HTMLInputElement).checked = (input as HTMLInputElement).value === currentDisplayMode;
    });

    logInputs.forEach(input => {
      (input as HTMLInputElement).checked = parseInt((input as HTMLInputElement).value) === currentLogLevel;
    });

    const highlightInput = modal.querySelector('#modal-highlightMatches') as HTMLInputElement;
    if (highlightInput) {
      highlightInput.checked = currentHighlight;
    }

    const focusDelayInput = modal.querySelector('#modal-focusDelayMs') as HTMLInputElement;
    if (focusDelayInput) {
      focusDelayInput.value = String(currentFocusDelay);
    }

    const selectAllOnFocusInput = modal.querySelector('#modal-selectAllOnFocus') as HTMLInputElement;
    if (selectAllOnFocusInput) {
      selectAllOnFocusInput.checked = SettingsManager.getSetting('selectAllOnFocus') ?? true;
    }

    // Ollama settings
    const ollamaEnabledInput = modal.querySelector('#modal-ollamaEnabled') as HTMLInputElement;
    if (ollamaEnabledInput) {
      ollamaEnabledInput.checked = SettingsManager.getSetting('ollamaEnabled') || false;
    }

    const ollamaEndpointInput = modal.querySelector('#modal-ollamaEndpoint') as HTMLInputElement;
    if (ollamaEndpointInput) {
      ollamaEndpointInput.value = SettingsManager.getSetting('ollamaEndpoint') || 'http://localhost:11434';
    }

    // Model is now a text input, not select
    const ollamaModelInput = modal.querySelector('#modal-ollamaModel') as HTMLInputElement;
    if (ollamaModelInput) {
      ollamaModelInput.value = SettingsManager.getSetting('ollamaModel') || 'llama3.2:1b';
    }

    const ollamaTimeoutInput = modal.querySelector('#modal-ollamaTimeout') as HTMLInputElement;
    if (ollamaTimeoutInput) {
      ollamaTimeoutInput.value = String(SettingsManager.getSetting('ollamaTimeout') || 30000);
    }

    // Semantic search settings
    const embeddingsEnabledInput = modal.querySelector('#modal-embeddingsEnabled') as HTMLInputElement;
    if (embeddingsEnabledInput) {
      embeddingsEnabledInput.checked = SettingsManager.getSetting('embeddingsEnabled') || false;
    }

    const embeddingModelInput = modal.querySelector('#modal-embeddingModel') as HTMLInputElement;
    if (embeddingModelInput) {
      embeddingModelInput.value = SettingsManager.getSetting('embeddingModel') || 'nomic-embed-text';
    }

    // Privacy settings
    const loadFaviconsInput = modal.querySelector('#modal-loadFavicons') as HTMLInputElement;
    if (loadFaviconsInput) {
      loadFaviconsInput.checked = SettingsManager.getSetting('loadFavicons') ?? true;
    }

    // Bookmarks indexing setting
    const indexBookmarksInput = modal.querySelector('#modal-indexBookmarks') as HTMLInputElement;
    if (indexBookmarksInput) {
      indexBookmarksInput.checked = SettingsManager.getSetting('indexBookmarks') ?? true;
    }

    // Search result diversity setting
    const showDuplicateUrlsInput = modal.querySelector('#modal-showDuplicateUrls') as HTMLInputElement;
    if (showDuplicateUrlsInput) {
      showDuplicateUrlsInput.checked = SettingsManager.getSetting('showDuplicateUrls') ?? false;
    }

    // Strict matching setting
    const showNonMatchingResultsInput = modal.querySelector('#modal-showNonMatchingResults') as HTMLInputElement;
    if (showNonMatchingResultsInput) {
      showNonMatchingResultsInput.checked = SettingsManager.getSetting('showNonMatchingResults') ?? false;
    }

    const sensitiveUrlBlacklistInput = modal.querySelector('#modal-sensitiveUrlBlacklist') as HTMLTextAreaElement;
    if (sensitiveUrlBlacklistInput) {
      const blacklist = SettingsManager.getSetting('sensitiveUrlBlacklist') || [];
      sensitiveUrlBlacklistInput.value = blacklist.join('\n');
    }

    // Initialize bookmark button in settings modal
    initializeBookmarkButton();
  }

  // Initialize bookmark button in settings modal
  function initializeBookmarkButton() {
    const bookmarkBtn = document.getElementById('bookmarkBtn') as HTMLButtonElement;
    if (bookmarkBtn) {
      const extensionURL = chrome.runtime.getURL('popup/popup.html');

      // Click to copy URL
      bookmarkBtn.addEventListener('click', (e) => {
        e.preventDefault();
        navigator.clipboard.writeText(extensionURL).then(() => {
          showToast('📋 Extension URL copied! Now add as bookmark.');
        }).catch(() => {
          showToast('❌ Failed to copy URL', true);
        });
      });

      // Drag-and-drop to bookmarks bar
      bookmarkBtn.addEventListener('dragstart', (e) => {
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'link';
          e.dataTransfer.setData('text/uri-list', extensionURL);
          e.dataTransfer.setData('text/plain', extensionURL);
          // Set bookmark data with title for browser
          e.dataTransfer.setData('text/x-moz-url', `${extensionURL}\nSmrutiCortex - Browser History Search`);
          // For Chrome bookmark creation
          e.dataTransfer.setData('text/html', `<a href="${extensionURL}">SmrutiCortex Search</a>`);
        }
      });

      // Visual feedback on drag
      bookmarkBtn.addEventListener('dragend', () => {
        showToast('✅ Drag complete! Check your bookmarks.');
      });
    }
  }

  // Close settings modal
  function closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) {
      modal.classList.add('hidden');
      // Re-focus search input
      const input = $('search-input') as HTMLInputElement;
      if (input) {
        input.focus();
      }
    }
  }

  // Load favicon cache statistics
  async function loadFaviconCacheStats() {
    const countEl = document.getElementById('favicon-cache-count');
    const sizeEl = document.getElementById('favicon-cache-size');
    
    if (!countEl || !sizeEl) {return;}
    
    try {
      const response = await new Promise<any>((resolve) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        chrome.runtime.sendMessage({ type: 'GET_FAVICON_CACHE_STATS' }, resolve);
      });
      
      if (response?.status === 'OK') {
        countEl.textContent = `${response.count} icons`;
        sizeEl.textContent = `${Math.round(response.totalSize / 1024)} KB`;
      } else {
        countEl.textContent = '-- icons';
        sizeEl.textContent = '-- KB';
      }
    } catch (err) {
      countEl.textContent = '-- icons';
      sizeEl.textContent = '-- KB';
    }
  }
  // Fetch and display storage quota info
  async function fetchStorageQuotaInfo() {
    const storageUsedEl = document.getElementById('storage-used');
    const storageItemsEl = document.getElementById('storage-items');
    const storageBarEl = document.getElementById('storage-bar');
    const healthIndicatorEl = document.getElementById('health-indicator');
    const healthTextEl = document.getElementById('health-text');
    
    if (!storageUsedEl || !storageItemsEl || !storageBarEl) {return;}
    
    try {
      storageUsedEl.textContent = 'Loading...';
      
      // Fetch storage quota
      const resp = await sendMessage({ type: 'GET_STORAGE_QUOTA' });
      if (resp && resp.status === 'OK' && resp.data) {
        const { usedFormatted, totalFormatted, percentage, itemCount } = resp.data;
        
        storageUsedEl.textContent = `${usedFormatted} / ${totalFormatted}`;
        storageItemsEl.textContent = `${itemCount.toLocaleString()} items`;
        storageBarEl.style.width = `${Math.min(percentage, 100)}%`;
        
        // Add warning colors based on usage
        storageBarEl.classList.remove('warning', 'danger');
        if (percentage >= 90) {
          storageBarEl.classList.add('danger');
        } else if (percentage >= 70) {
          storageBarEl.classList.add('warning');
        }
        
        logger.debug('openSettingsPage', 'Storage quota updated', resp.data);
      } else {
        storageUsedEl.textContent = 'Unknown';
        storageItemsEl.textContent = '-- items';
      }
      
      // Fetch health status
      if (healthIndicatorEl && healthTextEl) {
        const healthResp = await sendMessage({ type: 'GET_HEALTH_STATUS' });
        if (healthResp && healthResp.status === 'OK' && healthResp.data) {
          const { isHealthy, indexedItems, issues } = healthResp.data;
          
          healthIndicatorEl.classList.remove('healthy', 'warning', 'error');
          if (isHealthy) {
            healthIndicatorEl.classList.add('healthy');
            healthTextEl.textContent = `Healthy • ${indexedItems} items indexed`;
          } else if (indexedItems === 0) {
            healthIndicatorEl.classList.add('error');
            healthTextEl.textContent = 'Index empty - Click Rebuild to fix';
          } else {
            healthIndicatorEl.classList.add('warning');
            healthTextEl.textContent = `Issues: ${issues.join(', ')}`;
          }
        } else {
          healthTextEl.textContent = 'Unable to check health';
        }
      }
    } catch (error) {
      storageUsedEl.textContent = 'Error';
      storageItemsEl.textContent = '-- items';
      if (healthTextEl) {healthTextEl.textContent = 'Check failed';}
      logger.debug('openSettingsPage', 'Failed to fetch storage quota', error);
    }
  }
  
  // Set up inspect link handler
  function setupInspectLink() {
    const inspectLink = document.getElementById('storage-inspect-link');
    if (inspectLink) {
      inspectLink.addEventListener('click', (e) => {
        e.preventDefault();
        // IndexedDB is browser-internal, copy the debug URL for developers
        const debugUrl = 'chrome://indexeddb-internals';
        navigator.clipboard.writeText(debugUrl).then(() => {
          showToast(`📋 Copied: ${debugUrl}\nPaste in address bar to inspect storage.`);
        }).catch(() => {
          showToast('Open chrome://indexeddb-internals in a new tab to inspect storage');
        });
      });
    }
  }

  // Set up settings modal event listeners (called once)
  function setupSettingsModalListeners() {
    const modal = document.getElementById('settings-modal');
    if (!modal) {return;}

    // Close button
    const closeBtn = modal.querySelector('#settings-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeSettingsModal);
    }

    // Click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeSettingsModal();
      }
    });

    // Escape key to close
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeSettingsModal();
      }
    });

    // Display mode changes
    const displayInputs = modal.querySelectorAll('input[name="modal-displayMode"]');
    displayInputs.forEach(input => {
      input.addEventListener('change', async (e) => {
        const target = e.target as HTMLInputElement;
        if (target.checked) {
          await SettingsManager.setSetting('displayMode', target.value as DisplayMode);
          renderResults(); // Re-render results with new display mode
          showToast('Display mode updated');
        }
      });
    });

    // Log level changes
    const logInputs = modal.querySelectorAll('input[name="modal-logLevel"]');
    logInputs.forEach(input => {
      input.addEventListener('change', async (e) => {
        const target = e.target as HTMLInputElement;
        if (target.checked) {
          const level = parseInt(target.value);
          await SettingsManager.setSetting('logLevel', level);
          await Logger.setLevel(level);
          showToast('Log level updated');
        }
      });
    });

    // Highlight matches toggle
    const highlightInput = modal.querySelector('#modal-highlightMatches') as HTMLInputElement;
    if (highlightInput) {
      highlightInput.addEventListener('change', async (e) => {
        const target = e.target as HTMLInputElement;
        await SettingsManager.setSetting('highlightMatches', target.checked);
        renderResults(); // Re-render results with/without highlighting
        showToast('Match highlighting ' + (target.checked ? 'enabled' : 'disabled'));
      });
    }

    // Focus delay changes
    const focusDelayInput = modal.querySelector('#modal-focusDelayMs') as HTMLInputElement;
    if (focusDelayInput) {
      focusDelayInput.addEventListener('change', async () => {
        let val = parseInt(focusDelayInput.value);
        if (isNaN(val) || val < 0) {val = 0;}
        if (val > 2000) {val = 2000;}
        await SettingsManager.setSetting('focusDelayMs', val);
        focusDelayInput.value = String(val);
        showToast(val === 0 ? 'Auto-focus disabled' : `Focus delay set to ${val} ms`);
      });
    }

    // Select all on focus toggle
    const selectAllOnFocusInput = modal.querySelector('#modal-selectAllOnFocus') as HTMLInputElement;
    if (selectAllOnFocusInput) {
      selectAllOnFocusInput.addEventListener('change', async (e) => {
        const target = e.target as HTMLInputElement;
        await SettingsManager.setSetting('selectAllOnFocus', target.checked);
        showToast(target.checked ? 'Tab will select all text' : 'Tab will place cursor at end');
      });
    }

    // Ollama enabled toggle
    const ollamaEnabledInput = modal.querySelector('#modal-ollamaEnabled') as HTMLInputElement;
    if (ollamaEnabledInput) {
      ollamaEnabledInput.addEventListener('change', async (e) => {
        const target = e.target as HTMLInputElement;
        await SettingsManager.setSetting('ollamaEnabled', target.checked);
        console.info(`[Settings] AI search ${target.checked ? 'ENABLED' : 'DISABLED'} by user`);
        showToast('AI search ' + (target.checked ? 'enabled' : 'disabled'));
      });
    }

    // Ollama endpoint changes
    const ollamaEndpointInput = modal.querySelector('#modal-ollamaEndpoint') as HTMLInputElement;
    if (ollamaEndpointInput) {
      ollamaEndpointInput.addEventListener('change', async () => {
        const val = ollamaEndpointInput.value.trim();
        if (val) {
          await SettingsManager.setSetting('ollamaEndpoint', val);
          showToast('Ollama endpoint updated');
        }
      });
    }

    // Ollama model changes (now text input)
    const ollamaModelInput = modal.querySelector('#modal-ollamaModel') as HTMLInputElement;
    if (ollamaModelInput) {
      ollamaModelInput.addEventListener('change', async () => {
        const val = ollamaModelInput.value.trim();
        if (val) {
          await SettingsManager.setSetting('ollamaModel', val);
          showToast(`Model set to: ${val}`);
        }
      });
    }
    
    // Refresh models button - fetch available models from Ollama
    const refreshModelsBtn = modal.querySelector('#refresh-models-btn') as HTMLButtonElement;
    if (refreshModelsBtn) {
      refreshModelsBtn.addEventListener('click', async () => {
        const endpoint = SettingsManager.getSetting('ollamaEndpoint') || 'http://localhost:11434';
        refreshModelsBtn.disabled = true;
        refreshModelsBtn.textContent = '⏳';
        
        try {
          const response = await fetch(`${endpoint}/api/tags`);
          if (!response.ok) {throw new Error(`HTTP ${response.status}`);}
          
          const data = await response.json();
          const models = data.models || [];
          
          // Update datalist with available models
          const datalist = document.getElementById('ollama-models');
          if (datalist && models.length > 0) {
            datalist.innerHTML = models.map((m: { name: string }) => 
              `<option value="${m.name}">${m.name}</option>`
            ).join('');
            showToast(`Found ${models.length} models`);
          } else {
            showToast('No models found');
          }
        } catch (error) {
          showToast('Failed to fetch models. Is Ollama running?');
          console.error('Fetch models error:', error);
        } finally {
          refreshModelsBtn.disabled = false;
          refreshModelsBtn.textContent = '🔄';
        }
      });
    }

    // Ollama timeout changes
    const ollamaTimeoutInput = modal.querySelector('#modal-ollamaTimeout') as HTMLInputElement;
    if (ollamaTimeoutInput) {
      ollamaTimeoutInput.addEventListener('change', async () => {
        let val = parseInt(ollamaTimeoutInput.value);
        
        // Handle special cases
        if (val === -1) {
          // Infinite timeout (no timeout)
          await SettingsManager.setSetting('ollamaTimeout', -1);
          ollamaTimeoutInput.value = '-1';
          showToast('Timeout disabled (infinite wait)');
          return;
        }
        
        // Validate range for non-infinite timeouts
        if (isNaN(val) || val < 5000) {val = 5000;}  // Minimum 5s
        if (val > 120000) {val = 120000;}  // Maximum 2min
        await SettingsManager.setSetting('ollamaTimeout', val);
        ollamaTimeoutInput.value = String(val);
        showToast(`Ollama timeout set to ${val} ms (${(val/1000).toFixed(1)}s)`);
      });
    }

    // Semantic search settings
    const embeddingsEnabledInput = modal.querySelector('#modal-embeddingsEnabled') as HTMLInputElement;
    if (embeddingsEnabledInput) {
      embeddingsEnabledInput.addEventListener('change', async (e) => {
        const target = e.target as HTMLInputElement;
        await SettingsManager.setSetting('embeddingsEnabled', target.checked);
        console.info(`[Settings] Semantic search ${target.checked ? 'ENABLED' : 'DISABLED'} by user`);
        showToast('Semantic search ' + (target.checked ? 'enabled' : 'disabled'));
        if (target.checked) {
          showToast('⚠️ Rebuild index to generate embeddings for existing pages', true);
        }
      });
    }

    const embeddingModelInput = modal.querySelector('#modal-embeddingModel') as HTMLInputElement;
    if (embeddingModelInput) {
      embeddingModelInput.addEventListener('change', async () => {
        const val = embeddingModelInput.value.trim();
        if (val) {
          await SettingsManager.setSetting('embeddingModel', val);
          showToast(`Embedding model set to: ${val}`);
        }
      });
    }

    // Privacy settings - Load Favicons
    const loadFaviconsInput = modal.querySelector('#modal-loadFavicons') as HTMLInputElement;
    if (loadFaviconsInput) {
      loadFaviconsInput.addEventListener('change', async (e) => {
        const target = e.target as HTMLInputElement;
        await SettingsManager.setSetting('loadFavicons', target.checked);
        showToast(`Favicons ${target.checked ? 'enabled' : 'disabled'}`);
        renderResults(); // Re-render to apply changes immediately
      });
    }

    // Favicon cache - load stats and handle clear button
    loadFaviconCacheStats();
    const clearFaviconCacheBtn = modal.querySelector('#clear-favicon-cache') as HTMLButtonElement;
    if (clearFaviconCacheBtn) {
      clearFaviconCacheBtn.addEventListener('click', async () => {
        clearFaviconCacheBtn.disabled = true;
        clearFaviconCacheBtn.textContent = 'Clearing...';
        try {
          const response = await new Promise<any>((resolve) => { // eslint-disable-line @typescript-eslint/no-explicit-any
            chrome.runtime.sendMessage({ type: 'CLEAR_FAVICON_CACHE' }, resolve);
          });
          if (response?.status === 'OK') {
            showToast(`Cleared ${response.cleared} favicons, freed ${Math.round(response.freedBytes / 1024)}KB`);
            loadFaviconCacheStats();
          } else {
            showToast('Failed to clear favicon cache');
          }
        } catch (err) {
          showToast('Error clearing favicon cache');
        }
        clearFaviconCacheBtn.disabled = false;
        clearFaviconCacheBtn.textContent = 'Clear Cache';
      });
    }

    // Bookmarks indexing
    const indexBookmarksInput = modal.querySelector('#modal-indexBookmarks') as HTMLInputElement;
    if (indexBookmarksInput) {
      indexBookmarksInput.addEventListener('change', async (e) => {
        const target = e.target as HTMLInputElement;
        await SettingsManager.setSetting('indexBookmarks', target.checked);
        if (target.checked) {
          showToast('Bookmarks indexing enabled. Rebuilding index...');
          // Trigger bookmark indexing via service worker
          chrome.runtime.sendMessage({ type: 'INDEX_BOOKMARKS' });
        } else {
          showToast('Bookmarks indexing disabled. Bookmark flags will be cleared on next rebuild.');
        }
      });
    }

    // Search result diversity - Show Duplicate URLs
    const showDuplicateUrlsInput = modal.querySelector('#modal-showDuplicateUrls') as HTMLInputElement;
    if (showDuplicateUrlsInput) {
      showDuplicateUrlsInput.addEventListener('change', async (e) => {
        const target = e.target as HTMLInputElement;
        await SettingsManager.setSetting('showDuplicateUrls', target.checked);
        showToast(`Duplicate URLs ${target.checked ? 'shown' : 'filtered for diversity'}`);
        // Trigger re-search to apply diversity filter
        const searchInput = $('search-input') as HTMLInputElement;
        if (searchInput && searchInput.value.trim()) {
          doSearch(searchInput.value);
        }
      });
    }

    // Strict matching - Show Non-Matching Results
    const showNonMatchingResultsInput = modal.querySelector('#modal-showNonMatchingResults') as HTMLInputElement;
    if (showNonMatchingResultsInput) {
      showNonMatchingResultsInput.addEventListener('change', async (e) => {
        const target = e.target as HTMLInputElement;
        await SettingsManager.setSetting('showNonMatchingResults', target.checked);
        showToast(`Non-matching results ${target.checked ? 'shown' : 'hidden (strict matching)'}`);
        // Trigger re-search to apply strict matching
        const searchInput = $('search-input') as HTMLInputElement;
        if (searchInput && searchInput.value.trim()) {
          doSearch(searchInput.value);
        }
      });
    }

    // Privacy settings - Sensitive URL Blacklist
    const sensitiveUrlBlacklistInput = modal.querySelector('#modal-sensitiveUrlBlacklist') as HTMLTextAreaElement;
    if (sensitiveUrlBlacklistInput) {
      sensitiveUrlBlacklistInput.addEventListener('change', async () => {
        const val = sensitiveUrlBlacklistInput.value.trim();
        const blacklist = val ? val.split('\n').map(s => s.trim()).filter(Boolean) : [];
        await SettingsManager.setSetting('sensitiveUrlBlacklist', blacklist);
        showToast(`Blacklist updated (${blacklist.length} entries)`);
      });
    }

    // Reset button
    const resetBtn = modal.querySelector('#modal-reset') as HTMLButtonElement;
    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        if (confirm('Reset all settings to defaults?')) {
          await SettingsManager.resetToDefaults();
          await Logger.setLevel(SettingsManager.getSetting('logLevel') || 2);
          closeSettingsModal();
          renderResults();
          showToast('Settings reset to defaults');
        }
      });
    }

    // Rebuild Index button
    const rebuildBtn = modal.querySelector('#modal-rebuild') as HTMLButtonElement;
    if (rebuildBtn) {
      rebuildBtn.addEventListener('click', async () => {
        if (!confirm('Rebuild the entire history index? This may take a few minutes for large history.')) {
          return;
        }
        
        rebuildBtn.disabled = true;
        rebuildBtn.textContent = '⏳ Rebuilding...';
        showToast('🔄 Rebuilding index... This may take a while.');
        
        try {
          const resp = await sendMessage({ type: 'REBUILD_INDEX' });
          if (resp && resp.status === 'OK') {
            showToast('✅ Index rebuilt successfully!');
            // Refresh storage quota display
            await fetchStorageQuotaInfo();
          } else {
            showToast('❌ Rebuild failed: ' + (resp?.message || 'Unknown error'), true);
          }
        } catch (error) {
          showToast('❌ Rebuild failed', true);
          console.error('Rebuild error:', error);
        } finally {
          rebuildBtn.disabled = false;
          rebuildBtn.textContent = '🔄 Rebuild Index';
        }
      });
    }

    // Manual Index Now button
    const manualIndexBtn = modal.querySelector('#manual-index-btn') as HTMLButtonElement;
    const manualIndexFeedback = modal.querySelector('#manual-index-feedback') as HTMLSpanElement;
    if (manualIndexBtn && manualIndexFeedback) {
      manualIndexBtn.addEventListener('click', async () => {
        manualIndexBtn.disabled = true;
        manualIndexBtn.textContent = '⏳ Indexing...';
        manualIndexFeedback.textContent = '';
        manualIndexFeedback.className = 'index-feedback';
        
        try {
          const resp = await sendMessage({ type: 'MANUAL_INDEX' });
          if (resp && resp.status === 'OK') {
            const { added, updated, total, duration } = resp;
            
            if (total === 0) {
              manualIndexFeedback.textContent = '✓ No new pages to index';
              manualIndexFeedback.className = 'index-feedback success';
            } else {
              const durationSec = (duration / 1000).toFixed(1);
              manualIndexFeedback.textContent = `✓ Indexed ${total} page${total > 1 ? 's' : ''} (${added} new, ${updated} updated) in ${durationSec}s`;
              manualIndexFeedback.className = 'index-feedback success';
              
              // Refresh storage quota display
              await fetchStorageQuotaInfo();
            }
          } else {
            manualIndexFeedback.textContent = '✗ Indexing failed: ' + (resp?.message || 'Unknown error');
            manualIndexFeedback.className = 'index-feedback error';
          }
        } catch (error) {
          manualIndexFeedback.textContent = '✗ Indexing failed';
          manualIndexFeedback.className = 'index-feedback error';
          console.error('Manual index error:', error);
        } finally {
          manualIndexBtn.disabled = false;
          manualIndexBtn.textContent = '⚡ Index Now';
          
          // Clear feedback after 5 seconds
          setTimeout(() => {
            manualIndexFeedback.textContent = '';
            manualIndexFeedback.className = 'index-feedback';
          }, 5000);
        }
      });
    }

    // Clear data button
    const clearBtn = modal.querySelector('#modal-clear') as HTMLButtonElement;
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        if (!confirm('Clear ALL data and rebuild index?\n\nThis will:\n• Delete your browsing history index\n• Immediately rebuild from browser history\n• Reset all settings to defaults\n\nThis operation takes a few seconds.')) {
          return;
        }
        
        clearBtn.disabled = true;
        clearBtn.textContent = '⏳ Clearing & Rebuilding...';
        showToast('🔄 Clearing data and rebuilding index...');
        
        try {
          const resp = await sendMessage({ type: 'CLEAR_ALL_DATA' });
          if (resp && resp.status === 'OK') {
            const itemCount = resp.itemCount || 0;
            showToast(`✅ Done! ${itemCount} items re-indexed.`);
            // Refresh storage quota display
            await fetchStorageQuotaInfo();
            // Clear local results
            resultsLocal = [];
            activeIndex = -1;
            renderResults();
          } else {
            showToast('❌ Operation failed: ' + (resp?.message || 'Unknown error'), true);
          }
        } catch (error) {
          showToast('❌ Failed to clear data', true);
          console.error('Clear data error:', error);
        } finally {
          clearBtn.disabled = false;
          clearBtn.textContent = '🗑️ Clear & Rebuild';
        }
      });
    }

    // Performance Monitor Modal with auto-polling
    const perfBtn = modal.querySelector('#show-performance-modal') as HTMLButtonElement;
    const perfModal = document.getElementById('performance-modal');
    const perfCloseBtn = perfModal?.querySelector('#performance-close');
    const perfRefreshBtn = perfModal?.querySelector('#perf-refresh');
    let perfPollingInterval: ReturnType<typeof setInterval> | null = null;

    // Stop polling and cleanup
    function stopPerfPolling() {
      if (perfPollingInterval) {
        clearInterval(perfPollingInterval);
        perfPollingInterval = null;
      }
    }

    // Start auto-polling (every 5 seconds)
    function startPerfPolling() {
      stopPerfPolling(); // Ensure no duplicate intervals
      perfPollingInterval = setInterval(async () => {
        // Safety check: stop if modal is hidden or removed
        if (!perfModal || perfModal.classList.contains('hidden')) {
          stopPerfPolling();
          return;
        }
        try {
          await loadPerformanceMetrics();
        } catch {
          // On error, stop polling to prevent dangling
          stopPerfPolling();
        }
      }, 5000);
    }

    // Close performance modal and stop polling
    function closePerfModal() {
      stopPerfPolling();
      if (perfModal) {
        perfModal.classList.add('hidden');
      }
    }

    if (perfBtn && perfModal) {
      perfBtn.addEventListener('click', async () => {
        perfModal.classList.remove('hidden');
        await loadPerformanceMetrics();
        startPerfPolling();
      });

      if (perfCloseBtn) {
        perfCloseBtn.addEventListener('click', closePerfModal);
      }

      perfModal.addEventListener('click', (e) => {
        if (e.target === perfModal) {
          closePerfModal();
        }
      });

      // Stop polling on Escape key
      perfModal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          closePerfModal();
        }
      });

      if (perfRefreshBtn) {
        perfRefreshBtn.addEventListener('click', loadPerformanceMetrics);
      }
    }

    // Stop polling when popup/window closes
    window.addEventListener('beforeunload', stopPerfPolling);
    window.addEventListener('unload', stopPerfPolling);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopPerfPolling();
      }
    });

    // Diagnostics Export
    const diagBtn = modal.querySelector('#export-diagnostics') as HTMLButtonElement;
    if (diagBtn) {
      diagBtn.addEventListener('click', async () => {
        diagBtn.disabled = true;
        diagBtn.textContent = '📋 Exporting...';
        try {
          const response = await sendMessage({ type: 'EXPORT_DIAGNOSTICS' });
          if (response?.status === 'OK' && response.data) {
            // Download as JSON file
            const blob = new Blob([response.data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `smruticortex-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('✅ Diagnostics exported!');
          } else {
            showToast('❌ Failed to export diagnostics');
          }
        } catch (err) {
          showToast('❌ Error exporting diagnostics');
          console.error('Diagnostics export error:', err);
        }
        diagBtn.disabled = false;
        diagBtn.textContent = '📋 Export Diagnostics';
      });
    }

    // Search Debug Handlers
    const searchDebugCheckbox = modal.querySelector('#modal-searchDebugEnabled') as HTMLInputElement;
    if (searchDebugCheckbox) {
      // Load current state
      sendMessage({ type: 'GET_SEARCH_DEBUG_ENABLED' }).then((response) => {
        if (response?.enabled !== undefined) {
          searchDebugCheckbox.checked = response.enabled;
        }
      });

      // Toggle debug mode
      searchDebugCheckbox.addEventListener('change', async () => {
        await sendMessage({
          type: 'SET_SEARCH_DEBUG_ENABLED',
          enabled: searchDebugCheckbox.checked,
        });
        showToast(searchDebugCheckbox.checked ? '✅ Debug mode enabled' : '🔇 Debug mode disabled');
      });
    }

    // View Analytics Modal
    const analyticsBtn = modal.querySelector('#view-search-analytics') as HTMLButtonElement;
    if (analyticsBtn) {
      analyticsBtn.addEventListener('click', () => {
        showSearchAnalyticsModal();
      });
    }

    // Export Debug Data
    const exportDebugBtn = modal.querySelector('#export-search-debug') as HTMLButtonElement;
    if (exportDebugBtn) {
      exportDebugBtn.addEventListener('click', async () => {
        exportDebugBtn.disabled = true;
        exportDebugBtn.textContent = '💾 Exporting...';
        try {
          const response = await sendMessage({ type: 'EXPORT_SEARCH_DEBUG' });
          if (response?.status === 'OK' && response.data) {
            const blob = new Blob([response.data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `smruticortex-search-debug-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('✅ Debug data exported!');
          } else {
            showToast('❌ No debug data available');
          }
        } catch (err) {
          showToast('❌ Error exporting debug data');
          console.error('Debug export error:', err);
        }
        exportDebugBtn.disabled = false;
        exportDebugBtn.textContent = '💾 Export Debug Data';
      });
    }

    // Clear Debug History
    const clearDebugBtn = modal.querySelector('#clear-search-debug') as HTMLButtonElement;
    if (clearDebugBtn) {
      clearDebugBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to clear all search debug history?')) {
          await sendMessage({ type: 'CLEAR_SEARCH_DEBUG' });
          showToast('🗑️ Debug history cleared');
        }
      });
    }
  }

  // Load performance metrics from service worker
  async function loadPerformanceMetrics() {
    try {
      const response = await sendMessage({ type: 'GET_PERFORMANCE_METRICS' });
      if (response?.status === 'OK' && response.formatted) {
        const f = response.formatted;
        updatePerfElement('perf-search-count', f['Search Count']);
        updatePerfElement('perf-avg-time', f['Avg Search Time']);
        updatePerfElement('perf-min-max', f['Min/Max Search']);
        updatePerfElement('perf-last-time', f['Last Search']);
        updatePerfElement('perf-items-indexed', f['Items Indexed']);
        updatePerfElement('perf-index-time', f['Last Index Time']);
        updatePerfElement('perf-memory', f['Memory Used']);
        updatePerfElement('perf-uptime', f['Uptime']);
        updatePerfElement('perf-restarts', f['SW Restarts']);
        updatePerfElement('perf-self-heals', f['Self-Heals']);
      }
    } catch (err) {
      console.error('Failed to load performance metrics:', err);
    }
  }

  function updatePerfElement(id: string, value: string) {
    const el = document.getElementById(id);
    if (el) {el.textContent = value;}
  }

  // Assign global
  openSettingsPage = openSettingsPageLocal;

  // Fast event setup
  setupEventListeners();

  // Set up settings modal listeners once
  setupSettingsModalListeners();

  // Fast window load - check service worker status and lazy load hints
  window.addEventListener('load', () => {
    // Check service worker status asynchronously (don't block)
    checkServiceWorkerStatus().then(ready => {
      serviceWorkerReady = ready;
      if (!ready) {
        resultCountNode.textContent = 'Initializing...';
        resultsNode.innerHTML = '<div style="padding:8px;color:#f59e0b;">Extension starting up...</div>';
      }
    });

    // Lazy load hints after initial render (non-critical)
    requestIdleCallback(() => {
      const hintsContainer = document.getElementById('hints-container');
      if (hintsContainer && !hintsContainer.innerHTML.trim()) {
        hintsContainer.innerHTML = `
          <span>Enter: open · Ctrl+Enter: new tab · Shift+Enter: background tab · Ctrl+C: copy HTML · Ctrl+M: copy markdown</span>
          <span>↓: navigate results · ↑↓←→: move · Esc: clear · Ctrl+Shift+S: quick open · Type "sc " in address bar</span>
        `;
      }
    });
  });

  // Ultra-fast keyboard shortcut handling
  function handleKeyboardShortcut() {
    // Immediate focus and select for instant keyboard shortcut response
    if (input) {
      input.focus();
      input.select();
    }
  }

  // Message listeners
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'KEYBOARD_SHORTCUT_OPEN') {
        handleKeyboardShortcut();
        sendResponse({ status: 'ok' });
      } else if (message.type === 'PING') {
        sendResponse({ status: 'ok' });
      } else if (message.type === 'SETTINGS_CHANGED') {
        renderResults();
        sendResponse({ status: 'ok' });
      }
    });
  } else if (typeof browser !== 'undefined' && browser.runtime) {
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'KEYBOARD_SHORTCUT_OPEN') {
        handleKeyboardShortcut();
        sendResponse({ status: 'ok' });
      } else if (message.type === 'PING') {
        sendResponse({ status: 'ok' });
      } else if (message.type === 'SETTINGS_CHANGED') {
        renderResults();
        sendResponse({ status: 'ok' });
      }
    });
  }

  // Show search analytics modal
  async function showSearchAnalyticsModal() {
    const modal = document.getElementById('search-analytics-modal');
    if (!modal) {return;}

    modal.classList.remove('hidden');

    // Load analytics data
    try {
      const response = await sendMessage({ type: 'GET_SEARCH_ANALYTICS' });
      if (response?.status === 'OK') {
        const { analytics, history } = response;

        // Update summary stats
        document.getElementById('analytics-total')!.textContent = analytics.totalSearches.toString();
        document.getElementById('analytics-avg-results')!.textContent = analytics.averageResultCount.toFixed(1);
        document.getElementById('analytics-avg-duration')!.textContent = `${analytics.averageSearchDuration.toFixed(2)} ms`;

        // Top queries
        const topQueriesDiv = document.getElementById('analytics-top-queries');
        if (topQueriesDiv && analytics.topQueries.length > 0) {
          topQueriesDiv.innerHTML = analytics.topQueries
            .map(({ query, count }) => `
              <div class="query-item">
                <span class="query-text">"${query}"</span>
                <span class="query-count">${count}x</span>
              </div>
            `)
            .join('');
        } else if (topQueriesDiv) {
          topQueriesDiv.innerHTML = '<p style="text-align:center;color:#666;">No queries yet</p>';
        }

        // Query length distribution
        const queryLengthDiv = document.getElementById('analytics-query-length');
        if (queryLengthDiv) {
          const lengths = Object.keys(analytics.queryLengthDistribution).map(Number).sort((a, b) => a - b);
          queryLengthDiv.innerHTML = lengths
            .map((len) => {
              const count = analytics.queryLengthDistribution[len];
              const percent = (count / analytics.totalSearches) * 100;
              return `
                <div class="length-bar">
                  <span class="length-label">${len} chars</span>
                  <div class="length-bar-bg">
                    <div class="length-bar-fill" style="width: ${percent}%"></div>
                  </div>
                  <span class="length-count">${count}</span>
                </div>
              `;
            })
            .join('');
        }

        // Recent searches
        const recentDiv = document.getElementById('analytics-recent-searches');
        if (recentDiv && history.length > 0) {
          recentDiv.innerHTML = history
            .reverse()
            .map((entry: SearchDebugEntry) => `
              <div class="search-entry">
                <div class="search-query">"${entry.query}"</div>
                <div class="search-meta">
                  ${entry.resultCount} results · ${entry.duration.toFixed(2)}ms · 
                  ${new Date(entry.timestamp).toLocaleTimeString()}
                </div>
              </div>
            `)
            .join('');
        } else if (recentDiv) {
          recentDiv.innerHTML = '<p style="text-align:center;color:#666;">No recent searches</p>';
        }
      }
    } catch (err) {
      console.error('Failed to load analytics:', err);
    }

    // Close button
    const closeBtn = modal.querySelector('#analytics-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
      });
    }
  }
}
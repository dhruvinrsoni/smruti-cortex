// popup.ts — ultra-fast UI logic for SmrutiCortex popup
// Compiled to dist/popup/popup.js
// PERFORMANCE: This file is optimized for instant popup display
// ARCHITECTURE: Uses shared search-ui-base.ts for DRY compliance

import { BRAND_NAME } from '../core/constants';
import { Logger, LogLevel, ComponentLogger } from '../core/logger';
import { SettingsManager, DisplayMode } from '../core/settings';
import {
  type SearchResult,
  createMarkdownLink,
  openUrl,
  parseKeyboardAction,
  KeyboardAction
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

declare const browser: any;

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
let results: any[];
let openSettingsPage: () => void;
let $: (id: string) => any;

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

  // Make results container focusable for keyboard navigation
  // Removed - individual result items should be focusable instead

  if (input) {
    input.addEventListener('input', (ev) => debounceSearch((ev.target as HTMLInputElement).value));
    input.addEventListener('keydown', handleKeydown);
  }

  if (resultsNode) {
    // Removed - individual result items handle keyboard navigation
  }

  if (settingsButton) {
    settingsButton.addEventListener('keydown', handleKeydown);
    settingsButton.addEventListener('click', openSettingsPage);
  }
  
  // Bookmark button: copy URL and make draggable
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
  
  // Auto-open settings if URL has #settings hash
  if (window.location.hash === '#settings') {
    setTimeout(() => {
      openSettingsPage();
    }, 100);
  }
}

function initializePopup() {
  // No logging to maximize speed

  type IndexedItem = {
    url: string;
    title: string;
    hostname: string;
    metaDescription?: string;
    metaKeywords?: string[];
    visitCount: number;
    lastVisit: number;
    tokens?: string[];
  };

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
  }

  // Pre-render empty state immediately
  renderResults();

  // Fast message sending
  function sendMessage(msg: any): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        const runtime = (typeof chrome !== 'undefined' && chrome.runtime) ? chrome.runtime : (typeof browser !== 'undefined' ? browser.runtime : null);
        if (!runtime || !runtime.sendMessage) {
          resolve({ results: [] });
          return;
        }
        runtime.sendMessage(msg, (resp: any) => {
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
          fav.src = `https://www.google.com/s2/favicons?domain=${new URL(item.url).hostname}&sz=64`;
        } catch {
          fav.src = chrome.runtime.getURL('../assets/icon-favicon-fallback.svg');
        }

        const details = document.createElement('div');
        details.className = 'card-details';

        const title = document.createElement('div');
        title.className = 'card-title';
        title.innerHTML = highlightMatches(item.title || item.url, currentQuery);

        const url = document.createElement('div');
        url.className = 'card-url';
        url.innerHTML = highlightMatches(item.url, currentQuery);

        details.appendChild(title);
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
          fav.src = `https://www.google.com/s2/favicons?domain=${new URL(item.url).hostname}&sz=64`;
        } catch {
          fav.src = chrome.runtime.getURL('../assets/icon-favicon-fallback.svg');
        }

        const details = document.createElement('div');
        details.className = 'result-details';

        const title = document.createElement('div');
        title.className = 'result-title';
        title.innerHTML = highlightMatches(item.title || item.url, currentQuery);

        const url = document.createElement('div');
        url.className = 'result-url';
        url.innerHTML = highlightMatches(item.url, currentQuery);

        details.appendChild(title);
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

    // Use shared openUrl - opens new tab if Ctrl or Shift, background if Shift
    openUrl(item.url, isCtrl || isShift, isShift);
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

    // Handle Tab navigation between main components
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      if (currentElement === input) {
        // From search input -> first result item (if results exist)
        if (resultsLocal.length > 0) {
          const displayMode = SettingsManager.getSetting('displayMode') || DisplayMode.LIST;
          const selector = displayMode === DisplayMode.CARDS ? '.result-card' : 'li';
          const firstResult = resultsNode.querySelector(selector) as HTMLElement;
          if (firstResult) {
            activeIndex = 0;
            highlightActive();
            firstResult.focus();
          }
        } else {
          // No results, cycle back to search input
          input.focus();
          // Do not select text when focusing from Tab navigation
        }
      } else if (currentElement === settingsButton) {
        // From settings button -> search input
        input.focus();
        // Do not select text when focusing from Tab navigation
      } else if (resultsNode.contains(currentElement)) {
        // From any result item -> search input (cycle back)
        input.focus();
        // Do not select text when focusing from Tab navigation
      }
      return;
    }

    // Handle Shift+Tab navigation (reverse)
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      if (currentElement === input) {
        // From search input -> settings button
        settingsButton.focus();
      } else if (currentElement === settingsButton) {
        // From settings button -> last result item (if results exist), or search input
        if (resultsLocal.length > 0) {
          const displayMode = SettingsManager.getSetting('displayMode') || DisplayMode.LIST;
          const selector = displayMode === DisplayMode.CARDS ? '.result-card' : 'li';
          const results = resultsNode.querySelectorAll(selector);
          const lastResult = results[results.length - 1] as HTMLElement;
          if (lastResult) {
            activeIndex = resultsLocal.length - 1;
            highlightActive();
            lastResult.focus();
          }
        } else {
          // No results, go to search input
          input.focus();
          // Do not select text when focusing from Tab navigation
        }
      } else if (resultsNode.contains(currentElement)) {
        // From any result item -> search input
        input.focus();
        // Do not select text when focusing from Tab navigation
      }
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

    if (e.key.toLowerCase() === 'm' && e.ctrlKey) {
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

    // Ollama settings
    const ollamaEnabledInput = modal.querySelector('#modal-ollamaEnabled') as HTMLInputElement;
    if (ollamaEnabledInput) {
      ollamaEnabledInput.checked = SettingsManager.getSetting('ollamaEnabled') || false;
    }

    const ollamaEndpointInput = modal.querySelector('#modal-ollamaEndpoint') as HTMLInputElement;
    if (ollamaEndpointInput) {
      ollamaEndpointInput.value = SettingsManager.getSetting('ollamaEndpoint') || 'http://localhost:11434';
    }

    const ollamaModelInput = modal.querySelector('#modal-ollamaModel') as HTMLSelectElement;
    if (ollamaModelInput) {
      const savedModel = SettingsManager.getSetting('ollamaModel') || 'llama3.2:1b';
      // Check if saved model exists in dropdown, otherwise use default
      const optionExists = Array.from(ollamaModelInput.options).some(opt => opt.value === savedModel);
      ollamaModelInput.value = optionExists ? savedModel : 'llama3.2:1b';
    }

    const ollamaTimeoutInput = modal.querySelector('#modal-ollamaTimeout') as HTMLInputElement;
    if (ollamaTimeoutInput) {
      ollamaTimeoutInput.value = String(SettingsManager.getSetting('ollamaTimeout') || 30000);
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

    // Ollama model changes
    const ollamaModelInput = modal.querySelector('#modal-ollamaModel') as HTMLSelectElement;
    if (ollamaModelInput) {
      ollamaModelInput.addEventListener('change', async () => {
        const val = ollamaModelInput.value;
        if (val) {
          await SettingsManager.setSetting('ollamaModel', val);
          showToast('Ollama model updated');
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

    // Clear data button
    const clearBtn = modal.querySelector('#modal-clear') as HTMLButtonElement;
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        if (confirm('Clear all extension data? This will delete your browsing history index.')) {
          try {
            // Lazy load clearIndexedDB only when needed
            const clearDB = await getClearIndexedDB();
            await clearDB();
            await SettingsManager.resetToDefaults();
            await Logger.setLevel(SettingsManager.getSetting('logLevel') || 2);
            closeSettingsModal();
            resultsLocal = [];
            activeIndex = -1;
            renderResults();
            showToast('All data cleared');
          } catch (error) {
            showToast('Failed to clear data', true);
          }
        }
      });
    }
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
          <span>Enter: open · Ctrl+Enter: new tab · Shift+Enter: background tab · Ctrl+M: copy markdown</span>
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
}
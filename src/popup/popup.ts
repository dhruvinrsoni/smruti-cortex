// popup.ts — lightweight UI logic for SmrutiCortex popup
// Compiled by webpack to dist/popup/popup.js

import { BRAND_NAME } from "../core/constants";
import { Logger, LogLevel, ComponentLogger } from "../core/logger";
import { SettingsManager, DisplayMode } from "../core/settings";
import { tokenize } from "../background/search/tokenizer";
import { clearIndexedDB } from "../background/database";

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

// Global variables for event setup
let debounceSearch: (q: string) => void;
let handleKeydown: (e: KeyboardEvent) => void;
let results: any[];
let openSettingsPage: () => void;
let $: (id: string) => any;

// Initialize essentials synchronously first
function fastInit() {
  // Create logger synchronously
  logger = Logger.forComponent("PopupScript");

  // Initialize settings synchronously if possible
  SettingsManager.init().catch(err => {
    console.warn("Settings init failed:", err);
  });

  // Start popup immediately
  initializePopup();
}

// Start immediately
fastInit();

function setupEventListeners() {
  const input = $("search-input") as HTMLInputElement;
  const resultsNode = $("results") as HTMLUListElement;
  const resultCountNode = $("result-count") as HTMLDivElement;
  const settingsButton = $("settings-button") as HTMLButtonElement;

  // Make results container focusable for keyboard navigation
  // Removed - individual result items should be focusable instead

  if (input) {
    input.addEventListener("input", (ev) => debounceSearch((ev.target as HTMLInputElement).value));
    input.addEventListener("keydown", handleKeydown);
  }

  if (resultsNode) {
    // Removed - individual result items handle keyboard navigation
  }

  if (settingsButton) {
    settingsButton.addEventListener("keydown", handleKeydown);
    settingsButton.addEventListener("click", openSettingsPage);
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
  const input = $local("search-input") as HTMLInputElement;
  const resultsNode = $local("results") as HTMLUListElement;
  const resultCountNode = $local("result-count") as HTMLDivElement;
  const settingsButton = $local("settings-button") as HTMLButtonElement;

  let resultsLocal: IndexedItem[] = [];
  let activeIndex = -1;
  let debounceTimer: number | undefined;
  let serviceWorkerReady = false;
  let currentQuery = "";

  // Assign global results
  results = resultsLocal;

  // Highlight matching parts in text
  function highlightMatches(text: string, query: string): string {
    if (!query.trim() || !SettingsManager.getSetting('highlightMatches')) {
      return text;
    }
    const tokens = tokenize(query);
    let highlighted = text;
    for (const token of tokens) {
      if (token.length < 2) continue; // Skip very short tokens
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
  }

  // Pre-render empty state immediately
  renderResults();

  // Fast message sending
  function sendMessage(msg: any): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        const runtime = (typeof chrome !== "undefined" && chrome.runtime) ? chrome.runtime : (typeof browser !== "undefined" ? browser.runtime : null);
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
    if (serviceWorkerReady) return true;
    try {
      const resp = await sendMessage({ type: "PING" });
      serviceWorkerReady = resp && resp.status === "ok";
      return serviceWorkerReady;
    } catch (error) {
      return false;
    }
  }

  // Smart debounce - wait for user to stop typing before searching
  function debounceSearchLocal(q: string) {
    if (debounceTimer) clearTimeout(debounceTimer);
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
    if (!q || q.trim() === "") {
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
      resultCountNode.textContent = "Initializing...";
      resultsNode.innerHTML = '<div style="padding:8px;color:#f59e0b;">Extension starting up...</div>';
      return;
    }

    try {
      const resp = await sendMessage({ type: "SEARCH_QUERY", query: q });
      resultsLocal = (resp && resp.results) ? resp.results : [];
      activeIndex = resultsLocal.length ? 0 : -1;
      renderResults();
      // Focus the first result item if focusDelayMs > 0
      const focusDelay = SettingsManager.getSetting('focusDelayMs');
      if (typeof focusDelay === 'number' && focusDelay > 0 && resultsLocal.length > 0) {
        const displayMode = SettingsManager.getSetting('displayMode') || DisplayMode.LIST;
        const selector = displayMode === DisplayMode.CARDS ? ".result-card" : "li";
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
    resultsNode.className = displayMode === DisplayMode.CARDS ? "results cards" : "results list";

    resultsNode.innerHTML = "";
    resultCountNode.textContent = `${resultsLocal.length} result${resultsLocal.length === 1 ? "" : "s"}`;

    if (resultsLocal.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "No matches — try different keywords";
      empty.style.padding = "8px";
      empty.style.color = "var(--muted)";
      resultsNode.appendChild(empty);
      return;
    }

    // Fast rendering without logging
    if (displayMode === DisplayMode.CARDS) {
      resultsLocal.forEach((item, idx) => {
        const card = document.createElement("div");
        card.className = "result-card";
        card.tabIndex = 0;
        card.dataset.index = String(idx);
        if (idx === activeIndex) card.classList.add("active");

        const fav = document.createElement("img");
        fav.className = "card-favicon";
        try {
          fav.src = `https://www.google.com/s2/favicons?domain=${new URL(item.url).hostname}&sz=64`;
        } catch {
          fav.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Crect width='16' height='16' fill='%23ccc'/%3E%3C/svg%3E";
        }

        const details = document.createElement("div");
        details.className = "card-details";

        const title = document.createElement("div");
        title.className = "card-title";
        title.innerHTML = highlightMatches(item.title || item.url, currentQuery);

        const url = document.createElement("div");
        url.className = "card-url";
        url.innerHTML = highlightMatches(item.url, currentQuery);

        details.appendChild(title);
        details.appendChild(url);
        card.appendChild(fav);
        card.appendChild(details);

        card.addEventListener("click", (e) => openResult(idx, e as MouseEvent));
        card.addEventListener("keydown", handleKeydownLocal);

        resultsNode.appendChild(card);
      });
    } else {
      resultsLocal.forEach((item, idx) => {
        const li = document.createElement("li");
        li.tabIndex = 0;
        li.dataset.index = String(idx);
        if (idx === activeIndex) li.classList.add("active");

        const fav = document.createElement("img");
        fav.className = "favicon";
        try {
          fav.src = `https://www.google.com/s2/favicons?domain=${new URL(item.url).hostname}&sz=64`;
        } catch {
          fav.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Crect width='16' height='16' fill='%23ccc'/%3E%3C/svg%3E";
        }

        const details = document.createElement("div");
        details.className = "result-details";

        const title = document.createElement("div");
        title.className = "result-title";
        title.innerHTML = highlightMatches(item.title || item.url, currentQuery);

        const url = document.createElement("div");
        url.className = "result-url";
        url.innerHTML = highlightMatches(item.url, currentQuery);

        details.appendChild(title);
        details.appendChild(url);
        li.appendChild(fav);
        li.appendChild(details);

        li.addEventListener("click", (e) => openResult(idx, e as MouseEvent));
        li.addEventListener("keydown", handleKeydownLocal);

        resultsNode.appendChild(li);
      });
    }
  }

  // Fast result opening
  function openResult(index: number, event?: MouseEvent | KeyboardEvent) {
    const item = resultsLocal[index];
    if (!item) return;

    const isCtrl = (event && (event as MouseEvent).ctrlKey) || (event instanceof KeyboardEvent && event.ctrlKey);
    const isShift = (event && (event as MouseEvent).shiftKey) || (event instanceof KeyboardEvent && event.shiftKey);

    if (typeof chrome !== "undefined" && chrome.tabs) {
      chrome.tabs.create({ url: item.url, active: !isShift }, () => {});
    } else if (typeof browser !== "undefined" && browser.tabs) {
      browser.tabs.create({ url: item.url, active: !isShift });
    } else {
      window.open(item.url, isCtrl ? "_blank" : "_self");
    }
  }

  // Fast keyboard handling
  function handleKeydownLocal(e: KeyboardEvent) {
    const currentElement = document.activeElement;
    const input = $local("search-input") as HTMLInputElement;
    const resultsNode = $local("results") as HTMLUListElement;
    const settingsButton = $local("settings-button") as HTMLButtonElement;

    let currentIndex = -1;
    if (resultsNode.contains(currentElement)) {
      const displayMode = SettingsManager.getSetting('displayMode') || DisplayMode.LIST;
      const itemSelector = displayMode === DisplayMode.CARDS ? '.result-card' : 'li';
      const currentItem = (currentElement as HTMLElement).closest(itemSelector) as HTMLElement;
      if (currentItem) {
        currentIndex = parseInt(currentItem.dataset.index || "0");
      }
    }

    // Handle Tab navigation between main components
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      if (currentElement === input) {
        // From search input -> first result item (if results exist)
        if (resultsLocal.length > 0) {
          const displayMode = SettingsManager.getSetting('displayMode') || DisplayMode.LIST;
          const selector = displayMode === DisplayMode.CARDS ? ".result-card" : "li";
          const firstResult = resultsNode.querySelector(selector) as HTMLElement;
          if (firstResult) {
            activeIndex = 0;
            highlightActive();
            firstResult.focus();
          }
        } else {
          // No results, cycle back to search input
          input.focus();
          input.select();
        }
      } else if (currentElement === settingsButton) {
        // From settings button -> search input
        input.focus();
        input.select();
      } else if (resultsNode.contains(currentElement)) {
        // From any result item -> search input (cycle back)
        input.focus();
        input.select();
      }
      return;
    }

    // Handle Shift+Tab navigation (reverse)
    if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      if (currentElement === input) {
        // From search input -> settings button
        settingsButton.focus();
      } else if (currentElement === settingsButton) {
        // From settings button -> last result item (if results exist), or search input
        if (resultsLocal.length > 0) {
          const displayMode = SettingsManager.getSetting('displayMode') || DisplayMode.LIST;
          const selector = displayMode === DisplayMode.CARDS ? ".result-card" : "li";
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
          input.select();
        }
      } else if (resultsNode.contains(currentElement)) {
        // From any result item -> search input
        input.focus();
        input.select();
      }
      return;
    }

    // Handle search input specific keys
    if (currentElement === input) {
      if (e.key === "ArrowDown" && resultsLocal.length > 0) {
        e.preventDefault();
        // Move focus to first result item if not already focused
        const displayMode = SettingsManager.getSetting('displayMode') || DisplayMode.LIST;
        const selector = displayMode === DisplayMode.CARDS ? ".result-card" : "li";
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
      if (e.key === "Escape") {
        // Don't prevent default - let Escape bubble up to close the popup
        input.value = "";
        currentQuery = "";
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
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openSettingsPage();
        return;
      }
      return;
    }

    // Handle result item navigation
    if (resultsNode.contains(currentElement)) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (resultsLocal.length === 0) return;
        const newIndex = Math.min(resultsLocal.length - 1, currentIndex + 1);
        activeIndex = newIndex;
        highlightActive();
        // Focus the new active result item
        const displayMode = SettingsManager.getSetting('displayMode') || DisplayMode.LIST;
        const selector = displayMode === DisplayMode.CARDS ? ".result-card" : "li";
        const results = resultsNode.querySelectorAll(selector);
        const activeResult = results[newIndex] as HTMLElement;
        if (activeResult) {
          activeResult.focus();
        }
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (resultsLocal.length === 0) return;
        const newIndex = Math.max(0, currentIndex - 1);
        activeIndex = newIndex;
        highlightActive();
        // Focus the new active result item
        const displayMode = SettingsManager.getSetting('displayMode') || DisplayMode.LIST;
        const selector = displayMode === DisplayMode.CARDS ? ".result-card" : "li";
        const results = resultsNode.querySelectorAll(selector);
        const activeResult = results[newIndex] as HTMLElement;
        if (activeResult) {
          activeResult.focus();
        }
        return;
      }

      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        if (resultsLocal.length === 0) return;
        openResult(currentIndex, e);
        return;
      }

      if (e.key === "Escape") {
        // Don't prevent default - let Escape bubble up to close the popup
        input.value = "";
        currentQuery = "";
        resultsLocal = [];
        activeIndex = -1;
        renderResults();
        // Don't focus input - let popup close naturally
        return;
      }
    }

    if (e.key.toLowerCase() === "m" && e.ctrlKey) {
      e.preventDefault();
      if (resultsLocal.length === 0 || currentIndex === -1) return;
      const item = resultsLocal[currentIndex];
      if (item) {
        navigator.clipboard.writeText(`[${item.title || item.url}](${item.url})`).then(() => {
          const prev = resultCountNode.textContent;
          resultCountNode.textContent = "Copied!";
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
    const selector = displayMode === DisplayMode.CARDS ? ".result-card" : "li";
    const items = Array.from(resultsNode.querySelectorAll(selector));
    items.forEach((item) => item.classList.remove("active"));
    const active = items[activeIndex];
    if (active) {
      active.classList.add("active");
      // Don't focus individual items - keep focus on results container
      // Just scroll the active item into view if needed
      active.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  // Simplified settings page - replace app content
  function openSettingsPageLocal() {
    const app = $('app');
    const originalHTML = app.innerHTML;
    app.innerHTML = `
      <div class="settings-page">
        <div class="settings-header">
          <h2>Settings</h2>
          <button class="settings-close" title="Close">×</button>
        </div>
        <div class="settings-content">
          <div class="settings-section">
            <h3>Display Mode</h3>
            <p>Choose how search results are displayed.</p>
            <div class="setting-options">
              <label class="setting-option">
                <input type="radio" name="modal-displayMode" value="list">
                <span class="option-indicator"></span>
                <div class="option-content">
                  <strong>List View</strong>
                  <small>Vertical list layout - compact</small>
                </div>
              </label>
              <label class="setting-option">
                <input type="radio" name="modal-displayMode" value="cards">
                <span class="option-indicator"></span>
                <div class="option-content">
                  <strong>Card View</strong>
                  <small>Horizontal cards - shows full URLs</small>
                </div>
              </label>
            </div>
          </div>
          <div class="settings-section">
            <h3>Log Level</h3>
            <p>Control extension logging verbosity.</p>
            <div class="setting-options">
              <label class="setting-option">
                <input type="radio" name="modal-logLevel" value="0">
                <span class="option-indicator"></span>
                <div class="option-content">
                  <strong>Error</strong>
                  <small>Show only errors</small>
                </div>
              </label>
              <label class="setting-option">
                <input type="radio" name="modal-logLevel" value="2">
                <span class="option-indicator"></span>
                <div class="option-content">
                  <strong>Info</strong>
                  <small>Show general information</small>
                </div>
              </label>
              <label class="setting-option">
                <input type="radio" name="modal-logLevel" value="3">
                <span class="option-indicator"></span>
                <div class="option-content">
                  <strong>Debug</strong>
                  <small>Show detailed debugging info</small>
                </div>
              </label>
            </div>
          </div>
          <div class="settings-section">
            <h3>Match Highlighting</h3>
            <p>Highlight matching parts in search results.</p>
            <div class="setting-options">
              <label class="setting-option">
                <input type="checkbox" id="modal-highlightMatches">
                <span class="option-indicator"></span>
                <div class="option-content">
                  <strong>Enable highlighting</strong>
                  <small>Show what parts of titles and URLs match your search</small>
                </div>
              </label>
            </div>
          </div>
          <div class="settings-section">
            <h3>Result Focus Delay</h3>
            <p>Control how quickly focus shifts to results after typing. <br>
            <b>0 ms</b> disables auto-focus. <b>100-2000 ms</b> is recommended for natural UX.</p>
            <div class="setting-options">
              <label class="setting-option">
                <input type="number" id="modal-focusDelayMs" min="0" max="2000" step="50" style="width:80px;">
                <span class="option-indicator"></span>
                <div class="option-content">
                  <strong>Focus Delay (ms)</strong>
                  <small>Time to wait after typing before focusing results (0 disables)</small>
                </div>
              </label>
            </div>
          </div>
          <div class="settings-section">
            <h3>Actions</h3>
            <div class="setting-actions">
              <button class="action-btn secondary" id="modal-reset">Reset to Defaults</button>
              <button class="action-btn danger" id="modal-clear">Clear All Data</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Load current settings
    const currentDisplayMode = SettingsManager.getSetting('displayMode') || DisplayMode.LIST;
    const currentLogLevel = SettingsManager.getSetting('logLevel') || 2;
    const currentHighlight = SettingsManager.getSetting('highlightMatches') ?? true;
    const currentFocusDelay = SettingsManager.getSetting('focusDelayMs') ?? 300;

    const displayInputs = app.querySelectorAll('input[name="modal-displayMode"]');
    const logInputs = app.querySelectorAll('input[name="modal-logLevel"]');

    displayInputs.forEach(input => {
      if ((input as HTMLInputElement).value === currentDisplayMode) {
        (input as HTMLInputElement).checked = true;
      }
    });

    logInputs.forEach(input => {
      if (parseInt((input as HTMLInputElement).value) === currentLogLevel) {
        (input as HTMLInputElement).checked = true;
      }
    });

    const highlightInput = app.querySelector('#modal-highlightMatches') as HTMLInputElement;
    if (highlightInput) {
      highlightInput.checked = currentHighlight;
    }

    const focusDelayInput = app.querySelector('#modal-focusDelayMs') as HTMLInputElement;
    if (focusDelayInput) {
      focusDelayInput.value = String(currentFocusDelay);
      focusDelayInput.addEventListener('change', async (e) => {
        let val = parseInt(focusDelayInput.value);
        if (isNaN(val) || val < 0) val = 0;
        if (val > 2000) val = 2000;
        await SettingsManager.setSetting('focusDelayMs', val);
        focusDelayInput.value = String(val);
        showToast(val === 0 ? "Auto-focus disabled" : `Focus delay set to ${val} ms`);
      });
    }

    // Event handlers
    const closeBtn = app.querySelector('.settings-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        // Preserve input value and results after closing settings
        const inputValue = ($('search-input') as HTMLInputElement)?.value || input.value;
        app.innerHTML = originalHTML;
        setupEventListeners();
        // Restore input value
        const restoredInput = $('search-input') as HTMLInputElement;
        if (restoredInput) {
          restoredInput.value = inputValue;
          restoredInput.focus();
          restoredInput.select();
        }
        // Trigger search to restore results
        debounceSearch(inputValue);
      });
    }

    // Settings changes
    displayInputs.forEach(input => {
      input.addEventListener('change', async (e) => {
        const target = e.target as HTMLInputElement;
        if (target.checked) {
          await SettingsManager.setSetting('displayMode', target.value as DisplayMode);
          showToast("Display mode updated");
        }
      });
    });

    logInputs.forEach(input => {
      input.addEventListener('change', async (e) => {
        const target = e.target as HTMLInputElement;
        if (target.checked) {
          const level = parseInt(target.value);
          await SettingsManager.setSetting('logLevel', level);
          await Logger.setLevel(level);
          showToast("Log level updated");
        }
      });
    });

    if (highlightInput) {
      highlightInput.addEventListener('change', async (e) => {
        const target = e.target as HTMLInputElement;
        await SettingsManager.setSetting('highlightMatches', target.checked);
        showToast("Match highlighting " + (target.checked ? "enabled" : "disabled"));
      });
    }

    // Action buttons
    const resetBtn = app.querySelector('#modal-reset') as HTMLButtonElement;
    const clearBtn = app.querySelector('#modal-clear') as HTMLButtonElement;

    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        if (confirm('Reset all settings to defaults?')) {
          await SettingsManager.resetToDefaults();
          await Logger.setLevel(SettingsManager.getSetting('logLevel') || 2);
          app.innerHTML = originalHTML;
          setupEventListeners();
          showToast("Settings reset to defaults");
        }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        if (confirm('Clear all extension data? This will delete your browsing history.')) {
          try {
            await clearIndexedDB();
            await SettingsManager.resetToDefaults();
            await Logger.setLevel(SettingsManager.getSetting('logLevel') || 2);
            app.innerHTML = originalHTML;
            setupEventListeners();
            showToast("All data cleared");
          } catch (error) {
            showToast("Failed to clear data", true);
          }
        }
      });
    }
  }

  // Assign global
  openSettingsPage = openSettingsPageLocal;

  // Fast event setup
  setupEventListeners();

  // Fast window load - check service worker status and lazy load hints
  window.addEventListener("load", () => {
    // Check service worker status asynchronously (don't block)
    checkServiceWorkerStatus().then(ready => {
      serviceWorkerReady = ready;
      if (!ready) {
        resultCountNode.textContent = "Initializing...";
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
  if (typeof chrome !== "undefined" && chrome.runtime) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === "KEYBOARD_SHORTCUT_OPEN") {
        handleKeyboardShortcut();
        sendResponse({ status: "ok" });
      } else if (message.type === "PING") {
        sendResponse({ status: "ok" });
      } else if (message.type === "SETTINGS_CHANGED") {
        renderResults();
        sendResponse({ status: "ok" });
      }
    });
  } else if (typeof browser !== "undefined" && browser.runtime) {
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === "KEYBOARD_SHORTCUT_OPEN") {
        handleKeyboardShortcut();
        sendResponse({ status: "ok" });
      } else if (message.type === "PING") {
        sendResponse({ status: "ok" });
      } else if (message.type === "SETTINGS_CHANGED") {
        renderResults();
        sendResponse({ status: "ok" });
      }
    });
  }
}
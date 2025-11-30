// popup.ts — lightweight UI logic for SmrutiCortex popup
// Compiled by webpack to dist/popup/popup.js

import { BRAND_NAME } from "../core/constants";
import { Logger, LogLevel, ComponentLogger } from "../core/logger";
import { SettingsManager, DisplayMode } from "../core/settings";

declare const browser: any;

// Fast initialization - prioritize speed over logging
let logger: ComponentLogger;
let settingsManager: typeof SettingsManager;

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
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

  // Get elements immediately
  const input = $("search-input") as HTMLInputElement;
  const resultsNode = $("results") as HTMLUListElement;
  const resultCountNode = $("result-count") as HTMLDivElement;
  const settingsButton = $("settings-button") as HTMLButtonElement;

  let results: IndexedItem[] = [];
  let activeIndex = -1;
  let debounceTimer: number | undefined;
  let serviceWorkerReady = false;

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

  // Ultra-fast debounce for instant feel
  function debounceSearch(q: string) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => doSearch(q), 50); // Even faster
  }

  // Fast search
  async function doSearch(q: string) {
    if (!q || q.trim() === "") {
      results = [];
      activeIndex = -1;
      renderResults();
      return;
    }

    const isServiceWorkerReady = await checkServiceWorkerStatus();
    if (!isServiceWorkerReady) {
      results = [];
      activeIndex = -1;
      renderResults();
      resultCountNode.textContent = "Initializing...";
      resultsNode.innerHTML = '<div style="padding:8px;color:#f59e0b;">Extension starting up...</div>';
      return;
    }

    try {
      const resp = await sendMessage({ type: "SEARCH_QUERY", query: q });
      results = (resp && resp.results) ? resp.results : [];
      activeIndex = results.length ? 0 : -1;
      renderResults();
    } catch (error) {
      results = [];
      activeIndex = -1;
      renderResults();
    }
  }

  // Fast rendering
  function renderResults() {
    const displayMode = SettingsManager.getSetting('displayMode') || DisplayMode.LIST;
    resultsNode.className = displayMode === DisplayMode.CARDS ? "results cards" : "results list";

    resultsNode.innerHTML = "";
    resultCountNode.textContent = `${results.length} result${results.length === 1 ? "" : "s"}`;

    if (results.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "No matches — try different keywords";
      empty.style.padding = "8px";
      empty.style.color = "var(--muted)";
      resultsNode.appendChild(empty);
      return;
    }

    // Fast rendering without logging
    if (displayMode === DisplayMode.CARDS) {
      results.forEach((item, idx) => {
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
        title.textContent = item.title || item.url;

        const url = document.createElement("div");
        url.className = "card-url";
        url.textContent = item.url;

        details.appendChild(title);
        details.appendChild(url);
        card.appendChild(fav);
        card.appendChild(details);

        card.addEventListener("click", (e) => openResult(idx, e as MouseEvent));
        card.addEventListener("keydown", handleKeydown);

        resultsNode.appendChild(card);
      });
    } else {
      results.forEach((item, idx) => {
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
        title.textContent = item.title || item.url;

        const url = document.createElement("div");
        url.className = "result-url";
        url.textContent = item.url;

        details.appendChild(title);
        details.appendChild(url);
        li.appendChild(fav);
        li.appendChild(details);

        li.addEventListener("click", (e) => openResult(idx, e as MouseEvent));
        li.addEventListener("keydown", handleKeydown);

        resultsNode.appendChild(li);
      });
    }
  }

  // Fast result opening
  function openResult(index: number, event?: MouseEvent | KeyboardEvent) {
    const item = results[index];
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
  function handleKeydown(e: KeyboardEvent) {
    if (document.activeElement === input) {
      if (e.key === "ArrowDown" && results.length > 0) {
        e.preventDefault();
        activeIndex = 0;
        const displayMode = SettingsManager.getSetting('displayMode') || DisplayMode.LIST;
        const selector = displayMode === DisplayMode.CARDS ? ".result-card" : "li";
        const firstResult = resultsNode.querySelector(selector);
        if (firstResult) {
          (firstResult as HTMLElement).focus();
          highlightActive();
        }
        return;
      }
      return;
    }

    if (e.key === "Escape") {
      input.value = "";
      results = [];
      renderResults();
      input.focus();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (results.length === 0) return;
      activeIndex = Math.min(results.length - 1, activeIndex + 1);
      highlightActive();
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length === 0) return;
      activeIndex = Math.max(0, activeIndex - 1);
      highlightActive();
      return;
    }

    if (e.key === "ArrowRight") {
      e.preventDefault();
      if (results.length === 0) return;
      activeIndex = Math.min(results.length - 1, activeIndex + 1);
      highlightActive();
      return;
    }

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (results.length === 0) return;
      activeIndex = Math.max(0, activeIndex - 1);
      highlightActive();
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (results.length === 0) return;
      openResult(activeIndex, e);
      return;
    }

    if (e.key.toLowerCase() === "m" && e.ctrlKey) {
      e.preventDefault();
      if (results.length === 0) return;
      const item = results[activeIndex];
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

  // Fast highlighting
  function highlightActive() {
    const displayMode = SettingsManager.getSetting('displayMode') || DisplayMode.LIST;
    const selector = displayMode === DisplayMode.CARDS ? ".result-card" : "li";
    const items = Array.from(resultsNode.querySelectorAll(selector));
    items.forEach((item) => item.classList.remove("active"));
    const active = items[activeIndex];
    if (active) {
      active.classList.add("active");
      active.scrollIntoView({ inline: "center", behavior: "smooth" });
    }
  }

  // Simplified settings modal - load on demand
  function openSettingsPage() {
    // Create minimal modal for speed
    const modal = document.createElement('div');
    modal.className = 'settings-modal-overlay';
    modal.innerHTML = `
      <div class="settings-modal">
        <div class="settings-modal-header">
          <h2>Settings</h2>
          <button class="settings-modal-close" title="Close">×</button>
        </div>
        <div class="settings-modal-content">
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
            <h3>Actions</h3>
            <div class="setting-actions">
              <button class="action-btn secondary" id="modal-reset">Reset to Defaults</button>
              <button class="action-btn danger" id="modal-clear">Clear All Data</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Load current settings
    const currentDisplayMode = SettingsManager.getSetting('displayMode') || DisplayMode.LIST;
    const currentLogLevel = SettingsManager.getSetting('logLevel') || 2;

    const displayInputs = modal.querySelectorAll('input[name="modal-displayMode"]');
    const logInputs = modal.querySelectorAll('input[name="modal-logLevel"]');

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

    // Event handlers
    const closeBtn = modal.querySelector('.settings-modal-close');
    const overlay = modal;

    const closeModal = () => modal.remove();

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    // Settings changes
    displayInputs.forEach(input => {
      input.addEventListener('change', async (e) => {
        const target = e.target as HTMLInputElement;
        if (target.checked) {
          await SettingsManager.setSetting('displayMode', target.value as DisplayMode);
          renderResults();
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

    // Action buttons
    const resetBtn = modal.querySelector('#modal-reset') as HTMLButtonElement;
    const clearBtn = modal.querySelector('#modal-clear') as HTMLButtonElement;

    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        if (confirm('Reset all settings to defaults?')) {
          await SettingsManager.resetToDefaults();
          await Logger.setLevel(SettingsManager.getSetting('logLevel') || 2);
          closeModal();
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
            closeModal();
            showToast("All data cleared");
          } catch (error) {
            showToast("Failed to clear data", true);
          }
        }
      });
    }

    function showToast(message: string, isError = false) {
      const existingToast = document.querySelector('.toast');
      if (existingToast) existingToast.remove();

      const toast = document.createElement('div');
      toast.className = `toast ${isError ? 'error' : 'success'}`;
      toast.textContent = message;
      document.body.appendChild(toast);

      setTimeout(() => toast.classList.add('show'), 100);
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }

    async function clearIndexedDB(): Promise<void> {
      return new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase('SmrutiCortexDB');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Database deletion blocked'));
      });
    }
  }

  // Fast event setup
  if (input) {
    input.addEventListener("input", (ev) => debounceSearch((ev.target as HTMLInputElement).value));
    input.addEventListener("keydown", handleKeydown);
  }

  // Global keyboard listener for navigation
  document.addEventListener("keydown", (ev) => {
    if (results.length > 0 && document.activeElement !== input) {
      if (ev.key === "ArrowUp" || ev.key === "ArrowDown" || ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
        handleKeydown(ev);
      }
    }
  });

  if (settingsButton) {
    settingsButton.addEventListener("click", openSettingsPage);
  }

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
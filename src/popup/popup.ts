// popup.ts — lightweight UI logic for SmrutiCortex popup
// Compiled by webpack to dist/popup/popup.js

console.log("=== POPUP SCRIPT STARTING ===");

import { BRAND_NAME } from "../core/constants";
import { Logger, LogLevel } from "../core/logger";
import { SettingsManager, DisplayMode } from "../core/settings";

console.log("=== IMPORTS LOADED ===");

declare const browser: any;

// Initialize logger and settings
(async function initPopup() {
  console.log("=== initPopup() STARTING ===");
  await Logger.init();
  console.log("=== Logger.init() COMPLETED ===");
  await SettingsManager.init();
  console.log("=== SettingsManager.init() COMPLETED ===");
  Logger.info("Popup script initialized with log level:", LogLevel[Logger.getLevel()]);

  // Now continue with popup initialization
  initializePopup();
})();

async function initializePopup() {
  console.log("=== initializePopup() STARTING ===");
  Logger.info("Popup script starting execution");

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

  // Debug toggle - now replaced with log level selector
  let debugEnabled = false; // Kept for backward compatibility but not used

  function debugLog(...args: any[]) {
    // Replaced with Logger.trace for detailed UI logging
    Logger.trace('[UI]', ...args);
  }

  // Load debug setting from storage - replaced with log level
  if (typeof chrome !== "undefined" && chrome.storage) {
    chrome.storage.local.get(["debugEnabled"], (result) => {
      // Keep for backward compatibility but don't use
      debugEnabled = result.debugEnabled || false;
    });
  }

  // Helper
  const $ = <T extends HTMLElement>(id: string) => {
    Logger.trace("Looking for element with id:", id);
    const el = document.getElementById(id) as T;
    Logger.trace("Element found:", el);
    return el;
  };

  Logger.debug("Helper function defined");

  // Elements
  Logger.debug("About to get elements");
  const input = $("search-input") as HTMLInputElement;
  const resultsNode = $("results") as HTMLUListElement;
  const resultCountNode = $("result-count") as HTMLDivElement;
  const settingsButton = $("settings-button") as HTMLButtonElement;

  Logger.debug("Elements retrieved:", {
    input: !!input,
    resultsNode: !!resultsNode,
    resultCountNode: !!resultCountNode,
    settingsButton: !!settingsButton
  });

  let results: IndexedItem[] = [];
  let activeIndex = -1;
  let debounceTimer: number | undefined;

  // Helper to send messages to background in a cross-browser safe way
  function sendMessage(msg: any): Promise<any> {
    Logger.trace("sendMessage called with:", msg);
    return new Promise((resolve, reject) => {
      Logger.trace("Creating promise for sendMessage");
      try {
        Logger.trace("Checking for chrome/browser runtime");
        const runtime = (typeof chrome !== "undefined" && chrome.runtime) ? chrome.runtime : (typeof browser !== "undefined" ? browser.runtime : null);
        Logger.trace("Runtime found:", !!runtime);
        if (!runtime || !runtime.sendMessage) {
          Logger.trace("No runtime API found, resolving with empty results");
          resolve({ results: [] });
          return;
        }
        Logger.trace("Calling runtime.sendMessage");
        runtime.sendMessage(msg, (resp: any) => {
          Logger.trace("Runtime sendMessage callback received:", resp);
          // Check for runtime errors
          if (chrome && chrome.runtime && chrome.runtime.lastError) {
            Logger.debug("Runtime connection issue (expected during startup):", chrome.runtime.lastError.message || chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message || 'Runtime error'));
            return;
          }
          resolve(resp);
        });
      } catch (e) {
        Logger.debug("Send message connection issue (expected during startup):", e);
        reject(e);
      }
    });
  }

  // Check if service worker is available
  async function checkServiceWorkerStatus(): Promise<boolean> {
    Logger.debug("Checking service worker status");
    try {
      const resp = await sendMessage({ type: "PING" });
      Logger.debug("Service worker ping response:", resp);
      return resp && resp.status === "ok";
    } catch (error) {
      Logger.debug("Service worker ping failed:", error);
      return false;
    }
  }

  // Debounce helper
  function debounceSearch(q: string) {
    Logger.trace("debounceSearch called with:", q);
    if (debounceTimer) {
      Logger.trace("Clearing existing timer");
      window.clearTimeout(debounceTimer);
    }
    Logger.trace("Setting new timer for doSearch");
    debounceTimer = window.setTimeout(() => {
      Logger.trace("Timer fired, calling doSearch");
      doSearch(q);
    }, 120);
  }

  // Do the actual search (ask background worker)
  async function doSearch(q: string) {
    Logger.debug("doSearch called with:", q);
    if (!q || q.trim() === "") {
      Logger.trace("Query is empty, clearing results");
      results = [];
      renderResults();
      return;
    }
    Logger.debug("Query is valid, calling sendMessage");

    // Retry logic for service worker connection
    let retries = 3;
    let resp;

    while (retries > 0) {
      try {
        resp = await sendMessage({ type: "SEARCH_QUERY", query: q });
        Logger.debug("Search response received:", resp);
        break; // Success, exit retry loop
      } catch (error) {
        Logger.warn(`Search attempt failed (${4 - retries}/3), retries left: ${retries - 1}`, error);
        retries--;
        if (retries > 0) {
          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
    }

    if (!resp) {
      Logger.debug("All search attempts failed (service worker may not be ready), showing empty results");
      resp = { results: [] };
    }

    results = (resp && resp.results) ? resp.results : [];
    activeIndex = results.length ? 0 : -1;
    Logger.debug("Setting results:", results.length, "items");
    renderResults();
  }

  // Render results list
  function renderResults() {
    console.log('renderResults called');
    Logger.trace("renderResults called, results length:", results.length);
    const displayMode = SettingsManager.getSetting('displayMode');
    console.log('Current displayMode from SettingsManager:', displayMode);
    Logger.debug("Rendering results in mode:", DisplayMode[displayMode], "raw value:", displayMode);
    Logger.debug("DisplayMode enum values - LIST:", DisplayMode.LIST, "CARDS:", DisplayMode.CARDS);
    Logger.debug("Current settings:", SettingsManager.getSettings());

    resultsNode.innerHTML = "";
    resultCountNode.textContent = `${results.length} result${results.length === 1 ? "" : "s"}`;

    if (results.length === 0) {
      Logger.trace("No results, showing empty message");
      const empty = document.createElement("div");
      empty.textContent = "No matches — try different keywords";
      empty.style.padding = "8px";
      empty.style.color = "var(--muted)";
      resultsNode.appendChild(empty);
      return;
    }

    Logger.debug("Rendering", results.length, "results in", DisplayMode[displayMode], "mode");

    if (displayMode === DisplayMode.CARDS) {
      // Horizontal card layout
      results.forEach((item, idx) => {
        Logger.trace("Rendering card item", idx, item.title);
        const card = document.createElement("div");
        card.className = "result-card";
        card.tabIndex = 0;
        card.dataset.index = String(idx);
        if (idx === activeIndex) card.classList.add("active");

        // favicon
        const fav = document.createElement("img");
        fav.className = "card-favicon";
        try {
          const d = new URL(item.url).hostname;
          fav.src = `https://www.google.com/s2/favicons?domain=${d}&sz=64`;
        } catch {
          fav.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Crect width='16' height='16' fill='%23ccc'/%3E%3C/svg%3E";
        }

        // details
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

        // click handler
        card.addEventListener("click", (e) => {
          openResult(idx, e as MouseEvent);
        });

        // keyboard focus
        card.addEventListener("keydown", (ev) => {
          handleKeydown(ev as KeyboardEvent);
        });

        resultsNode.appendChild(card);
      });
    } else {
      // Vertical list layout (default)
      results.forEach((item, idx) => {
        Logger.trace("Rendering list item", idx, item.title);
        const li = document.createElement("li");
        li.tabIndex = 0;
        li.dataset.index = String(idx);
        if (idx === activeIndex) li.classList.add("active");

        // favicon
        const fav = document.createElement("img");
        fav.className = "favicon";
        try {
          const d = new URL(item.url).hostname;
          fav.src = `https://www.google.com/s2/favicons?domain=${d}&sz=64`;
        } catch {
          fav.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Crect width='16' height='16' fill='%23ccc'/%3E%3C/svg%3E";
        }

        // details
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

        // click handler
        li.addEventListener("click", (e) => {
          openResult(idx, e as MouseEvent);
        });

        // keyboard focus
        li.addEventListener("keydown", (ev) => {
          handleKeydown(ev as KeyboardEvent);
        });

        resultsNode.appendChild(li);
      });
    }
  }

  // Open a result according to modifiers
  function openResult(index: number, event?: MouseEvent | KeyboardEvent) {
    const item = results[index];
    if (!item) return;

    const isCtrl = (event && (event as MouseEvent).ctrlKey) || (event instanceof KeyboardEvent && event.ctrlKey);
    const isShift = (event && (event as MouseEvent).shiftKey) || (event instanceof KeyboardEvent && event.shiftKey);

    const openInNewTab = isCtrl;
    const openInBackground = isShift;

    if (typeof chrome !== "undefined" && chrome.tabs) {
      // chrome extension open
      chrome.tabs.create({ url: item.url, active: !openInBackground }, () => {});
    } else if (typeof browser !== "undefined" && browser.tabs) {
      browser.tabs.create({ url: item.url, active: !openInBackground });
    } else {
      // fallback
      window.open(item.url, openInNewTab ? "_blank" : "_self");
    }
  }

  // Copy current item as markdown: [Title](URL)
  function copyMarkdown(index: number) {
    const item = results[index];
    if (!item) return;
    const md = `[${item.title || item.url}](${item.url})`;
    navigator.clipboard.writeText(md).then(() => {
      // small visual feedback
      const prev = resultCountNode.textContent;
      resultCountNode.textContent = "Copied!";
      setTimeout(() => (resultCountNode.textContent = prev), 900);
    });
  }

  // Keyboard handling in popup
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      input.value = "";
      results = [];
      renderResults();
      input.focus();
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

    // Ctrl+Enter -> new tab (handled via modifier in openResult)
    // Shift+Enter -> background tab

    // quick markdown copy: Ctrl+M
    if (e.key.toLowerCase() === "m" && e.ctrlKey) {
      e.preventDefault();
      if (results.length === 0) return;
      copyMarkdown(activeIndex);
      return;
    }
  }

  // Highlight active li visually and ensure into view
  function highlightActive() {
    const displayMode = SettingsManager.getSetting('displayMode');
    const selector = displayMode === DisplayMode.CARDS ? ".result-card" : "li";
    const items = Array.from(resultsNode.querySelectorAll(selector));
    items.forEach((item) => item.classList.remove("active"));
    const active = items[activeIndex];
    if (active) {
      active.classList.add("active");
      active.scrollIntoView({ inline: "center", behavior: "smooth" });
    }
  }

  // Open settings page as modal overlay
  function openSettingsPage() {
    Logger.debug("Opening settings modal");

    // Check if modal already exists
    const existingModal = document.querySelector('.settings-modal-overlay');
    if (existingModal) {
      Logger.debug("Modal already exists, removing it");
      existingModal.remove();
    }

    // Create modal overlay
    const modal = document.createElement('div');
    modal.className = 'settings-modal-overlay';

    // Create modal content programmatically
    const modalContent = document.createElement('div');
    modalContent.className = 'settings-modal';

    // Header
    const header = document.createElement('div');
    header.className = 'settings-modal-header';

    const title = document.createElement('h2');
    title.textContent = 'Settings';
    header.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'settings-modal-close';
    closeBtn.title = 'Close';
    closeBtn.textContent = '×';
    header.appendChild(closeBtn);

    modalContent.appendChild(header);

    // Content
    const content = document.createElement('div');
    content.className = 'settings-modal-content';

    // Display Mode Section
    const displaySection = document.createElement('div');
    displaySection.className = 'settings-section';

    const displayTitle = document.createElement('h3');
    displayTitle.textContent = 'Display Mode';
    displaySection.appendChild(displayTitle);

    const displayDesc = document.createElement('p');
    displayDesc.textContent = 'Choose how search results are displayed.';
    displaySection.appendChild(displayDesc);

    const displayOptions = document.createElement('div');
    displayOptions.className = 'setting-options';

    // List View Option
    const listLabel = document.createElement('label');
    listLabel.className = 'setting-option';

    const listInput = document.createElement('input');
    listInput.type = 'radio';
    listInput.name = 'modal-displayMode';
    listInput.value = 'list';

    const listIndicator = document.createElement('span');
    listIndicator.className = 'option-indicator';

    const listContent = document.createElement('div');
    listContent.className = 'option-content';

    const listStrong = document.createElement('strong');
    listStrong.textContent = 'List View';
    listContent.appendChild(listStrong);

    const listSmall = document.createElement('small');
    listSmall.textContent = 'Vertical list layout - compact';
    listContent.appendChild(listSmall);

    listLabel.appendChild(listInput);
    listLabel.appendChild(listIndicator);
    listLabel.appendChild(listContent);
    displayOptions.appendChild(listLabel);

    // Card View Option
    const cardLabel = document.createElement('label');
    cardLabel.className = 'setting-option';

    const cardInput = document.createElement('input');
    cardInput.type = 'radio';
    cardInput.name = 'modal-displayMode';
    cardInput.value = 'cards';

    const cardIndicator = document.createElement('span');
    cardIndicator.className = 'option-indicator';

    const cardContent = document.createElement('div');
    cardContent.className = 'option-content';

    const cardStrong = document.createElement('strong');
    cardStrong.textContent = 'Card View';
    cardContent.appendChild(cardStrong);

    const cardSmall = document.createElement('small');
    cardSmall.textContent = 'Horizontal cards - shows full URLs';
    cardContent.appendChild(cardSmall);

    cardLabel.appendChild(cardInput);
    cardLabel.appendChild(cardIndicator);
    cardLabel.appendChild(cardContent);
    displayOptions.appendChild(cardLabel);

    displaySection.appendChild(displayOptions);
    content.appendChild(displaySection);

    // Log Level Section
    const logSection = document.createElement('div');
    logSection.className = 'settings-section';

    const logTitle = document.createElement('h3');
    logTitle.textContent = 'Log Level';
    logSection.appendChild(logTitle);

    const logDesc = document.createElement('p');
    logDesc.textContent = 'Control extension logging verbosity.';
    logSection.appendChild(logDesc);

    const logOptions = document.createElement('div');
    logOptions.className = 'setting-options';

    const logLevels = [
      { value: 0, label: 'Error Only', desc: 'Show only errors' },
      { value: 1, label: 'Info', desc: 'Show general information' },
      { value: 2, label: 'Debug', desc: 'Show detailed debugging info' },
      { value: 3, label: 'Trace', desc: 'Show all internal operations' }
    ];

    logLevels.forEach(level => {
      const label = document.createElement('label');
      label.className = 'setting-option';

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'modal-logLevel';
      input.value = level.value.toString();

      const indicator = document.createElement('span');
      indicator.className = 'option-indicator';

      const optionContent = document.createElement('div');
      optionContent.className = 'option-content';

      const strong = document.createElement('strong');
      strong.textContent = level.label;
      optionContent.appendChild(strong);

      const small = document.createElement('small');
      small.textContent = level.desc;
      optionContent.appendChild(small);

      label.appendChild(input);
      label.appendChild(indicator);
      label.appendChild(optionContent);
      logOptions.appendChild(label);
    });

    logSection.appendChild(logOptions);
    content.appendChild(logSection);

    // Actions Section
    const actionsSection = document.createElement('div');
    actionsSection.className = 'settings-section';

    const actionsTitle = document.createElement('h3');
    actionsTitle.textContent = 'Actions';
    actionsSection.appendChild(actionsTitle);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'setting-actions';

    const resetBtn = document.createElement('button');
    resetBtn.className = 'action-btn secondary';
    resetBtn.id = 'modal-reset';
    resetBtn.textContent = 'Reset to Defaults';
    actionsDiv.appendChild(resetBtn);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'action-btn danger';
    clearBtn.id = 'modal-clear';
    clearBtn.textContent = 'Clear All Data';
    actionsDiv.appendChild(clearBtn);

    actionsSection.appendChild(actionsDiv);
    content.appendChild(actionsSection);

    modalContent.appendChild(content);
    modal.appendChild(modalContent);

    document.body.appendChild(modal);

    Logger.debug("Modal created programmatically and appended to body");

    // Load current settings
    const currentDisplayMode = SettingsManager.getSetting('displayMode');
    const currentLogLevel = SettingsManager.getSetting('logLevel');

    console.log("Modal loading current settings - displayMode:", currentDisplayMode, "logLevel:", currentLogLevel);
    console.log("All current settings:", SettingsManager.getSettings());
    Logger.debug("Modal loading current settings - displayMode:", currentDisplayMode, "logLevel:", currentLogLevel);
    Logger.debug("All current settings:", SettingsManager.getSettings());

    const displayInputs = modal.querySelectorAll('input[name="modal-displayMode"]');
    const logInputs = modal.querySelectorAll('input[name="modal-logLevel"]');

    Logger.debug("Found display inputs:", displayInputs.length, "log inputs:", logInputs.length);

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
    const overlay = modal; // The modal itself is the overlay

    Logger.debug("Close button element:", closeBtn);
    Logger.debug("Close button found:", !!closeBtn);

    const closeModal = () => {
      modal.remove();
    };

    if (closeBtn) {
      Logger.debug("Adding close button event listener");
      closeBtn.addEventListener('click', closeModal);
    } else {
      Logger.error("Close button not found!");
    }
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    // Display mode change
    displayInputs.forEach(input => {
      input.addEventListener('change', async (e) => {
        const target = e.target as HTMLInputElement;
        if (target.checked) {
          console.log("Display mode change detected, new value:", target.value);
          Logger.debug("Display mode change detected, new value:", target.value);
          await SettingsManager.setSetting('displayMode', target.value as DisplayMode);
          console.log("Display mode setting updated, current settings:", SettingsManager.getSettings());
          Logger.debug("Display mode setting updated, current settings:", SettingsManager.getSettings());
          Logger.info("Display mode changed to:", target.value);
          showToast("Display mode updated");
        }
      });
    });

    // Log level change
    logInputs.forEach(input => {
      input.addEventListener('change', async (e) => {
        const target = e.target as HTMLInputElement;
        if (target.checked) {
          const level = parseInt(target.value);
          await SettingsManager.setSetting('logLevel', level);
          await Logger.setLevel(level);
          Logger.info("Log level changed to:", LogLevel[level]);
          showToast("Log level updated");
        }
      });
    });

    // Action buttons
    Logger.debug("Reset button element:", resetBtn);
    Logger.debug("Reset button found:", !!resetBtn, "Clear button found:", !!clearBtn);

    if (resetBtn) {
      Logger.debug("Adding reset button event listener");
      resetBtn.addEventListener('click', async () => {
        if (confirm('Reset all settings to defaults?')) {
          await SettingsManager.resetToDefaults();
          await Logger.setLevel(SettingsManager.getSetting('logLevel'));
          closeModal();
          Logger.info("Settings reset to defaults");
          showToast("Settings reset to defaults");
        }
      });
    }

    if (clearBtn) {
      Logger.debug("Adding clear button event listener");
      clearBtn.addEventListener('click', async () => {
        if (confirm('Clear all extension data? This will delete your browsing history.')) {
          try {
            await clearIndexedDB();
            await SettingsManager.resetToDefaults();
            await Logger.setLevel(SettingsManager.getSetting('logLevel'));
            closeModal();
            Logger.info("All data cleared");
            showToast("All data cleared");
          } catch (error) {
            Logger.error("Failed to clear data:", error);
            showToast("Failed to clear data", true);
          }
        }
      });
    }

    // Helper functions
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

  // Events
  if (input) {
    Logger.debug("Adding input event listener");
    input.addEventListener("input", (ev) => {
      const q = (ev.target as HTMLInputElement).value;
      Logger.trace("Input event fired, query:", q);
      debounceSearch(q);
    });

    Logger.debug("Adding keydown event listener");
    input.addEventListener("keydown", (ev) => {
      Logger.trace("Keydown event fired, key:", ev.key);
      handleKeydown(ev);
    });
  } else {
    Logger.error("Input element not found, not adding listeners");
  }

  // Settings button handler
  if (settingsButton) {
    Logger.debug("Adding settings button event listener");
    settingsButton.addEventListener("click", () => {
      Logger.debug("Settings button clicked");
      openSettingsPage();
    });
  } else {
    Logger.error("Settings button not found");
  }

  // Focus the input on load
  Logger.debug("Adding window load event listener");
  window.addEventListener("load", async () => {
    console.log("=== WINDOW LOAD EVENT FIRED ===");
    Logger.debug("Window load event fired");

    // Give service worker a moment to initialize
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check service worker status
    const isServiceWorkerReady = await checkServiceWorkerStatus();
    Logger.info("Service worker ready:", isServiceWorkerReady);

    if (!isServiceWorkerReady) {
      Logger.debug("Service worker not ready, showing warning");
      resultCountNode.textContent = "Initializing... Please wait.";
      resultsNode.innerHTML = "";
      const warning = document.createElement("div");
      warning.textContent = "Extension is starting up. Search will be available shortly.";
      warning.style.padding = "8px";
      warning.style.color = "#f59e0b";
      resultsNode.appendChild(warning);

      // Retry after a short delay
      setTimeout(async () => {
        const retryReady = await checkServiceWorkerStatus();
        if (retryReady) {
          Logger.debug("Service worker ready after retry");
          resultCountNode.textContent = "";
          renderResults();
        } else {
          Logger.error("Service worker still not ready after retry");
          resultCountNode.textContent = "Extension error. Please reload.";
        }
      }, 5000);
    }

    if (input) {
      Logger.debug("Focusing input");
      input.focus();
    } else {
      Logger.error("Input not found, cannot focus");
    }
    // small initial query attempt: show nothing
    Logger.debug("Calling initial renderResults");
    renderResults();
  });

  // Handle keyboard shortcut opening - focus search box or first result if available
  function handleKeyboardShortcut() {
    if (results.length > 0) {
      // Focus on first result
      activeIndex = 0;
      highlightActive();
      const displayMode = SettingsManager.getSetting('displayMode');
      const selector = displayMode === DisplayMode.CARDS ? ".result-card" : "li";
      const firstResult = resultsNode.querySelector(selector);
      if (firstResult) {
        (firstResult as HTMLElement).focus();
      }
    } else {
      // Focus on search input
      if (input) {
        input.focus();
      }
    }
  }

  // Check if opened via keyboard shortcut (simple heuristic: if no user interaction yet)
  let hasUserInteracted = false;
  document.addEventListener("keydown", () => { hasUserInteracted = true; });
  document.addEventListener("click", () => { hasUserInteracted = true; });

  // Listen for settings changes
  if (typeof chrome !== "undefined" && chrome.runtime) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      Logger.debug("Popup received message:", message);
      if (message.type === "KEYBOARD_SHORTCUT_OPEN") {
        Logger.debug("Handling keyboard shortcut open");
        handleKeyboardShortcut();
        sendResponse({ status: "ok" });
      } else if (message.type === "PING") {
        Logger.debug("Handling ping from background");
        sendResponse({ status: "ok" });
      } else if (message.type === "SETTINGS_CHANGED") {
        Logger.debug("Handling settings changed:", message.settings);
        Logger.debug("Re-rendering results after settings change");
        // Re-render results with new display mode
        renderResults();
        sendResponse({ status: "ok" });
      }
    });
  } else if (typeof browser !== "undefined" && browser.runtime) {
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      Logger.debug("Popup received message:", message);
      if (message.type === "KEYBOARD_SHORTCUT_OPEN") {
        Logger.debug("Handling keyboard shortcut open");
        handleKeyboardShortcut();
        sendResponse({ status: "ok" });
      } else if (message.type === "PING") {
        Logger.debug("Handling ping from background");
        sendResponse({ status: "ok" });
      } else if (message.type === "SETTINGS_CHANGED") {
        Logger.debug("Handling settings changed:", message.settings);
        Logger.debug("Re-rendering results after settings change");
        // Re-render results with new display mode
        renderResults();
        sendResponse({ status: "ok" });
      }
    });
  }

  // After a short delay, if no interaction, assume keyboard shortcut
  setTimeout(() => {
    if (!hasUserInteracted && results.length > 0) {
      handleKeyboardShortcut();
    }
  }, 100);
}
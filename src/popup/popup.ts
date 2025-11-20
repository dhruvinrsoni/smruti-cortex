// popup.ts — lightweight UI logic for SmrutiCortex popup
// Compiled by webpack to dist/popup/popup.js

import { BRAND_NAME } from "../core/constants";
import { Logger, LogLevel } from "../core/logger";

declare const browser: any;

// Initialize logger
(async function initPopup() {
  await Logger.init();
  Logger.info("Popup script initialized with log level:", LogLevel[Logger.getLevel()]);

  // Now continue with popup initialization
  await Logger.init();
  initializePopup();
})();

async function initializePopup() {
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
  const logLevelButtons = $("log-level-buttons") as HTMLDivElement;

  Logger.debug("Elements retrieved:", {
    input: !!input,
    resultsNode: !!resultsNode,
    resultCountNode: !!resultCountNode,
    logLevelButtons: !!logLevelButtons
  });

  if (!input || !resultsNode || !resultCountNode) {
    Logger.error("CRITICAL: Missing DOM elements!");
    Logger.error("Missing DOM elements! Check console for details.");
  } else {
    Logger.debug("All elements found, proceeding");
  }

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
            Logger.error("Runtime error in sendMessage:", chrome.runtime.lastError.message || chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message || 'Runtime error'));
            return;
          }
          resolve(resp);
        });
      } catch (e) {
        Logger.error("Send message error:", e);
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
      Logger.error("All search attempts failed, showing empty results");
      resp = { results: [] };
    }

    results = (resp && resp.results) ? resp.results : [];
    activeIndex = results.length ? 0 : -1;
    Logger.debug("Setting results:", results.length, "items");
    renderResults();
  }

  // Render results list
  function renderResults() {
    Logger.trace("renderResults called, results length:", results.length);
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

    Logger.debug("Rendering", results.length, "results");
    results.forEach((item, idx) => {
      Logger.trace("Rendering item", idx, item.title);
      const li = document.createElement("li");
      li.tabIndex = 0;
      li.dataset.index = String(idx);
      if (idx === activeIndex) li.classList.add("active");

      // favicon
      const fav = document.createElement("img");
      fav.className = "favicon";
      // use google favicon service for quick preview (works in extension popup)
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
    const lis = Array.from(resultsNode.querySelectorAll("li"));
    lis.forEach((li) => li.classList.remove("active"));
    const active = lis[activeIndex];
    if (active) {
      active.classList.add("active");
      active.scrollIntoView({ block: "nearest", behavior: "smooth" });
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

  // Log level buttons handler
  if (logLevelButtons) {
    // Function to update button states
    const updateButtonStates = () => {
      const currentLevel = Logger.getLevel();
      const buttons = logLevelButtons.querySelectorAll('.log-btn');
      buttons.forEach((btn, index) => {
        if (index === currentLevel) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    };

    // Initialize buttons with current level
    updateButtonStates();

    // Add click handlers to buttons
    logLevelButtons.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target.classList.contains('log-btn')) {
        const newLevel = parseInt(target.dataset.level || '2');
        Logger.setLevel(newLevel);
        updateButtonStates();
        Logger.debug("Log level changed to:", LogLevel[newLevel]);

        // Notify service worker of level change
        Logger.debug("[Popup] Sending SET_LOG_LEVEL", newLevel);
        sendMessage({ type: "SET_LOG_LEVEL", level: newLevel }).then(() => {
          Logger.debug("[Popup] SET_LOG_LEVEL sent successfully");
        }).catch((error) => {
          Logger.error("[Popup] SET_LOG_LEVEL send failed", error);
        });
      }
    });
  } else {
    Logger.error("Log level buttons not found");
  }

  // Focus the input on load
  Logger.debug("Adding window load event listener");
  window.addEventListener("load", async () => {
    Logger.debug("Window load event fired");

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
      const firstResult = resultsNode.querySelector("li");
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

  // Listen for keyboard shortcut message from background
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
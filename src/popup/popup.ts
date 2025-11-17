// popup.ts — lightweight UI logic for SmritiCortex popup
// Compiled by webpack to dist/popup/popup.js

declare const browser: any;

console.log("[DEBUG] Popup script starting execution");

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

// Debug toggle
let debugEnabled = false;

function debugLog(...args: any[]) {
  if (debugEnabled) {
    console.log("[DEBUG]", ...args);
  }
}

// Load debug setting from storage
if (typeof chrome !== "undefined" && chrome.storage) {
  chrome.storage.local.get(["debugEnabled"], (result) => {
    debugEnabled = result.debugEnabled || false;
    // Update the checkbox if it exists
    const debugToggle = document.getElementById("debug-toggle") as HTMLInputElement;
    if (debugToggle) {
      debugToggle.checked = debugEnabled;
    }
  });
}

// Helper
const $ = <T extends HTMLElement>(id: string) => {
  debugLog("Looking for element with id:", id);
  const el = document.getElementById(id) as T;
  debugLog("Element found:", el);
  return el;
};

console.log("[DEBUG] Helper function defined");

// Elements
console.log("[DEBUG] About to get elements");
const input = $("search-input") as HTMLInputElement;
const resultsNode = $("results") as HTMLUListElement;
const resultCountNode = $("result-count") as HTMLDivElement;

console.log("[DEBUG] Elements retrieved:", { input: !!input, resultsNode: !!resultsNode, resultCountNode: !!resultCountNode });
console.log("[DEBUG] Element details:", { input, resultsNode, resultCountNode });

if (!input || !resultsNode || !resultCountNode) {
  console.error("[DEBUG] CRITICAL: Missing DOM elements!");
  debugLog("[DEBUG] ERROR: Missing DOM elements! Check console.");
} else {
  console.log("[DEBUG] All elements found, proceeding");
}

let results: IndexedItem[] = [];
let activeIndex = -1;
let debounceTimer: number | undefined;

// Helper to send messages to background in a cross-browser safe way
function sendMessage(msg: any): Promise<any> {
  debugLog("sendMessage called with:", msg);
  return new Promise((resolve) => {
    debugLog("Creating promise for sendMessage");
    try {
      debugLog("Checking for chrome/browser runtime");
      const runtime = (typeof chrome !== "undefined" && chrome.runtime) ? chrome.runtime : (typeof browser !== "undefined" ? browser.runtime : null);
      debugLog("Runtime found:", !!runtime);
      if (!runtime || !runtime.sendMessage) {
        debugLog("No runtime API found, resolving with empty results");
        resolve({ results: [] });
        return;
      }
      debugLog("Calling runtime.sendMessage");
      runtime.sendMessage(msg, (resp: any) => {
        debugLog("Runtime sendMessage callback received:", resp);
        resolve(resp);
      });
    } catch (e) {
      console.error("[DEBUG] Send message error:", e);
      resolve({ results: [] });
    }
  });
}// Debounce helper
function debounceSearch(q: string) {
  debugLog("debounceSearch called with:", q);
  if (debounceTimer) {
    debugLog("Clearing existing timer");
    window.clearTimeout(debounceTimer);
  }
  debugLog("Setting new timer for doSearch");
  debounceTimer = window.setTimeout(() => {
    debugLog("Timer fired, calling doSearch");
    doSearch(q);
  }, 120);
}

// Do the actual search (ask background worker)
async function doSearch(q: string) {
  debugLog("doSearch called with:", q);
  if (!q || q.trim() === "") {
    debugLog("Query is empty, clearing results");
    results = [];
    renderResults();
    return;
  }
  debugLog("Query is valid, calling sendMessage");
  const resp = await sendMessage({ type: "SEARCH_QUERY", query: q });
  debugLog("Search response received:", resp);
  results = (resp && resp.results) ? resp.results : [];
  activeIndex = results.length ? 0 : -1;
  debugLog("Setting results:", results.length, "items");
  renderResults();
}

// Render results list
function renderResults() {
  debugLog("renderResults called, results length:", results.length);
  resultsNode.innerHTML = "";
  resultCountNode.textContent = `${results.length} result${results.length === 1 ? "" : "s"}`;

  if (results.length === 0) {
    debugLog("No results, showing empty message");
    const empty = document.createElement("div");
    empty.textContent = "No matches — try different keywords";
    empty.style.padding = "8px";
    empty.style.color = "#9aa4b2";
    resultsNode.appendChild(empty);
    return;
  }

  debugLog("Rendering", results.length, "results");
  results.forEach((item, idx) => {
    debugLog("Rendering item", idx, item.title);
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

  // quick markdown copy: key "m" or "M"
  if (e.key.toLowerCase() === "m") {
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
  console.log("[DEBUG] Adding input event listener");
  input.addEventListener("input", (ev) => {
    const q = (ev.target as HTMLInputElement).value;
    console.log("[DEBUG] Input event fired, query:", q);
    debounceSearch(q);
  });

  console.log("[DEBUG] Adding keydown event listener");
  input.addEventListener("keydown", (ev) => {
    console.log("[DEBUG] Keydown event fired, key:", ev.key);
    handleKeydown(ev);
  });
} else {
  console.log("[DEBUG] Input element not found, not adding listeners");
}

// Debug toggle handler
const debugToggle = document.getElementById("debug-toggle") as HTMLInputElement;
if (debugToggle) {
  debugToggle.addEventListener("change", () => {
    debugEnabled = debugToggle.checked;
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set({ debugEnabled });
    }
  });
}

// Focus the input on load
console.log("[DEBUG] Adding window load event listener");
window.addEventListener("load", () => {
  console.log("[DEBUG] Window load event fired");
  if (input) {
    console.log("[DEBUG] Focusing input");
    input.focus();
  } else {
    console.log("[DEBUG] Input not found, cannot focus");
  }
  // small initial query attempt: show nothing
  console.log("[DEBUG] Calling initial renderResults");
  renderResults();
});

// Handle keyboard shortcut opening - focus first result if available
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

// After a short delay, if no interaction, assume keyboard shortcut
setTimeout(() => {
  if (!hasUserInteracted && results.length > 0) {
    handleKeyboardShortcut();
  }
}, 100);
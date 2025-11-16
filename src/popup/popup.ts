// popup.ts — lightweight UI logic for SmritiCortex popup
// Compiled by webpack to dist/popup/popup.js

declare const browser: any;

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

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const input = $("search-input") as HTMLInputElement;
const resultsNode = $("results") as HTMLUListElement;
const resultCountNode = $("result-count") as HTMLDivElement;

let results: IndexedItem[] = [];
let activeIndex = -1;
let debounceTimer: number | undefined;

// Helper to send messages to background in a cross-browser safe way
function sendMessage(msg: any): Promise<any> {
  return new Promise((resolve) => {
    try {
      const runtime = (typeof chrome !== "undefined" && chrome.runtime) ? chrome.runtime : (typeof browser !== "undefined" ? browser.runtime : null);
      if (!runtime || !runtime.sendMessage) {
        resolve({ results: [] });
        return;
      }
      runtime.sendMessage(msg, (resp: any) => {
        resolve(resp);
      });
    } catch (e) {
      resolve({ results: [] });
    }
  });
}

// Debounce helper
function debounceSearch(q: string) {
  if (debounceTimer) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    doSearch(q);
  }, 120);
}

// Do the actual search (ask background worker)
async function doSearch(q: string) {
  if (!q || q.trim() === "") {
    results = [];
    renderResults();
    return;
  }
  const resp = await sendMessage({ type: "SEARCH_QUERY", query: q });
  results = (resp && resp.results) ? resp.results : [];
  activeIndex = results.length ? 0 : -1;
  renderResults();
}

// Render results list
function renderResults() {
  resultsNode.innerHTML = "";
  resultCountNode.textContent = `${results.length} result${results.length === 1 ? "" : "s"}`;

  if (results.length === 0) {
    const empty = document.createElement("div");
    empty.textContent = "No matches — try different keywords";
    empty.style.padding = "8px";
    empty.style.color = "#9aa4b2";
    resultsNode.appendChild(empty);
    return;
  }

  results.forEach((item, idx) => {
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
input.addEventListener("input", (ev) => {
  const q = (ev.target as HTMLInputElement).value;
  debounceSearch(q);
});

input.addEventListener("keydown", (ev) => {
  handleKeydown(ev);
});

// Focus the input on load
window.addEventListener("load", () => {
  input.focus();
  // small initial query attempt: show nothing
  renderResults();
});
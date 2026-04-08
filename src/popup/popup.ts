// popup.ts — ultra-fast UI logic for SmrutiCortex popup
// Compiled to dist/popup/popup.js
// PERFORMANCE: This file is optimized for instant popup display
// ARCHITECTURE: Uses shared search-ui-base.ts for DRY compliance

import { BRAND_NAME } from '../core/constants'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { Logger, LogLevel, ComponentLogger } from '../core/logger'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { SettingsManager, DisplayMode } from '../core/settings';
import { SearchDebugEntry } from '../background/diagnostics';
import { IndexedItem } from '../background/schema';
import { addRecentSearch, getRecentSearches, clearRecentSearches } from '../shared/recent-searches';
import { addRecentInteraction, getRecentInteractions, clearRecentInteractions } from '../shared/recent-interactions';
import { POPUP_TOUR_STEPS, runTour, isTourCompleted } from '../shared/tour';
import { TOOLBAR_TOGGLE_DEFS, getToggleDef, getCycleState, getNextCycleValue } from '../shared/toolbar-toggles';
import {
  type PaletteCommand,
  ALL_COMMANDS,
  preparePaletteCommandList,
  getPowerSettingsPatch,
  getAvailableCommands,
  getCycleValueFromCommand,
  saveRecentCommand,
  getWebSearchPrefixHintLines,
  getWebSearchEngineDisplayName,
  formatPaletteCategoryHeader,
  parseWebSearchQuery,
  buildWebSearchUrl,
  webSearchSiteUrlToastMessage,
  webSearchSiteUrlPreviewLabel,
} from '../shared/command-registry';
import {
  formatPaletteDiagnosticToast,
  isPaletteDiagnosticMessageType,
  PALETTE_DIAGNOSTIC_TOAST_MS,
} from '../shared/palette-messages';
import { wireHideImgOnError } from '../shared/hide-img-on-error';
import type { AppSettings } from '../core/settings';
import {
  type SearchResult,
  type FocusableGroup,
  type AIStatus,
  createMarkdownLink,
  copyHtmlLinkToClipboard,
  handleCyclicTabNavigation,
  openUrl,
  parseKeyboardAction, // eslint-disable-line @typescript-eslint/no-unused-vars
  KeyboardAction, // eslint-disable-line @typescript-eslint/no-unused-vars
  sortResults,
  escapeHtml,
  tokenizeQuery,
  highlightHtml,
  renderAIStatus as renderAIStatusShared,
} from '../shared/search-ui-base';

// Lazy-loaded imports for non-critical features
let tokenize: ((query: string) => string[]) | null = null;
let clearIndexedDB: (() => Promise<void>) | null = null;

// Load tokenize lazily when needed
async function getTokenize(): Promise<(query: string) => string[]> { // eslint-disable-line @typescript-eslint/no-unused-vars
  if (!tokenize) {
    const mod = await import('../background/search/tokenizer');
    tokenize = mod.tokenize;
  }
  return tokenize;
}

// Load clearIndexedDB lazily when needed (only for settings clear button)
async function getClearIndexedDB(): Promise<() => Promise<void>> { // eslint-disable-line @typescript-eslint/no-unused-vars
  if (!clearIndexedDB) {
    const mod = await import('../background/database');
    clearIndexedDB = mod.clearIndexedDB;
  }
  return clearIndexedDB;
}

declare const browser: typeof chrome | undefined;

type ToastType = 'success' | 'error' | 'warning' | 'info';
const TOAST_COLORS: Record<ToastType, string> = {
  success: '#10b981',
  error:   '#ef4444',
  warning: '#f59e0b',
  info:    '#3b82f6',
};

function showToast(message: string, type: ToastType = 'success', durationMs = 5000) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: 12px;
    left: 50%;
    transform: translateX(-50%) translateY(-8px);
    background: ${TOAST_COLORS[type]};
    color: white;
    padding: 10px 20px;
    border-radius: 8px;
    z-index: 10000;
    font-size: 13px;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    opacity: 0;
    transition: opacity 0.25s, transform 0.25s;
    pointer-events: auto;
    white-space: normal;
    max-width: 90%;
    word-break: break-word;
    user-select: text;
    cursor: default;
  `;
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });

  let hovered = false;
  let dismissTimer: ReturnType<typeof setTimeout>;

  function startDismiss() {
    dismissTimer = setTimeout(() => {
      if (hovered) {return;}
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(-8px)';
      setTimeout(() => toast.remove(), 250);
    }, durationMs);
  }

  toast.addEventListener('mouseenter', () => {
    hovered = true;
    clearTimeout(dismissTimer);
  });
  toast.addEventListener('mouseleave', () => {
    hovered = false;
    startDismiss();
  });

  startDismiss();
}

// Fast initialization - prioritize speed over logging
let logger: ComponentLogger;
let settingsManager: typeof SettingsManager; // eslint-disable-line @typescript-eslint/no-unused-vars

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
} catch {
  // Ignore timing errors - not critical
}

// Global variables for event setup
let debounceSearch: (q: string) => void;
let handleKeydown: (e: KeyboardEvent) => void;
let results: SearchResult[]; // eslint-disable-line @typescript-eslint/no-unused-vars
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
  const resultCountNode = $('result-count') as HTMLDivElement; // eslint-disable-line @typescript-eslint/no-unused-vars
  const settingsButton = $('settings-button') as HTMLButtonElement;
  const sortBySelect = $('sort-by') as HTMLSelectElement; // eslint-disable-line @typescript-eslint/no-unused-vars

  // Make results container focusable for keyboard navigation
  // Removed - individual result items should be focusable instead

  if (input) {
    input.addEventListener('input', (ev) => debounceSearch((ev.target as HTMLInputElement).value));
    input.addEventListener('keydown', handleKeydown);
  }

  const clearBtn = $('clear-input') as HTMLButtonElement | null;
  if (clearBtn && input) {
    clearBtn.addEventListener('click', () => {
      input.value = '';
      input.dispatchEvent(new Event('input'));
      input.focus();
    });
  }
  
  // Note: Sort dropdown handler is initialized in initializePopup() where resultsLocal is in scope

  if (resultsNode) {
    // Redirect vertical wheel scroll to horizontal in card view
    resultsNode.addEventListener('wheel', (e) => {
      const displayMode = SettingsManager.getSetting('displayMode') || DisplayMode.LIST;
      if (displayMode === DisplayMode.CARDS && !e.shiftKey) {
        const delta = e.deltaY || e.deltaX;
        if (delta !== 0) {
          e.preventDefault();
          resultsNode.scrollLeft += delta;
        }
      }
    }, { passive: false });
  }

  if (settingsButton) {
    settingsButton.addEventListener('keydown', handleKeydown);
    settingsButton.addEventListener('click', openSettingsPage);
  }

  // Tour/Help button — runs in-extension tour
  const tourButton = $('tour-button') as HTMLButtonElement;
  if (tourButton) {
    tourButton.addEventListener('click', () => {
      runTour(POPUP_TOUR_STEPS, document);
    });
  }

  // Settings modal tour link
  const settingsTourLink = document.getElementById('settings-tour-link');
  if (settingsTourLink) {
    settingsTourLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'https://dhruvinrsoni.github.io/smruti-cortex/feature-tour.html' });
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

  // Fast DOM access without logging
  const $local = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

  // Assign global $
  $ = $local;

  // Get elements immediately
  const input = $local('search-input') as HTMLInputElement;
  const resultsNode = $local('results') as HTMLUListElement;
  const resultCountNode = $local('result-count') as HTMLDivElement;
  const popupSpinner = $local('search-spinner') as HTMLDivElement | null;
  const aiStatusBarEl = $local('ai-status-bar') as HTMLDivElement | null;
  const settingsButton = $local('settings-button') as HTMLButtonElement; // eslint-disable-line @typescript-eslint/no-unused-vars

  let resultsLocal: IndexedItem[] = [];
  let activeIndex = -1;
  let debounceTimer: number | undefined;
  let focusTimer: number | undefined;  // Delayed focus shift to results (cancelled on new typing)
  let serviceWorkerReady = false;
  let currentQuery = '';
  let currentAIExpandedKeywords: string[] = [];
  let aiDebounceTimer: number | undefined;
  let aiSearchPending = false; // True from debounceSearch until Phase 2 response arrives

  // Assign global results
  results = resultsLocal;

  // Highlight matching parts in text (HTML-safe, uses shared core logic)
  function highlightMatches(text: string, query: string, aiKeywords: string[] = []): string {
    if (!SettingsManager.getSetting('highlightMatches')) {
      return escapeHtml(text);
    }
    return highlightHtml(
      text,
      query.trim() ? tokenizeQuery(query) : [],
      aiKeywords,
      m => `<mark>${m}</mark>`,
      m => `<mark class="ai">${m}</mark>`
    );
  }

  // Thin wrapper — delegates to shared renderAIStatus with this popup's container
  function renderAIStatus(aiStatus: AIStatus | null | undefined): void {
    try {
      renderAIStatusShared(aiStatusBarEl, aiStatus);
    } catch (err) {
      console.error('[SmrutiCortex] renderAIStatus error:', err);
    }
  }

  /**
   * Focus input with configurable select behavior
   * If selectAllOnFocus setting is true (default), select all text for fresh typing
   * If false, just place cursor at end
   */
  function focusInputWithSelectBehavior() {
    if (!input) {return;}
    input.focus();
    const selectAll = SettingsManager.getSetting('selectAllOnFocus') ?? false;
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
    } catch {
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

  // --- Toggle Chip Bar ---
  const toggleBarEl = $local('toggle-bar') as HTMLDivElement | null;

  function renderToggleBar() {
    if (!toggleBarEl) {return;}
    toggleBarEl.innerHTML = '';
    const visibleKeys = SettingsManager.getSetting('toolbarToggles') ?? ['ollamaEnabled', 'indexBookmarks', 'showDuplicateUrls'];
    for (const key of visibleKeys) {
      const def = getToggleDef(key);
      if (!def) {continue;}

      const chip = document.createElement('button');
      chip.className = 'toggle-chip';
      chip.dataset.toggleKey = key;
      chip.type = 'button';

      chip.addEventListener('click', () => {
        if (def.type === 'boolean') {
          const cur = SettingsManager.getSetting(def.key) as boolean;
          SettingsManager.setSetting(def.key, !cur as AppSettings[typeof def.key]).catch(() => {});
        } else if (def.type === 'cycle') {
          const cur = SettingsManager.getSetting(def.key);
          const next = getNextCycleValue(def, cur);
          SettingsManager.setSetting(def.key, next as AppSettings[typeof def.key]).catch(() => {});
        }
        applyPopupSettingSideEffects(def.key);
        if (def.key !== 'displayMode' && def.key !== 'highlightMatches' && def.key !== 'loadFavicons') {
          if (currentQuery?.trim()) {
            debounceSearch(currentQuery);
          } else if (def.key !== 'showRecentHistory' && def.key !== 'showRecentSearches') {
            loadRecentHistory();
          }
        }
      });

      toggleBarEl.appendChild(chip);
    }
    syncToggleBar();
  }

  function syncToggleBar() {
    if (!toggleBarEl) {return;}
    const chips = toggleBarEl.querySelectorAll<HTMLButtonElement>('.toggle-chip');
    chips.forEach(chip => {
      const key = chip.dataset.toggleKey as keyof AppSettings;
      if (!key) {return;}
      const def = getToggleDef(key);
      if (!def) {return;}

      const val = SettingsManager.getSetting(key);

      if (def.type === 'boolean') {
        const isActive = Boolean(val);
        chip.classList.toggle('active', isActive);
        chip.title = isActive ? def.tooltipOn : def.tooltipOff;
        chip.innerHTML = `<span class="chip-icon">${def.icon}</span>${def.label}`;
      } else if (def.type === 'cycle') {
        const cs = getCycleState(def, val);
        chip.classList.add('active');
        chip.title = `${def.tooltipOn.replace(/:.+$/, '')}: ${cs?.label ?? String(val)}`;
        chip.innerHTML = `<span class="chip-icon">${cs?.icon ?? def.icon}</span>${cs?.label ?? def.label}`;
      }
    });
  }

  // Pre-render empty state immediately
  renderResults();
  
  // Render toggle bar after settings init
  SettingsManager.init().then(() => renderToggleBar());

  // Load recent history on popup open (show default results)
  loadRecentHistory();
  
  // Sort dropdown event handler (must be after resultsLocal is declared)
  const sortBySelect = $local('sort-by') as HTMLSelectElement;
  if (sortBySelect) {
    // Load saved sort setting
    const savedSort = SettingsManager.getSetting('sortBy') || 'best-match';
    sortBySelect.value = savedSort;
    
    // Handle sort change
    sortBySelect.addEventListener('change', () => {
      const newSort = sortBySelect.value;
      SettingsManager.setSetting('sortBy', newSort).catch(() => {});
      
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
    } catch {
      return false;
    }
  }

  // Smart debounce - wait for user to stop typing before searching
  // Two-phase: Phase 1 (150ms) = instant non-AI results, Phase 2 (500ms) = AI expansion
  // Note: This is intentionally separate from focusDelayMs (which controls result auto-focus)
  function syncClearButton() {
    const btn = $('clear-input');
    const inp = $('search-input') as HTMLInputElement | null;
    if (btn) { btn.classList.toggle('visible', (inp?.value?.length ?? 0) > 0); }
  }

  // Popup command palette state
  type PopupPaletteMode = 'history' | 'commands' | 'power' | 'tabs' | 'bookmarks' | 'websearch' | 'help';
  let popupPaletteMode: PopupPaletteMode = 'history';
  let popupSelectedIndex = 0;
  let popupConfirmingCommand: PaletteCommand | null = null;
  let popupWindowPickerActive = false;

  function getPopupPaletteSelectableRows(): HTMLElement[] {
    const list = $local('results') as HTMLUListElement | null;
    if (!list) {return [];}
    return Array.from(list.querySelectorAll('.palette-selectable-row')) as HTMLElement[];
  }

  function applyPopupPaletteRowHighlight(): void {
    const rows = getPopupPaletteSelectableRows();
    const n = rows.length;
    if (n === 0) {return;}
    if (popupSelectedIndex < 0 || popupSelectedIndex >= n) {
      popupSelectedIndex = 0;
    }
    rows.forEach((el, i) => {
      el.style.background = i === popupSelectedIndex ? 'var(--hover)' : 'var(--card)';
    });
    rows[popupSelectedIndex]?.scrollIntoView({ block: 'nearest' });
  }

  function handlePopupPaletteArrow(direction: 'up' | 'down'): void {
    const rows = getPopupPaletteSelectableRows();
    if (rows.length === 0) {return;}
    if (direction === 'down') {
      popupSelectedIndex = (popupSelectedIndex + 1) % rows.length;
    } else {
      popupSelectedIndex = (popupSelectedIndex - 1 + rows.length) % rows.length;
    }
    applyPopupPaletteRowHighlight();
  }

  function focusPopupPaletteRowAt(index: number): void {
    const rows = getPopupPaletteSelectableRows();
    const el = rows[index];
    if (el) {
      try { el.focus(); } catch { /* ignore */ }
    }
  }

  function detectPopupMode(value: string): { mode: PopupPaletteMode; query: string } {
    const cpEnabled = SettingsManager.getSetting('commandPaletteEnabled') ?? true;
    const cpInPopup = SettingsManager.getSetting('commandPaletteInPopup') ?? false;
    const cpModes = SettingsManager.getSetting('commandPaletteModes') ?? ['/', '>', '@', '#', '??'];

    if (!cpEnabled || !cpInPopup || !value) {return { mode: 'history', query: value };}
    if (value === '?') {return { mode: 'help', query: '' };}
    if (value.startsWith('??') && cpModes.includes('??')) {return { mode: 'websearch', query: value.slice(2).trim() };}

    const prefixMap: Record<string, PopupPaletteMode> = { '/': 'commands', '>': 'power', '@': 'tabs', '#': 'bookmarks' };
    const first = value[0];
    if (prefixMap[first] && cpModes.includes(first)) {return { mode: prefixMap[first], query: value.slice(1).trim() };}

    return { mode: 'history', query: value };
  }

  function renderPopupHelpScreen(): void {
    const resultsList = $('results') as HTMLUListElement;
    if (!resultsList) {return;}

    popupSelectedIndex = -1;
    resultsList.innerHTML = '';
    resultsList.className = 'results list';

    const cpModes = SettingsManager.getSetting('commandPaletteModes') ?? ['/', '>', '@', '#', '??'];

    const modes = [
      { prefix: '/',  label: 'Commands',      desc: 'Toggle settings, page actions, navigation' },
      { prefix: '>',  label: 'Power / Admin',  desc: 'Index management, diagnostics, data export' },
      { prefix: '@',  label: 'Tab Switcher',   desc: 'Search & switch open tabs, reopen closed' },
      { prefix: '#',  label: 'Bookmarks',      desc: 'Recent bookmarks when empty; type to search all' },
      { prefix: '??', label: 'Web Search',     desc: 'Default engine + optional prefix (g, d, …) then query' },
    ];

    modes.forEach(m => {
      const enabled = cpModes.includes(m.prefix);
      const li = document.createElement('li');
      li.style.cssText = `display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:6px;cursor:pointer;border:1px solid transparent;background:var(--card);${!enabled ? 'opacity:0.4;' : ''}`;
      li.innerHTML = `
        <span style="font-family:ui-monospace,SFMono-Regular,monospace;font-size:14px;font-weight:700;color:var(--accent,#3b82f6);width:28px;text-align:center;">${m.prefix}</span>
        <span style="flex:1;font-size:13px;font-weight:500;">${m.label}${!enabled ? ' <span style="font-size:10px;color:var(--muted);">[disabled]</span>' : ''}</span>
        <span style="font-size:9px;color:var(--muted);">${m.desc}</span>
      `;
      if (enabled) {
        li.addEventListener('click', () => {
          const input = $('search-input') as HTMLInputElement;
          if (input) {
            input.value = m.prefix;
            input.dispatchEvent(new Event('input'));
            input.focus();
          }
        });
      }
      resultsList.appendChild(li);
    });

    const divider = document.createElement('li');
    divider.style.cssText = 'padding:6px 12px;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted);cursor:default;border-top:1px solid var(--border,#e5e7eb);margin-top:4px;';
    divider.textContent = 'Tips';
    resultsList.appendChild(divider);

    const tips = [
      { icon: '⌨️', label: 'Keyboard Shortcut', desc: 'Ctrl+Shift+S to open quick-search' },
      { icon: '🔍', label: 'Omnibox', desc: 'Type "sc " in the address bar' },
      { icon: '🎯', label: 'Guided Tour', desc: 'Type /tour to start the interactive tour' },
    ];

    tips.forEach(t => {
      const li = document.createElement('li');
      li.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:6px;border:1px solid transparent;background:var(--card);cursor:default;';
      li.innerHTML = `
        <span style="font-size:16px;width:24px;text-align:center;">${t.icon}</span>
        <span style="flex:1;font-size:13px;font-weight:500;">${t.label}</span>
        <span style="font-size:9px;color:var(--muted);">${t.desc}</span>
      `;
      resultsList.appendChild(li);
    });

    resultCountNode.textContent = '';
  }

  function renderPopupPaletteResults(mode: PopupPaletteMode, query: string): void {
    const resultsList = $('results') as HTMLUListElement;
    if (!resultsList) {return;}

    popupWindowPickerActive = false;
    popupSelectedIndex = 0;
    resultsList.innerHTML = '';
    resultsList.className = 'results list';

    if (mode === 'commands' || mode === 'power') {
      const tier = mode === 'power' ? 'power' as const : 'everyday' as const;
      const settings = SettingsManager.getSettings();
      const commands = getAvailableCommands(tier, settings);

      const displayList = preparePaletteCommandList(tier, query, commands, settings);

      resultCountNode.textContent = `${displayList.length} command${displayList.length !== 1 ? 's' : ''}`;
      if (displayList.length === 0) {
        resultsList.innerHTML = '<li style="text-align:center;padding:24px;color:var(--muted);">No matching commands</li>';
        return;
      }

      const rowBaseStyle = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:6px;cursor:pointer;border:1px solid transparent;background:var(--card);';
      const emptyQuery = !query.trim();
      if (emptyQuery) {
        const tip = document.createElement('li');
        tip.style.cssText = 'list-style:none;padding:8px 12px;font-size:12px;color:var(--muted);line-height:1.35;cursor:default;';
        tip.setAttribute('role', 'presentation');
        tip.textContent = tier === 'power'
          ? 'Tabs, data, AI, diagnostics, presets — type to filter.'
          : 'Toggles, sort, page actions, navigation, tabs — type to filter.';
        resultsList.appendChild(tip);
      }

      let lastCategory = '';
      displayList.forEach((cmd, idx) => {
        if (emptyQuery && cmd.category !== lastCategory) {
          lastCategory = cmd.category;
          const h = document.createElement('li');
          h.style.cssText = 'list-style:none;padding:6px 12px 4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);cursor:default;';
          h.setAttribute('role', 'presentation');
          h.textContent = formatPaletteCategoryHeader(cmd.category, tier);
          resultsList.appendChild(h);
        }

        const li = document.createElement('li');
        li.className = 'palette-selectable-row';
        li.tabIndex = 0;
        li.style.cssText = rowBaseStyle;

        const currentLabel = getPopupCurrentLabel(cmd);
        const hintBlock = cmd.hint
          ? `<div style="font-size:11px;color:var(--muted);line-height:1.25;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(cmd.hint)}</div>`
          : '';
        li.innerHTML = `
          <span style="font-size:16px;width:24px;text-align:center;flex-shrink:0;">${cmd.icon}</span>
          <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;">
            <span style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${cmd.label}${currentLabel ? ` <span style="font-size:10px;color:var(--accent,#3b82f6);font-weight:600;">[${currentLabel}]</span>` : ''}</span>
            ${hintBlock}
          </div>
          <span style="font-size:9px;text-transform:uppercase;color:var(--muted);background:var(--chip);padding:1px 6px;border-radius:3px;flex-shrink:0;">${cmd.category}</span>
          ${cmd.dangerous ? '<span>⚠️</span>' : ''}
          ${cmd.shortcut ? `<span style="font-size:9px;color:var(--muted);background:var(--chip);padding:1px 5px;border-radius:3px;">${cmd.shortcut}</span>` : ''}
        `;

        li.addEventListener('click', () => {
          popupSelectedIndex = idx;
          executePopupCommand(cmd);
        });
        li.addEventListener('mouseenter', () => {
          popupSelectedIndex = idx;
          applyPopupPaletteRowHighlight();
        });
        resultsList.appendChild(li);
      });
      applyPopupPaletteRowHighlight();
      return;
    }

    if (mode === 'tabs') {
      resultCountNode.textContent = 'Loading tabs...';
      sendMessage({ type: 'GET_OPEN_TABS' }).then((resp: { tabs?: chrome.tabs.Tab[] }) => {
        if (!resp?.tabs) { resultCountNode.textContent = '0 tabs'; return; }
        const tabs = query
          ? resp.tabs.filter(t => t.title?.toLowerCase().includes(query.toLowerCase()) || t.url?.toLowerCase().includes(query.toLowerCase()))
          : resp.tabs;
        resultCountNode.textContent = `${tabs.length} tab${tabs.length !== 1 ? 's' : ''}`;
        resultsList.innerHTML = '';
        const hint = document.createElement('li');
        hint.style.cssText = 'list-style:none;padding:8px 12px;font-size:12px;color:var(--muted);line-height:1.35;cursor:default;';
        hint.setAttribute('role', 'presentation');
        hint.textContent = 'Enter: switch tab · Shift+Enter: open URL in background.';
        resultsList.appendChild(hint);
        tabs.forEach((tab, idx) => {
          const li = document.createElement('li');
          li.className = 'palette-selectable-row';
          li.tabIndex = 0;
          li.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:6px;cursor:pointer;background:var(--card);';
          if (typeof tab.id === 'number') {
            li.dataset.tabId = String(tab.id);
          }
          if (typeof tab.windowId === 'number') {
            li.dataset.windowId = String(tab.windowId);
          }
          if (tab.url) {
            li.dataset.tabUrl = tab.url;
          }
          const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          li.innerHTML = `
            <img src="${tab.favIconUrl || ''}" alt="" style="width:16px;height:16px;border-radius:3px;">
            <div style="flex:1;overflow:hidden;">
              <div style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(tab.title || 'Untitled')}</div>
              <div style="font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(tab.url || '')}</div>
            </div>
            ${tab.pinned ? '<span>📌</span>' : ''}${tab.active ? '<span>●</span>' : ''}
          `;
          wireHideImgOnError(li.querySelector('img'));
          li.addEventListener('click', (ev) => {
            const sk = (ev as MouseEvent).shiftKey;
            const url = tab.url || '';
            if (sk && url) {
              chrome.tabs.create({ url, active: false });
            } else if (typeof tab.id === 'number' && typeof tab.windowId === 'number') {
              void sendMessage({ type: 'SWITCH_TO_TAB', tabId: tab.id, windowId: tab.windowId });
            }
          });
          li.addEventListener('mouseenter', () => {
            popupSelectedIndex = idx;
            applyPopupPaletteRowHighlight();
          });
          resultsList.appendChild(li);
        });
        applyPopupPaletteRowHighlight();
      }).catch(() => { resultCountNode.textContent = 'Error loading tabs'; });
      return;
    }

    if (mode === 'bookmarks') {
      resultCountNode.textContent = 'Searching bookmarks...';
      const msgType = query ? 'SEARCH_BOOKMARKS' : 'GET_RECENT_BOOKMARKS';
      const payload = query ? { type: msgType, query } : { type: msgType };
      sendMessage(payload).then((resp: { bookmarks?: chrome.bookmarks.BookmarkTreeNode[] }) => {
        if (!resp?.bookmarks) { resultCountNode.textContent = '0 bookmarks'; return; }
        const bms = resp.bookmarks.filter(b => b.url);
        resultCountNode.textContent = `${bms.length} bookmark${bms.length !== 1 ? 's' : ''}`;
        resultsList.innerHTML = '';
        if (!query.trim() && bms.length > 0) {
          const header = document.createElement('li');
          header.style.cssText = 'list-style:none;padding:6px 12px 4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);cursor:default;';
          header.setAttribute('role', 'presentation');
          header.textContent = 'Recent bookmarks';
          resultsList.appendChild(header);
          const tip = document.createElement('li');
          tip.style.cssText = 'list-style:none;padding:8px 12px;font-size:12px;color:var(--muted);line-height:1.35;cursor:default;';
          tip.setAttribute('role', 'presentation');
          tip.textContent = 'Type to search all bookmarks by title or URL.';
          resultsList.appendChild(tip);
        }
        bms.forEach((bm, idx) => {
          const li = document.createElement('li');
          li.className = 'palette-selectable-row';
          li.tabIndex = 0;
          li.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:6px;cursor:pointer;background:var(--card);';
          if (bm.url) {
            li.dataset.bookmarkUrl = bm.url;
          }
          const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          li.innerHTML = `
            <img src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(bm.url!).hostname)}&sz=16" alt="" style="width:16px;height:16px;border-radius:3px;">
            <div style="flex:1;overflow:hidden;">
              <div style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(bm.title || 'Untitled')}</div>
              <div style="font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(bm.url || '')}</div>
            </div>
          `;
          wireHideImgOnError(li.querySelector('img'));
          li.addEventListener('click', (ev) => {
            const sk = (ev as MouseEvent).shiftKey;
            chrome.tabs.create({ url: bm.url!, active: !sk });
          });
          li.addEventListener('mouseenter', () => {
            popupSelectedIndex = idx;
            applyPopupPaletteRowHighlight();
          });
          resultsList.appendChild(li);
        });
        applyPopupPaletteRowHighlight();
      }).catch(() => { resultCountNode.textContent = 'Error'; });
      return;
    }

    if (mode === 'websearch') {
      if (!query) {
        resultsList.innerHTML = '';
        const defaultKey = SettingsManager.getSetting('webSearchEngine') ?? 'google';
        const intro = document.createElement('li');
        intro.style.cssText = 'list-style:none;padding:8px 12px;font-size:12px;color:var(--muted);line-height:1.35;cursor:default;';
        intro.setAttribute('role', 'presentation');
        intro.textContent = `Default engine: ${getWebSearchEngineDisplayName(defaultKey)} (change in settings). Type a query, then Enter. For Jira and Confluence, set each site URL in settings.`;
        resultsList.appendChild(intro);
        const prefixTitle = document.createElement('li');
        prefixTitle.style.cssText = 'list-style:none;padding:6px 12px 4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);cursor:default;';
        prefixTitle.setAttribute('role', 'presentation');
        prefixTitle.textContent = 'Prefix + space + query';
        resultsList.appendChild(prefixTitle);
        const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        for (const line of getWebSearchPrefixHintLines()) {
          const row = document.createElement('li');
          row.style.cssText = 'list-style:none;padding:5px 12px 5px 16px;font-size:11px;color:var(--muted);line-height:1.4;cursor:default;';
          row.setAttribute('role', 'presentation');
          row.innerHTML = `<code style='font-family:ui-monospace,monospace;font-size:10px;background:var(--chip);padding:1px 5px;border-radius:3px'>?? ${esc(line.prefix)}</code> — ${esc(line.engineLabel)} <span style='opacity:0.85'>(e.g. <code style='font-family:ui-monospace,monospace;font-size:10px;background:var(--chip);padding:1px 5px;border-radius:3px'>?? ${esc(line.prefix)} cats</code>)</span>`;
          resultsList.appendChild(row);
        }
        resultCountNode.textContent = '';
        return;
      }
      const defaultKey = SettingsManager.getSetting('webSearchEngine') ?? 'google';
      const settings = SettingsManager.getSettings();
      const parsed = parseWebSearchQuery(query, defaultKey);
      const engineName = getWebSearchEngineDisplayName(parsed.engineKey);
      const jiraOrigin = (settings.jiraSiteUrl ?? '').trim();
      const confluenceOrigin = (settings.confluenceSiteUrl ?? '').trim();
      const missingSiteForEngine =
        (parsed.engineKey === 'jira' && !jiraOrigin)
        || (parsed.engineKey === 'confluence' && !confluenceOrigin);
      const built = buildWebSearchUrl(parsed, settings);
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      const li = document.createElement('li');
      li.className = 'palette-selectable-row';
      li.tabIndex = 0;
      li.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:6px;cursor:pointer;background:var(--hover);';

      if (parsed.usedPrefix && parsed.searchTerms === '') {
        const mp = parsed.matchedPrefix ?? '';
        if (missingSiteForEngine) {
          const siteHint = parsed.engineKey === 'jira' ? 'Jira' : 'Confluence';
          li.innerHTML = `
            <span style="font-size:16px;">🔍</span>
            <span style="flex:1;font-size:13px;font-weight:500;">${esc(engineName)} — set ${siteHint} site URL in settings, then add terms (e.g. ?? ${esc(mp)} PROJ-1)</span>
            <span style="font-size:10px;color:var(--muted);">Enter: n/a</span>
          `;
          li.addEventListener('click', () => {
            showToast(
              webSearchSiteUrlToastMessage(parsed.engineKey === 'jira' ? 'no-jira-site' : 'no-confluence-site'),
              'warning',
            );
          });
        } else {
          li.innerHTML = `
            <span style="font-size:16px;">🔍</span>
            <span style="flex:1;font-size:13px;font-weight:500;">${esc(engineName)} — type terms after a space (e.g. ?? ${esc(mp)} query)</span>
            <span style="font-size:10px;color:var(--muted);">Enter: n/a</span>
          `;
          li.addEventListener('click', () => {
            showToast('Add search text after the prefix.', 'info');
          });
        }
      } else if ('error' in built) {
        const msg =
          built.error === 'no-jira-site' || built.error === 'no-confluence-site'
            ? webSearchSiteUrlPreviewLabel(built.error, engineName)
            : 'Cannot open search';
        li.innerHTML = `
          <span style="font-size:16px;">🔍</span>
          <span style="flex:1;font-size:13px;font-weight:500;">${esc(msg)}</span>
          <span style="font-size:10px;color:var(--muted);">Enter: n/a</span>
        `;
        li.addEventListener('click', () => {
          if (built.error === 'no-jira-site' || built.error === 'no-confluence-site') {
            showToast(webSearchSiteUrlToastMessage(built.error), 'warning');
          } else {
            showToast('Add search text after the prefix.', 'info');
          }
        });
      } else {
        li.innerHTML = `
          <span style="font-size:16px;">🔍</span>
          <span style="flex:1;font-size:13px;font-weight:500;">Search ${esc(engineName)} for "${esc(parsed.searchTerms)}"</span>
          <span style="font-size:10px;color:var(--muted);">Enter to search</span>
        `;
        li.addEventListener('click', (ev) => {
          const sk = (ev as MouseEvent).shiftKey;
          chrome.tabs.create({ url: built.url, active: !sk });
        });
      }
      resultsList.appendChild(li);
      popupSelectedIndex = 0;
      applyPopupPaletteRowHighlight();
      resultCountNode.textContent = '';
      return;
    }
  }

  function getPopupCurrentLabel(cmd: PaletteCommand): string | null {
    const settings = SettingsManager.getSettings();
    if (cmd.action === 'toggle-boolean' && cmd.settingKey) {return settings[cmd.settingKey] ? 'ON' : 'OFF';}
    if (cmd.action === 'sub-command' && cmd.cycleValues && cmd.settingKey) {
      const current = String(settings[cmd.settingKey]);
      const match = cmd.cycleValues.find(cv => cv.value === current);
      return match?.label ?? null;
    }
    if (cmd.action === 'cycle' && cmd.settingKey) {
      const parent = ALL_COMMANDS.find(c => c.subCommands?.some(sub => sub.id === cmd.id));
      if (parent?.cycleValues) {
        const current = String(settings[parent.settingKey!]);
        const thisValue = getCycleValueFromCommand(cmd);
        return String(thisValue) === current ? 'current' : null;
      }
    }
    return null;
  }

  function applyPopupSettingSideEffects(key: string): void {
    syncToggleBar();
    if (key === 'theme') {
      applyTheme((SettingsManager.getSetting('theme') ?? 'auto') as 'light' | 'dark' | 'auto');
    }
    if (key === 'displayMode' || key === 'highlightMatches' || key === 'loadFavicons') {
      renderResults();
    }
    if (key === 'showRecentHistory' || key === 'showRecentSearches') {
      if (!currentQuery?.trim()) { loadRecentHistory(); }
    }
    if (key === 'maxResults' || key === 'defaultResultCount') {
      if (!currentQuery?.trim()) { loadRecentHistory(); }
    }
    if ((key === 'jiraSiteUrl' || key === 'confluenceSiteUrl') && popupPaletteMode === 'websearch') {
      const input = $('search-input') as HTMLInputElement;
      if (input) {
        const { query } = detectPopupMode(input.value.trim());
        renderPopupPaletteResults('websearch', query);
      }
    }
  }

  interface WindowInfo {
    id: number;
    tabCount: number;
    activeTabTitle: string;
    activeTabFavicon: string;
    isCurrent: boolean;
  }

  async function showWindowPicker(): Promise<void> {
    const resultsList = $('results') as HTMLUListElement;
    const resultCountNode = $('result-count') as HTMLDivElement;
    if (!resultsList) { return; }

    popupWindowPickerActive = true;
    resultsList.innerHTML = '';
    if (resultCountNode) { resultCountNode.textContent = 'Loading windows...'; }

    let resp: { windows?: WindowInfo[] };
    try {
      resp = await sendMessage({ type: 'GET_WINDOWS' }) as { windows?: WindowInfo[] };
    } catch {
      showToast('Failed to fetch windows', 'error');
      return;
    }

    const windows = resp?.windows;
    if (!windows || windows.length === 0) {
      if (resultCountNode) { resultCountNode.textContent = '0 windows'; }
      showToast('No windows found', 'error');
      return;
    }

    const otherWindows = windows.filter(w => !w.isCurrent);
    if (otherWindows.length === 0) {
      if (resultCountNode) { resultCountNode.textContent = '1 window'; }
      showToast('Only one window open — nothing to move to', 'info');
      return;
    }

    if (resultCountNode) {
      resultCountNode.textContent = `${otherWindows.length} window${otherWindows.length !== 1 ? 's' : ''}`;
    }

    const hint = document.createElement('li');
    hint.style.cssText = 'list-style:none;padding:8px 12px;font-size:12px;color:var(--muted);line-height:1.35;cursor:default;';
    hint.setAttribute('role', 'presentation');
    hint.textContent = 'Select a window to move this tab to:';
    resultsList.appendChild(hint);

    const rowStyle = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:6px;cursor:pointer;border:1px solid transparent;background:var(--card);';
    popupSelectedIndex = 0;

    otherWindows.forEach((win, idx) => {
      const li = document.createElement('li');
      li.className = 'palette-selectable-row';
      li.tabIndex = 0;
      li.style.cssText = rowStyle;

      const tabLabel = win.tabCount === 1 ? '1 tab' : `${win.tabCount} tabs`;
      const title = escapeHtml(win.activeTabTitle);

      li.innerHTML = `
        <span style="font-size:16px;width:24px;text-align:center;flex-shrink:0;">🪟</span>
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;">
          <span style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${title}</span>
          <span style="font-size:11px;color:var(--muted);">${tabLabel}</span>
        </div>
        <span style="font-size:9px;text-transform:uppercase;color:var(--muted);background:var(--chip);padding:1px 6px;border-radius:3px;flex-shrink:0;">window</span>
      `;

      li.addEventListener('click', () => {
        void moveTabToWindow(win.id, win.activeTabTitle);
      });
      li.addEventListener('mouseenter', () => {
        popupSelectedIndex = idx;
        applyPopupPaletteRowHighlight();
      });
      resultsList.appendChild(li);
    });

    applyPopupPaletteRowHighlight();
  }

  async function moveTabToWindow(targetWindowId: number, windowTitle: string): Promise<void> {
    try {
      const resp = await sendMessage({ type: 'MOVE_TAB_TO_WINDOW', targetWindowId }) as Record<string, unknown>;
      if (resp?.error) {
        showToast(`Error: ${resp.error}`, 'error');
      } else {
        showToast(`↗️ Moved tab to: ${windowTitle}`, 'success');
      }
    } catch {
      showToast('Failed to move tab', 'error');
    }
  }

  function executePopupCommand(cmd: PaletteCommand): void {
    saveRecentCommand(cmd.id);
    if (cmd.action === 'toggle-boolean' && cmd.settingKey) {
      const current = SettingsManager.getSetting(cmd.settingKey);
      const newVal = !current;
      SettingsManager.setSetting(cmd.settingKey, newVal as never);
      applyPopupSettingSideEffects(cmd.settingKey);
      showToast(`${cmd.label}: ${newVal ? 'ON' : 'OFF'}`, 'info');
      const input = $('search-input') as HTMLInputElement;
      if (input) {
        const { query } = detectPopupMode(input.value.trim());
        renderPopupPaletteResults(popupPaletteMode, query);
      }
      return;
    }
    if (cmd.action === 'cycle' && cmd.settingKey) {
      const value = getCycleValueFromCommand(cmd);
      if (value !== undefined) {
        SettingsManager.setSetting(cmd.settingKey, value as never);
        applyPopupSettingSideEffects(cmd.settingKey);
        showToast(`${cmd.label}`, 'info');
        const input = $('search-input') as HTMLInputElement;
        if (input) {
          const { query } = detectPopupMode(input.value.trim());
          renderPopupPaletteResults(popupPaletteMode, query);
        }
      }
      return;
    }
    if (cmd.action === 'message' && cmd.messageType) {
      if (cmd.messageType === 'SETTINGS_CHANGED') {
        const patch = getPowerSettingsPatch(cmd.id);
        if (patch) {
          void SettingsManager.updateSettings(patch).then(() => {
            (Object.keys(patch) as (keyof AppSettings)[]).forEach(k => applyPopupSettingSideEffects(k));
            showToast(`${cmd.label} — saved`, 'info');
            const input = $('search-input') as HTMLInputElement;
            if (input) {
              debounceSearch(input.value);
            }
          });
        }
        return;
      }

      if (cmd.id === 'search-debug') {
        void (async () => {
          try {
            const g = await sendMessage({ type: 'GET_SEARCH_DEBUG_ENABLED' }) as { enabled?: boolean };
            const next = !g?.enabled;
            await sendMessage({ type: 'SET_SEARCH_DEBUG_ENABLED', enabled: next });
            showToast(`Search debug: ${next ? 'ON' : 'OFF'}`, 'info');
            const input = $('search-input') as HTMLInputElement;
            if (input) {
              const { query } = detectPopupMode(input.value.trim());
              renderPopupPaletteResults(popupPaletteMode, query);
            }
          } catch {
            showToast('Error', 'error');
          }
        })();
        return;
      }

      if (cmd.id === 'move-tab-to-window') {
        void showWindowPicker();
        return;
      }

      const payload: Record<string, unknown> = { type: cmd.messageType };
      if (cmd.id === 'zoom-in') {
        payload.direction = 'in';
      } else if (cmd.id === 'zoom-out') {
        payload.direction = 'out';
      } else if (cmd.id === 'zoom-reset') {
        payload.direction = 'reset';
      } else if (cmd.id === 'new-tab') {
        payload.windowType = 'tab';
      } else if (cmd.id === 'new-window') {
        payload.windowType = 'window';
      } else if (cmd.id === 'new-incognito') {
        payload.windowType = 'incognito';
      } else if (cmd.id.startsWith('color-group-')) {
        payload.color = cmd.id.replace('color-group-', '');
      }

      const diagnostic = isPaletteDiagnosticMessageType(cmd.messageType);
      const toastMs = diagnostic ? PALETTE_DIAGNOSTIC_TOAST_MS : 5000;

      void sendMessage(payload)
        .then((resp: Record<string, unknown>) => {
          if (resp?.error) {
            showToast(`Error: ${resp.error}`, 'error');
            return;
          }
          const formatted =
            cmd.messageType && resp
              ? formatPaletteDiagnosticToast(cmd.messageType, resp)
              : null;
          if (formatted) {
            showToast(formatted, 'info', toastMs);
            return;
          }
          const ok = resp?.status === 'OK' || resp?.status === 'ok' || resp?.success;
          if (ok) {
            showToast(`${cmd.icon} ${cmd.label} — done`, 'success', toastMs);
            return;
          }
          if (resp?.data !== undefined) {
            const slice =
              typeof resp.data === 'string'
                ? resp.data.slice(0, 280)
                : JSON.stringify(resp.data).slice(0, 280);
            showToast(`${cmd.icon} ${cmd.label}:\n${slice}`, 'info', toastMs);
          }
        })
        .catch(() => showToast('Error', 'error'));
      return;
    }
    if (cmd.action === 'open-url' && cmd.url) {
      chrome.tabs.create({ url: cmd.url, active: true });
      return;
    }
    if (cmd.action === 'page-action') {
      if (cmd.id === 'tour') {
        runTour(POPUP_TOUR_STEPS, document);
      } else if (cmd.id === 'about') {
        const manifest = chrome.runtime.getManifest();
        showToast(`SmrutiCortex v${manifest.version}\nInstant browser history search`);
      } else if (cmd.id === 'shortcuts') {
        showToast('Enter: open · Shift+Enter: background · ↑↓: navigate · Esc: clear');
      } else if (cmd.id === 'shortcut-toggle-bookmarks-bar') {
        showToast('Toggle Bookmarks / Favorites Bar\n\nCtrl + Shift + B\n\nWorks in Chrome, Edge & Firefox.\nShortcuts may vary by browser version.', 'info', 8000);
      } else if (cmd.id === 'shortcut-toggle-vertical-tabs') {
        showToast('Toggle Vertical Tabs (Edge only)\n\nCtrl + Shift + , (comma)\n\nSwitches between vertical and horizontal tab layout.\nNote: No shortcut exists to collapse/expand the sidebar pane — use the UI button.\nShortcuts may vary by browser version.', 'info', 10000);
      } else if (cmd.id === 'copy-ollama-endpoint') {
        const url = SettingsManager.getSetting('ollamaEndpoint') ?? '';
        if (!url) {
          showToast('No Ollama endpoint set', 'warning');
        } else {
          void navigator.clipboard.writeText(url).then(() => showToast('Ollama endpoint copied', 'info')).catch(() => showToast('Failed to copy', 'error'));
        }
      } else if (cmd.id === 'copy-ollama-model') {
        const m = SettingsManager.getSetting('ollamaModel') ?? '';
        if (!m) {
          showToast('No keyword model set', 'warning');
        } else {
          void navigator.clipboard.writeText(m).then(() => showToast('Ollama model copied', 'info')).catch(() => showToast('Failed to copy', 'error'));
        }
      } else if (cmd.id === 'copy-embedding-model') {
        const m = SettingsManager.getSetting('embeddingModel') ?? '';
        if (!m) {
          showToast('No embedding model set', 'warning');
        } else {
          void navigator.clipboard.writeText(m).then(() => showToast('Embedding model copied', 'info')).catch(() => showToast('Failed to copy', 'error'));
        }
      }
    }
  }

  function handlePopupPaletteEnter(shiftKey = false): void {
    const resultsList = $('results') as HTMLUListElement;
    if (!resultsList) {return;}
    const input = $('search-input') as HTMLInputElement;

    if (popupPaletteMode === 'websearch') {
      const { query } = detectPopupMode((input?.value ?? '').trim());
      if (query) {
        const defaultKey = SettingsManager.getSetting('webSearchEngine') ?? 'google';
        const parsed = parseWebSearchQuery(query, defaultKey);
        const built = buildWebSearchUrl(parsed, SettingsManager.getSettings());
        if ('error' in built) {
          if (built.error === 'no-terms') {
            showToast('Add search text after the prefix.', 'info');
          } else if (built.error === 'no-jira-site' || built.error === 'no-confluence-site') {
            showToast(webSearchSiteUrlToastMessage(built.error), 'warning');
          }
          return;
        }
        chrome.tabs.create({ url: built.url, active: !shiftKey });
      }
      return;
    }

    if (popupPaletteMode === 'tabs') {
      const items = resultsList.querySelectorAll('.palette-selectable-row');
      if (items.length === 0) {return;}
      const selected = items[Math.min(popupSelectedIndex, items.length - 1)] as HTMLElement;
      const tabId = selected.dataset.tabId;
      const windowId = selected.dataset.windowId;
      const url = selected.dataset.tabUrl || '';
      if (tabId && windowId) {
        if (shiftKey && url) {
          chrome.tabs.create({ url, active: false });
        } else {
          void sendMessage({ type: 'SWITCH_TO_TAB', tabId: Number(tabId), windowId: Number(windowId) });
        }
      }
      return;
    }

    if (popupPaletteMode === 'bookmarks') {
      const items = resultsList.querySelectorAll('.palette-selectable-row');
      if (items.length === 0) {return;}
      const selected = items[Math.min(popupSelectedIndex, items.length - 1)] as HTMLElement;
      const url = selected.dataset.bookmarkUrl;
      if (url) {
        chrome.tabs.create({ url, active: !shiftKey });
      }
      return;
    }

    if (popupWindowPickerActive) {
      const rows = getPopupPaletteSelectableRows();
      if (rows.length > 0 && popupSelectedIndex >= 0 && popupSelectedIndex < rows.length) {
        rows[popupSelectedIndex].click();
      }
      return;
    }

    if (popupPaletteMode === 'commands' || popupPaletteMode === 'power') {
      const { query } = detectPopupMode((input?.value ?? '').trim());
      const tier = popupPaletteMode === 'power' ? 'power' as const : 'everyday' as const;
      const settings = SettingsManager.getSettings();
      const commands = getAvailableCommands(tier, settings);
      const list = preparePaletteCommandList(tier, query, commands, settings);
      if (list.length > 0 && popupSelectedIndex >= 0 && popupSelectedIndex < list.length) {
        executePopupCommand(list[popupSelectedIndex]);
      }
    }
  }

  function debounceSearchLocal(q: string) {
    syncClearButton();
    popupConfirmingCommand = null;

    const { mode, query } = detectPopupMode(q.trim());
    popupPaletteMode = mode;

    if (mode === 'help') {
      renderPopupHelpScreen();
      return;
    }

    if (debounceTimer) {clearTimeout(debounceTimer);}
    if (aiDebounceTimer) {clearTimeout(aiDebounceTimer); aiDebounceTimer = undefined;}
    if (focusTimer) {clearTimeout(focusTimer); focusTimer = undefined;}

    // Non-history modes: route to palette rendering
    if (mode !== 'history') {
      resultsLocal = [];
      activeIndex = -1;
      if (popupSpinner) {popupSpinner.classList.remove('active');}
      renderPopupPaletteResults(mode, query);
      return;
    }

    // --- Original history search flow ---
    const aiEnabled = SettingsManager.getSetting('ollamaEnabled') ?? false;
    aiSearchPending = aiEnabled;

    if (popupSpinner) {popupSpinner.classList.add('active');}
    resultCountNode.textContent = 'Searching...';

    debounceTimer = window.setTimeout(() => doSearch(q, true), 150);

    if (aiEnabled) {
      const aiDelayMs = SettingsManager.getSetting('aiSearchDelayMs') ?? 500;
      aiDebounceTimer = window.setTimeout(() => {
        aiDebounceTimer = undefined;
        doSearch(q, false);
      }, aiDelayMs);
    }
  }

  // Assign global
  debounceSearch = debounceSearchLocal;

  function renderRecentSearches(entries: Array<{ query: string; timestamp: number; selectedUrl?: string }>) {
    const container = document.createElement('div');
    container.className = 'recent-searches-section';

    const header = document.createElement('div');
    header.className = 'recent-searches-header';
    header.innerHTML = '<span class="recent-searches-title">🕐 Recent Searches</span>';
    const clearBtn = document.createElement('button');
    clearBtn.className = 'recent-searches-clear';
    clearBtn.textContent = 'Clear';
    clearBtn.title = 'Clear recent searches';
    clearBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await clearRecentSearches();
      container.remove();
    });
    header.appendChild(clearBtn);
    container.appendChild(header);

    for (const entry of entries) {
      const item = document.createElement('div');
      item.className = 'recent-search-item';
      item.tabIndex = 0;
      item.title = entry.selectedUrl ? `Search: "${entry.query}" → ${entry.selectedUrl}` : `Search: "${entry.query}"`;
      item.innerHTML = `<span class="recent-search-icon">🔍</span><span class="recent-search-query">${escapeHtml(entry.query)}</span>`;
      item.addEventListener('click', () => {
        const input = $('search-input') as HTMLInputElement;
        if (input) {
          input.value = entry.query;
          input.focus();
          debounceSearch(entry.query);
        }
      });
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          item.click();
        }
      });
      container.appendChild(item);
    }
    return container;
  }

  function renderRecentInteractionsSection(entries: Array<{ url: string; title: string; timestamp: number; action: string }>) {
    const container = document.createElement('div');
    container.className = 'recent-searches-section';

    const header = document.createElement('div');
    header.className = 'recent-searches-header';
    header.innerHTML = '<span class="recent-searches-title">⚡ Recently Visited</span>';
    const clearBtn = document.createElement('button');
    clearBtn.className = 'recent-searches-clear';
    clearBtn.textContent = 'Clear';
    clearBtn.title = 'Clear recently visited';
    clearBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await clearRecentInteractions();
      container.remove();
    });
    header.appendChild(clearBtn);
    container.appendChild(header);

    for (const entry of entries) {
      const item = document.createElement('div');
      item.className = 'recent-search-item';
      item.tabIndex = 0;
      item.title = entry.title || entry.url;

      const icon = entry.action === 'copy' ? '📋' : '🔗';
      item.innerHTML = `<span class="recent-search-icon">${icon}</span><span class="recent-search-query">${escapeHtml(entry.title || entry.url)}</span>`;
      item.addEventListener('click', () => {
        openUrl(entry.url, true, false);
      });
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {item.click();}
      });
      container.appendChild(item);
    }
    return container;
  }

  // Load default view (shown when popup opens or query is cleared)
  async function loadRecentHistory() {
    // Ensure settings are fully loaded from storage before reading toggles
    await SettingsManager.init();

    const isServiceWorkerReady = await checkServiceWorkerStatus();
    if (!isServiceWorkerReady) {
      resultsLocal = [];
      activeIndex = -1;
      renderResults();
      resultCountNode.textContent = 'Initializing...';
      return;
    }

    const showRecentlyVisited = SettingsManager.getSetting('showRecentHistory') ?? true;
    const showSearches = SettingsManager.getSetting('showRecentSearches') ?? true;

    try {
      const defaultResultCount = SettingsManager.getSetting('defaultResultCount') ?? 50;
      const resp = await sendMessage({ type: 'GET_RECENT_HISTORY', limit: defaultResultCount });
      resultsLocal = (resp && resp.results) ? resp.results : [];
      const sortBy = SettingsManager.getSetting('sortBy') || 'most-recent';
      sortResults(resultsLocal, sortBy);

      currentAIExpandedKeywords = [];
      renderAIStatus(null);
      activeIndex = -1;
      renderResults();

      // "⚡ Recently Visited" section — gated by showRecentHistory toggle
      if (showRecentlyVisited) {
        const interactions = await getRecentInteractions();
        if (interactions.length > 0) {
          const section = renderRecentInteractionsSection(interactions.slice(0, 5));
          resultsNode.insertBefore(section, resultsNode.firstChild);
        }
      }

      // Show recent searches above results when enabled
      if (showSearches) {
        const recentEntries = await getRecentSearches();
        if (recentEntries.length > 0) {
          const section = renderRecentSearches(recentEntries.slice(0, 5));
          resultsNode.insertBefore(section, resultsNode.firstChild);
        }
      }

    } catch {
      resultsLocal = [];
      activeIndex = -1;
      renderResults();
    }
  }

  // Fast search (skipAI=true for Phase 1, false for Phase 2 with AI)
  async function doSearch(q: string, skipAI: boolean = false) {
    currentQuery = q;
    if (!q || q.trim() === '') {
      // Show recent history when query is cleared
      aiSearchPending = false;
      if (popupSpinner) {popupSpinner.classList.remove('active');}
      loadRecentHistory();
      return;
    }

    const isServiceWorkerReady = await checkServiceWorkerStatus();
    if (!isServiceWorkerReady) {
      resultsLocal = [];
      activeIndex = -1;
      aiSearchPending = false;
      if (popupSpinner) {popupSpinner.classList.remove('active');}
      renderResults();
      resultCountNode.textContent = 'Initializing...';
      resultsNode.innerHTML = '<div style="padding:8px;color:#f59e0b;">Extension starting up...</div>';
      return;
    }

    try {
      const resp = await sendMessage({ type: 'SEARCH_QUERY', query: q, skipAI });
      // Guard against stale responses from slower earlier queries
      if (q !== currentQuery) {return;}
      resultsLocal = (resp && resp.results) ? resp.results : [];
      currentAIExpandedKeywords = resp?.aiStatus?.aiExpandedKeywords ?? [];

      // Apply current sort setting
      const sortBy = SettingsManager.getSetting('sortBy') || 'best-match';
      sortResults(resultsLocal, sortBy);

      activeIndex = resultsLocal.length ? 0 : -1;
      renderResults();
      renderAIStatus(resp?.aiStatus);

      // Loading state: Phase 1 + AI pending → keep spinner, show "AI expanding..."
      // Phase 2 response (or non-AI) → hide spinner, show final count
      if (skipAI && aiSearchPending) {
        // Phase 1 done, AI still in flight — keep spinner, update count with hint
        resultCountNode.textContent = `${resultsLocal.length} result${resultsLocal.length === 1 ? '' : 's'} · AI expanding...`;
      } else {
        // Final response
        aiSearchPending = false;
        if (popupSpinner) {popupSpinner.classList.remove('active');}
        resultCountNode.textContent = `${resultsLocal.length} result${resultsLocal.length === 1 ? '' : 's'}`;
      }

      // Focus the first result after focusDelayMs — ONLY for actual search results.
      // Cancelled if user types again. Doesn't fire for empty/recent-history results.
      const focusDelay = SettingsManager.getSetting('focusDelayMs') ?? 450;
      if (focusDelay > 0 && resultsLocal.length > 0 && activeIndex >= 0) {
        if (focusTimer) {clearTimeout(focusTimer);}
        const searchSnapshot = currentQuery;
        focusTimer = window.setTimeout(() => {
          focusTimer = undefined;
          // If query changed (user typed more), skip — stale focus
          if (currentQuery !== searchSnapshot) {return;}
          const displayMode = SettingsManager.getSetting('displayMode') || DisplayMode.LIST;
          const selector = displayMode === DisplayMode.CARDS ? '.result-card' : 'li';
          const firstResult = resultsNode.querySelector(selector) as HTMLElement;
          if (firstResult) {
            activeIndex = 0;
            highlightActive();
            firstResult.focus();
          }
        }, focusDelay);
      }
    } catch {
      resultsLocal = [];
      activeIndex = -1;
      aiSearchPending = false;
      if (popupSpinner) {popupSpinner.classList.remove('active');}
      renderResults();
      renderAIStatus(null);
    }
  }

  // Fast rendering
  function renderResults() {
    try {
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
        const cardFavFallback = chrome.runtime.getURL('../assets/icon-favicon-fallback.svg');
        fav.src = cardFavFallback;
        fav.addEventListener('error', () => { fav.src = cardFavFallback; }, { once: true });
        if (loadFavicons) {
          try {
            const hostname = new URL(item.url).hostname;
            chrome.runtime.sendMessage({ type: 'GET_FAVICON', hostname }, (resp) => {
              if (chrome.runtime.lastError) { return; }
              if (resp?.dataUrl) { fav.src = resp.dataUrl; }
            });
          } catch { /* ignore */ }
        }

        const details = document.createElement('div');
        details.className = 'card-details';

        const title = document.createElement('div');
        title.className = 'card-title';
        // Add bookmark indicator if item is bookmarked
        const bookmarkIndicator = item.isBookmark ? '<span class="bookmark-indicator" title="Bookmarked">★</span> ' : '';
        title.innerHTML = bookmarkIndicator + highlightMatches(item.title || item.url, currentQuery, currentAIExpandedKeywords);

        details.appendChild(title);

        // Add bookmark folder path if available
        if (item.bookmarkFolders && item.bookmarkFolders.length > 0) {
          const folderPath = document.createElement('div');
          folderPath.className = 'bookmark-folder';
          folderPath.textContent = '📁 ' + item.bookmarkFolders.join(' › ');
          details.appendChild(folderPath);
        }

        const url = document.createElement('div');
        url.className = 'card-url';
        url.innerHTML = highlightMatches(item.url, currentQuery, currentAIExpandedKeywords);

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
        const listFavFallback = chrome.runtime.getURL('../assets/icon-favicon-fallback.svg');
        fav.src = listFavFallback;
        fav.addEventListener('error', () => { fav.src = listFavFallback; }, { once: true });
        if (loadFavicons) {
          try {
            const hostname = new URL(item.url).hostname;
            chrome.runtime.sendMessage({ type: 'GET_FAVICON', hostname }, (resp) => {
              if (chrome.runtime.lastError) { return; }
              if (resp?.dataUrl) { fav.src = resp.dataUrl; }
            });
          } catch { /* ignore */ }
        }

        const details = document.createElement('div');
        details.className = 'result-details';

        const title = document.createElement('div');
        title.className = 'result-title';
        // Add bookmark indicator if item is bookmarked
        const bookmarkIndicator = item.isBookmark ? '<span class="bookmark-indicator" title="Bookmarked">★</span> ' : '';
        title.innerHTML = bookmarkIndicator + highlightMatches(item.title || item.url, currentQuery, currentAIExpandedKeywords);

        details.appendChild(title);

        // Add bookmark folder path if available
        if (item.bookmarkFolders && item.bookmarkFolders.length > 0) {
          const folderPath = document.createElement('div');
          folderPath.className = 'bookmark-folder';
          folderPath.textContent = '📁 ' + item.bookmarkFolders.join(' › ');
          details.appendChild(folderPath);
        }

        const url = document.createElement('div');
        url.className = 'result-url';
        url.innerHTML = highlightMatches(item.url, currentQuery, currentAIExpandedKeywords);

        details.appendChild(url);
        li.appendChild(fav);
        li.appendChild(details);

        li.addEventListener('click', (e) => openResult(idx, e as MouseEvent));
        li.addEventListener('keydown', handleKeydownLocal);

        resultsNode.appendChild(li);
      });
    }
    } catch (err) {
      resultsNode.innerHTML = '<div style="padding:12px;color:#ef4444;">Render error — try a new search</div>';
      console.error('[SmrutiCortex] renderResults error:', err);
    }
  }

  // Fast result opening (using shared openUrl utility)
  function openResult(index: number, event?: MouseEvent | KeyboardEvent) {
    const item = resultsLocal[index];
    if (!item) {return;}

    // Record recent search (fire-and-forget)
    if (currentQuery?.trim()) {
      addRecentSearch(currentQuery, item.url).catch(() => {});
    }

    const isCtrl = (event && (event as MouseEvent).ctrlKey) || (event instanceof KeyboardEvent && event.ctrlKey);
    const isShift = (event && (event as MouseEvent).shiftKey) || (event instanceof KeyboardEvent && event.shiftKey);

    const openInBackground = isShift && !isCtrl;
    const action = openInBackground ? 'background-tab' : 'click';
    addRecentInteraction(item.url, item.title || '', action).catch(() => {});

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
            if (popupPaletteMode !== 'history') {
              const rows = getPopupPaletteSelectableRows();
              if (rows.length > 0) {
                popupSelectedIndex = 0;
                applyPopupPaletteRowHighlight();
                rows[0].focus();
              }
              return;
            }
            if (resultsLocal.length > 0) {
              const firstResult = resultsNode.querySelector(selector) as HTMLElement;
              if (firstResult) {
                activeIndex = 0;
                highlightActive();
                firstResult.focus();
              }
            }
          },
          shouldSkip: () => {
            if (popupPaletteMode !== 'history') {
              return getPopupPaletteSelectableRows().length === 0;
            }
            return resultsLocal.length === 0;
          },
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
      if (popupPaletteMode !== 'history' && popupPaletteMode !== 'help') {
        const pRows = getPopupPaletteSelectableRows();
        if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && pRows.length > 0) {
          e.preventDefault();
          handlePopupPaletteArrow(e.key === 'ArrowDown' ? 'down' : 'up');
          return;
        }
      }
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
        if (popupWindowPickerActive) {
          e.preventDefault();
          popupWindowPickerActive = false;
          const { query } = detectPopupMode(input.value.trim());
          renderPopupPaletteResults(popupPaletteMode, query);
          return;
        }
        if (input.value.length > 0) {
          e.preventDefault();
          input.value = '';
          syncClearButton();
          currentQuery = '';
          debounceSearch('');
          return;
        }
        // Input already empty — let Escape bubble up to close the popup
        return;
      }
      // Command palette: Enter in non-history mode
      if (e.key === 'Enter' && popupPaletteMode !== 'history') {
        e.preventDefault();
        handlePopupPaletteEnter(e.shiftKey);
        return;
      }
      // Ctrl+A in input: select only the input text, not the whole popup document
      if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
        e.stopPropagation();
        input.select();
        return;
      }
      // Don't intercept any other keys in input - allow normal text editing (Ctrl+C, Ctrl+V, Ctrl+Z, Ctrl+Backspace, etc.)
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
      const paletteRow = (currentElement as HTMLElement).closest?.('.palette-selectable-row');
      if (popupPaletteMode !== 'history' && paletteRow) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          handlePopupPaletteArrow('down');
          focusPopupPaletteRowAt(popupSelectedIndex);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          const rows = getPopupPaletteSelectableRows();
          if (rows.length === 0) {return;}
          if (popupSelectedIndex <= 0) {
            input.focus();
            return;
          }
          handlePopupPaletteArrow('up');
          focusPopupPaletteRowAt(popupSelectedIndex);
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          handlePopupPaletteEnter(e.shiftKey);
          return;
        }
        if (e.key === 'Escape') {
          if (popupWindowPickerActive) {
            e.preventDefault();
            popupWindowPickerActive = false;
            const { query } = detectPopupMode(input.value.trim());
            renderPopupPaletteResults(popupPaletteMode, query);
            input.focus();
            return;
          }
          if (input.value.length > 0) {
            e.preventDefault();
            input.value = '';
            syncClearButton();
            currentQuery = '';
            debounceSearch('');
            input.focus();
            return;
          }
          return;
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          return;
        }
      }

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
        if (currentIndex <= 0) {
          // On first result — return focus to search input
          activeIndex = -1;
          highlightActive();
          input.focus();
          return;
        }
        const newIndex = currentIndex - 1;
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

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (resultsLocal.length === 0) {return;}
        const displayMode = SettingsManager.getSetting('displayMode') || DisplayMode.LIST;
        if (displayMode === DisplayMode.CARDS) {
          // In card grid (3 rows), ArrowRight moves to next column (+3)
          const newIndex = Math.min(resultsLocal.length - 1, currentIndex + 3);
          if (newIndex !== currentIndex) {
            activeIndex = newIndex;
            highlightActive();
            const selector = '.result-card';
            const results = resultsNode.querySelectorAll(selector);
            (results[newIndex] as HTMLElement)?.focus();
          }
        } else {
          openResult(currentIndex, e);
        }
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (resultsLocal.length === 0) {return;}
        const displayModeLeft = SettingsManager.getSetting('displayMode') || DisplayMode.LIST;
        if (displayModeLeft === DisplayMode.CARDS) {
          // In card grid (3 rows), ArrowLeft moves to prev column (-3)
          const newIndex = Math.max(0, currentIndex - 3);
          if (newIndex !== currentIndex) {
            activeIndex = newIndex;
            highlightActive();
            const results = resultsNode.querySelectorAll('.result-card');
            (results[newIndex] as HTMLElement)?.focus();
          }
        }
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (resultsLocal.length === 0) {return;}
        openResult(currentIndex, e);
        return;
      }

      if (e.key === 'Escape') {
        if (input.value.length > 0) {
          e.preventDefault();
          input.value = '';
          syncClearButton();
          currentQuery = '';
          debounceSearch('');
          input.focus();
          return;
        }
        // Input already empty — let Escape bubble up to close the popup
        return;
      }
    }

    // Copy shortcuts - ONLY when a result is focused (not input)
    if (e.key.toLowerCase() === 'm' && e.ctrlKey && resultsNode.contains(currentElement)) {
      e.preventDefault();
      if (resultsLocal.length === 0 || currentIndex === -1) {return;}
      const item = resultsLocal[currentIndex];
      if (item) {
        const markdown = createMarkdownLink(item as SearchResult);
        navigator.clipboard.writeText(markdown).then(() => {
          showToast('📋 Copied markdown link!');
        }).catch(() => {
          showToast('❌ Copy failed', 'error');
        });
        addRecentInteraction(item.url, item.title || '', 'copy').catch(() => {});
      }
      return;
    }

    if (e.key.toLowerCase() === 'c' && e.ctrlKey && resultsNode.contains(currentElement)) {
      e.preventDefault();
      if (resultsLocal.length === 0 || currentIndex === -1) {return;}
      const item = resultsLocal[currentIndex];
      if (item) {
        copyHtmlLinkToClipboard(item as SearchResult).then(() => {
          showToast('📋 Copied HTML link!');
        }).catch(() => {
          showToast('📋 Copied (text only)', 'info');
        });
        addRecentInteraction(item.url, item.title || '', 'copy').catch(() => {});
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

  // Track active settings tab (persists across modal open/close within session)
  let activeSettingsTab = 'general';

  // Switch settings tab — show only sections matching the given tab name
  function switchSettingsTab(tabName: string) {
    const modal = document.getElementById('settings-modal');
    if (!modal) {return;}
    activeSettingsTab = tabName;

    // Update tab buttons
    modal.querySelectorAll('.settings-tab').forEach(btn => {
      const isActive = (btn as HTMLElement).dataset.tab === tabName;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
    });

    // Show/hide sections based on active tab
    modal.querySelectorAll('.settings-section[data-tab]').forEach(section => {
      (section as HTMLElement).style.display =
        (section as HTMLElement).dataset.tab === tabName ? '' : 'none';
    });

    // Scroll content to top when switching tabs
    const content = modal.querySelector('.settings-content');
    if (content) {content.scrollTop = 0;}
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
    const currentLogLevel = SettingsManager.getSetting('logLevel') ?? 2;
    const currentHighlight = SettingsManager.getSetting('highlightMatches') ?? true;
    const currentFocusDelay = SettingsManager.getSetting('focusDelayMs') ?? 450;

    const currentTheme = SettingsManager.getSetting('theme') ?? 'auto';
    const themeInputs = modal.querySelectorAll('input[name="modal-theme"]');
    themeInputs.forEach(input => {
      (input as HTMLInputElement).checked = (input as HTMLInputElement).value === currentTheme;
    });

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
      selectAllOnFocusInput.checked = SettingsManager.getSetting('selectAllOnFocus') ?? false;
    }

    const showRecentHistoryInput = modal.querySelector('#modal-showRecentHistory') as HTMLInputElement;
    if (showRecentHistoryInput) {
      showRecentHistoryInput.checked = SettingsManager.getSetting('showRecentHistory') ?? true;
    }

    const showRecentSearchesInput = modal.querySelector('#modal-showRecentSearches') as HTMLInputElement;
    if (showRecentSearchesInput) {
      showRecentSearchesInput.checked = SettingsManager.getSetting('showRecentSearches') ?? true;
    }

    // Ollama settings
    const ollamaEnabledInput = modal.querySelector('#modal-ollamaEnabled') as HTMLInputElement;
    if (ollamaEnabledInput) {
      ollamaEnabledInput.checked = SettingsManager.getSetting('ollamaEnabled') ?? false;
    }

    const ollamaEndpointInput = modal.querySelector('#modal-ollamaEndpoint') as HTMLInputElement;
    if (ollamaEndpointInput) {
      ollamaEndpointInput.value = SettingsManager.getSetting('ollamaEndpoint') || 'http://localhost:11434';
    }

    // Initialize custom model select
    initModelSelect(SettingsManager.getSetting('ollamaModel') || 'llama3.2:1b');

    const ollamaTimeoutInput = modal.querySelector('#modal-ollamaTimeout') as HTMLInputElement;
    if (ollamaTimeoutInput) {
      ollamaTimeoutInput.value = String(SettingsManager.getSetting('ollamaTimeout') ?? 30000);
    }

    // Semantic search settings
    const embeddingsEnabledInput = modal.querySelector('#modal-embeddingsEnabled') as HTMLInputElement;
    if (embeddingsEnabledInput) {
      embeddingsEnabledInput.checked = SettingsManager.getSetting('embeddingsEnabled') ?? false;
    }

    initEmbedSelect(SettingsManager.getSetting('embeddingModel') || 'nomic-embed-text');

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

    // Advanced Browser Commands setting
    const advBrowserInput = modal.querySelector('#modal-advancedBrowserCommands') as HTMLInputElement;
    if (advBrowserInput) {
      advBrowserInput.checked = SettingsManager.getSetting('advancedBrowserCommands') ?? false;
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

    // Command Palette settings
    const cpEnabled = SettingsManager.getSetting('commandPaletteEnabled') ?? true;
    const cpEnabledInput = modal.querySelector('#modal-commandPaletteEnabled') as HTMLInputElement;
    if (cpEnabledInput) {cpEnabledInput.checked = cpEnabled;}

    const cpModes = SettingsManager.getSetting('commandPaletteModes') ?? ['/', '>', '@', '#', '??'];
    const cpInPopup = SettingsManager.getSetting('commandPaletteInPopup') ?? false;
    const cpInPopupInput = modal.querySelector('#modal-commandPaletteInPopup') as HTMLInputElement;
    if (cpInPopupInput) {
      cpInPopupInput.checked = cpInPopup;
      cpInPopupInput.disabled = !cpEnabled;
    }

    const modeMap: Record<string, string> = { '/': 'slash', '>': 'angle', '@': 'at', '#': 'hash', '??': 'web' };
    for (const [prefix, suffix] of Object.entries(modeMap)) {
      const el = modal.querySelector(`#modal-palette-mode-${suffix}`) as HTMLInputElement;
      if (el) {
        el.checked = cpModes.includes(prefix);
        el.disabled = !cpEnabled;
      }
    }

    const currentWebEngine = SettingsManager.getSetting('webSearchEngine') ?? 'google';
    const webEngineInputs = modal.querySelectorAll('input[name="modal-webSearchEngine"]');
    webEngineInputs.forEach(input => {
      (input as HTMLInputElement).checked = (input as HTMLInputElement).value === currentWebEngine;
    });

    const jiraUrlInput = modal.querySelector('#modal-jiraSiteUrl') as HTMLInputElement | null;
    if (jiraUrlInput) {
      jiraUrlInput.value = SettingsManager.getSetting('jiraSiteUrl') ?? '';
    }
    const confluenceUrlInput = modal.querySelector('#modal-confluenceSiteUrl') as HTMLInputElement | null;
    if (confluenceUrlInput) {
      confluenceUrlInput.value = SettingsManager.getSetting('confluenceSiteUrl') ?? '';
    }

    // Sync toolbar toggle checkboxes with current settings
    const toolbarOptionsContainer = modal.querySelector('#toolbar-toggle-options') as HTMLDivElement | null;
    if (toolbarOptionsContainer) {
      const currentToggles = SettingsManager.getSetting('toolbarToggles') ?? ['ollamaEnabled', 'indexBookmarks', 'showDuplicateUrls'];
      toolbarOptionsContainer.querySelectorAll<HTMLInputElement>('input[data-toolbar-key]').forEach(cb => {
        cb.checked = currentToggles.includes(cb.dataset.toolbarKey!);
      });
    }

    // Initialize bookmark button in settings modal
    initializeBookmarkButton();

    // Activate the remembered (or default) settings tab
    switchSettingsTab(activeSettingsTab);
  }

  function formatBytes(bytes: number): string {
    if (bytes >= 1_048_576) {return `${(bytes / 1_048_576).toFixed(1)} MB`;}
    if (bytes >= 1_024)     {return `${Math.round(bytes / 1_024)} KB`;}
    return `${bytes} B`;
  }

  // ===== SEARCHABLE MODEL SELECT =====
  const MODEL_SELECT_DEFAULTS = [
    { value: 'llama3.2:1b',  hint: '1.3 GB · Fast ★' },
    { value: 'llama3.2:3b',  hint: '2.0 GB · Best balance ★' },
    { value: 'gemma2:2b',    hint: '1.6 GB · Google' },
    { value: 'phi3:mini',    hint: '2.3 GB · Microsoft' },
    { value: 'qwen2.5:1.5b', hint: '1.0 GB · Alibaba' },
    { value: 'mistral:7b',   hint: '4.1 GB · High quality ★' },
  ];
  let modelSelectOptions: Array<{ value: string; hint?: string }> = [...MODEL_SELECT_DEFAULTS];
  let modelSelectInitialized = false;
  let renderModelSelectList: ((filter?: string) => void) | null = null;

  function initModelSelect(currentValue: string): void {
    const valueEl = document.getElementById('model-select-value');
    const hiddenInput = document.getElementById('modal-ollamaModel') as HTMLInputElement | null;
    if (valueEl) {valueEl.textContent = currentValue;}
    if (hiddenInput) {hiddenInput.value = currentValue;}

    if (modelSelectInitialized) {return;}
    modelSelectInitialized = true;

    const trigger = document.getElementById('model-select-trigger');
    const dropdown = document.getElementById('model-select-dropdown');
    const searchInput = document.getElementById('model-select-search') as HTMLInputElement | null;
    const listEl = document.getElementById('model-select-list');
    if (!trigger || !dropdown || !searchInput || !listEl || !valueEl || !hiddenInput) {return;}

    // All variables above are null-checked. TypeScript cannot narrow them inside closures,
    // so we suppress non-null assertion warnings for this entire block.
    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    function renderList(filter = '') {
      const lf = filter.toLowerCase().trim();
      const filtered = lf
        ? modelSelectOptions.filter(o => o.value.toLowerCase().includes(lf) || (o.hint || '').toLowerCase().includes(lf))
        : [...modelSelectOptions];

      listEl!.innerHTML = '';
      if (filtered.length === 0 && lf) {
        const div = document.createElement('div');
        div.className = 'model-select-option';
        div.textContent = `↵ Use "${filter}"`;
        div.addEventListener('mousedown', (ev) => { ev.preventDefault(); selectModel(filter.trim()); });
        listEl!.appendChild(div);
      } else {
        filtered.forEach((o) => {
          const div = document.createElement('div');
          div.className = 'model-select-option' + (o.value === hiddenInput!.value ? ' selected' : '');
          div.dataset.value = o.value;
          const label = document.createElement('span');
          label.className = 'model-select-option-label';
          label.textContent = o.value;
          div.appendChild(label);
          if (o.hint) {
            const hint = document.createElement('span');
            hint.className = 'model-select-option-hint' + (o.hint.includes('★') ? ' recommended' : '');
            hint.textContent = o.hint;
            div.appendChild(hint);
          }
          div.addEventListener('mousedown', (ev) => { ev.preventDefault(); selectModel(o.value); });
          div.addEventListener('mouseenter', () => highlight(div));
          listEl!.appendChild(div);
        });
      }
    }

    function highlight(activeEl?: Element | null) {
      listEl!.querySelectorAll('.model-select-option').forEach(el => el.classList.toggle('highlighted', el === activeEl));
    }

    function getHighlighted(): HTMLElement | null {
      return listEl!.querySelector('.model-select-option.highlighted');
    }

    function selectModel(value: string) {
      valueEl!.textContent = value;
      hiddenInput!.value = value;
      hiddenInput!.dispatchEvent(new Event('change', { bubbles: true }));
      closeDropdown();
    }

    function openDropdown() {
      dropdown!.removeAttribute('hidden');
      trigger.setAttribute('aria-expanded', 'true');
      searchInput!.value = '';
      renderList();
      searchInput!.focus();
    }

    function closeDropdown() {
      dropdown!.setAttribute('hidden', '');
      trigger.setAttribute('aria-expanded', 'false');
    }

    renderModelSelectList = renderList;

    trigger.addEventListener('click', () => {
      if (dropdown.hasAttribute('hidden')) {openDropdown();} else {closeDropdown();}
    });
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); openDropdown(); }
    });

    searchInput.addEventListener('input', () => renderList(searchInput.value));
    searchInput.addEventListener('keydown', (e) => {
      const options = Array.from(listEl!.querySelectorAll('.model-select-option')) as HTMLElement[];
      const highlighted = getHighlighted();
      let idx = highlighted ? options.indexOf(highlighted) : -1;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        idx = Math.min(idx + 1, options.length - 1);
        highlight(options[idx]);
        options[idx]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        idx = Math.max(idx - 1, 0);
        highlight(options[idx]);
        options[idx]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlighted?.dataset.value) {
          selectModel(highlighted.dataset.value);
        } else if (searchInput.value.trim()) {
          selectModel(searchInput.value.trim());
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeDropdown();
        trigger.focus();
      }
    });

    document.addEventListener('mousedown', (e) => {
      const wrap = document.getElementById('model-select-wrap');
      if (wrap && !wrap.contains(e.target as Node) && !dropdown.hasAttribute('hidden')) {closeDropdown();}
    });
    /* eslint-enable @typescript-eslint/no-non-null-assertion */
  }

  // ===== SEARCHABLE EMBEDDING MODEL SELECT =====
  const EMBED_SELECT_DEFAULTS = [
    { value: 'nomic-embed-text',       hint: '274 MB · Best balance ★' },
    { value: 'all-minilm',             hint: '46 MB · Lightest ★' },
    { value: 'mxbai-embed-large',      hint: '670 MB · High quality ★' },
    { value: 'snowflake-arctic-embed', hint: '669 MB · Retrieval-optimized' },
  ];
  let embedSelectOptions: Array<{ value: string; hint?: string }> = [...EMBED_SELECT_DEFAULTS];
  let embedSelectInitialized = false;
  let renderEmbedSelectList: ((filter?: string) => void) | null = null;

  function initEmbedSelect(currentValue: string): void {
    const valueEl = document.getElementById('embed-select-value');
    const hiddenInput = document.getElementById('modal-embeddingModel') as HTMLInputElement | null;
    if (valueEl) {valueEl.textContent = currentValue;}
    if (hiddenInput) {hiddenInput.value = currentValue;}

    if (embedSelectInitialized) {return;}
    embedSelectInitialized = true;

    const trigger = document.getElementById('embed-select-trigger');
    const dropdown = document.getElementById('embed-select-dropdown');
    const searchInput = document.getElementById('embed-select-search') as HTMLInputElement | null;
    const listEl = document.getElementById('embed-select-list');
    if (!trigger || !dropdown || !searchInput || !listEl || !valueEl || !hiddenInput) {return;}

    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    function renderList(filter = '') {
      const lf = filter.toLowerCase().trim();
      const filtered = lf
        ? embedSelectOptions.filter(o => o.value.toLowerCase().includes(lf) || (o.hint || '').toLowerCase().includes(lf))
        : [...embedSelectOptions];

      listEl!.innerHTML = '';
      if (filtered.length === 0 && lf) {
        const div = document.createElement('div');
        div.className = 'model-select-option';
        div.textContent = `↵ Use "${filter}"`;
        div.addEventListener('mousedown', (ev) => { ev.preventDefault(); selectEmbed(filter.trim()); });
        listEl!.appendChild(div);
      } else {
        filtered.forEach((o) => {
          const div = document.createElement('div');
          div.className = 'model-select-option' + (o.value === hiddenInput!.value ? ' selected' : '');
          div.dataset.value = o.value;
          const label = document.createElement('span');
          label.className = 'model-select-option-label';
          label.textContent = o.value;
          div.appendChild(label);
          if (o.hint) {
            const hint = document.createElement('span');
            hint.className = 'model-select-option-hint' + (o.hint.includes('★') ? ' recommended' : '');
            hint.textContent = o.hint;
            div.appendChild(hint);
          }
          div.addEventListener('mousedown', (ev) => { ev.preventDefault(); selectEmbed(o.value); });
          div.addEventListener('mouseenter', () => highlightEmbed(div));
          listEl!.appendChild(div);
        });
      }
    }

    function highlightEmbed(activeEl?: Element | null) {
      listEl!.querySelectorAll('.model-select-option').forEach(el => el.classList.toggle('highlighted', el === activeEl));
    }

    function getHighlightedEmbed(): HTMLElement | null {
      return listEl!.querySelector('.model-select-option.highlighted');
    }

    function selectEmbed(value: string) {
      valueEl!.textContent = value;
      hiddenInput!.value = value;
      hiddenInput!.dispatchEvent(new Event('change', { bubbles: true }));
      closeEmbedDropdown();
    }

    function openEmbedDropdown() {
      dropdown!.removeAttribute('hidden');
      trigger.setAttribute('aria-expanded', 'true');
      searchInput!.value = '';
      renderList();
      searchInput!.focus();
    }

    function closeEmbedDropdown() {
      dropdown!.setAttribute('hidden', '');
      trigger.setAttribute('aria-expanded', 'false');
    }

    renderEmbedSelectList = renderList;

    trigger.addEventListener('click', () => {
      if (dropdown.hasAttribute('hidden')) {openEmbedDropdown();} else {closeEmbedDropdown();}
    });
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); openEmbedDropdown(); }
    });

    searchInput.addEventListener('input', () => renderList(searchInput.value));
    searchInput.addEventListener('keydown', (e) => {
      const options = Array.from(listEl!.querySelectorAll('.model-select-option')) as HTMLElement[];
      const highlighted = getHighlightedEmbed();
      let idx = highlighted ? options.indexOf(highlighted) : -1;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        idx = Math.min(idx + 1, options.length - 1);
        highlightEmbed(options[idx]);
        options[idx]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        idx = Math.max(idx - 1, 0);
        highlightEmbed(options[idx]);
        options[idx]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlighted?.dataset.value) {
          selectEmbed(highlighted.dataset.value);
        } else if (searchInput.value.trim()) {
          selectEmbed(searchInput.value.trim());
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeEmbedDropdown();
        trigger.focus();
      }
    });

    document.addEventListener('mousedown', (e) => {
      const wrap = document.getElementById('embed-select-wrap');
      if (wrap && !wrap.contains(e.target as Node) && !dropdown.hasAttribute('hidden')) {closeEmbedDropdown();}
    });
    /* eslint-enable @typescript-eslint/no-non-null-assertion */
  }

  // Initialize bookmark button in settings modal (guarded to prevent duplicate listeners)
  let bookmarkBtnInitialized = false;
  function initializeBookmarkButton() {
    if (bookmarkBtnInitialized) {return;}
    const bookmarkBtn = document.getElementById('bookmarkBtn') as HTMLButtonElement;
    if (bookmarkBtn) {
      bookmarkBtnInitialized = true;
      const extensionURL = chrome.runtime.getURL('popup/popup.html');
      const bookmarkTitle = 'SmrutiCortex — Instant History Search';

      // Detect browser
      const isFirefox = extensionURL.startsWith('moz-extension://');
      const isEdge = !isFirefox && navigator.userAgent.includes('Edg/');
      const browserName = isFirefox ? 'Firefox' : isEdge ? 'Edge' : 'Chrome';
      const barName = isFirefox ? 'Bookmarks Toolbar' : isEdge ? 'Favorites Bar' : 'Bookmarks Bar';

      // Update UI text for the detected browser
      const titleEl = document.getElementById('bookmark-section-title');
      const descEl = document.getElementById('bookmark-section-desc');
      const btnTextEl = document.getElementById('bookmark-btn-text');
      if (titleEl) {titleEl.textContent = `Bookmark in ${browserName}`;}
      if (descEl) {descEl.textContent = `Drag to your ${barName}, or click to copy the extension URL.`;}
      if (btnTextEl) {btnTextEl.textContent = `Drag to ${barName}`;}
      bookmarkBtn.title = `Drag to your ${barName} · Click to copy link`;

      // Click to copy URL
      bookmarkBtn.addEventListener('click', (e) => {
        e.preventDefault();
        navigator.clipboard.writeText(extensionURL).then(() => {
          showToast(`📋 Link copied — paste it into ${browserName} to add bookmark.`);
        }).catch(() => {
          showToast('❌ Failed to copy URL', 'error');
        });
      });

      // Drag-and-drop to bookmarks bar
      bookmarkBtn.addEventListener('dragstart', (e) => {
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'link';
          e.dataTransfer.setData('text/uri-list', extensionURL);
          e.dataTransfer.setData('text/plain', extensionURL);
          // Firefox: sets both URL and display title
          e.dataTransfer.setData('text/x-moz-url', `${extensionURL}\n${bookmarkTitle}`);
          // Chrome / Edge: anchor tag carries the title
          e.dataTransfer.setData('text/html', `<a href="${extensionURL}">${bookmarkTitle}</a>`);
        }
      });

      // Visual feedback on drag end
      bookmarkBtn.addEventListener('dragend', () => {
        showToast(`✅ Drop it on your ${barName} to save!`, 'info');
      });
    }
  }

  // Close settings modal
  function closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) {
      modal.classList.add('hidden');
      // Stop embedding progress polling
      stopEmbeddingProgressPolling();
      // Refresh toggle bar in case configuration changed
      renderToggleBar();
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
        sizeEl.textContent = formatBytes(response.totalSize);
      } else {
        countEl.textContent = '-- icons';
        sizeEl.textContent = '--';
      }
    } catch {
      countEl.textContent = '-- icons';
      sizeEl.textContent = '--';
    }
  }
  async function loadEmbeddingStats() {
    const countEl = document.getElementById('embedding-count');
    const storageEl = document.getElementById('embedding-storage-est');
    const modelEl = document.getElementById('embedding-model-info');
    const barEl = document.getElementById('embedding-admin-bar');
    if (!countEl) {return;}

    try {
      const resp = await new Promise<any>((resolve) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        chrome.runtime.sendMessage({ type: 'GET_EMBEDDING_STATS' }, resolve);
      });
      if (resp?.status === 'OK') {
        countEl.textContent = `${resp.withEmbeddings}/${resp.total} pages`;
        if (storageEl) {storageEl.textContent = `~${formatBytes(resp.estimatedBytes)}`;}
        if (modelEl) {modelEl.textContent = resp.embeddingModel;}
        if (barEl) {barEl.style.width = `${resp.total > 0 ? Math.round(resp.withEmbeddings / resp.total * 100) : 0}%`;}
      }
    } catch { /* ignore */ }
  }

  // === Embedding Processor Progress Polling ===
  let embeddingProgressInterval: ReturnType<typeof setInterval> | null = null;

  function startEmbeddingProgressPolling() {
    stopEmbeddingProgressPolling();
    updateEmbeddingProcessorUI(); // immediate
    embeddingProgressInterval = setInterval(updateEmbeddingProcessorUI, 2000);
  }

  function stopEmbeddingProgressPolling() {
    if (embeddingProgressInterval) {
      clearInterval(embeddingProgressInterval);
      embeddingProgressInterval = null;
    }
  }

  async function updateEmbeddingProcessorUI() {
    const statusEl = document.getElementById('embedding-processor-status');
    const stateEl = document.getElementById('embedding-processor-state');
    const progressEl = document.getElementById('embedding-processor-progress');
    const speedEl = document.getElementById('embedding-processor-speed');
    const etaEl = document.getElementById('embedding-processor-eta');
    const barEl = document.getElementById('embedding-processor-bar');
    const startBtn = document.getElementById('embedding-start-btn') as HTMLButtonElement | null;
    const pauseBtn = document.getElementById('embedding-pause-btn') as HTMLButtonElement | null;
    const resumeBtn = document.getElementById('embedding-resume-btn') as HTMLButtonElement | null;

    // Only show if embeddings are enabled
    const embeddingsEnabled = SettingsManager.getSetting('embeddingsEnabled') ?? false;
    if (!embeddingsEnabled || !statusEl) {
      if (statusEl) { statusEl.style.display = 'none'; }
      if (startBtn) { startBtn.style.display = 'none'; }
      if (pauseBtn) { pauseBtn.style.display = 'none'; }
      if (resumeBtn) { resumeBtn.style.display = 'none'; }
      return;
    }

    try {
      const resp = await new Promise<any>((resolve) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        chrome.runtime.sendMessage({ type: 'GET_EMBEDDING_PROGRESS' }, resolve);
      });

      if (resp?.status !== 'OK' || !resp.progress) { return; }

      const p = resp.progress;
      statusEl.style.display = 'block';

      // State display
      const stateLabels: Record<string, string> = {
        idle: 'Idle',
        running: 'Running',
        paused: 'Paused',
        completed: 'Completed',
        error: 'Error',
      };
      if (stateEl) {
        stateEl.textContent = stateLabels[p.state] || p.state;
        stateEl.style.color = p.state === 'running' ? '#10b981'
          : p.state === 'error' ? '#ef4444'
          : p.state === 'completed' ? '#3b82f6'
          : p.state === 'paused' ? '#f59e0b'
          : 'inherit';
      }

      // Progress: "145/867 (17%)"
      if (progressEl) {
        const pct = p.total > 0 ? Math.round(p.withEmbeddings / p.total * 100) : 0;
        progressEl.textContent = `${p.withEmbeddings}/${p.total} (${pct}%)`;
      }

      // Speed: "12 items/min"
      if (speedEl) {
        speedEl.textContent = p.speed > 0 ? `${p.speed} items/min` : '--';
      }

      // ETA: "~12 min"
      if (etaEl) {
        if (p.state === 'completed') {
          etaEl.textContent = 'Done';
        } else if (p.state === 'error') {
          etaEl.textContent = p.lastError ? p.lastError.substring(0, 40) : 'Error';
        } else {
          etaEl.textContent = p.estimatedMinutes > 0 ? `~${p.estimatedMinutes} min` : '--';
        }
      }

      // Progress bar
      if (barEl) {
        const pct = p.total > 0 ? Math.round(p.withEmbeddings / p.total * 100) : 0;
        barEl.style.width = `${pct}%`;
      }

      // Button visibility
      if (startBtn) { startBtn.style.display = (p.state === 'idle' || p.state === 'completed' || p.state === 'error') ? '' : 'none'; }
      if (pauseBtn) { pauseBtn.style.display = p.state === 'running' ? '' : 'none'; }
      if (resumeBtn) { resumeBtn.style.display = p.state === 'paused' ? '' : 'none'; }

      // Also refresh the embedding stats bar
      loadEmbeddingStats();
    } catch { /* ignore */ }
  }

  async function loadAICacheStats() {
    const countEl = document.getElementById('ai-cache-count');
    const sizeEl = document.getElementById('ai-cache-size');
    if (!countEl) {return;}

    try {
      const resp = await new Promise<any>((resolve) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        chrome.runtime.sendMessage({ type: 'GET_AI_CACHE_STATS' }, resolve);
      });
      if (resp?.status === 'OK') {
        countEl.textContent = `${resp.size} entries`;
        if (sizeEl) {sizeEl.textContent = `~${resp.estimatedBytes} B`;}
      }
    } catch { /* ignore */ }
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
  
  // Set up inspect link handler (guarded to prevent duplicate listeners)
  let inspectLinkInitialized = false;
  function setupInspectLink() {
    if (inspectLinkInitialized) {return;}
    const inspectLink = document.getElementById('storage-inspect-link');
    if (inspectLink) {
      inspectLinkInitialized = true;
      inspectLink.addEventListener('click', (e) => {
        e.preventDefault();
        // IndexedDB is browser-internal, copy the debug URL for developers
        const debugUrl = 'chrome://indexeddb-internals';
        navigator.clipboard.writeText(debugUrl).then(() => {
          showToast(`📋 Copied: ${debugUrl}\nPaste in address bar to inspect storage.`);
        }).catch(() => {
          showToast('Open chrome://indexeddb-internals in a new tab to inspect storage', 'info');
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

    // Tab switching
    modal.querySelectorAll('.settings-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = (btn as HTMLElement).dataset.tab;
        if (tab) {switchSettingsTab(tab);}
      });
    });

    // Convert vertical mouse wheel to horizontal scroll on settings tab bar
    const tabBar = modal.querySelector('.settings-tabs') as HTMLElement | null;
    if (tabBar) {
      tabBar.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0) {
          e.preventDefault();
          tabBar.scrollLeft += e.deltaY;
        }
      }, { passive: false });
    }

    // Theme changes
    const themeInputs = modal.querySelectorAll('input[name="modal-theme"]');
    themeInputs.forEach(input => {
      input.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.checked) {
          const value = target.value as 'light' | 'dark' | 'auto';
          SettingsManager.setSetting('theme', value).catch(() => {});
          applyTheme(value);
          syncToggleBar();
          showToast(`Theme set to ${value}`, 'info');
        }
      });
    });

    // Display mode changes
    const displayInputs = modal.querySelectorAll('input[name="modal-displayMode"]');
    displayInputs.forEach(input => {
      input.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.checked) {
          SettingsManager.setSetting('displayMode', target.value as DisplayMode).catch(() => {});
          syncToggleBar();
          renderResults();
          showToast('Display mode updated', 'info');
        }
      });
    });

    // Log level changes
    const logInputs = modal.querySelectorAll('input[name="modal-logLevel"]');
    logInputs.forEach(input => {
      input.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.checked) {
          const level = parseInt(target.value);
          SettingsManager.setSetting('logLevel', level).catch(() => {});
          Logger.setLevel(level).catch(() => {});
          showToast('Log level updated', 'info');
        }
      });
    });

    // Highlight matches toggle
    const highlightInput = modal.querySelector('#modal-highlightMatches') as HTMLInputElement;
    if (highlightInput) {
      highlightInput.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        SettingsManager.setSetting('highlightMatches', target.checked).catch(() => {});
        syncToggleBar();
        renderResults();
        showToast('Match highlighting ' + (target.checked ? 'enabled' : 'disabled'), 'info');
      });
    }

    // Focus delay changes
    const focusDelayInput = modal.querySelector('#modal-focusDelayMs') as HTMLInputElement;
    if (focusDelayInput) {
      focusDelayInput.addEventListener('change', () => {
        let val = parseInt(focusDelayInput.value);
        if (isNaN(val) || val < 0) {val = 0;}
        if (val > 2000) {val = 2000;}
        SettingsManager.setSetting('focusDelayMs', val).catch(() => {});
        focusDelayInput.value = String(val);
        showToast(val === 0 ? 'Auto-focus disabled' : `Focus delay set to ${val} ms`, 'info');
      });
    }

    // Select all on focus toggle
    const selectAllOnFocusInput = modal.querySelector('#modal-selectAllOnFocus') as HTMLInputElement;
    if (selectAllOnFocusInput) {
      selectAllOnFocusInput.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        SettingsManager.setSetting('selectAllOnFocus', target.checked).catch(() => {});
        syncToggleBar();
        showToast(target.checked ? 'Tab will select all text' : 'Tab will place cursor at end', 'info');
      });
    }

    // Recent history toggle
    const showRecentHistoryInput2 = modal.querySelector('#modal-showRecentHistory') as HTMLInputElement;
    if (showRecentHistoryInput2) {
      showRecentHistoryInput2.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        SettingsManager.setSetting('showRecentHistory', target.checked).catch(() => {});
        syncToggleBar();
        showToast(target.checked ? 'Recent browsing history enabled' : 'Recent browsing history disabled', 'info');
        if (!currentQuery?.trim()) { loadRecentHistory(); }
      });
    }

    // Recent searches toggle
    const showRecentSearchesInput2 = modal.querySelector('#modal-showRecentSearches') as HTMLInputElement;
    if (showRecentSearchesInput2) {
      showRecentSearchesInput2.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        SettingsManager.setSetting('showRecentSearches', target.checked).catch(() => {});
        syncToggleBar();
        showToast(target.checked ? 'Recent searches enabled' : 'Recent searches disabled', 'info');
        if (!currentQuery?.trim()) { loadRecentHistory(); }
      });
    }

    // Ollama enabled toggle
    const ollamaEnabledInput = modal.querySelector('#modal-ollamaEnabled') as HTMLInputElement;
    if (ollamaEnabledInput) {
      ollamaEnabledInput.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        SettingsManager.setSetting('ollamaEnabled', target.checked).catch(() => {});
        syncToggleBar();
        console.info(`[Settings] AI search ${target.checked ? 'ENABLED' : 'DISABLED'} by user`);
        showToast('AI search ' + (target.checked ? 'enabled' : 'disabled'), 'info');
      });
    }

    // Ollama endpoint changes
    const ollamaEndpointInput = modal.querySelector('#modal-ollamaEndpoint') as HTMLInputElement;
    if (ollamaEndpointInput) {
      ollamaEndpointInput.addEventListener('change', () => {
        const val = ollamaEndpointInput.value.trim();
        if (val) {
          SettingsManager.setSetting('ollamaEndpoint', val).catch(() => {});
          showToast('Ollama endpoint updated', 'info');
        }
      });
    }

    // Ollama model changes (hidden input synced by custom model select)
    const ollamaModelInput = modal.querySelector('#modal-ollamaModel') as HTMLInputElement;
    if (ollamaModelInput) {
      ollamaModelInput.addEventListener('change', () => {
        const val = ollamaModelInput.value.trim();
        if (val) {
          SettingsManager.setSetting('ollamaModel', val).catch(() => {});
          showToast(`Model set to: ${val}`, 'info');
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

        // GUARDRAIL: 5-second timeout to prevent hanging if Ollama is unresponsive
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        try {
          const response = await fetch(`${endpoint}/api/tags`, {
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          if (!response.ok) {throw new Error(`HTTP ${response.status}`);}

          const data = await response.json();
          const models = data.models || [];

          if (models.length > 0) {
            modelSelectOptions = models.map((m: { name: string }) => ({ value: m.name }));
            if (renderModelSelectList) {renderModelSelectList();}
            showToast(`Found ${models.length} models`, 'info');
          } else {
            showToast('No models found', 'warning');
          }
        } catch (error) {
          clearTimeout(timeoutId);
          const msg = error instanceof Error && error.name === 'AbortError'
            ? 'Timed out after 5s. Is Ollama running?'
            : 'Failed to fetch models. Is Ollama running?';
          showToast(msg, 'error');
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
      ollamaTimeoutInput.addEventListener('change', () => {
        let val = parseInt(ollamaTimeoutInput.value);
        
        if (val === -1) {
          SettingsManager.setSetting('ollamaTimeout', -1).catch(() => {});
          ollamaTimeoutInput.value = '-1';
          showToast('Timeout disabled (infinite wait)', 'info');
          return;
        }
        
        if (isNaN(val) || val < 5000) {val = 5000;}
        if (val > 120000) {val = 120000;}
        SettingsManager.setSetting('ollamaTimeout', val).catch(() => {});
        ollamaTimeoutInput.value = String(val);
        showToast(`Ollama timeout set to ${val} ms (${(val/1000).toFixed(1)}s)`, 'info');
      });
    }

    // Semantic search settings
    const embeddingsEnabledInput = modal.querySelector('#modal-embeddingsEnabled') as HTMLInputElement;
    if (embeddingsEnabledInput) {
      embeddingsEnabledInput.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        SettingsManager.setSetting('embeddingsEnabled', target.checked).catch(() => {});
        console.info(`[Settings] Semantic search ${target.checked ? 'ENABLED' : 'DISABLED'} by user`);
        showToast('Semantic search ' + (target.checked ? 'enabled' : 'disabled'), 'info');
        if (target.checked) {
          showToast('⚠️ Rebuild index to generate embeddings for existing pages', 'warning');
        }
      });
    }

    const embeddingModelHidden = modal.querySelector('#modal-embeddingModel') as HTMLInputElement;
    if (embeddingModelHidden) {
      embeddingModelHidden.addEventListener('change', () => {
        const val = embeddingModelHidden.value.trim();
        if (val) {
          SettingsManager.setSetting('embeddingModel', val).catch(() => {});
          showToast(`Embedding model set to: ${val}`, 'info');
        }
      });
    }

    // Refresh embedding models button - fetch embedding models from Ollama (filtered by 'embed')
    const refreshEmbedModelsBtn = modal.querySelector('#refresh-embed-models-btn') as HTMLButtonElement;
    if (refreshEmbedModelsBtn) {
      refreshEmbedModelsBtn.addEventListener('click', async () => {
        const endpoint = SettingsManager.getSetting('ollamaEndpoint') || 'http://localhost:11434';
        refreshEmbedModelsBtn.disabled = true;
        refreshEmbedModelsBtn.textContent = '⏳';

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        try {
          const response = await fetch(`${endpoint}/api/tags`, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (!response.ok) {throw new Error(`HTTP ${response.status}`);}

          const data = await response.json();
          const allModels: Array<{ name: string }> = data.models || [];
          const embedModels = allModels.filter(m => m.name.toLowerCase().includes('embed'));

          if (embedModels.length > 0) {
            embedSelectOptions = embedModels.map(m => ({ value: m.name }));
            if (renderEmbedSelectList) {renderEmbedSelectList();}
            showToast(`Found ${embedModels.length} embedding model${embedModels.length > 1 ? 's' : ''}`, 'info');
          } else if (allModels.length > 0) {
            showToast('No embedding models found. Try: ollama pull nomic-embed-text', 'warning');
          } else {
            showToast('No models found. Is Ollama running?', 'warning');
          }
        } catch (error) {
          clearTimeout(timeoutId);
          const msg = error instanceof Error && error.name === 'AbortError'
            ? 'Timed out after 5s. Is Ollama running?'
            : 'Failed to fetch models. Is Ollama running?';
          showToast(msg, 'error');
        } finally {
          refreshEmbedModelsBtn.disabled = false;
          refreshEmbedModelsBtn.textContent = '🔄';
        }
      });
    }

    // Privacy settings - Load Favicons
    const loadFaviconsInput = modal.querySelector('#modal-loadFavicons') as HTMLInputElement;
    if (loadFaviconsInput) {
      loadFaviconsInput.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        SettingsManager.setSetting('loadFavicons', target.checked).catch(() => {});
        syncToggleBar();
        showToast(`Favicons ${target.checked ? 'enabled' : 'disabled'}`, 'info');
        renderResults();
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
            showToast(`Cleared ${response.cleared} favicons, freed ${formatBytes(response.freedBytes)}`);
            loadFaviconCacheStats();
          } else {
            showToast('Failed to clear favicon cache', 'error');
          }
        } catch {
          showToast('Error clearing favicon cache', 'error');
        }
        clearFaviconCacheBtn.disabled = false;
        clearFaviconCacheBtn.textContent = 'Clear Cache';
      });
    }

    // Embedding admin - load stats and handle buttons
    loadEmbeddingStats();
    const embeddingRefreshBtn = modal.querySelector('#embedding-refresh-stats') as HTMLButtonElement;
    if (embeddingRefreshBtn) {
      embeddingRefreshBtn.addEventListener('click', () => loadEmbeddingStats());
    }
    const embeddingClearBtn = modal.querySelector('#embedding-clear-all') as HTMLButtonElement;
    if (embeddingClearBtn) {
      embeddingClearBtn.addEventListener('click', async () => {
        if (!confirm('Clear all AI embeddings?\n\nPages are kept. Embeddings regenerate on next search.')) {return;}
        embeddingClearBtn.disabled = true;
        embeddingClearBtn.textContent = '⏳ Clearing...';
        try {
          const resp = await new Promise<any>((resolve) => { // eslint-disable-line @typescript-eslint/no-explicit-any
            chrome.runtime.sendMessage({ type: 'CLEAR_ALL_EMBEDDINGS' }, resolve);
          });
          if (resp?.status === 'OK') {
            showToast(`Cleared embeddings from ${resp.cleared} pages`);
            loadEmbeddingStats();
          } else {
            showToast('Failed to clear embeddings', 'error');
          }
        } catch { showToast('Error clearing embeddings', 'error'); }
        embeddingClearBtn.disabled = false;
        embeddingClearBtn.textContent = '🗑️ Clear Embeddings';
      });
    }

    // Embedding processor controls — Start / Pause / Resume
    const embStartBtn = modal.querySelector('#embedding-start-btn') as HTMLButtonElement;
    const embPauseBtn = modal.querySelector('#embedding-pause-btn') as HTMLButtonElement;
    const embResumeBtn = modal.querySelector('#embedding-resume-btn') as HTMLButtonElement;

    if (embStartBtn) {
      embStartBtn.addEventListener('click', async () => {
        embStartBtn.disabled = true;
        try {
          await new Promise<any>((resolve) => { // eslint-disable-line @typescript-eslint/no-explicit-any
            chrome.runtime.sendMessage({ type: 'START_EMBEDDING_PROCESSOR' }, resolve);
          });
          updateEmbeddingProcessorUI();
        } catch { /* ignore */ }
        embStartBtn.disabled = false;
      });
    }
    if (embPauseBtn) {
      embPauseBtn.addEventListener('click', async () => {
        embPauseBtn.disabled = true;
        try {
          await new Promise<any>((resolve) => { // eslint-disable-line @typescript-eslint/no-explicit-any
            chrome.runtime.sendMessage({ type: 'PAUSE_EMBEDDING_PROCESSOR' }, resolve);
          });
          updateEmbeddingProcessorUI();
        } catch { /* ignore */ }
        embPauseBtn.disabled = false;
      });
    }
    if (embResumeBtn) {
      embResumeBtn.addEventListener('click', async () => {
        embResumeBtn.disabled = true;
        try {
          await new Promise<any>((resolve) => { // eslint-disable-line @typescript-eslint/no-explicit-any
            chrome.runtime.sendMessage({ type: 'RESUME_EMBEDDING_PROCESSOR' }, resolve);
          });
          updateEmbeddingProcessorUI();
        } catch { /* ignore */ }
        embResumeBtn.disabled = false;
      });
    }

    // Start polling for embedding processor progress
    startEmbeddingProgressPolling();

    // AI keyword cache - load stats and handle clear
    loadAICacheStats();
    const clearAICacheBtn = modal.querySelector('#clear-ai-cache') as HTMLButtonElement;
    if (clearAICacheBtn) {
      clearAICacheBtn.addEventListener('click', async () => {
        clearAICacheBtn.disabled = true;
        try {
          const resp = await new Promise<any>((resolve) => { // eslint-disable-line @typescript-eslint/no-explicit-any
            chrome.runtime.sendMessage({ type: 'CLEAR_AI_CACHE' }, resolve);
          });
          if (resp?.status === 'OK') {
            showToast(`Cleared ${resp.cleared} cached expansions`);
            loadAICacheStats();
          } else {
            showToast('Failed to clear AI cache', 'error');
          }
        } catch { showToast('Error clearing AI cache', 'error'); }
        clearAICacheBtn.disabled = false;
      });
    }

    // Bookmarks indexing
    const indexBookmarksInput = modal.querySelector('#modal-indexBookmarks') as HTMLInputElement;
    if (indexBookmarksInput) {
      indexBookmarksInput.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        SettingsManager.setSetting('indexBookmarks', target.checked).catch(() => {});
        syncToggleBar();
        if (target.checked) {
          showToast('Bookmarks indexing enabled. Rebuilding index...', 'info');
          chrome.runtime.sendMessage({ type: 'INDEX_BOOKMARKS' });
        } else {
          showToast('Bookmarks indexing disabled. Bookmark flags will be cleared on next rebuild.', 'info');
        }
      });
    }

    // Advanced Browser Commands: optional permissions must be granted before the setting turns on
    const ADV_BROWSER_OPTIONAL_PERMS = ['tabGroups', 'browsingData', 'topSites'] as const;
    const advBrowserInput = modal.querySelector('#modal-advancedBrowserCommands') as HTMLInputElement;
    if (advBrowserInput) {
      advBrowserInput.addEventListener('change', async (e) => {
        const target = e.target as HTMLInputElement;
        if (!target.checked) {
          await SettingsManager.setSetting('advancedBrowserCommands', false).catch(() => {});
          syncToggleBar();
          showToast('Advanced Browser Commands disabled', 'info');
          return;
        }
        target.disabled = true;
        try {
          const resp = await sendMessage({
            type: 'REQUEST_OPTIONAL_PERMISSIONS',
            permissions: [...ADV_BROWSER_OPTIONAL_PERMS],
          }) as { status?: string; granted?: boolean; error?: string };
          if (resp?.error) {
            target.checked = false;
            await SettingsManager.setSetting('advancedBrowserCommands', false).catch(() => {});
            showToast(
              'Advanced Browser Commands stay off (permission request failed). Try again from chrome://extensions → SmrutiCortex → Details → Permissions.',
              'warning',
            );
            return;
          }
          if (resp?.granted) {
            await SettingsManager.setSetting('advancedBrowserCommands', true).catch(() => {});
            showToast(
              'Advanced Browser Commands enabled. Tab groups, browsing data cleanup, and Top Sites are allowed.',
              'info',
            );
          } else {
            target.checked = false;
            await SettingsManager.setSetting('advancedBrowserCommands', false).catch(() => {});
            showToast(
              'Advanced Browser Commands stay off because optional permissions were not granted. Chrome was asked for: tab groups, browsing data cleanup, and Top Sites. To try again: chrome://extensions → SmrutiCortex → Details → Permissions.',
              'warning',
            );
          }
        } catch {
          target.checked = false;
          await SettingsManager.setSetting('advancedBrowserCommands', false).catch(() => {});
          showToast(
            'Advanced Browser Commands stay off (could not complete permission request). Try again from chrome://extensions → SmrutiCortex → Details.',
            'warning',
          );
        } finally {
          target.disabled = false;
          syncToggleBar();
        }
      });
    }

    // Search result diversity - Show Duplicate URLs
    const showDuplicateUrlsInput = modal.querySelector('#modal-showDuplicateUrls') as HTMLInputElement;
    if (showDuplicateUrlsInput) {
      showDuplicateUrlsInput.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        SettingsManager.setSetting('showDuplicateUrls', target.checked).catch(() => {});
        syncToggleBar();
        showToast(`Duplicate URLs ${target.checked ? 'shown' : 'filtered for diversity'}`, 'info');
        const searchInput = $('search-input') as HTMLInputElement;
        if (searchInput && searchInput.value.trim()) {
          doSearch(searchInput.value);
        }
      });
    }

    // Strict matching - Show Non-Matching Results
    const showNonMatchingResultsInput = modal.querySelector('#modal-showNonMatchingResults') as HTMLInputElement;
    if (showNonMatchingResultsInput) {
      showNonMatchingResultsInput.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        SettingsManager.setSetting('showNonMatchingResults', target.checked).catch(() => {});
        syncToggleBar();
        showToast(`Non-matching results ${target.checked ? 'shown' : 'hidden (strict matching)'}`, 'info');
        const searchInput = $('search-input') as HTMLInputElement;
        if (searchInput && searchInput.value.trim()) {
          doSearch(searchInput.value);
        }
      });
    }

    // Privacy settings - Sensitive URL Blacklist
    const sensitiveUrlBlacklistInput = modal.querySelector('#modal-sensitiveUrlBlacklist') as HTMLTextAreaElement;
    if (sensitiveUrlBlacklistInput) {
      sensitiveUrlBlacklistInput.addEventListener('change', () => {
        const val = sensitiveUrlBlacklistInput.value.trim();
        const blacklist = val ? val.split('\n').map(s => s.trim()).filter(Boolean) : [];
        SettingsManager.setSetting('sensitiveUrlBlacklist', blacklist).catch(() => {});
        showToast(`Blacklist updated (${blacklist.length} entries)`, 'info');
      });
    }

    // --- Command Palette settings ---
    const cpMasterInput = modal.querySelector('#modal-commandPaletteEnabled') as HTMLInputElement;
    const cpInPopupInput2 = modal.querySelector('#modal-commandPaletteInPopup') as HTMLInputElement;
    const cpModeCheckboxes = modal.querySelectorAll<HTMLInputElement>('[id^="modal-palette-mode-"]');

    function updatePaletteDisabledState() {
      const enabled = cpMasterInput?.checked ?? true;
      cpModeCheckboxes.forEach(cb => { cb.disabled = !enabled; });
      if (cpInPopupInput2) {cpInPopupInput2.disabled = !enabled;}
    }

    if (cpMasterInput) {
      cpMasterInput.addEventListener('change', () => {
        SettingsManager.setSetting('commandPaletteEnabled', cpMasterInput.checked).catch(() => {});
        updatePaletteDisabledState();
        showToast('Command Palette ' + (cpMasterInput.checked ? 'enabled' : 'disabled'), 'info');
      });
    }

    cpModeCheckboxes.forEach(cb => {
      cb.addEventListener('change', () => {
        const selected: string[] = [];
        cpModeCheckboxes.forEach(c => { if (c.checked) {selected.push(c.value);} });
        SettingsManager.setSetting('commandPaletteModes', selected).catch(() => {});
        showToast(`Active modes: ${selected.join(' ') || 'none'}`, 'info');
      });
    });

    if (cpInPopupInput2) {
      cpInPopupInput2.addEventListener('change', () => {
        SettingsManager.setSetting('commandPaletteInPopup', cpInPopupInput2.checked).catch(() => {});
        showToast('Popup command palette ' + (cpInPopupInput2.checked ? 'enabled' : 'disabled'), 'info');
      });
    }

    const webEngineInputs = modal.querySelectorAll('input[name="modal-webSearchEngine"]');
    webEngineInputs.forEach(input => {
      input.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.checked) {
          SettingsManager.setSetting('webSearchEngine', target.value).catch(() => {});
          showToast(`Web search engine set to ${target.value}`, 'info');
        }
      });
    });

    const jiraUrlInput2 = modal.querySelector('#modal-jiraSiteUrl') as HTMLInputElement | null;
    if (jiraUrlInput2) {
      jiraUrlInput2.addEventListener('change', () => {
        const raw = jiraUrlInput2.value.trim();
        SettingsManager.setSetting('jiraSiteUrl', raw).catch(() => {});
        showToast(raw ? 'Jira site URL saved' : 'Jira site URL cleared', 'info');
      });
    }
    const confluenceUrlInput2 = modal.querySelector('#modal-confluenceSiteUrl') as HTMLInputElement | null;
    if (confluenceUrlInput2) {
      confluenceUrlInput2.addEventListener('change', () => {
        const raw = confluenceUrlInput2.value.trim();
        SettingsManager.setSetting('confluenceSiteUrl', raw).catch(() => {});
        showToast(raw ? 'Confluence site URL saved' : 'Confluence site URL cleared', 'info');
      });
    }

    // --- Toolbar tab: populate toggle checkboxes ---
    const toolbarOptionsContainer = modal.querySelector('#toolbar-toggle-options') as HTMLDivElement;
    if (toolbarOptionsContainer) {
      const currentToggles = SettingsManager.getSetting('toolbarToggles') ?? ['ollamaEnabled', 'indexBookmarks', 'showDuplicateUrls'];
      toolbarOptionsContainer.innerHTML = '';

      for (const def of TOOLBAR_TOGGLE_DEFS) {
        const isChecked = currentToggles.includes(def.key as string);
        const label = document.createElement('label');
        label.className = 'setting-option';
        label.innerHTML = `
          <input type="checkbox" data-toolbar-key="${def.key}" ${isChecked ? 'checked' : ''}>
          <span class="option-indicator"></span>
          <div class="option-content">
            <strong>${def.icon} ${def.label}</strong>
            <small>${def.tooltipOn}</small>
          </div>
        `;
        const checkbox = label.querySelector('input') as HTMLInputElement;
        checkbox.addEventListener('change', () => {
          const allChecked: string[] = [];
          toolbarOptionsContainer.querySelectorAll<HTMLInputElement>('input[data-toolbar-key]').forEach(cb => {
            if (cb.checked) {allChecked.push(cb.dataset.toolbarKey!);}
          });
          SettingsManager.setSetting('toolbarToggles', allChecked).catch(() => {});
          renderToggleBar();
          showToast(`Toolbar updated (${allChecked.length} toggle${allChecked.length !== 1 ? 's' : ''})`, 'info');
        });
        toolbarOptionsContainer.appendChild(label);
      }
    }

    // Reset button — settings only, keep browsing index
    const resetBtn = modal.querySelector('#modal-reset') as HTMLButtonElement;
    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        if (confirm('Reset settings to defaults?\n\nThis will:\n• Reset all settings to defaults\n• Clear favicon cache\n• Clear search debug history\n\nYour browsing history index will NOT be affected.')) {
          await SettingsManager.resetToDefaults();
          await Logger.setLevel(SettingsManager.getSetting('logLevel') ?? 2);
          sendMessage({ type: 'CLEAR_FAVICON_CACHE' }).catch(() => {});
          sendMessage({ type: 'CLEAR_SEARCH_DEBUG' }).catch(() => {});
          closeSettingsModal();
          renderResults();
          showToast('Settings reset to defaults', 'info');
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
        showToast('🔄 Rebuilding index... This may take a while.', 'info');
        
        try {
          const resp = await sendMessage({ type: 'REBUILD_INDEX' });
          if (resp && resp.status === 'OK') {
            showToast('✅ Index rebuilt successfully!');
            // Refresh storage quota display
            await fetchStorageQuotaInfo();
          } else {
            showToast('❌ Rebuild failed: ' + (resp?.message || 'Unknown error'), 'error');
          }
        } catch (error) {
          showToast('❌ Rebuild failed', 'error');
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
              showToast('✅ Index is up to date', 'info');
            } else {
              const durationSec = (duration / 1000).toFixed(1);
              manualIndexFeedback.textContent = `✓ Indexed ${total} page${total > 1 ? 's' : ''} (${added} new, ${updated} updated) in ${durationSec}s`;
              manualIndexFeedback.className = 'index-feedback success';
              showToast(`✅ Indexed ${total} page${total > 1 ? 's' : ''}`);
              
              // Refresh storage quota display
              await fetchStorageQuotaInfo();
            }
          } else {
            manualIndexFeedback.textContent = '✗ Indexing failed: ' + (resp?.message || 'Unknown error');
            manualIndexFeedback.className = 'index-feedback error';
            showToast('❌ Indexing failed', 'error');
          }
        } catch (error) {
          manualIndexFeedback.textContent = '✗ Indexing failed';
          manualIndexFeedback.className = 'index-feedback error';
          showToast('❌ Indexing failed', 'error');
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

    // Export Index button
    const exportBtn = modal.querySelector('#export-index-btn') as HTMLButtonElement;
    const exportImportFeedback = modal.querySelector('#export-import-feedback') as HTMLSpanElement;
    if (exportBtn) {
      exportBtn.addEventListener('click', async () => {
        exportBtn.disabled = true;
        exportBtn.textContent = '⏳ Exporting...';
        if (exportImportFeedback) {
          exportImportFeedback.textContent = '';
          exportImportFeedback.className = 'index-feedback';
        }
        try {
          const resp = await sendMessage({ type: 'EXPORT_INDEX' });
          if (resp?.status === 'OK' && resp.data) {
            const blob = new Blob([JSON.stringify(resp.data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `smruti-cortex-export-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            if (exportImportFeedback) {
              exportImportFeedback.textContent = `✓ Exported ${resp.data.itemCount} items`;
              exportImportFeedback.className = 'index-feedback success';
            }
            showToast(`✅ Exported ${resp.data.itemCount} items`);
          } else {
            if (exportImportFeedback) {
              exportImportFeedback.textContent = '✗ Export failed: ' + (resp?.message || 'Unknown error');
              exportImportFeedback.className = 'index-feedback error';
            }
            showToast('❌ Export failed', 'error');
          }
        } catch (error) {
          console.error('Export error:', error);
          if (exportImportFeedback) {
            exportImportFeedback.textContent = '✗ Export failed';
            exportImportFeedback.className = 'index-feedback error';
          }
          showToast('❌ Export failed', 'error');
        } finally {
          exportBtn.disabled = false;
          exportBtn.textContent = '📥 Export Index';
          setTimeout(() => {
            if (exportImportFeedback) {
              exportImportFeedback.textContent = '';
              exportImportFeedback.className = 'index-feedback';
            }
          }, 5000);
        }
      });
    }

    // Import Index button
    const importBtn = modal.querySelector('#import-index-btn') as HTMLButtonElement;
    const importFileInput = modal.querySelector('#import-index-file') as HTMLInputElement;
    if (importBtn && importFileInput) {
      importBtn.addEventListener('click', () => importFileInput.click());
      importFileInput.addEventListener('change', async () => {
        const file = importFileInput.files?.[0];
        if (!file) {return;}
        importFileInput.value = '';
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          if (!data.items || !Array.isArray(data.items)) {
            showToast('Invalid file: missing items array', 'error');
            return;
          }
          if (!confirm(`Import ${data.items.length} items into your index?\n\nExisting items with the same URL will be updated.`)) {
            return;
          }
          importBtn.disabled = true;
          importBtn.textContent = '⏳ Importing...';
          if (exportImportFeedback) {
            exportImportFeedback.textContent = '';
            exportImportFeedback.className = 'index-feedback';
          }
          const resp = await sendMessage({ type: 'IMPORT_INDEX', items: data.items });
          if (resp?.status === 'OK') {
            if (exportImportFeedback) {
              exportImportFeedback.textContent = `✓ Imported ${resp.imported} items` + (resp.skipped > 0 ? ` (${resp.skipped} skipped)` : '');
              exportImportFeedback.className = 'index-feedback success';
            }
            showToast(`✅ Imported ${resp.imported} items`);
            await fetchStorageQuotaInfo();
          } else {
            if (exportImportFeedback) {
              exportImportFeedback.textContent = '✗ Import failed: ' + (resp?.message || 'Unknown error');
              exportImportFeedback.className = 'index-feedback error';
            }
            showToast('❌ Import failed', 'error');
          }
        } catch (error) {
          console.error('Import error:', error);
          showToast('Import failed: invalid JSON file', 'error');
        } finally {
          importBtn.disabled = false;
          importBtn.textContent = '📤 Import Index';
          setTimeout(() => {
            if (exportImportFeedback) {
              exportImportFeedback.textContent = '';
              exportImportFeedback.className = 'index-feedback';
            }
          }, 5000);
        }
      });
    }

    // Clear data button
    const clearBtn = modal.querySelector('#modal-clear') as HTMLButtonElement;
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        if (!confirm('Clear index and rebuild?\n\nThis will:\n• Delete your browsing history index\n• Immediately rebuild from browser history\n\nSettings will NOT be changed. This takes a few seconds.')) {
          return;
        }
        
        clearBtn.disabled = true;
        clearBtn.textContent = '⏳ Clearing & Rebuilding...';
        showToast('🔄 Clearing data and rebuilding index...', 'info');
        
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
            showToast('❌ Operation failed: ' + (resp?.message || 'Unknown error'), 'error');
          }
        } catch (error) {
          showToast('❌ Failed to clear data', 'error');
          console.error('Clear data error:', error);
        } finally {
          clearBtn.disabled = false;
          clearBtn.textContent = '🗑️ Clear & Rebuild';
        }
      });
    }

    // Factory Reset — clears index + resets settings + clears all caches + rebuilds
    const factoryResetBtn = modal.querySelector('#modal-factory-reset') as HTMLButtonElement;
    if (factoryResetBtn) {
      factoryResetBtn.addEventListener('click', async () => {
        if (!confirm('Factory reset the extension?\n\nThis will:\n• Reset ALL settings to defaults\n• Clear ALL indexed data and caches\n• Rebuild the index from your browser history\n\nThis is a complete fresh start. It takes a few seconds.')) {
          return;
        }

        factoryResetBtn.disabled = true;
        factoryResetBtn.textContent = '⏳ Resetting...';
        showToast('⚙️ Factory resetting...', 'info');

        try {
          // Reset settings first
          await SettingsManager.resetToDefaults();
          await Logger.setLevel(SettingsManager.getSetting('logLevel') ?? 2);
          // Clear caches in parallel
          await Promise.allSettled([
            sendMessage({ type: 'CLEAR_FAVICON_CACHE' }),
            sendMessage({ type: 'CLEAR_SEARCH_DEBUG' }),
          ]);
          // Clear all data and rebuild
          const resp = await sendMessage({ type: 'CLEAR_ALL_DATA' });
          if (resp && resp.status === 'OK') {
            const itemCount = resp.itemCount || 0;
            showToast(`✅ Factory reset complete! ${itemCount} items indexed.`);
            await fetchStorageQuotaInfo();
            resultsLocal = [];
            activeIndex = -1;
            renderResults();
            closeSettingsModal();
          } else {
            showToast('❌ Factory reset failed: ' + (resp?.message || 'Unknown error'), 'error');
          }
        } catch (error) {
          showToast('❌ Factory reset failed', 'error');
          console.error('Factory reset error:', error);
        } finally {
          factoryResetBtn.disabled = false;
          factoryResetBtn.textContent = '⚠️ Factory Reset';
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
            showToast('❌ Failed to export diagnostics', 'error');
          }
        } catch (err) {
          showToast('❌ Error exporting diagnostics', 'error');
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
        showToast(searchDebugCheckbox.checked ? '✅ Debug mode enabled' : '🔇 Debug mode disabled', 'info');
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
            showToast('❌ No debug data available', 'warning');
          }
        } catch (err) {
          showToast('❌ Error exporting debug data', 'error');
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
          showToast('🗑️ Debug history cleared', 'info');
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

  function applyTheme(theme: 'light' | 'dark' | 'auto') {
    if (theme === 'auto') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }

  function applyRemoteSettingsChanges(settings: Record<string, unknown> | undefined): void {
    if (!settings) {return;}
    SettingsManager.applyRemoteSettings(settings).catch(() => {});
    const keys = Object.keys(settings);

    if (keys.includes('theme')) {
      applyTheme(String(settings.theme ?? 'auto') as 'light' | 'dark' | 'auto');
    }
    if (keys.includes('toolbarToggles')) {
      renderToggleBar();
    } else {
      syncToggleBar();
    }
    if (keys.some(k => ['displayMode', 'highlightMatches', 'loadFavicons'].includes(k))) {
      renderResults();
    }
    if (keys.some(k => ['showRecentHistory', 'showRecentSearches', 'sortBy', 'defaultResultCount'].includes(k))) {
      if (!currentQuery?.trim()) { loadRecentHistory(); }
    }
    if (keys.some(k => k === 'jiraSiteUrl' || k === 'confluenceSiteUrl' || k === 'webSearchEngine') && popupPaletteMode === 'websearch') {
      const input = $('search-input') as HTMLInputElement;
      if (input) {
        const { query } = detectPopupMode(input.value.trim());
        renderPopupPaletteResults('websearch', query);
      }
    }
  }

  // Apply theme immediately from stored setting
  applyTheme((SettingsManager.getSetting('theme') ?? 'auto') as 'light' | 'dark' | 'auto');

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
          <span>Enter: open in new tab · Shift+Enter: background tab · Ctrl+C: copy HTML · Ctrl+M: copy markdown</span>
          <span>↑↓: navigate · ←→: move columns (cards) · Esc: clear · Ctrl+Shift+S: quick open · Type "sc " in address bar</span>
        `;
      }
    });

    // Auto-show tour on first install
    isTourCompleted().then(completed => {
      if (!completed) {
        setTimeout(() => runTour(POPUP_TOUR_STEPS, document), 500);
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
        applyRemoteSettingsChanges(message.settings);
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
        applyRemoteSettingsChanges(message.settings);
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
        document.getElementById('analytics-total')!.textContent = analytics.totalSearches.toString(); // eslint-disable-line @typescript-eslint/no-non-null-assertion
        document.getElementById('analytics-avg-results')!.textContent = analytics.averageResultCount.toFixed(1); // eslint-disable-line @typescript-eslint/no-non-null-assertion
        document.getElementById('analytics-avg-duration')!.textContent = `${analytics.averageSearchDuration.toFixed(2)} ms`; // eslint-disable-line @typescript-eslint/no-non-null-assertion

        // Top queries
        const topQueriesDiv = document.getElementById('analytics-top-queries');
        if (topQueriesDiv && analytics.topQueries.length > 0) {
          topQueriesDiv.innerHTML = analytics.topQueries
            .map(({ query, count }) => `
              <div class="query-item">
                <span class="query-text">"${escapeHtml(query)}"</span>
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
          recentDiv.innerHTML = [...history]
            .reverse()
            .map((entry: SearchDebugEntry) => `
              <div class="search-entry">
                <div class="search-query">"${escapeHtml(entry.query)}"</div>
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

    const closeBtn = modal.querySelector('#analytics-close') as HTMLElement;
    if (closeBtn) {
      const newClose = closeBtn.cloneNode(true) as HTMLElement;
      closeBtn.replaceWith(newClose);
      newClose.addEventListener('click', () => {
        modal.classList.add('hidden');
      });
    }
  }
}
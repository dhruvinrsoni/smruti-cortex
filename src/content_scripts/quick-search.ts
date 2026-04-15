/**
 * quick-search.ts — SmrutiCortex In-Page Search Overlay
 *
 * The modern face of SmrutiCortex: an instant, full-featured search overlay
 * injected directly into every web page. Activates via keyboard shortcut
 * without leaving the current tab — faster than any popup.
 *
 * Key architectural decisions:
 *   - Closed Shadow DOM: complete style isolation from any host page CSS
 *   - Port-based messaging: persistent connection to the service worker for
 *     real-time search-as-you-type without per-message handshake overhead
 *   - MHTML-safe: overlay detaches from DOM when hidden, so browser "Save As"
 *     and print never capture extension UI into saved pages
 *   - Zero-downtime updates: survives extension reloads via automatic
 *     re-injection from the service worker (see service-worker.ts Tier 2)
 *   - Graceful degradation: if injection fails on a restricted page, the
 *     service worker falls back to the classic popup — the user never sees
 *     an error, only a slightly different (but fully functional) UI
 */

/* eslint-disable no-inner-declarations */
// ^ Functions intentionally nested inside conditional blocks to guard against double-injection

import {
  type SearchResult,
  type FocusableGroup,
  type AIStatus,
  KeyboardAction,
  createMarkdownLink,
  copyHtmlLinkToClipboard,
  escapeHtml,
  handleCyclicTabNavigation,
  parseKeyboardAction,
  renderResults as renderResultsShared,
  sortResults,
  tokenizeQuery,
  highlightHtml,
  renderAIStatus as renderAIStatusShared,
} from '../shared/search-ui-base';

import { type AppSettings, DisplayMode } from '../core/settings';
import { addRecentSearch, getRecentSearches, clearRecentSearches } from '../shared/recent-searches';
import { addRecentInteraction, getRecentInteractions, clearRecentInteractions } from '../shared/recent-interactions';
import { runTour, type TourStep } from '../shared/tour';
import { getToggleDef, getCycleState, getNextCycleValue } from '../shared/toolbar-toggles';
import {
  type PaletteCommand,
  ALL_COMMANDS,
  preparePaletteCommandList,
  getPowerSettingsPatch,
  getCommandsByTier,
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
import {
  type PaletteMode,
  sanitizeQuery as sanitizeQueryPure,
  detectMode as detectModePure,
  clampWidth as clampWidthPure,
  clampHeight as clampHeightPure,
  formatTimeAgo,
  isOverlayKey as isOverlayKeyPure,
  prevWordBoundary,
  nextWordBoundary,
} from './quick-search-utils';

// Extend window interface for our extension
declare global {
  interface Window {
    __SMRUTI_QUICK_SEARCH_LOADED__?: boolean;
  }
}

// Prevent double-injection within the same extension lifecycle.
// After an extension update, Chrome destroys the old isolated world and
// creates a fresh one, so this flag resets automatically — allowing the
// service worker to re-inject us via chrome.scripting.executeScript()
// without a page reload. See service-worker.ts "Zero-Downtime" comments.
if (!window.__SMRUTI_QUICK_SEARCH_LOADED__) {
  window.__SMRUTI_QUICK_SEARCH_LOADED__ = true;

  // ===== CONFIGURATION =====
  const OVERLAY_ID = 'smruti-cortex-overlay';

  // Clean up any stale overlay left by a previous extension version.
  // The old content script's shadow host may linger in the DOM after
  // an extension update — remove it so the new overlay initializes cleanly.
  const staleOverlay = document.getElementById(OVERLAY_ID);
  if (staleOverlay) { staleOverlay.remove(); }
  const DEBOUNCE_MS = 150; // Wait for user to pause typing before searching (prevents flicker)
  const MAX_RESULTS = 15;
  
  // Log level constants (matches Logger.LogLevel)
  const LOG_LEVEL = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
    TRACE: 4
  };
  
  // Dynamic log level - fetched from settings
  let currentLogLevel = LOG_LEVEL.INFO;

  // ===== STRUCTURED LOGGING =====
  // All logs go through these helpers so they respect the dynamic log level
  const log = {
    error: (tag: string, ...args: unknown[]) => {
      if (currentLogLevel >= LOG_LEVEL.ERROR) { console.error(`[SmrutiCortex:${tag}]`, ...args); }
    },
    warn: (tag: string, ...args: unknown[]) => {
      if (currentLogLevel >= LOG_LEVEL.WARN) { console.warn(`[SmrutiCortex:${tag}]`, ...args); }
    },
    info: (tag: string, ...args: unknown[]) => {
      if (currentLogLevel >= LOG_LEVEL.INFO) { console.info(`[SmrutiCortex:${tag}]`, ...args); }
    },
    debug: (tag: string, ...args: unknown[]) => {
      if (currentLogLevel >= LOG_LEVEL.DEBUG) { console.debug(`[SmrutiCortex:${tag}]`, ...args); }
    },
    trace: (tag: string, ...args: unknown[]) => {
      if (currentLogLevel >= LOG_LEVEL.TRACE) { console.debug(`[SmrutiCortex:${tag}]`, ...args); }
    },
  };

  // ===== PERFORMANCE TIMING =====
  const perfLog = (label: string, startTime?: number) => {
    if (currentLogLevel < LOG_LEVEL.DEBUG) {return;}
    if (startTime !== undefined) {
      console.debug(`[SmrutiCortex Perf] ${label}: ${(performance.now() - startTime).toFixed(2)}ms`);
    } else {
      console.debug(`[SmrutiCortex Perf] ${label} @ ${performance.now().toFixed(2)}ms`);
    }
  };

  // ===== STATE =====
  let shadowHost: HTMLDivElement | null = null;
  let shadowRoot: ShadowRoot | null = null;
  let overlayEl: HTMLDivElement | null = null;
  let inputEl: HTMLInputElement | null = null;
  let resultsEl: HTMLDivElement | null = null;
  let settingsBtn: HTMLButtonElement | null = null;
  let selectedIndex = 0;
  let currentResults: SearchResult[] = [];
  let debounceTimer: number | null = null;
  let qsFocusTimer: number | null = null;  // Delayed focus to results (cancelled on new typing)
  let overlayFocusInterval: ReturnType<typeof setInterval> | null = null; // Tracked to prevent leaks
  let overlayFocusTimeouts: ReturnType<typeof setTimeout>[] = [];         // Tracked backup timeouts
  let searchPort: chrome.runtime.Port | null = null;
  let prewarmed = false;
  let cachedSettings: AppSettings | null = null;
  let searchDebounceMs = DEBOUNCE_MS;
  let aiDebounceTimer: number | null = null; // Separate longer debounce for AI expansion
  let aiSearchPending = false; // True from handleInput until Phase 2 response arrives (or AI disabled)
  let hidePortCloseTimer: number | null = null;
  let spinnerEl: HTMLDivElement | null = null;
  let clearBtnEl: HTMLButtonElement | null = null;
  let aiStatusBarEl: HTMLDivElement | null = null;
  let footerEl: HTMLDivElement | null = null;
  let toggleBarEl: HTMLDivElement | null = null;
  let currentAIExpandedTokens: string[] = [];
  let spinnerTimeoutTimer: number | null = null; // Safety timeout to prevent stuck spinner
  let visibilityChangeHandler: (() => void) | null = null;
  const SPINNER_TIMEOUT_MS = 15_000; // Hide spinner after 15s if no response

  // Command palette state
  let currentMode: PaletteMode = 'history';
  let modeBadgeEl: HTMLDivElement | null = null;
  let confirmingCommand: PaletteCommand | null = null;
  let qsWindowPickerActive = false;
  let cachedTabs: chrome.tabs.Tab[] | null = null;
  let cachedBookmarks: chrome.bookmarks.BookmarkTreeNode[] | null = null;
  let firstUseHintEl: HTMLDivElement | null = null;
  let firstUseHintTimer: number | null = null;
  // Helper: returns the currently focused element inside our shadow root if any
  function getFocusedElement(): Element | null {
    try {
      if (shadowRoot) {
        const focused = shadowRoot.querySelector(':focus') as Element | null;
        if (focused) { return focused; }
      }
    } catch {
      // ignore
    }
    return document.activeElement;
  }

  // Helper: Check if extension context is still valid
  function isExtensionContextValid(): boolean {
    try {
      return !!(chrome?.runtime?.id);
    } catch {
      return false;
    }
  }

  // No-reload reconnect: re-establish port and retry search without reloading
  // the page. After an extension update, the service worker re-injects this
  // content script automatically (via chrome.scripting). This function handles
  // the content-script side: reset recovery state, reopen the port, and
  // retry the current query so the user never loses their underlying page.
  function attemptNoReloadReconnect(): void {
    if (isExtensionContextValid()) {
      openSearchPort();
      const query = inputEl?.value?.trim() || '';
      if (query.length > 0) {
        performSearch(query, true);
      } else {
        loadRecentHistory();
      }
    } else {
      showToast('Extension context not available yet — press Ctrl+Shift+S to trigger re-injection.', 'warning', 8000);
    }
  }

  const sanitizeQuery = sanitizeQueryPure;

  const QUICK_SEARCH_TOUR_STEPS: TourStep[] = [
    { target: '.search-input', title: 'Search', description: 'Type anything — title, URL, or keywords. Results appear instantly.', position: 'bottom' },
    { target: '.sort-btn', title: 'Sort', description: 'Switch between Best Match, Most Recent, Most Visited, or Alphabetical.', position: 'bottom' },
    { target: '.ai-status-bar', title: 'AI Status', description: 'When Ollama AI is enabled in Settings, a status bar appears here showing search sources: Keyword [LEXICAL], AI Cache [ENGRAM], or AI Live [NEURAL].', position: 'bottom' },
    { target: '.palette-hints', title: 'Command Palette', description: 'Type / for commands, > for admin, @ to switch tabs, # to search bookmarks. Your keyboard is the remote control for the entire browser.', position: 'top' },
    { target: '.footer', title: 'Keyboard Shortcuts', description: 'Enter opens in new tab. Shift+Enter opens in background. Use arrow keys to navigate results. Esc closes the overlay.', position: 'top' },
    { target: '.help-link', title: 'Help', description: 'Click "?" anytime to replay this tour. Press Ctrl+Shift+S to open/close the overlay.', position: 'top' },
  ];

  // ===== STYLES (inlined for instant loading, with CSS containment) =====
  // Supports both light and dark themes via prefers-color-scheme
  const OVERLAY_STYLES = `
    :host {
      all: initial;
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      z-index: 2147483647 !important;
      pointer-events: none;
      color-scheme: light dark;
    }
    :host(.visible) {
      pointer-events: auto;
    }
    * {
      box-sizing: border-box;
    }
    
    /* CSS Variables for theming */
    :host {
      --bg-overlay: rgba(0, 0, 0, 0.5);
      --bg-container: #ffffff;
      --bg-header: #f8f9fa;
      --bg-hover: #e9ecef;
      --bg-card: #f8f9fa;
      --bg-kbd: #e9ecef;
      --border-color: #dee2e6;
      --text-primary: #212529;
      --text-secondary: #6c757d;
      --text-url: #6c757d;
      --accent-color: #0d6efd;
      --highlight-bg: #fff3cd;
      --highlight-text: #664d03;
      --highlight-ai-bg: #dcfce7;
      --highlight-ai-text: #14532d;
    }

    @media (prefers-color-scheme: dark) {
      :host(:not([data-theme="light"])) {
        --bg-overlay: rgba(0, 0, 0, 0.6);
        --bg-container: #1e1e2e;
        --bg-header: #181825;
        --bg-hover: #313244;
        --bg-card: #252536;
        --bg-kbd: #313244;
        --border-color: #313244;
        --text-primary: #cdd6f4;
        --text-secondary: #a6adc8;
        --text-url: #6c7086;
        --accent-color: #89b4fa;
        --highlight-bg: #fab387;
        --highlight-text: #1e1e2e;
        --highlight-ai-bg: #14532d;
        --highlight-ai-text: #dcfce7;
      }
    }
    :host([data-theme="dark"]) {
      --bg-overlay: rgba(0, 0, 0, 0.6);
      --bg-container: #1e1e2e;
      --bg-header: #181825;
      --bg-hover: #313244;
      --bg-card: #252536;
      --bg-kbd: #313244;
      --border-color: #313244;
      --text-primary: #cdd6f4;
      --text-secondary: #a6adc8;
      --text-url: #6c7086;
      --accent-color: #89b4fa;
      --highlight-bg: #fab387;
      --highlight-text: #1e1e2e;
      --highlight-ai-bg: #14532d;
      --highlight-ai-text: #dcfce7;
    }
    
    .overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: var(--bg-overlay);
      display: none;
      justify-content: center;
      align-items: flex-start;
      padding-top: 8vh;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      contain: layout style;
    }
    .overlay.visible {
      display: flex;
    }
    .container {
      position: relative;
      display: flex;
      flex-direction: column;
      width: 680px;
      max-width: 92vw;
      background: var(--bg-container);
      border-radius: 12px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      overflow: hidden;
      contain: content;
      will-change: transform;
    }
    .container.user-resized .results {
      max-height: none;
    }
    .container.user-resized .results.cards {
      max-height: none;
    }
    .header {
      display: flex;
      align-items: center;
      padding: 16px;
      background: var(--bg-header);
      border-bottom: 1px solid var(--border-color);
    }
    .logo {
      width: 28px;
      height: 28px;
      margin-right: 12px;
      display: block;
      flex-shrink: 0;
      object-fit: contain;
    }
    .search-input-wrapper {
      flex: 1;
      position: relative;
      display: flex;
      align-items: center;
    }
    .search-input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      font-size: 18px;
      color: var(--text-primary);
      caret-color: var(--accent-color);
      padding-right: 24px;
    }
    .search-input::placeholder {
      color: var(--text-secondary);
    }
    .clear-input-btn {
      position: absolute;
      right: 2px;
      border: none;
      background: transparent;
      color: #e05252;
      cursor: pointer;
      font-size: 18px;
      font-weight: 700;
      line-height: 1;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 2px;
      opacity: 0.7;
      transition: opacity 0.15s, color 0.15s;
    }
    .clear-input-btn:hover {
      opacity: 1;
      color: #d32f2f;
    }
    .clear-input-btn.visible {
      display: flex;
    }
    .sort-btn {
      background: var(--bg-kbd);
      border: 1px solid var(--border-color);
      cursor: pointer;
      padding: 6px 10px;
      margin-left: 8px;
      border-radius: 6px;
      color: var(--text-primary);
      font-size: 16px;
      line-height: 1;
      transition: background 0.15s, border-color 0.2s;
      min-width: 32px;
      text-align: center;
    }
    .sort-btn:hover {
      background: var(--bg-hover);
      border-color: var(--accent-color);
    }
    .sort-btn:focus {
      outline: none;
      border-color: var(--accent-color);
      box-shadow: 0 0 0 2px rgba(13, 110, 253, 0.1);
    }
    .kbd {
      background: var(--bg-kbd);
      color: var(--text-secondary);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      margin-left: 8px;
    }
    .settings-btn {
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 6px;
      margin-left: 8px;
      border-radius: 4px;
      color: var(--text-secondary);
      font-size: 16px;
      line-height: 1;
      transition: background 0.15s, color 0.15s;
    }
    .settings-btn:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
    .results {
      max-height: 65vh;
      overflow-y: auto;
      padding: 8px 0;
      contain: content;
      flex: 1;
      min-height: 0;
    }
    /* Card view: 3-row grid with horizontal scroll (mirrors popup card layout) */
    .results.cards {
      display: grid;
      grid-template-rows: repeat(3, auto);
      grid-auto-flow: column;
      grid-auto-columns: clamp(150px, 28vw, 210px);
      overflow-x: auto;
      overflow-y: auto;
      gap: 10px;
      max-height: 55vh;
      padding: 8px;
      contain: layout style;
    }
    .results.cards .result-card {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px 10px;
      border-radius: 8px;
      cursor: pointer;
      border: 1px solid var(--border-color);
      background: var(--bg-container);
      transition: all 0.2s ease;
      overflow: hidden;
    }
    .results.cards .result-card:hover,
    .results.cards .result-card.selected {
      background: var(--bg-hover);
      border-color: var(--accent-color);
      box-shadow: 0 0 0 2px rgba(13, 110, 253, 0.2);
    }
    .results.cards .result-card:focus {
      outline: 2px solid var(--accent-color);
      outline-offset: -2px;
    }
    .results.cards .card-favicon {
      width: 20px;
      height: 20px;
      border-radius: 4px;
      background: #24333f;
      display: block;
      flex-shrink: 0;
      margin-bottom: 2px;
    }
    .results.cards .card-details {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      width: 100%;
      gap: 2px;
    }
    .results.cards .card-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.4;
    }
    .results.cards .card-url {
      font-size: 11px;
      color: var(--text-url);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
      line-height: 1.3;
    }
    .result {
      display: flex;
      flex-direction: column;
      padding: 10px 16px;
      cursor: pointer;
      border-left: 3px solid transparent;
      contain: layout style;
      content-visibility: auto;
    }
    .result:hover,
    .result.selected {
      background: var(--bg-hover);
      border-left-color: var(--accent-color);
    }
    .result-title {
      color: var(--text-primary);
      font-size: 14px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 2px;
    }
    .result-url {
      color: var(--text-url);
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    /* Favicon sizing: list and card parity with popup */
    .results .favicon { width: 16px; height: 16px; border-radius: 3px; background:#24333f; flex-shrink:0; margin-right:8px; }
    .results .card-favicon { width: 32px; height: 32px; border-radius: 6px; background:#24333f; display:block; margin-bottom:4px; }
    /* Bookmark indicator and folder styles shared with popup */
    .bookmark-indicator { color: var(--accent-color); font-size: 16px; font-weight: 600; margin-right: 6px; vertical-align: middle; }
    .bookmark-folder { font-size: 0.85em; color: #6b7280; margin-left: 8px; }
    .highlight {
      background: var(--highlight-bg);
      color: var(--highlight-text);
      border-radius: 2px;
      padding: 0 2px;
    }
    .highlight-ai {
      background: var(--highlight-ai-bg);
      color: var(--highlight-ai-text);
      border-radius: 2px;
      padding: 0 2px;
    }
    .empty {
      padding: 24px;
      text-align: center;
      color: var(--text-secondary);
    }
    .toast {
      position: fixed;
      top: 12px;
      left: 50%;
      transform: translateX(-50%) translateY(-8px);
      color: #fff;
      padding: 10px 20px;
      border-radius: 8px;
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
      z-index: 999999;
      background: #10b981;
    }
    .toast.show {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    .toast.toast-error   { background: #ef4444; }
    .toast.toast-warning { background: #f59e0b; }
    .toast.toast-info    { background: #3b82f6; }
    .resize-handle-bottom {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 14px;
      height: 6px;
      cursor: ns-resize;
      z-index: 10;
    }
    .resize-handle-corner {
      position: absolute;
      bottom: 0;
      right: 0;
      width: 14px;
      height: 14px;
      cursor: nwse-resize;
      z-index: 11;
    }
    .resize-handle-corner::after {
      content: '';
      position: absolute;
      right: 3px;
      bottom: 3px;
      width: 8px;
      height: 8px;
      border-right: 2px solid var(--text-secondary);
      border-bottom: 2px solid var(--text-secondary);
      opacity: 0.3;
      transition: opacity 0.15s;
    }
    .container:hover .resize-handle-corner::after {
      opacity: 0.6;
    }
    .footer {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      padding: 10px 16px;
      background: var(--bg-header);
      border-top: 1px solid var(--border-color);
      font-size: 11px;
      color: var(--text-secondary);
    }
    .footer span {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .footer kbd {
      background: var(--bg-kbd);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: inherit;
    }
    .help-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: none;
      background: var(--bg-kbd);
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 600;
      margin-left: auto;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .help-link:hover {
      background: var(--accent-color);
      color: var(--bg-container);
    }
    /* Loading spinner shown during AI-powered searches */
    .search-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid var(--border-color);
      border-top-color: var(--accent-color);
      border-radius: 50%;
      animation: sc-spin 0.7s linear infinite;
      margin-left: 8px;
      flex-shrink: 0;
      display: none;
    }
    .search-spinner.active {
      display: block;
    }
    @keyframes sc-spin {
      to { transform: rotate(360deg); }
    }
    .result-count {
      padding: 2px 16px;
      font-size: 11px;
      color: var(--text-secondary);
      min-height: 0;
    }
    .result-count:empty { display: none; }
    /* AI status bar below the header */
    .ai-status-bar {
      padding: 3px 16px;
      font-size: 11px;
      color: var(--text-secondary);
      background: var(--bg-header);
      border-bottom: 1px solid var(--border-color);
      display: none;
      align-items: center;
      gap: 8px;
      overflow: hidden;
      white-space: nowrap;
    }
    .ai-status-bar.visible {
      display: flex;
    }
    .ai-status-bar .ai-badge {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 600;
    }
    .ai-badge.ai-active {
      background: rgba(16, 185, 129, 0.15);
      color: #10b981;
    }
    .ai-badge.ai-cache {
      background: rgba(59, 130, 246, 0.15);
      color: #3b82f6;
    }
    .ai-badge.ai-error {
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
    }
    .ai-badge.ai-semantic {
      background: rgba(139, 92, 246, 0.15);
      color: #8b5cf6;
    }
    .ai-badge.ai-lexical {
      background: rgba(100, 116, 139, 0.12);
      color: #64748b;
      letter-spacing: 0.04em;
    }
    .ai-status-bar .ai-time {
      margin-left: auto;
      opacity: 0.7;
    }
    /* Toggle chip bar */
    .toggle-bar {
      display: flex;
      gap: 6px;
      padding: 4px 16px;
      align-items: center;
      flex-wrap: wrap;
      min-height: 0;
    }
    .toggle-bar:empty {
      display: none;
    }
    .toggle-chip {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid var(--bg-hover);
      background: transparent;
      color: var(--text-secondary);
      transition: all 0.18s ease;
      user-select: none;
      white-space: nowrap;
      font-family: inherit;
      line-height: 1.5;
      opacity: 0.5;
    }
    .toggle-chip:hover {
      opacity: 0.75;
    }
    .toggle-chip.active {
      background: var(--accent-color);
      color: #fff;
      border-color: var(--accent-color);
      opacity: 1;
      box-shadow: 0 0 8px rgba(13, 110, 253, 0.4);
    }
    .toggle-chip .chip-icon {
      font-size: 12px;
    }
    .recent-searches-section {
      margin-bottom: 8px;
      border-bottom: 1px solid var(--bg-hover);
      padding-bottom: 6px;
    }
    .recent-searches-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 8px;
    }
    .recent-searches-title {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .recent-searches-clear {
      background: none;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: inherit;
    }
    .recent-searches-clear:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
    .recent-search-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      cursor: pointer;
      border-radius: 6px;
      font-size: 13px;
      color: var(--text-primary);
    }
    .recent-search-item:hover,
    .recent-search-item:focus {
      background: var(--bg-hover);
      outline: none;
    }
    .recent-search-icon {
      font-size: 12px;
      flex-shrink: 0;
    }
    .recent-search-query {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Command Palette — mode badge */
    .mode-badge {
      position: absolute;
      left: 8px;
      top: 50%;
      transform: translateY(-50%);
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.03em;
      pointer-events: none;
      z-index: 1;
    }
    .mode-badge.mode-commands  { background: rgba(59,130,246,0.15); color: #3b82f6; }
    .mode-badge.mode-power     { background: rgba(245,158,11,0.15); color: #f59e0b; }
    .mode-badge.mode-tabs      { background: rgba(16,185,129,0.15); color: #10b981; }
    .mode-badge.mode-bookmarks { background: rgba(139,92,246,0.15); color: #8b5cf6; }
    .mode-badge.mode-websearch { background: rgba(234,88,12,0.15);  color: #ea580c; }
    .mode-badge.mode-help      { background: rgba(107,114,128,0.15); color: #6b7280; }

    /* Command Palette — command rows */
    .command-row {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 6px;
      cursor: pointer;
      border: 1px solid transparent;
      background: var(--bg-card);
      transition: all 0.15s ease;
    }
    .command-row:hover, .command-row.selected {
      background: var(--bg-hover);
      border-color: var(--border-color);
    }
    .cmd-icon { font-size: 16px; flex-shrink: 0; width: 24px; text-align: center; margin-top: 1px; }
    .cmd-label { flex: 1; font-size: 13px; font-weight: 500; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cmd-current { font-size: 10px; color: var(--accent-color, #3b82f6); font-weight: 600; }
    .cmd-category {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-secondary);
      background: var(--bg-header);
      padding: 1px 6px;
      border-radius: 3px;
      flex-shrink: 0;
    }
    .cmd-danger { flex-shrink: 0; }
    .cmd-shortcut {
      font-size: 10px;
      color: var(--text-secondary);
      background: var(--bg-kbd, rgba(0,0,0,0.06));
      padding: 1px 5px;
      border-radius: 3px;
      flex-shrink: 0;
      font-family: ui-monospace, SFMono-Regular, monospace;
    }
    .cmd-alias {
      font-size: 9px;
      color: var(--text-secondary);
      opacity: 0.6;
      flex-shrink: 0;
    }
    .cmd-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .cmd-label-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
    .cmd-hint {
      font-size: 11px;
      color: var(--text-secondary);
      opacity: 0.9;
      line-height: 1.25;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .palette-category-header {
      list-style: none;
      padding: 8px 12px 4px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-secondary);
      cursor: default;
      margin-top: 4px;
    }
    .palette-category-header:first-child { margin-top: 0; }

    .palette-discovery-tip {
      list-style: none;
      padding: 8px 12px 6px;
      font-size: 12px;
      color: var(--text-secondary);
      line-height: 1.35;
      cursor: default;
    }
    .palette-hint-line {
      list-style: none;
      padding: 5px 12px 5px 16px;
      font-size: 11px;
      color: var(--text-secondary);
      line-height: 1.4;
      cursor: default;
    }
    .palette-hint-line code {
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-size: 10px;
      background: var(--bg-kbd, rgba(0,0,0,0.06));
      padding: 1px 5px;
      border-radius: 3px;
    }
    .palette-hint-muted { opacity: 0.85; }

    /* Command Palette — confirmation view */
    .confirm-view {
      text-align: center;
      padding: 32px 16px;
    }
    .confirm-icon { font-size: 32px; margin-bottom: 8px; }
    .confirm-title { font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px; }
    .confirm-label { font-size: 13px; color: var(--text-secondary); margin-bottom: 16px; }
    .confirm-actions {
      display: flex;
      justify-content: center;
      gap: 24px;
      font-size: 12px;
      color: var(--text-secondary);
    }
    .confirm-actions kbd {
      background: var(--bg-kbd, rgba(0,0,0,0.06));
      padding: 2px 6px;
      border-radius: 3px;
    }

    /* Command Palette — tab results */
    .tab-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 6px;
      cursor: pointer;
      border: 1px solid transparent;
      background: var(--bg-card);
      transition: all 0.15s ease;
    }
    .tab-row:hover, .tab-row.selected {
      background: var(--bg-hover);
      border-color: var(--border-color);
    }
    .tab-favicon { width: 16px; height: 16px; border-radius: 3px; flex-shrink: 0; }
    .tab-details { display: flex; flex-direction: column; overflow: hidden; flex: 1; }
    .tab-title { font-size: 13px; font-weight: 500; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tab-url { font-size: 11px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, SFMono-Regular, monospace; }
    .tab-badges { font-size: 11px; flex-shrink: 0; color: var(--text-secondary); }
    .tab-window-sep {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-secondary);
      padding: 6px 12px 2px;
      font-weight: 600;
      cursor: default;
    }
    .recently-closed-sep { border-top: 1px solid var(--border-color); margin-top: 4px; padding-top: 8px; }
    .recently-closed-row { opacity: 0.7; }

    /* Command Palette — bookmark results */
    .bookmark-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 6px;
      cursor: pointer;
      border: 1px solid transparent;
      background: var(--bg-card);
      transition: all 0.15s ease;
    }
    .bookmark-row:hover, .bookmark-row.selected {
      background: var(--bg-hover);
      border-color: var(--border-color);
    }
    .bookmark-folder {
      font-size: 10px;
      color: var(--text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Command Palette — empty state */
    .empty-state {
      text-align: center;
      padding: 24px 16px;
      color: var(--text-secondary);
      font-size: 13px;
      cursor: default;
    }

    /* Command Palette — first-use hint */
    .first-use-hint {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      margin-bottom: 4px;
      background: rgba(59,130,246,0.08);
      border-radius: 6px;
      font-size: 12px;
      color: var(--accent-color, #3b82f6);
      cursor: default;
      animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

    /* Command Palette — footer prefix hints */
    .palette-hints {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .palette-hints kbd {
      background: var(--bg-kbd, rgba(0,0,0,0.06));
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 10px;
      font-family: inherit;
    }
  `;

  // ===== FETCH LOG LEVEL FROM SETTINGS =====
  function fetchLogLevel(): void {
    if (!chrome.runtime?.id) {
      // Extension context invalidated
      return;
    }
    try {
      chrome.runtime.sendMessage({ type: 'GET_LOG_LEVEL' }, (response) => {
        if (chrome.runtime.lastError) {
          // Ignore - use default
          return;
        }
        if (typeof response?.logLevel === 'number') {
          currentLogLevel = response.logLevel;
          log.debug('logLevel', `Log level set to ${currentLogLevel}`);
        }
      });
    } catch {
      // Extension context may be invalid
    }
  }

  // Fetch settings from background. Returns a promise so callers can await fresh settings.
  function fetchSettings(): Promise<void> {
    if (!chrome.runtime?.id) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (resp) => {
          if (chrome.runtime.lastError) {
            log.debug('settings', 'GET_SETTINGS lastError:', chrome.runtime.lastError.message);
            resolve();
            return;
          }
          try {
            const settings = resp?.settings || {};
            cachedSettings = settings;
            try {
              updateSelectAllBadge(Boolean(settings?.selectAllOnFocus));
            } catch { /* ignore */ }
            try {
              if (shadowHost) { shadowHost.dataset.selectAll = String(Boolean(settings?.selectAllOnFocus)); }
            } catch { /* ignore */ }
            searchDebounceMs = DEBOUNCE_MS;
            applyQSTheme(settings?.theme);
            log.debug('settings', 'Fetched settings, searchDebounceMs=', searchDebounceMs);
            if (currentResults.length > 0) {
              try { renderResults(currentResults); } catch { /* ignore */ }
            }
          } catch {
            // ignore
          }
          resolve();
        });
      } catch {
        resolve();
      }
    });
  }

  function applyQSTheme(theme?: string): void {
    if (!shadowHost) {return;}
    if (theme === 'light' || theme === 'dark') {
      shadowHost.dataset.theme = theme;
    } else {
      delete shadowHost.dataset.theme;
    }
  }

  // ===== SERVICE WORKER PRE-WARMING =====
  function prewarmServiceWorker(): void {
    if (prewarmed || !chrome.runtime?.id) {return;}
    prewarmed = true;
    const t0 = performance.now();
    try {
      chrome.runtime.sendMessage({ type: 'PING' }, () => {
        perfLog('Service worker pre-warm response', t0);
        if (chrome.runtime.lastError) {
          // Ignore - just warming up
        }
      });
    } catch {
      // Extension context may be invalid
    }
  }

  // ===== PORT-BASED MESSAGING =====
  function openSearchPort(): void {
    // Don't try to reconnect if port already exists
    if (searchPort) {return;}
    
    // Check extension context validity first
    if (!isExtensionContextValid()) {
      log.debug('port', 'Cannot open port: extension context invalidated');
      return;
    }
    
    const t0 = performance.now();
    try {
      searchPort = chrome.runtime.connect({ name: 'quick-search' });
      perfLog('Search port opened', t0);
      
      searchPort.onMessage.addListener((response) => {
        // Handle error responses from service worker
        if (response?.error) {
          if (response.error === 'Service worker not ready') {
            log.debug('port', 'Service worker still initializing — will retry');
            const query = inputEl?.value?.trim() || '';
            if (query.length > 0) {
              setTimeout(() => performSearch(query, true), 500);
            } else {
              setTimeout(() => loadRecentHistory(), 500);
            }
            return;
          }
          log.warn('port', 'Error response from service worker:', response.error);
          aiSearchPending = false;
          hideSpinner();
          if (response.error === 'Rate limited') {
            const query = inputEl?.value?.trim() || '';
            if (!query) { loadRecentHistory(); }
          }
          return;
        }

        if (response?.results) {
          // Mode guard: ignore port responses when in a palette mode
          if (currentMode !== 'history') {
            log.debug('port', `Ignoring port response — currently in palette mode: ${currentMode}`);
            return;
          }
          // Staleness guard: ignore responses for old queries
          // Compare both sides lowercased to avoid case mismatch
          const currentInputQuery = (inputEl?.value?.trim() || '').toLowerCase();
          const responseQuery = (response.query || '').toLowerCase();
          if (responseQuery && responseQuery !== currentInputQuery) {
            log.debug('port', `Ignoring stale response for "${responseQuery}" (current: "${currentInputQuery}")`);
            return;
          }

          const isPhase1 = response.skipAI === true;
          log.debug('port', `Search results received (${isPhase1 ? 'Phase 1 LEXICAL' : 'Phase 2 AI'}): ${response.results.length} results`);

          currentResults = response.results.slice(0, cachedSettings?.maxResults ?? MAX_RESULTS);

          // Apply current sort setting from cached settings
          const currentSort = cachedSettings?.sortBy || 'best-match';
          sortResults(currentResults, currentSort);

          currentAIExpandedTokens = response.aiStatus?.aiExpandedKeywords ?? [];
          selectedIndex = currentResults.length > 0 ? 0 : -1;
          renderResults(currentResults);

          // Loading state logic:
          // - Phase 1 response + AI still pending → keep spinner, skip AI status
          // - Phase 2 response (or Phase 1 with no AI) → hide spinner, show AI status
          if (isPhase1 && aiSearchPending) {
            log.debug('port', 'Phase 1 done, AI Phase 2 still pending — showing spinner');
            showSpinner(); // Show spinner NOW — Phase 1 results are already rendered above
          } else {
            log.debug('port', 'Final response — hiding spinner, rendering AI status');
            aiSearchPending = false;
            hideSpinner();
            renderAIStatus(response.aiStatus);
          }
        }
      });

      searchPort.onDisconnect.addListener(() => {
        const lastError = chrome.runtime.lastError;
        // bfcache navigation causes port closure - this is expected and not an error
        if (isExtensionContextValid()) {
          if (lastError) {
            log.warn('port', 'Port disconnected with error:', lastError.message);
          } else {
            log.debug('port', 'Port disconnected (normal)');
          }
        }

        // Clean up pending state — port is gone, no more responses coming
        if (aiSearchPending) {
          log.info('port', 'Port disconnected while AI search pending — clearing pending state');
          aiSearchPending = false;
          hideSpinner();
        }

        searchPort = null;
        
        // If context is still valid, automatically try to reconnect after a delay
        if (isExtensionContextValid()) {
          setTimeout(() => {
            if (!searchPort && isExtensionContextValid()) {
              log.debug('port', 'Auto-reconnecting search port');
              openSearchPort();
            }
          }, 500);
        }
      });
    } catch (e) {
      log.error('port', 'Failed to open search port:', (e as Error).message);
      searchPort = null;
    }
  }

  function closeSearchPort(): void {
    if (searchPort) {
      searchPort.disconnect();
      searchPort = null;
    }
  }

  // ===== TOAST NOTIFICATION =====
  let toastEl: HTMLDivElement | null = null;
  let toastTimeout: number | null = null;
  let toastDurationMs = 5000;
  let toastHovered = false;
  let selectAllBadge: HTMLElement | null = null;
  
  function startToastDismissTimer(): void {
    if (toastTimeout) {clearTimeout(toastTimeout);}
    toastTimeout = window.setTimeout(() => {
      if (toastEl && !toastHovered) {
        toastEl.classList.remove('show');
      }
    }, toastDurationMs);
  }

  function showToast(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'success', durationMs = 5000): void {
    if (!toastEl) {return;}
    toastEl.textContent = message;
    toastEl.className = 'toast show' + (type !== 'success' ? ` toast-${type}` : '');
    toastDurationMs = durationMs;
    toastHovered = false;
    startToastDismissTimer();
  }

  function showReportConfirmation(issueUrl: string): void {
    if (!shadowRoot) { return; }
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;border-radius:12px;';

    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:var(--bg-container,#fff);color:var(--text-primary,#1a1a1a);border-radius:12px;padding:20px 24px;max-width:340px;width:90%;box-shadow:0 8px 30px rgba(0,0,0,0.3);text-align:center;font-family:inherit;';

    const icon = document.createElement('div');
    icon.textContent = '\u2705';
    icon.style.cssText = 'font-size:32px;margin-bottom:8px;';

    const titleEl = document.createElement('div');
    titleEl.textContent = 'Report copied to clipboard';
    titleEl.style.cssText = 'font-size:14px;font-weight:700;margin-bottom:8px;';

    const msg = document.createElement('div');
    msg.textContent = 'A new GitHub issue will open. Paste the report into the "Debug Data" section, describe what\'s wrong, and submit.';
    msg.style.cssText = 'font-size:12px;color:var(--text-secondary,#666);line-height:1.5;margin-bottom:16px;';

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;justify-content:center;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'padding:6px 18px;font-size:12px;font-weight:600;border:1px solid #d1d5db;color:var(--text-primary,#333);background:transparent;border-radius:6px;cursor:pointer;';
    cancelBtn.addEventListener('click', () => { overlay.remove(); });

    const okBtn = document.createElement('button');
    okBtn.textContent = 'Open GitHub';
    okBtn.style.cssText = 'padding:6px 18px;font-size:12px;font-weight:600;border:none;color:#fff;background:#3b82f6;border-radius:6px;cursor:pointer;';
    okBtn.addEventListener('click', () => {
      window.open(issueUrl, '_blank');
      overlay.remove();
    });

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(okBtn);
    dialog.appendChild(icon);
    dialog.appendChild(titleEl);
    dialog.appendChild(msg);
    dialog.appendChild(btnRow);
    overlay.appendChild(dialog);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); } });

    const container = shadowRoot.querySelector('.container');
    if (container) {
      (container as HTMLElement).style.position = 'relative';
      container.appendChild(overlay);
    }
    okBtn.focus();
  }

  function updateSelectAllBadge(enabled: boolean): void {
    try {
      if (!selectAllBadge) { return; }
      if (enabled) {
        selectAllBadge.textContent = 'Aa';
        selectAllBadge.title = 'Select All On Focus is enabled — tabbing back selects all text';
        selectAllBadge.setAttribute('aria-label', 'Select All On Focus enabled');
        selectAllBadge.style.background = 'var(--accent-color)';
        selectAllBadge.style.color = 'var(--bg-container)';
      } else {
        selectAllBadge.textContent = 'Aa|';
        selectAllBadge.title = 'Select All On Focus is disabled — tabbing back places caret';
        selectAllBadge.setAttribute('aria-label', 'Select All On Focus disabled');
        selectAllBadge.style.background = 'var(--bg-kbd)';
        selectAllBadge.style.color = 'var(--text-secondary)';
      }
    } catch {
      // ignore
    }
  }

  // ===== RESIZE HANDLES FOR QUICK-SEARCH CONTAINER =====
  const QS_SIZE_KEY = 'quickSearchSize';
  const QS_MIN_W = 400;
  const QS_MIN_H = 300;

  function clampWidth(w: number): number {
    return clampWidthPure(w, QS_MIN_W, window.innerWidth);
  }
  function clampHeight(h: number): number {
    return clampHeightPure(h, QS_MIN_H, window.innerHeight);
  }

  function persistSize(w: number, h: number): void {
    try {
      chrome.storage.local.set({ [QS_SIZE_KEY]: { width: Math.round(w), height: Math.round(h) } },
        () => void chrome.runtime.lastError);
    } catch { /* ignore */ }
  }

  function setupResizeHandles(container: HTMLElement, _resultsEl: HTMLElement): void {
    const handleBottom = document.createElement('div');
    handleBottom.className = 'resize-handle-bottom';
    const handleCorner = document.createElement('div');
    handleCorner.className = 'resize-handle-corner';
    container.appendChild(handleBottom);
    container.appendChild(handleCorner);

    let startX = 0, startY = 0, startW = 0, startH = 0;
    let resizingAxis: 'y' | 'xy' = 'y';

    function onPointerMove(e: PointerEvent): void {
      e.preventDefault();
      const dY = e.clientY - startY;
      const newH = clampHeight(startH + dY);
      container.style.height = newH + 'px';

      if (resizingAxis === 'xy') {
        const dX = e.clientX - startX;
        const newW = clampWidth(startW + dX);
        container.style.width = newW + 'px';
      }

      if (!container.classList.contains('user-resized')) {
        container.classList.add('user-resized');
      }
    }

    function onPointerUp(e: PointerEvent): void {
      (e.target as Element)?.releasePointerCapture?.(e.pointerId);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);

      const rect = container.getBoundingClientRect();
      persistSize(rect.width, rect.height);
    }

    function startResize(e: PointerEvent, axis: 'y' | 'xy'): void {
      e.preventDefault();
      e.stopPropagation();
      resizingAxis = axis;
      startX = e.clientX;
      startY = e.clientY;
      const rect = container.getBoundingClientRect();
      startW = rect.width;
      startH = rect.height;

      (e.target as Element)?.setPointerCapture?.(e.pointerId);
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    }

    handleBottom.addEventListener('pointerdown', (e) => startResize(e, 'y'));
    handleCorner.addEventListener('pointerdown', (e) => startResize(e, 'xy'));

    function resetSize(): void {
      container.style.width = '';
      container.style.height = '';
      container.classList.remove('user-resized');
      try {
        chrome.storage.local.remove(QS_SIZE_KEY, () => void chrome.runtime.lastError);
      } catch { /* ignore */ }
    }
    handleBottom.addEventListener('dblclick', resetSize);
    handleCorner.addEventListener('dblclick', resetSize);
  }

  function restoreSavedSize(container: HTMLElement): void {
    try {
      chrome.storage.local.get(QS_SIZE_KEY, (data) => {
        if (chrome.runtime.lastError) {return;}
        const saved = data?.[QS_SIZE_KEY];
        if (saved && typeof saved.width === 'number' && typeof saved.height === 'number') {
          container.style.width = clampWidth(saved.width) + 'px';
          container.style.height = clampHeight(saved.height) + 'px';
          container.classList.add('user-resized');
        }
      });
    } catch { /* ignore */ }
  }

  // ===== CREATE OVERLAY WITH SHADOW DOM (CSP-safe, no innerHTML) =====
  function createOverlay(): void {
    if (shadowHost) {return;}
    
    const t0 = performance.now();

    // Create shadow host
    shadowHost = document.createElement('div');
    shadowHost.id = OVERLAY_ID;
    
    // Attach closed shadow root (complete isolation)
    shadowRoot = shadowHost.attachShadow({ mode: 'closed' });
    // Expose simple dataset flag so external tests or page scripts can
    // detect whether selectAllOnFocus is enabled. This is safe even with
    // a closed shadow root because dataset is on the host element.
    try {
      shadowHost.dataset.selectAll = String(Boolean(cachedSettings?.selectAllOnFocus));
    } catch { /* ignore */ }
    
    // Inject styles into shadow root
    const styleEl = document.createElement('style');
    styleEl.textContent = OVERLAY_STYLES;
    shadowRoot.appendChild(styleEl);

    // Create overlay structure using DOM APIs (CSP-safe)
    overlayEl = document.createElement('div');
    overlayEl.className = 'overlay';
    
    // Container
    const container = document.createElement('div');
    container.className = 'container';
    
    // Header
    const header = document.createElement('div');
    header.className = 'header';
    
    const logo = document.createElement('img');
    logo.className = 'logo';
    logo.src = chrome.runtime.getURL('../assets/icon-48.svg');
    logo.alt = 'SmrutiCortex';
    
    inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.className = 'search-input';
    inputEl.placeholder = 'Search your browsing history...';
    inputEl.autocomplete = 'off';
    inputEl.spellcheck = false;
    inputEl.tabIndex = 0;

    clearBtnEl = document.createElement('button');
    clearBtnEl.className = 'clear-input-btn';
    clearBtnEl.type = 'button';
    clearBtnEl.title = 'Clear search';
    clearBtnEl.setAttribute('aria-label', 'Clear search');
    clearBtnEl.textContent = '✕';
    clearBtnEl.tabIndex = -1;
    clearBtnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (inputEl) {
        inputEl.value = '';
        syncClearButton();
        inputEl.dispatchEvent(new Event('input'));
        inputEl.focus();
      }
    });

    modeBadgeEl = document.createElement('div');
    modeBadgeEl.className = 'mode-badge';
    modeBadgeEl.style.display = 'none';
    modeBadgeEl.setAttribute('aria-label', 'Current mode');

    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'search-input-wrapper';
    inputWrapper.appendChild(modeBadgeEl);
    inputWrapper.appendChild(inputEl);
    inputWrapper.appendChild(clearBtnEl);

    // Sort button (cycles through options on click)
    const sortBtn = document.createElement('button');
    sortBtn.className = 'sort-btn';
    sortBtn.tabIndex = 0;
    
    const sortOptions = [
      { value: 'best-match', label: '🎯', title: 'Best Match' },
      { value: 'most-recent', label: '🕒', title: 'Most Recent' },
      { value: 'most-visited', label: '🔥', title: 'Most Visited' },
      { value: 'alphabetical', label: '🔤', title: 'Alphabetical' }
    ];
    
    let currentSortIndex = 0;
    // Read sort preference from cached settings (synced with popup via SettingsManager)
    {
      const savedSort = cachedSettings?.sortBy || 'best-match';
      currentSortIndex = sortOptions.findIndex(opt => opt.value === savedSort);
      if (currentSortIndex === -1) {currentSortIndex = 0;}
    }
    
    const updateSortButton = () => {
      const opt = sortOptions[currentSortIndex];
      sortBtn.textContent = opt.label;
      sortBtn.title = `Sort: ${opt.title} (click to cycle)`;
    };
    updateSortButton();
    
    sortBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentSortIndex = (currentSortIndex + 1) % sortOptions.length;
      const newSort = sortOptions[currentSortIndex].value;
      // Persist sort preference via settings (synced with popup)
      try {
        chrome.runtime.sendMessage({ type: 'SETTINGS_CHANGED', settings: { sortBy: newSort } });
        if (cachedSettings) { cachedSettings.sortBy = newSort as any; } // eslint-disable-line @typescript-eslint/no-explicit-any
      } catch {
        // Extension context may be invalid
      }
      updateSortButton();
      
      // Re-sort current results without re-searching
      if (currentResults.length > 0) {
        sortResults(currentResults, newSort);
        selectedIndex = currentResults.length ? 0 : -1;
        renderResults(currentResults);
      }
    });
    
    // Small badge to indicate when "Select All On Focus" is enabled
    selectAllBadge = document.createElement('span');
    selectAllBadge.className = 'select-all-badge';
    selectAllBadge.title = 'When enabled, tabbing back to the input selects all text for quick replace';
    selectAllBadge.setAttribute('aria-label', 'Select All On Focus enabled');
    selectAllBadge.textContent = '\u2713';
    selectAllBadge.style.display = 'inline-flex';
    selectAllBadge.style.marginLeft = '8px';
    selectAllBadge.style.fontSize = '12px';
    selectAllBadge.style.padding = '0 8px';
    selectAllBadge.style.borderRadius = '999px';
    selectAllBadge.style.background = 'var(--accent-color)';
    selectAllBadge.style.color = 'var(--bg-container)';
    selectAllBadge.style.minWidth = '22px';
    selectAllBadge.style.height = '20px';
    selectAllBadge.style.display = 'inline-flex';
    selectAllBadge.style.alignItems = 'center';
    selectAllBadge.style.justifyContent = 'center';
    selectAllBadge.style.fontWeight = '600';
    
    // Settings button - opens the full popup
    settingsBtn = document.createElement('button');
    settingsBtn.className = 'settings-btn';
    settingsBtn.title = 'Open settings';
    settingsBtn.tabIndex = 0; // Make focusable
    
    const settingsIcon = document.createElement('img');
    settingsIcon.src = chrome.runtime.getURL('../assets/icon-settings.svg');
    settingsIcon.alt = 'Settings';
    settingsIcon.style.width = '16px';
    settingsIcon.style.height = '16px';
    settingsIcon.style.display = 'block';
    settingsBtn.appendChild(settingsIcon);
    
    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!chrome.runtime?.id) {
        log.debug('settings', 'Cannot open settings: extension context invalidated');
        return;
      }
      // Open the extension popup page in a new tab
      chrome.runtime.sendMessage({ type: 'OPEN_SETTINGS' });
      hideOverlay();
    });
    
    // Loading spinner (shown during AI-powered searches)
    spinnerEl = document.createElement('div');
    spinnerEl.className = 'search-spinner';

    header.appendChild(logo);
    header.appendChild(inputWrapper);
    header.appendChild(spinnerEl);
    header.appendChild(sortBtn);
    // header.appendChild(selectAllBadge); // hidden to reduce UI clutter for LTS
    header.appendChild(settingsBtn);

    // Result count (palette mode result count display)
    const resultCountEl = document.createElement('div');
    resultCountEl.className = 'result-count';
    resultCountEl.setAttribute('aria-live', 'polite');

    // AI status bar (below header, shows AI feedback)
    aiStatusBarEl = document.createElement('div');
    aiStatusBarEl.className = 'ai-status-bar';

    // Results
    resultsEl = document.createElement('div');
    resultsEl.className = 'results';

    // Redirect vertical wheel scroll to horizontal when in card view
    resultsEl.addEventListener('wheel', (e) => {
      if (resultsEl?.classList.contains('cards') && !e.shiftKey) {
        const delta = e.deltaY || e.deltaX;
        if (delta !== 0) {
          e.preventDefault();
          if (resultsEl) { resultsEl.scrollLeft += delta; }
        }
      }
    }, { passive: false });

    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty';
    emptyDiv.textContent = 'Type to search your history...';
    resultsEl.appendChild(emptyDiv);
    
    footerEl = document.createElement('div');
    const footer = footerEl;
    footer.className = 'footer';
    
    const shortcuts = [
      ['↑↓', 'Navigate'],
      ['Enter', 'Open'],
      ['→', 'New tab'],
      ['Ctrl+M', 'Copy'],
      ['Ctrl+C', 'Copy HTML'],
      ['ESC', 'Close']
    ];
    
    shortcuts.forEach(([key, label]) => {
      const span = document.createElement('span');
      const kbd = document.createElement('kbd');
      kbd.textContent = key;
      span.appendChild(kbd);
      span.appendChild(document.createTextNode(` ${label}`));
      footer.appendChild(span);
    });

    // Command palette prefix hints
    const paletteHints = document.createElement('div');
    paletteHints.className = 'palette-hints';
    const hintPrefixes = [
      ['/', 'Commands'],
      ['>', 'Power'],
      ['@', 'Tabs'],
      ['#', 'Bookmarks'],
      ['??', 'Web Search'],
      ['?', 'Help'],
    ];
    hintPrefixes.forEach(([prefix, label]) => {
      const span = document.createElement('span');
      const kbd = document.createElement('kbd');
      kbd.textContent = prefix;
      span.appendChild(kbd);
      span.appendChild(document.createTextNode(` ${label}`));
      paletteHints.appendChild(span);
    });
    footer.appendChild(paletteHints);

    // Help/tour button — triggers in-extension tour
    const helpLink = document.createElement('button');
    helpLink.textContent = '?';
    helpLink.title = 'Feature tour & help';
    helpLink.className = 'help-link';
    helpLink.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (shadowRoot) {
        runTour(QUICK_SEARCH_TOUR_STEPS, shadowRoot, (sel) => shadowRoot!.querySelector(sel));
      }
    });
    footer.appendChild(helpLink);

    toggleBarEl = document.createElement('div');
    toggleBarEl.className = 'toggle-bar';

    container.appendChild(header);
    container.appendChild(toggleBarEl);
    container.appendChild(resultCountEl);
    container.appendChild(aiStatusBarEl);
    container.appendChild(resultsEl);
    container.appendChild(footer);
    setupResizeHandles(container, resultsEl);
    restoreSavedSize(container);
    overlayEl.appendChild(container);
    
    // Toast for copy feedback
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.addEventListener('mouseenter', () => {
      toastHovered = true;
      if (toastTimeout) { clearTimeout(toastTimeout); toastTimeout = null; }
    });
    toastEl.addEventListener('mouseleave', () => {
      toastHovered = false;
      startToastDismissTimer();
    });
    overlayEl.appendChild(toastEl);

    shadowRoot.appendChild(overlayEl);

    // Event listeners
    overlayEl.addEventListener('click', (e) => {
      if (e.target === overlayEl) {hideOverlay();}
    });
    
    // Capture-phase keyboard handling for overlay.
    // DISABLED: Global handler now handles all key routing
    // overlayEl.addEventListener('keydown', (e) => {
    //   // Always allow Tab to flow to browser for native focus movement
    //   if (e.key === 'Tab') { return; }

    //   // Only act when overlay is visible
    //   if (!isOverlayVisible()) { return; }

    //   // If the input is focused, let its handlers process the event
    //   if (document.activeElement === inputEl) { return; }

    //   // For other focused elements (results, settings), handle navigation keys here
    //   // Debug: log key and active element
    //   if (currentLogLevel >= LOG_LEVEL.DEBUG) {
    //     try {
    //       console.debug('[SmrutiCortex] Overlay keydown:', { key: e.key, active: document.activeElement, selectedIndex });
    //     } catch (err) {}
    //   }
    //   let action = parseKeyboardAction(e);
    //   // Fallback mapping in case parseKeyboardAction returns null for some edge keys
    //   if (!action) {
    //     if (e.key === 'Enter') action = KeyboardAction.OPEN;
    //     else if (e.key === 'ArrowDown') action = KeyboardAction.NAVIGATE_DOWN;
    //     else if (e.key === 'ArrowUp') action = KeyboardAction.NAVIGATE_UP;
    //     else if (e.key === 'ArrowRight') action = KeyboardAction.OPEN_NEW_TAB;
    //   }
    //   if (!action) { return; }

    //   // Prevent page-level defaults and route to key handler
    //   e.preventDefault();
    //   e.stopPropagation();
    //   e.stopImmediatePropagation();

    //   // Re-use the same logic as input's keydown handler
    //   handleKeydown(e);
    // }, true); // Use capture phase
    
    // Maintain focus behaviour on mousedown
    // Only force focus when clicking the backdrop (overlay background).
    // Do NOT force-focus when clicking interactive elements or selectable text.
    overlayEl.addEventListener('mousedown', (e) => {
      const target = e.target as Element | null;
      if (!target) { return; }

      if (target === overlayEl) { return; }

      const tag = target.tagName?.toLowerCase();
      const isInteractive = tag === 'input' || tag === 'button' || tag === 'a'
        || target.classList?.contains('result')
        || target.closest?.('.toast, .recent-searches-section, .result, .command-row, .tab-row, .bookmark-row, .help-row')
        || target.closest?.('button, a, input');
      if (!isInteractive) {
        setTimeout(() => inputEl?.focus(), 0);
      }
    });
    
    inputEl.addEventListener('input', handleInput);
    inputEl.addEventListener('keydown', handleKeydown);
    
    // Debug focus issues
    inputEl.addEventListener('focus', () => {
      log.debug('focus', 'Input focused');
    });
    // Remove aggressive refocus from blur — prefer native focus behavior and Tab navigation.
    // Keep a light debug hook for visibility only.
    inputEl.addEventListener('blur', (e) => {
      log.debug('focus', 'Input blurred. relatedTarget:', (e as FocusEvent).relatedTarget);
    });

    perfLog('Overlay created with Shadow DOM (in-memory, not yet attached)', t0);
    // Fetch settings now to configure debounce and focus behavior
    fetchSettings();
  }

  // ===== SHOW/HIDE =====
  function showOverlay(): void {
    const t0 = performance.now();
    log.debug('overlay', 'showOverlay called');

    if (!shadowHost) {
      const t1 = performance.now();
      createOverlay();
      perfLog('createOverlay (on-demand)', t1);
    }
    
    if (!shadowHost || !overlayEl || !inputEl) {return;}

    // Attach to DOM only when showing (prevents leak into MHTML/print saves)
    if (!shadowHost.isConnected) {
      document.documentElement.appendChild(shadowHost);
    }

    // Cancel any pending port close from a previous hideOverlay
    if (hidePortCloseTimer) {
      clearTimeout(hidePortCloseTimer);
      hidePortCloseTimer = null;
    }

    // Show overlay FIRST
    shadowHost.classList.add('visible');
    overlayEl.classList.add('visible');
    // Refresh settings each time overlay is shown so UI (badge, focus behavior)
    // reflects the most recent user preferences even if the overlay was pre-created
    try {
      updateSelectAllBadge(Boolean(cachedSettings?.selectAllOnFocus));
    } catch { /* ignore */ }
    
    // Reset state
    inputEl.value = '';
    syncClearButton();
    currentResults = [];
    selectedIndex = 0;
    
    // Reset palette mode
    currentMode = 'history';
    if (modeBadgeEl) { modeBadgeEl.style.display = 'none'; }
    if (inputEl) { inputEl.style.paddingLeft = '12px'; inputEl.placeholder = 'Search your browsing history...'; }

    // Show empty state immediately so overlay is never visually blank
    renderResults([]);
    recentHistoryRetryCount = 0;

    // Await fresh settings before loading defaults so toggles are respected
    fetchSettings().then(() => {
      renderQSToggleBar();
      loadRecentHistory();
      showFirstUseHint();
    }).catch(() => loadRecentHistory());
    
    // NUCLEAR OPTION: Force blur current element (omnibox) then focus aggressively
    // Strategy 1: Blur active element (likely the omnibox with selected text)
    try {
      if (document.activeElement && document.activeElement !== inputEl) {
        (document.activeElement as HTMLElement).blur();
      }
    } catch { /* ignore */ }
    
    // Strategy 2: Immediate synchronous focus
    inputEl.focus();
    inputEl.setSelectionRange(0, 0);
    perfLog('Input focused immediately', t0);
    
    // Strategy 3: Continuous focus attempts with setInterval (nuclear option for selected text in omnibox)
    // Clear any previous interval/timeouts from a prior showOverlay call to prevent leaks
    if (overlayFocusInterval) {clearInterval(overlayFocusInterval); overlayFocusInterval = null;}
    overlayFocusTimeouts.forEach(t => clearTimeout(t));
    overlayFocusTimeouts = [];

    let focusAttempts = 0;
    const maxAttempts = 20; // Try for up to 1 second (20 * 50ms)
    overlayFocusInterval = setInterval(() => {
      focusAttempts++;

      if (focusAttempts >= maxAttempts) {
        if (overlayFocusInterval) {clearInterval(overlayFocusInterval); overlayFocusInterval = null;}
        return;
      }
      if (document.activeElement === inputEl || shadowRoot?.activeElement === inputEl) {
        if (overlayFocusInterval) {clearInterval(overlayFocusInterval); overlayFocusInterval = null;}
        return;
      }
      if (!isOverlayVisible()) {
        if (overlayFocusInterval) {clearInterval(overlayFocusInterval); overlayFocusInterval = null;}
        return;
      }

      try {
        if (document.activeElement && document.activeElement !== inputEl) {
          (document.activeElement as HTMLElement).blur();
        }
      } catch { /* ignore */ }

      inputEl.focus();
      inputEl.setSelectionRange(0, 0);
    }, 50);

    // Strategy 4: Backup timeouts at key intervals (tracked for cleanup)
    [0, 100, 200, 300, 500, 800].forEach(delay => {
      const tid = setTimeout(() => {
        if (inputEl && isOverlayVisible() && document.activeElement !== inputEl && shadowRoot?.activeElement !== inputEl) {
          try {
            if (document.activeElement && document.activeElement !== inputEl) {
              (document.activeElement as HTMLElement).blur();
            }
          } catch { /* ignore */ }
          inputEl.focus();
          inputEl.setSelectionRange(0, 0);
        }
      }, delay);
      overlayFocusTimeouts.push(tid);
    });

    // Open port for faster messaging (only if extension context is valid)
    if (chrome.runtime?.id) {
      openSearchPort();
    }
  }

  function hideOverlay(): void {
    if (!shadowHost || !overlayEl) {return;}

    log.debug('overlay', 'Hiding overlay');
    shadowHost.classList.remove('visible');
    overlayEl.classList.remove('visible');

    // Detach from DOM so the overlay is never serialized into MHTML/print saves.
    // JS references (shadowHost, shadowRoot, inputEl, etc.) are kept for instant re-show.
    if (shadowHost.parentNode) {
      shadowHost.parentNode.removeChild(shadowHost);
    }

    if (inputEl) {inputEl.blur();}
    aiSearchPending = false;
    hideSpinner();
    renderAIStatus(null);
    // Clear any pending debounce timers (prevents stale searches after close)
    if (debounceTimer) {clearTimeout(debounceTimer); debounceTimer = null;}
    if (aiDebounceTimer) {clearTimeout(aiDebounceTimer); aiDebounceTimer = null;}

    // Close port after a delay (in case user reopens quickly)
    // Timer is cancelled in showOverlay if user reopens
    hidePortCloseTimer = window.setTimeout(closeSearchPort, 1000) as unknown as number;
  }

  function isOverlayVisible(): boolean {
    return shadowHost?.classList.contains('visible') ?? false;
  }

  // ===== SEARCH =====
  function syncClearButton() {
    if (clearBtnEl) { clearBtnEl.classList.toggle('visible', (inputEl?.value?.length ?? 0) > 0); }
  }

  // ===== COMMAND PALETTE: MODE DETECTION =====

  function detectMode(value: string): { mode: PaletteMode; query: string } {
    return detectModePure(value, {
      commandPaletteEnabled: cachedSettings?.commandPaletteEnabled ?? true,
      commandPaletteModes: cachedSettings?.commandPaletteModes ?? ['/', '>', '@', '#', '??'],
    });
  }

  function updateModeBadge(mode: PaletteMode): void {
    if (!modeBadgeEl || !inputEl) {return;}

    const labels: Record<PaletteMode, string> = {
      history: '',
      commands: '/ CMD',
      power: '> PWR',
      tabs: '@ TABS',
      bookmarks: '# MARK',
      websearch: '?? WEB',
      help: '? HELP',
    };

    const classes: Record<PaletteMode, string> = {
      history: '',
      commands: 'mode-commands',
      power: 'mode-power',
      tabs: 'mode-tabs',
      bookmarks: 'mode-bookmarks',
      websearch: 'mode-websearch',
      help: 'mode-help',
    };

    const placeholders: Record<PaletteMode, string> = {
      history: 'Search your browsing history...',
      commands: 'Type a command...',
      power: 'Admin command...',
      tabs: 'Search open tabs...',
      bookmarks: 'Search bookmarks...',
      websearch: 'Search the web...',
      help: '',
    };

    if (mode === 'history') {
      modeBadgeEl.style.display = 'none';
      inputEl.style.paddingLeft = '12px';
    } else {
      modeBadgeEl.textContent = labels[mode];
      modeBadgeEl.className = `mode-badge ${classes[mode]}`;
      modeBadgeEl.style.display = 'block';
      inputEl.style.paddingLeft = '64px';
    }
    inputEl.placeholder = placeholders[mode];
  }

  function handleInput(): void {
    syncClearButton();
    confirmingCommand = null;

    const raw = inputEl?.value ?? '';
    const { mode, query } = detectMode(raw.trim());

    // Mode changed — update badge and reset state
    if (mode !== currentMode) {
      currentMode = mode;
      updateModeBadge(mode);
      cachedTabs = null;
      cachedBookmarks = null;
    }

    if (mode === 'help') {
      renderHelpScreen();
      return;
    }

    if (debounceTimer) {clearTimeout(debounceTimer);}
    if (aiDebounceTimer) {clearTimeout(aiDebounceTimer); aiDebounceTimer = null;}
    if (qsFocusTimer) {clearTimeout(qsFocusTimer); qsFocusTimer = null;}

    // Non-history modes: route to command palette handlers
    if (mode !== 'history') {
      dismissFirstUseHint();
      handlePaletteMode(mode, query);
      return;
    }

    // --- Original history search flow ---

    if (!isExtensionContextValid()) {
      log.debug('handleInput', 'Extension context invalid — showing reconnect UI');
      renderErrorResults(
        '🔄 Extension was updated. Click reconnect or press the shortcut again.',
        attemptNoReloadReconnect
      );
      return;
    }

    const aiEnabled = cachedSettings?.ollamaEnabled ?? false;
    aiSearchPending = aiEnabled;
    log.trace('handleInput', `Input changed, aiEnabled=${aiEnabled}, aiSearchPending=${aiSearchPending}`);

    renderAIStatus(null);

    debounceTimer = window.setTimeout(() => {
      const q = inputEl?.value?.trim() || '';
      if (q.length === 0) {
        log.debug('handleInput', 'Query empty — loading recent history');
        aiSearchPending = false;
        hideSpinner();
        loadRecentHistory();
        return;
      }
      log.debug('handleInput', `Phase 1 (LEXICAL) firing for "${q}"`);
      performSearch(q, true);
    }, searchDebounceMs);

    if (aiEnabled) {
      const aiDelayMs = cachedSettings?.aiSearchDelayMs ?? 500;
      aiDebounceTimer = window.setTimeout(() => {
        aiDebounceTimer = null;
        const q = inputEl?.value?.trim() || '';
        if (q.length === 0) {
          log.debug('handleInput', 'Phase 2 skipped — query empty');
          aiSearchPending = false;
          hideSpinner();
          return;
        }
        perfLog(`AI Phase 2 triggered for: "${q}" (delay: ${aiDelayMs}ms)`);
        performSearch(q, false);
      }, aiDelayMs);
    }
  }

  // ===== COMMAND PALETTE: HELP SCREEN =====

  function renderHelpScreen(): void {
    if (!resultsEl) {return;}

    selectedIndex = -1;
    resultsEl.innerHTML = '';
    resultsEl.className = 'results list';

    const modes = [
      { prefix: '/',  label: 'Commands',      desc: 'Toggle settings, page actions, navigation' },
      { prefix: '>',  label: 'Power / Admin',  desc: 'Index, diagnostics, tuning presets, AI copy, data tools' },
      { prefix: '@',  label: 'Tab Switcher',   desc: 'Search & switch open tabs, reopen closed' },
      { prefix: '#',  label: 'Bookmarks',      desc: 'Recent bookmarks when empty; type to search all' },
      { prefix: '??', label: 'Web Search',     desc: 'Default engine + optional prefix (g, d, …) then query' },
    ];

    const enabledModes = cachedSettings?.commandPaletteModes ?? ['/', '>', '@', '#', '??'];

    modes.forEach(m => {
      const enabled = enabledModes.includes(m.prefix);
      const li = document.createElement('li');
      li.className = 'command-row';
      if (!enabled) {li.style.opacity = '0.4';}
      li.innerHTML = `
        <span class="cmd-icon" style="font-family:ui-monospace,SFMono-Regular,monospace;font-size:14px;font-weight:700;color:var(--accent-color);width:28px;text-align:center;">${m.prefix}</span>
        <span class="cmd-label">${m.label}${!enabled ? ' <span class="cmd-current">[disabled]</span>' : ''}</span>
        <span class="cmd-category">${m.desc}</span>
      `;
      if (enabled) {
        li.addEventListener('click', () => {
          if (inputEl) {
            inputEl.value = m.prefix;
            inputEl.dispatchEvent(new Event('input'));
            inputEl.focus();
          }
        });
      }
      resultsEl!.appendChild(li);
    });

    const divider = document.createElement('li');
    divider.style.cssText = 'padding:6px 12px;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-secondary);cursor:default;border-top:1px solid var(--border-color);margin-top:4px;';
    divider.textContent = 'Tips';
    resultsEl.appendChild(divider);

    const tips = [
      { icon: '⌨️', label: 'Keyboard Shortcut', desc: 'Ctrl+Shift+S to open quick-search' },
      { icon: '🔍', label: 'Omnibox', desc: 'Type "sc " in the address bar' },
      { icon: '🎯', label: 'Guided Tour', desc: 'Type /tour to start the interactive tour' },
    ];

    tips.forEach(t => {
      const li = document.createElement('li');
      li.className = 'command-row';
      li.innerHTML = `
        <span class="cmd-icon">${t.icon}</span>
        <span class="cmd-label">${t.label}</span>
        <span class="cmd-category">${t.desc}</span>
      `;
      resultsEl!.appendChild(li);
    });

    updateResultCount('');
  }

  // ===== COMMAND PALETTE: PALETTE MODE HANDLER =====

  function handlePaletteMode(mode: PaletteMode, query: string): void {
    hideSpinner();
    renderAIStatus(null);

    switch (mode) {
      case 'commands':
        renderCommandResults(query, 'everyday');
        break;
      case 'power':
        renderCommandResults(query, 'power');
        break;
      case 'tabs':
        handleTabMode(query);
        break;
      case 'bookmarks':
        handleBookmarkMode(query);
        break;
      case 'websearch':
        renderWebSearchPreview(query);
        break;
    }
  }

  // ===== COMMAND PALETTE: RENDER COMMANDS =====

  function renderCommandResults(query: string, tier: 'everyday' | 'power'): void {
    if (!resultsEl) {return;}
    qsWindowPickerActive = false;

    const commands = cachedSettings
      ? getAvailableCommands(tier, cachedSettings)
      : getCommandsByTier(tier);

    const displayList = preparePaletteCommandList(tier, query, commands, cachedSettings ?? undefined);

    selectedIndex = 0;
    resultsEl.innerHTML = '';
    resultsEl.className = 'results list';
    resultsEl.setAttribute('role', 'listbox');
    resultsEl.setAttribute('aria-label', tier === 'power' ? 'Power commands' : 'Commands');

    if (displayList.length === 0) {
      resultsEl.innerHTML = '<li class="empty-state">No matching commands</li>';
      updateResultCount('0 commands');
      return;
    }

    updateResultCount(`${displayList.length} command${displayList.length !== 1 ? 's' : ''}`);

    const emptyQuery = !query.trim();
    const showCategoryHeaders = emptyQuery;
    let lastCategory = '';

    if (emptyQuery) {
      const tip = document.createElement('li');
      tip.className = 'palette-discovery-tip';
      tip.setAttribute('role', 'presentation');
      tip.textContent = tier === 'power'
        ? 'Tabs, data, AI, diagnostics, presets — type to filter.'
        : 'Toggles, sort, page actions, navigation, tabs — type to filter.';
      resultsEl.appendChild(tip);
    }

    displayList.forEach((cmd, idx) => {
      if (showCategoryHeaders && cmd.category !== lastCategory) {
        lastCategory = cmd.category;
        const header = document.createElement('li');
        header.className = 'palette-category-header';
        header.setAttribute('role', 'presentation');
        header.textContent = formatPaletteCategoryHeader(cmd.category, tier);
        resultsEl!.appendChild(header);
      }

      const li = document.createElement('li');
      li.className = 'command-row';
      li.dataset.commandId = cmd.id;
      if (idx === 0) {li.classList.add('selected');}
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', idx === 0 ? 'true' : 'false');

      const currentLabel = getCurrentLabel(cmd);
      const hintHtml = cmd.hint
        ? `<div class="cmd-hint">${escapeHtml(cmd.hint)}</div>`
        : '';

      li.innerHTML = `
        <span class="cmd-icon">${cmd.icon}</span>
        <div class="cmd-main">
          <div class="cmd-label-row">
            <span class="cmd-label">${cmd.label}${currentLabel ? ` <span class="cmd-current">[${currentLabel}]</span>` : ''}</span>
          </div>
          ${hintHtml}
        </div>
        <span class="cmd-category">${cmd.category}</span>
        ${cmd.dangerous ? '<span class="cmd-danger">⚠️</span>' : ''}
        ${cmd.shortcut ? `<span class="cmd-shortcut">${cmd.shortcut}</span>` : ''}
        ${cmd.aliases?.length ? `<span class="cmd-alias">${cmd.aliases[0]}</span>` : ''}
      `;

      li.addEventListener('click', () => {
        selectedIndex = idx;
        executeSelectedCommand(displayList);
      });
      resultsEl!.appendChild(li);
    });
  }

  function getCurrentLabel(cmd: PaletteCommand): string | null {
    if (!cachedSettings) {return null;}
    if (cmd.action === 'toggle-boolean' && cmd.settingKey) {
      return cachedSettings[cmd.settingKey] ? 'ON' : 'OFF';
    }
    if (cmd.action === 'sub-command' && cmd.cycleValues && cmd.settingKey) {
      const current = String(cachedSettings[cmd.settingKey]);
      const match = cmd.cycleValues.find(cv => cv.value === current);
      return match?.label ?? null;
    }
    if (cmd.action === 'cycle' && cmd.settingKey) {
      const parent = ALL_COMMANDS.find(c => c.subCommands?.some(sub => sub.id === cmd.id));
      if (parent?.cycleValues) {
        const current = String(cachedSettings[parent.settingKey!]);
        const thisValue = getCycleValueFromCommand(cmd);
        return String(thisValue) === current ? 'current' : null;
      }
    }
    return null;
  }

  function updateResultCount(text: string): void {
    if (!resultsEl?.parentElement) {return;}
    const countEl = resultsEl.parentElement.querySelector('.result-count');
    if (countEl) {countEl.textContent = text;}
  }

  // ===== COMMAND PALETTE: EXECUTION =====

  function executeSelectedCommand(commands: PaletteCommand[]): void {
    const cmd = commands[selectedIndex];
    if (!cmd) {return;}

    if (cmd.dangerous && !confirmingCommand) {
      showConfirmation(cmd, commands);
      return;
    }

    confirmingCommand = null;
    executeCommand(cmd);
  }

  function showConfirmation(cmd: PaletteCommand, _commands: PaletteCommand[]): void {
    if (!resultsEl) {return;}
    confirmingCommand = cmd;

    resultsEl.innerHTML = `
      <li class="confirm-view">
        <div class="confirm-icon">⚠️</div>
        <div class="confirm-title">Are you sure?</div>
        <div class="confirm-label">${cmd.label} — this action cannot be undone.</div>
        <div class="confirm-actions">
          <span>Press <kbd>Enter</kbd> to confirm</span>
          <span>Press <kbd>Esc</kbd> to cancel</span>
        </div>
      </li>
    `;

    const cancelOnEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        confirmingCommand = null;
        inputEl?.removeEventListener('keydown', cancelOnEsc);
        renderCommandResults(inputEl?.value?.slice(1).trim() ?? '', cmd.tier);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        inputEl?.removeEventListener('keydown', cancelOnEsc);
        confirmingCommand = null;
        executeCommand(cmd);
      }
    };
    inputEl?.addEventListener('keydown', cancelOnEsc);
  }

  function applySettingSideEffects(key: keyof AppSettings): void {
    syncQSToggleBar();
    if (key === 'theme') {
      applyQSTheme(cachedSettings?.theme);
    }
    if (key === 'selectAllOnFocus') {
      updateSelectAllBadge(Boolean(cachedSettings?.selectAllOnFocus));
      try { if (shadowHost) {shadowHost.dataset.selectAll = String(Boolean(cachedSettings?.selectAllOnFocus));} } catch { /* ignore */ }
    }
    if (key === 'displayMode' || key === 'highlightMatches') {
      if (currentResults.length > 0 && currentMode === 'history') {
        renderResults(currentResults);
      }
    }
    if (key === 'maxResults' || key === 'defaultResultCount') {
      if (currentMode === 'history' && !(inputEl?.value?.trim())) {
        loadRecentHistory();
      }
    }
  }

  function applySettingsPatchSideEffects(patch: Partial<AppSettings>): void {
    (Object.keys(patch) as (keyof AppSettings)[]).forEach(k => applySettingSideEffects(k));
  }

  interface QsWindowInfo {
    id: number;
    tabCount: number;
    activeTabTitle: string;
    activeTabFavicon: string;
    isCurrent: boolean;
  }

  function showQsWindowPicker(): void {
    if (!resultsEl) { return; }
    qsWindowPickerActive = true;
    selectedIndex = 0;
    updateResultCount('Loading windows...');
    resultsEl.innerHTML = '';

    try {
      chrome.runtime.sendMessage({ type: 'GET_WINDOWS' }, (resp) => {
        if (chrome.runtime.lastError || !resp) {
          qsWindowPickerActive = false;
          showToast('Failed to fetch windows', 'error');
          return;
        }
        const windows = (resp as { windows?: QsWindowInfo[] }).windows;
        if (!windows || windows.length === 0) {
          qsWindowPickerActive = false;
          updateResultCount('0 windows');
          showToast('No windows found', 'error');
          return;
        }
        const otherWindows = windows.filter(w => !w.isCurrent);
        if (otherWindows.length === 0) {
          qsWindowPickerActive = false;
          updateResultCount('1 window');
          showToast('Only one window open — nothing to move to', 'info');
          return;
        }
        if (!resultsEl) { return; }
        updateResultCount(`${otherWindows.length} window${otherWindows.length !== 1 ? 's' : ''}`);
        resultsEl.innerHTML = '';
        selectedIndex = 0;

        const hint = document.createElement('li');
        hint.className = 'palette-discovery-tip';
        hint.setAttribute('role', 'presentation');
        hint.textContent = 'Enter: move tab · Esc: back to commands · ↑↓: navigate';
        resultsEl.appendChild(hint);

        otherWindows.forEach((win, idx) => {
          const row = document.createElement('li');
          row.className = `command-row${idx === 0 ? ' selected' : ''}`;
          row.setAttribute('role', 'option');
          row.setAttribute('aria-selected', idx === 0 ? 'true' : 'false');
          row.dataset.windowId = String(win.id);
          row.dataset.windowTitle = win.activeTabTitle;
          const tabLabel = win.tabCount === 1 ? '1 tab' : `${win.tabCount} tabs`;
          row.innerHTML = `
            <span class="cmd-icon">🪟</span>
            <span class="cmd-label">${escapeHtml(win.activeTabTitle)}</span>
            <span class="cmd-hint">${tabLabel}</span>
          `;
          row.addEventListener('click', () => {
            moveTabToWindowQs(win.id, win.activeTabTitle);
          });
          resultsEl!.appendChild(row);
        });
      });
    } catch {
      qsWindowPickerActive = false;
      showToast('Extension context lost — please reopen', 'error');
    }
  }

  function moveTabToWindowQs(targetWindowId: number, windowTitle: string): void {
    try {
      chrome.runtime.sendMessage({ type: 'MOVE_TAB_TO_WINDOW', targetWindowId }, (moveResp) => {
        if (chrome.runtime.lastError) {
          showToast(`Error: ${chrome.runtime.lastError.message}`, 'error');
          return;
        }
        const r = moveResp as Record<string, unknown> | undefined;
        if (r?.error) {
          showToast(`Error: ${r.error}`, 'error');
        } else {
          showToast(`↗️ Moved tab to: ${windowTitle}`, 'success');
          hideOverlay();
        }
      });
    } catch {
      showToast('Extension context lost — please reopen', 'error');
    }
  }

  function executeCommand(cmd: PaletteCommand): void {
    log.info('executeCommand', `Executing: ${cmd.id} (action: ${cmd.action})`);
    saveRecentCommand(cmd.id);

    switch (cmd.action) {
      case 'toggle-boolean':
        if (cmd.settingKey && cachedSettings) {
          const newVal = !cachedSettings[cmd.settingKey];
          cachedSettings = { ...cachedSettings, [cmd.settingKey]: newVal };
          try {
            chrome.runtime.sendMessage({
              type: 'SETTINGS_CHANGED',
              settings: { [cmd.settingKey]: newVal },
            });
          } catch { /* context invalidated */ }
          applySettingSideEffects(cmd.settingKey);
          showToast(`${cmd.label}: ${newVal ? 'ON' : 'OFF'}`);
          const raw = inputEl?.value ?? '';
          const { query } = detectMode(raw.trim());
          renderCommandResults(query, cmd.tier);
        }
        break;

      case 'cycle':
        if (cmd.settingKey) {
          const value = getCycleValueFromCommand(cmd);
          if (value !== undefined && cachedSettings) {
            cachedSettings = { ...cachedSettings, [cmd.settingKey]: value as never };
            try {
              chrome.runtime.sendMessage({
                type: 'SETTINGS_CHANGED',
                settings: { [cmd.settingKey]: value },
              });
            } catch { /* context invalidated */ }
            applySettingSideEffects(cmd.settingKey);
            showToast(`${cmd.label}`);
            const raw = inputEl?.value ?? '';
            const { query } = detectMode(raw.trim());
            renderCommandResults(query, cmd.tier);
          }
        }
        break;

      case 'message':
        if (cmd.messageType) {
          if (cmd.messageType === 'SETTINGS_CHANGED') {
            const patch = getPowerSettingsPatch(cmd.id);
            if (patch && cachedSettings) {
              cachedSettings = { ...cachedSettings, ...patch };
              try {
                chrome.runtime.sendMessage({ type: 'SETTINGS_CHANGED', settings: patch });
              } catch { /* context invalidated */ }
              applySettingsPatchSideEffects(patch);
              showToast(`${cmd.label} — saved`);
              inputEl?.dispatchEvent(new Event('input', { bubbles: true }));
            }
            break;
          }

          if (cmd.id === 'search-debug') {
            showToast(`${cmd.icon} ${cmd.label}...`);
            try {
              chrome.runtime.sendMessage({ type: 'GET_SEARCH_DEBUG_ENABLED' }, (gResp) => {
                if (chrome.runtime.lastError) {
                  showToast(`Error: ${chrome.runtime.lastError.message}`, 'error');
                  return;
                }
                const cur = Boolean((gResp as { enabled?: boolean })?.enabled);
                const next = !cur;
                chrome.runtime.sendMessage({ type: 'SET_SEARCH_DEBUG_ENABLED', enabled: next }, (sResp) => {
                  if (chrome.runtime.lastError) {
                    showToast(`Error: ${chrome.runtime.lastError.message}`, 'error');
                    return;
                  }
                  if ((sResp as { error?: string })?.error) {
                    showToast(`Error: ${(sResp as { error: string }).error}`, 'error');
                    return;
                  }
                  showToast(`Search debug: ${next ? 'ON' : 'OFF'}`);
                  const raw = inputEl?.value ?? '';
                  const { query } = detectMode(raw.trim());
                  renderCommandResults(query, cmd.tier);
                });
              });
            } catch {
              showToast('Extension context lost — please reopen', 'error');
            }
            break;
          }

          if (cmd.id === 'move-tab-to-window') {
            showQsWindowPicker();
            break;
          }

          const payload: Record<string, unknown> = { type: cmd.messageType };
          if (cmd.id === 'zoom-in') {payload.direction = 'in';}
          else if (cmd.id === 'zoom-out') {payload.direction = 'out';}
          else if (cmd.id === 'zoom-reset') {payload.direction = 'reset';}
          else if (cmd.id === 'new-tab') {payload.windowType = 'tab';}
          else if (cmd.id === 'new-window') {payload.windowType = 'window';}
          else if (cmd.id === 'new-incognito') {payload.windowType = 'incognito';}
          else if (cmd.id.startsWith('color-group-')) {payload.color = cmd.id.replace('color-group-', '');}

          const diagnostic = isPaletteDiagnosticMessageType(cmd.messageType);
          const toastMs = diagnostic ? PALETTE_DIAGNOSTIC_TOAST_MS : 5000;

          showToast(`${cmd.icon} ${cmd.label}...`);
          try {
            chrome.runtime.sendMessage(payload, (resp) => {
              if (chrome.runtime.lastError) {
                showToast(`Error: ${chrome.runtime.lastError.message}`, 'error');
                return;
              }
              const r = resp as Record<string, unknown> | undefined;
              if (r?.error) {
                showToast(`Error: ${r.error}`, 'error');
                return;
              }
              const ok = r?.status === 'OK' || r?.status === 'ok' || r?.success;
              const formatted =
                cmd.messageType && r
                  ? formatPaletteDiagnosticToast(cmd.messageType, r)
                  : null;
              if (formatted) {
                showToast(formatted, 'info', toastMs);
              } else if (ok) {
                showToast(`${cmd.icon} ${cmd.label} — done`, 'success', toastMs);
                if (cmd.id === 'close-tab') {hideOverlay();}
              } else if (r?.data !== undefined) {
                const slice =
                  typeof r.data === 'string'
                    ? r.data.slice(0, 280)
                    : JSON.stringify(r.data).slice(0, 280);
                showToast(`${cmd.icon} ${cmd.label}:\n${slice}`, 'info', toastMs);
              }
            });
          } catch {
            showToast('Extension context lost — please reopen', 'error');
          }

          const keepOverlayOpen =
            diagnostic ||
            cmd.dangerous ||
            cmd.messageType === 'CLOSE_TAB';
          if (!keepOverlayOpen) {
            hideOverlay();
          }
        }
        break;

      case 'open-url':
        if (cmd.url) {
          try {
            chrome.runtime.sendMessage({
              type: 'WINDOW_CREATE',
              windowType: 'tab',
              url: cmd.url,
            });
          } catch {
            window.open(cmd.url, '_blank');
          }
          hideOverlay();
        }
        break;

      case 'page-action':
        executePageAction(cmd);
        break;

      case 'sub-command':
        break;
    }
  }

  function executePageAction(cmd: PaletteCommand): void {
    switch (cmd.id) {
      case 'copy-url':
        navigator.clipboard.writeText(window.location.href)
          .then(() => showToast('URL copied'))
          .catch(() => showToast('Failed to copy', 'error'));
        break;
      case 'copy-title':
        navigator.clipboard.writeText(document.title)
          .then(() => showToast('Title copied'))
          .catch(() => showToast('Failed to copy', 'error'));
        break;
      case 'copy-markdown': {
        const mdLink = `[${document.title}](${window.location.href})`;
        navigator.clipboard.writeText(mdLink)
          .then(() => showToast('Markdown link copied'))
          .catch(() => showToast('Failed to copy', 'error'));
        break;
      }
      case 'share':
        if (navigator.share) {
          navigator.share({ title: document.title, url: window.location.href })
            .catch(() => { /* user cancelled */ });
        }
        break;
      case 'print':
        hideOverlay();
        window.print();
        break;
      case 'fullscreen':
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(e => log.debug('command', 'exitFullscreen failed', e));
        } else {
          document.documentElement.requestFullscreen().catch(e => log.debug('command', 'requestFullscreen failed', e));
        }
        break;
      case 'tour':
        if (shadowRoot) {
          runTour(QUICK_SEARCH_TOUR_STEPS, shadowRoot, (sel) => shadowRoot!.querySelector(sel));
        }
        break;
      case 'shortcuts':
        showToast('Enter: open · Shift+Enter: background · Ctrl+C: copy · ↑↓: navigate · Esc: close');
        break;
      case 'shortcut-toggle-bookmarks-bar':
        showToast('Toggle Bookmarks / Favorites Bar\n\nCtrl + Shift + B\n\nWorks in Chrome, Edge & Firefox.\nShortcuts may vary by browser version.', 'info', 8000);
        break;
      case 'shortcut-toggle-vertical-tabs':
        showToast('Toggle Vertical Tabs (Edge only)\n\nCtrl + Shift + , (comma)\n\nSwitches between vertical and horizontal tab layout.\nNote: No shortcut exists to collapse/expand the sidebar pane — use the UI button.\nShortcuts may vary by browser version.', 'info', 10000);
        break;
      case 'about': {
        const manifest = chrome.runtime.getManifest();
        showToast(`SmrutiCortex v${manifest.version}\nInstant browser history search\ngithub.com/dhruvinrsoni/smruti-cortex`);
        break;
      }
      case 'import-index':
        triggerFileImport();
        break;
      case 'copy-ollama-endpoint': {
        const url = cachedSettings?.ollamaEndpoint ?? '';
        if (!url) {
          showToast('No Ollama endpoint set — open extension settings', 'warning');
          break;
        }
        navigator.clipboard.writeText(url)
          .then(() => showToast('Ollama endpoint copied'))
          .catch(() => showToast('Failed to copy', 'error'));
        break;
      }
      case 'copy-ollama-model': {
        const m = cachedSettings?.ollamaModel ?? '';
        if (!m) {
          showToast('No keyword model set — open extension settings', 'warning');
          break;
        }
        navigator.clipboard.writeText(m)
          .then(() => showToast('Ollama model copied'))
          .catch(() => showToast('Failed to copy', 'error'));
        break;
      }
      case 'copy-embedding-model': {
        const m = cachedSettings?.embeddingModel ?? '';
        if (!m) {
          showToast('No embedding model set — open extension settings', 'warning');
          break;
        }
        navigator.clipboard.writeText(m)
          .then(() => showToast('Embedding model copied'))
          .catch(() => showToast('Failed to copy', 'error'));
        break;
      }
    }
  }

  function triggerFileImport(): void {
    if (!shadowRoot) {return;}
    let fileInput = shadowRoot.querySelector('#palette-file-import') as HTMLInputElement;
    if (!fileInput) {
      fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.json';
      fileInput.id = 'palette-file-import';
      fileInput.style.display = 'none';
      shadowRoot.appendChild(fileInput);

      fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (!file) {return;}
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const parsed = JSON.parse(reader.result as string) as { items?: unknown } | unknown[];
            const items = Array.isArray(parsed) ? parsed : parsed?.items;
            if (!Array.isArray(items)) {
              showToast('Invalid file: expected { items: [...] } or a top-level array', 'error');
              return;
            }
            chrome.runtime.sendMessage({ type: 'IMPORT_INDEX', items }, (resp) => {
              if (resp?.status === 'OK') {
                showToast('Index imported successfully');
              } else {
                showToast('Import failed: ' + (resp?.message || 'Unknown error'), 'error');
              }
            });
          } catch {
            showToast('Invalid JSON file', 'error');
          }
        };
        reader.readAsText(file);
        fileInput.value = '';
      });
    }
    fileInput.click();
  }

  // ===== COMMAND PALETTE: TAB SWITCHER =====

  function handleTabMode(query: string): void {
    if (!resultsEl) {return;}

    if (!cachedTabs) {
      resultsEl.innerHTML = '<li class="empty-state">Loading tabs...</li>';
      try {
        chrome.runtime.sendMessage({ type: 'GET_OPEN_TABS' }, (resp) => {
          if (chrome.runtime.lastError || !resp?.tabs) {
            resultsEl!.innerHTML = '<li class="empty-state">Could not load tabs</li>';
            return;
          }
          cachedTabs = resp.tabs;
          renderTabResults(query);
        });
      } catch {
        resultsEl.innerHTML = '<li class="empty-state">Extension context lost</li>';
      }
      return;
    }

    renderTabResults(query);
  }

  function renderTabResults(query: string): void {
    if (!resultsEl || !cachedTabs) {return;}

    let tabs = cachedTabs;
    if (query) {
      const lq = query.toLowerCase();
      tabs = tabs.filter(t =>
        (t.title?.toLowerCase().includes(lq)) ||
        (t.url?.toLowerCase().includes(lq))
      );
    }

    selectedIndex = 0;
    resultsEl.innerHTML = '';
    resultsEl.className = 'results list';
    resultsEl.setAttribute('role', 'listbox');
    resultsEl.setAttribute('aria-label', 'Open tabs');

    if (tabs.length === 0) {
      resultsEl.innerHTML = '<li class="empty-state">No matching tabs</li>';
      updateResultCount('0 tabs');
      return;
    }

    const windowIds = [...new Set(tabs.map(t => t.windowId))];
    updateResultCount(`${tabs.length} tab${tabs.length !== 1 ? 's' : ''} across ${windowIds.length} window${windowIds.length !== 1 ? 's' : ''}`);

    const tabHint = document.createElement('li');
    tabHint.className = 'palette-discovery-tip';
    tabHint.setAttribute('role', 'presentation');
    tabHint.textContent = 'Enter: switch tab · Shift+Enter: open URL in background · Recently closed appears below when available.';
    resultsEl.appendChild(tabHint);

    let globalIdx = 0;
    for (const wid of windowIds) {
      if (windowIds.length > 1) {
        const sep = document.createElement('li');
        sep.className = 'tab-window-sep';
        sep.textContent = `Window ${windowIds.indexOf(wid) + 1}`;
        resultsEl.appendChild(sep);
      }

      const windowTabs = tabs.filter(t => t.windowId === wid);
      for (const tab of windowTabs) {
        const li = document.createElement('li');
        li.className = 'tab-row';
        li.dataset.tabId = String(tab.id);
        if (globalIdx === 0) {li.classList.add('selected');}
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', globalIdx === 0 ? 'true' : 'false');

        const badges = [
          tab.pinned ? '📌' : '',
          tab.audible ? (tab.mutedInfo?.muted ? '🔇' : '🔊') : '',
          tab.active ? '●' : '',
        ].filter(Boolean).join(' ');

        const rawFaviconUrl = tab.favIconUrl || '';
        const faviconUrl = (location.protocol === 'https:' && rawFaviconUrl.startsWith('http://'))
          ? '' : rawFaviconUrl;
        const tabFavSrc = faviconUrl || chrome.runtime.getURL('../assets/icon-favicon-fallback.svg');
        li.innerHTML = `
          <img class="tab-favicon" src="${tabFavSrc}" alt="">
          <div class="tab-details">
            <span class="tab-title">${escapeHtml(tab.title || 'Untitled')}</span>
            <span class="tab-url">${escapeHtml(truncateUrl(tab.url || ''))}</span>
          </div>
          ${badges ? `<span class="tab-badges">${badges}</span>` : ''}
        `;
        wireHideImgOnError(li.querySelector('img'));

        const tabId = tab.id!;
        const windowId = tab.windowId!;
        const tabUrl = tab.url || '';
        li.dataset.tabId = String(tabId);
        li.dataset.windowId = String(windowId);
        if (tabUrl) {li.dataset.tabUrl = tabUrl;}
        li.addEventListener('click', (ev) => {
          const sk = (ev as MouseEvent).shiftKey;
          if (sk && tabUrl) {
            try {
              chrome.runtime.sendMessage({ type: 'WINDOW_CREATE', windowType: 'background-tab', url: tabUrl });
            } catch { window.open(tabUrl); }
            hideOverlay();
          } else {
            switchToTab(tabId, windowId);
          }
        });
        resultsEl!.appendChild(li);
        globalIdx++;
      }
    }

    // Recently closed section
    try {
      chrome.runtime.sendMessage({ type: 'GET_RECENTLY_CLOSED' }, (resp) => {
        if (chrome.runtime.lastError || !resp?.sessions?.length) {return;}
        appendRecentlyClosedTabs(resp.sessions, query);
      });
    } catch { /* ignore */ }
  }

  function appendRecentlyClosedTabs(
    sessions: Array<{ tab?: chrome.tabs.Tab; lastModified: number; sessionId?: string }>,
    query: string
  ): void {
    if (!resultsEl) {return;}

    const closedTabs = sessions
      .filter(s => s.tab)
      .map(s => ({
        ...s.tab!,
        lastModified: s.lastModified,
        sessionId: s.sessionId,
      }));

    let filtered = closedTabs;
    if (query) {
      const lq = query.toLowerCase();
      filtered = closedTabs.filter(t =>
        (t.title?.toLowerCase().includes(lq)) ||
        (t.url?.toLowerCase().includes(lq))
      );
    }

    if (filtered.length === 0) {return;}

    const sep = document.createElement('li');
    sep.className = 'tab-window-sep recently-closed-sep';
    sep.textContent = 'Recently Closed';
    resultsEl.appendChild(sep);

    for (const tab of filtered) {
      const li = document.createElement('li');
      li.className = 'tab-row recently-closed-row';
      li.setAttribute('role', 'option');

      const ago = formatTimeAgo((tab as unknown as { lastModified: number }).lastModified);
      const rawClosedFavicon = tab.favIconUrl || '';
      const closedFavicon = (location.protocol === 'https:' && rawClosedFavicon.startsWith('http://'))
        ? '' : rawClosedFavicon;
      const closedFavSrc = closedFavicon || chrome.runtime.getURL('../assets/icon-favicon-fallback.svg');
      li.innerHTML = `
        <img class="tab-favicon" src="${closedFavSrc}" alt="">
        <div class="tab-details">
          <span class="tab-title">${escapeHtml(tab.title || 'Untitled')}</span>
          <span class="tab-url">${escapeHtml(truncateUrl(tab.url || ''))}</span>
        </div>
        <span class="tab-badges">${ago}</span>
      `;
      wireHideImgOnError(li.querySelector('img'));

      const sessionId = tab.sessionId;
      const closedUrl = tab.url || '';
      if (sessionId) {li.dataset.sessionId = sessionId;}
      if (closedUrl) {li.dataset.closedUrl = closedUrl;}
      li.addEventListener('click', (ev) => {
        const sk = (ev as MouseEvent).shiftKey;
        if (sessionId && !sk) {
          try {
            chrome.runtime.sendMessage({ type: 'REOPEN_TAB', sessionId });
          } catch { /* ignore */ }
        } else if (closedUrl) {
          if (sk) {
            try {
              chrome.runtime.sendMessage({ type: 'WINDOW_CREATE', windowType: 'background-tab', url: closedUrl });
            } catch { window.open(closedUrl); }
          } else {
            window.open(closedUrl, '_blank');
          }
        }
        hideOverlay();
      });
      resultsEl.appendChild(li);
    }
  }

  function switchToTab(tabId: number, windowId: number): void {
    try {
      chrome.runtime.sendMessage({ type: 'SWITCH_TO_TAB', tabId, windowId });
    } catch { /* ignore */ }
    hideOverlay();
  }

  function truncateUrl(url: string): string {
    try {
      const u = new URL(url);
      const path = u.pathname + u.search;
      return u.host + (path.length > 50 ? path.slice(0, 50) + '...' : path);
    } catch { return url.slice(0, 60); }
  }

  // ===== COMMAND PALETTE: BOOKMARK SEARCH =====

  function handleBookmarkMode(query: string): void {
    if (!resultsEl) {return;}

    if (!query && !cachedBookmarks) {
      resultsEl.innerHTML = '<li class="empty-state">Loading bookmarks...</li>';
      try {
        chrome.runtime.sendMessage({ type: 'GET_RECENT_BOOKMARKS' }, (resp) => {
          if (chrome.runtime.lastError || !resp?.bookmarks) {
            resultsEl!.innerHTML = '<li class="empty-state">Could not load bookmarks</li>';
            return;
          }
          cachedBookmarks = resp.bookmarks;
          renderBookmarkResults(query);
        });
      } catch {
        resultsEl.innerHTML = '<li class="empty-state">Extension context lost</li>';
      }
      return;
    }

    if (query) {
      try {
        chrome.runtime.sendMessage({ type: 'SEARCH_BOOKMARKS', query }, (resp) => {
          if (chrome.runtime.lastError || !resp?.bookmarks) {
            resultsEl!.innerHTML = '<li class="empty-state">No matching bookmarks</li>';
            updateResultCount('0 bookmarks');
            return;
          }
          cachedBookmarks = resp.bookmarks;
          renderBookmarkResults(query);
        });
      } catch {
        resultsEl!.innerHTML = '<li class="empty-state">Extension context lost</li>';
      }
      return;
    }

    renderBookmarkResults(query);
  }

  function renderBookmarkResults(query: string): void {
    if (!resultsEl || !cachedBookmarks) {return;}

    selectedIndex = 0;
    resultsEl.innerHTML = '';
    resultsEl.className = 'results list';
    resultsEl.setAttribute('role', 'listbox');
    resultsEl.setAttribute('aria-label', 'Bookmarks');

    const bookmarks = cachedBookmarks.filter(b => b.url);

    if (bookmarks.length === 0) {
      resultsEl.innerHTML = '<li class="empty-state">No matching bookmarks</li>';
      updateResultCount('0 bookmarks');
      return;
    }

    updateResultCount(`${bookmarks.length} bookmark${bookmarks.length !== 1 ? 's' : ''}`);

    if (!query.trim()) {
      const header = document.createElement('li');
      header.className = 'palette-category-header';
      header.setAttribute('role', 'presentation');
      header.textContent = 'Recent bookmarks';
      resultsEl.appendChild(header);
      const tip = document.createElement('li');
      tip.className = 'palette-discovery-tip';
      tip.setAttribute('role', 'presentation');
      tip.textContent = 'Type to search all bookmarks by title or URL.';
      resultsEl.appendChild(tip);
    }

    bookmarks.forEach((bm, idx) => {
      const li = document.createElement('li');
      li.className = 'bookmark-row';
      if (idx === 0) {li.classList.add('selected');}
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', idx === 0 ? 'true' : 'false');

      const folderPath = (bm as unknown as { folderPath?: string }).folderPath || '';
      li.innerHTML = `
        <img class="tab-favicon" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(bm.url!).hostname)}&sz=16" alt="">
        <div class="tab-details">
          <span class="tab-title">${escapeHtml(bm.title || 'Untitled')}</span>
          ${folderPath ? `<span class="bookmark-folder">📁 ${escapeHtml(folderPath)}</span>` : ''}
          <span class="tab-url">${escapeHtml(truncateUrl(bm.url || ''))}</span>
        </div>
      `;
      wireHideImgOnError(li.querySelector('img'));

      li.addEventListener('click', (e) => {
        const url = bm.url!;
        if ((e as MouseEvent).shiftKey) {
          try { chrome.runtime.sendMessage({ type: 'WINDOW_CREATE', windowType: 'background-tab', url }); } catch { window.open(url); }
        } else {
          try { chrome.runtime.sendMessage({ type: 'WINDOW_CREATE', windowType: 'tab', url }); } catch { window.open(url, '_blank'); }
        }
        hideOverlay();
      });
      resultsEl!.appendChild(li);
    });
  }

  // ===== COMMAND PALETTE: WEB SEARCH =====

  function showFirstUseHint(): void {
    if (!resultsEl || !cachedSettings) {return;}
    if (!cachedSettings.commandPaletteEnabled) {return;}
    if (cachedSettings.commandPaletteOnboarded) {return;}

    if (firstUseHintEl) {return;}

    firstUseHintEl = document.createElement('div');
    firstUseHintEl.className = 'first-use-hint';
    firstUseHintEl.textContent = 'New: Type / for commands, @ for tabs, # for bookmarks';

    resultsEl.parentElement?.insertBefore(firstUseHintEl, resultsEl);

    firstUseHintTimer = window.setTimeout(() => {
      dismissFirstUseHint();
    }, 5000) as unknown as number;
  }

  function dismissFirstUseHint(): void {
    if (firstUseHintTimer) { clearTimeout(firstUseHintTimer); firstUseHintTimer = null; }
    if (firstUseHintEl) {
      firstUseHintEl.remove();
      firstUseHintEl = null;
    }
    if (cachedSettings && !cachedSettings.commandPaletteOnboarded) {
      cachedSettings = { ...cachedSettings, commandPaletteOnboarded: true };
      try {
        chrome.runtime.sendMessage({
          type: 'SETTINGS_CHANGED',
          settings: { commandPaletteOnboarded: true },
        });
      } catch { /* ignore */ }
    }
  }

  function handlePaletteEnter(shiftKey = false): void {
    if (!resultsEl) {return;}

    if (currentMode === 'websearch') {
      const raw = inputEl?.value ?? '';
      const { query } = detectMode(raw.trim());
      if (query) {
        const defaultKey = cachedSettings?.webSearchEngine ?? 'google';
        const parsed = parseWebSearchQuery(query, defaultKey);
        const built = buildWebSearchUrl(parsed, cachedSettings ?? {});
        if ('error' in built) {
          if (built.error === 'no-terms') {
            showToast('Add search text after the prefix.', 'info');
          } else if (built.error === 'no-jira-site' || built.error === 'no-confluence-site') {
            showToast(webSearchSiteUrlToastMessage(built.error), 'warning');
          }
          return;
        }
        window.open(built.url, '_blank');
        hideOverlay();
      }
      return;
    }

    if (currentMode === 'tabs') {
      const selected = resultsEl.querySelector('.tab-row.selected') as HTMLElement | null;
      if (!selected) {return;}
      if (selected.classList.contains('recently-closed-row')) {
        const sessionId = selected.dataset.sessionId;
        const closedUrl = selected.dataset.closedUrl || '';
        if (sessionId && !shiftKey) {
          try {
            chrome.runtime.sendMessage({ type: 'REOPEN_TAB', sessionId });
          } catch { /* ignore */ }
        } else if (closedUrl) {
          if (shiftKey) {
            try {
              chrome.runtime.sendMessage({ type: 'WINDOW_CREATE', windowType: 'background-tab', url: closedUrl });
            } catch { window.open(closedUrl); }
          } else {
            window.open(closedUrl, '_blank');
          }
        }
        hideOverlay();
        return;
      }
      const tabId = selected.dataset.tabId ? Number(selected.dataset.tabId) : NaN;
      const windowId = selected.dataset.windowId ? Number(selected.dataset.windowId) : NaN;
      const tabUrl = selected.dataset.tabUrl || '';
      if (Number.isFinite(tabId) && Number.isFinite(windowId)) {
        if (shiftKey && tabUrl) {
          try {
            chrome.runtime.sendMessage({ type: 'WINDOW_CREATE', windowType: 'background-tab', url: tabUrl });
          } catch { window.open(tabUrl); }
          hideOverlay();
        } else {
          switchToTab(tabId, windowId);
        }
      }
      return;
    }

    if (currentMode === 'bookmarks') {
      const selected = resultsEl.querySelector('.bookmark-row.selected') as HTMLElement;
      if (selected) {
        selected.click();
      }
      return;
    }

    if (qsWindowPickerActive) {
      const rows = resultsEl.querySelectorAll('.command-row');
      if (rows.length > 0 && selectedIndex >= 0 && selectedIndex < rows.length) {
        const row = rows[selectedIndex] as HTMLElement;
        row.click();
      }
      return;
    }

    if (currentMode === 'commands' || currentMode === 'power') {
      const raw = inputEl?.value ?? '';
      const { query } = detectMode(raw.trim());
      const tier = currentMode === 'power' ? 'power' as const : 'everyday' as const;
      const commands = cachedSettings
        ? getAvailableCommands(tier, cachedSettings)
        : getCommandsByTier(tier);
      const list = preparePaletteCommandList(tier, query, commands, cachedSettings ?? undefined);
      if (list.length > 0 && selectedIndex >= 0 && selectedIndex < list.length) {
        executeSelectedCommand(list);
      }
    }
  }

  function handlePaletteArrow(direction: 'up' | 'down'): void {
    if (!resultsEl) {return;}

    const rowSelector = currentMode === 'tabs' ? '.tab-row' :
      currentMode === 'bookmarks' ? '.bookmark-row' : '.command-row';
    const rows = resultsEl.querySelectorAll(rowSelector);
    if (rows.length === 0) {return;}

    rows[selectedIndex]?.classList.remove('selected');
    rows[selectedIndex]?.setAttribute('aria-selected', 'false');

    if (direction === 'down') {
      selectedIndex = (selectedIndex + 1) % rows.length;
    } else {
      selectedIndex = (selectedIndex - 1 + rows.length) % rows.length;
    }

    rows[selectedIndex]?.classList.add('selected');
    rows[selectedIndex]?.setAttribute('aria-selected', 'true');
    (rows[selectedIndex] as HTMLElement)?.scrollIntoView({ block: 'nearest' });
  }

  function renderWebSearchPreview(query: string): void {
    if (!resultsEl) {return;}

    selectedIndex = 0;
    resultsEl.innerHTML = '';
    resultsEl.className = 'results list';

    if (!query) {
      resultsEl.setAttribute('role', 'listbox');
      resultsEl.setAttribute('aria-label', 'Web search hints');
      const defaultKey = cachedSettings?.webSearchEngine ?? 'google';
      const defaultLabel = getWebSearchEngineDisplayName(defaultKey);
      const intro = document.createElement('li');
      intro.className = 'palette-discovery-tip';
      intro.setAttribute('role', 'presentation');
      intro.textContent = `Default engine: ${defaultLabel} (change in settings). Type a query, then Enter. For Jira and Confluence, set each site URL in settings.`;
      resultsEl.appendChild(intro);
      const prefixTitle = document.createElement('li');
      prefixTitle.className = 'palette-category-header';
      prefixTitle.setAttribute('role', 'presentation');
      prefixTitle.textContent = 'Prefix + space + query';
      resultsEl.appendChild(prefixTitle);
      for (const line of getWebSearchPrefixHintLines()) {
        const row = document.createElement('li');
        row.className = 'palette-hint-line';
        row.setAttribute('role', 'presentation');
        row.innerHTML = `<code>?? ${escapeHtml(line.prefix)}</code> — ${escapeHtml(line.engineLabel)} <span class="palette-hint-muted">(e.g. <code>?? ${escapeHtml(line.prefix)} cats</code>)</span>`;
        resultsEl.appendChild(row);
      }
      updateResultCount('');
      return;
    }

    const defaultKey = cachedSettings?.webSearchEngine ?? 'google';
    const parsed = parseWebSearchQuery(query, defaultKey);
    const engineName = getWebSearchEngineDisplayName(parsed.engineKey);
    const jiraOrigin = (cachedSettings?.jiraSiteUrl ?? '').trim();
    const confluenceOrigin = (cachedSettings?.confluenceSiteUrl ?? '').trim();
    const missingSiteForEngine =
      (parsed.engineKey === 'jira' && !jiraOrigin)
      || (parsed.engineKey === 'confluence' && !confluenceOrigin);
    const built = buildWebSearchUrl(parsed, cachedSettings ?? {});

    const li = document.createElement('li');
    li.className = 'command-row selected';
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'true');

    if (parsed.usedPrefix && parsed.searchTerms === '') {
      const mp = parsed.matchedPrefix ?? '';
      if (missingSiteForEngine) {
        const siteHint = parsed.engineKey === 'jira' ? 'Jira' : 'Confluence';
        li.innerHTML = `
          <span class="cmd-icon">🔍</span>
          <span class="cmd-label">${escapeHtml(engineName)} — set ${siteHint} site URL in settings, then add terms (e.g. <code>?? ${escapeHtml(mp)} PROJ-1</code>)</span>
          <span class="cmd-shortcut">Enter: n/a</span>
        `;
        li.addEventListener('click', () => {
          showToast(
            webSearchSiteUrlToastMessage(parsed.engineKey === 'jira' ? 'no-jira-site' : 'no-confluence-site'),
            'warning',
          );
        });
      } else {
        li.innerHTML = `
          <span class="cmd-icon">🔍</span>
          <span class="cmd-label">${escapeHtml(engineName)} — type search terms after a space (e.g. <code>?? ${escapeHtml(mp)} query</code>)</span>
          <span class="cmd-shortcut">Enter: n/a</span>
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
        <span class="cmd-icon">🔍</span>
        <span class="cmd-label">${escapeHtml(msg)}</span>
        <span class="cmd-shortcut">Enter: n/a</span>
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
        <span class="cmd-icon">🔍</span>
        <span class="cmd-label">Search ${escapeHtml(engineName)} for "${escapeHtml(parsed.searchTerms)}"</span>
        <span class="cmd-shortcut">Enter to search</span>
      `;
      li.addEventListener('click', () => {
        window.open(built.url, '_blank');
        hideOverlay();
      });
    }

    resultsEl.appendChild(li);
    updateResultCount('');
  }

  // ===== LOADING SPINNER & AI STATUS =====
  function showSpinner(): void {
    if (spinnerEl) {spinnerEl.classList.add('active');}
    log.trace('spinner', 'Spinner shown');
    // Start safety timeout — hides spinner if no response arrives
    clearSpinnerTimeout();
    spinnerTimeoutTimer = window.setTimeout(() => {
      log.warn('spinner', `Spinner timeout after ${SPINNER_TIMEOUT_MS}ms — hiding stuck spinner`);
      aiSearchPending = false;
      hideSpinner();
    }, SPINNER_TIMEOUT_MS);
  }

  function hideSpinner(): void {
    if (spinnerEl) {spinnerEl.classList.remove('active');}
    clearSpinnerTimeout();
    log.trace('spinner', 'Spinner hidden');
  }

  function clearSpinnerTimeout(): void {
    if (spinnerTimeoutTimer) {
      clearTimeout(spinnerTimeoutTimer);
      spinnerTimeoutTimer = null;
    }
  }

  // Thin wrapper — delegates to shared renderAIStatus with this overlay's container
  function renderAIStatus(aiStatus: AIStatus | null | undefined): void {
    try {
      log.debug('aiStatus', 'Rendering AI status:', aiStatus ? {
        aiKeywords: aiStatus.aiKeywords,
        semantic: aiStatus.semantic,
        expandedCount: aiStatus.expandedCount,
        searchTimeMs: aiStatus.searchTimeMs,
      } : 'cleared');
      renderAIStatusShared(aiStatusBarEl, aiStatus);
    } catch (err) {
      console.error('[SmrutiCortex] renderAIStatus error:', err);
    }
  }

  function updateOverlayReportButton(hasResults: boolean): void {
    if (!footerEl) { return; }
    let btn = footerEl.querySelector('.report-ranking-btn') as HTMLButtonElement | null;
    if (!hasResults) {
      if (btn) { btn.remove(); }
      return;
    }
    if (btn) { return; }
    btn = document.createElement('button');
    btn.className = 'report-ranking-btn';
    btn.textContent = 'Report';
    btn.title = 'Report ranking issue to GitHub';
    btn.style.cssText = 'padding:2px 8px;font-size:10px;font-weight:600;border:1px solid #ef4444;color:#ef4444;background:transparent;border-radius:4px;cursor:pointer;margin-left:auto;';
    btn.addEventListener('click', () => {
      btn!.disabled = true;
      btn!.textContent = 'Sending...';
      const method = cachedSettings?.developerGithubPat ? 'api' : 'url';
      chrome.runtime.sendMessage({
        type: 'GENERATE_RANKING_REPORT',
        maskingLevel: 'partial',
        method,
      }, (resp) => {
        if (resp?.status === 'OK') {
          if (resp.method === 'api') {
            btn!.textContent = 'Filed!';
            btn!.style.color = '#10b981';
            btn!.style.borderColor = '#10b981';
          } else {
            navigator.clipboard.writeText(resp.reportBody || '').catch(e => log.debug('bugReport', 'Clipboard write failed', e));
            btn!.textContent = 'Copied!';
            btn!.style.color = '#10b981';
            btn!.style.borderColor = '#10b981';
            showReportConfirmation(resp.issueUrl);
          }
        } else {
          btn!.textContent = resp?.message || 'Error';
          btn!.style.color = '#ef4444';
        }
        setTimeout(() => {
          if (btn) {
            btn.textContent = 'Report';
            btn.style.color = '#ef4444';
            btn.style.borderColor = '#ef4444';
            btn.disabled = false;
          }
        }, 3000);
      });
    });
    footerEl.appendChild(btn);
  }

  function buildRecentSearchesSection(entries: Array<{ query: string; timestamp: number; selectedUrl?: string }>): HTMLElement {
    const container = document.createElement('div');
    container.className = 'recent-searches-section';

    const header = document.createElement('div');
    header.className = 'recent-searches-header';
    const title = document.createElement('span');
    title.className = 'recent-searches-title';
    title.textContent = '🕐 Recent Searches';
    header.appendChild(title);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'recent-searches-clear';
    clearBtn.textContent = 'Clear';
    clearBtn.title = 'Clear recent searches';
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearRecentSearches().then(() => container.remove()).catch(e => log.debug('recentSearches', 'Failed to clear', e));
    });
    header.appendChild(clearBtn);
    container.appendChild(header);

    for (const entry of entries) {
      const item = document.createElement('div');
      item.className = 'recent-search-item';
      item.tabIndex = 0;
      item.title = entry.selectedUrl ? `Search: "${entry.query}" → ${entry.selectedUrl}` : `Search: "${entry.query}"`;

      const icon = document.createElement('span');
      icon.className = 'recent-search-icon';
      icon.textContent = '🔍';
      item.appendChild(icon);

      const querySpan = document.createElement('span');
      querySpan.className = 'recent-search-query';
      querySpan.textContent = entry.query;
      item.appendChild(querySpan);

      item.addEventListener('click', () => {
        if (inputEl) {
          inputEl.value = entry.query;
          syncClearButton();
          inputEl.focus();
          handleInput();
        }
      });
      item.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {item.click();}
      });
      container.appendChild(item);
    }
    return container;
  }

  function buildRecentInteractionsSection(entries: Array<{ url: string; title: string; timestamp: number; action: string }>): HTMLElement {
    const container = document.createElement('div');
    container.className = 'recent-searches-section';

    const header = document.createElement('div');
    header.className = 'recent-searches-header';
    const title = document.createElement('span');
    title.className = 'recent-searches-title';
    title.textContent = '⚡ Recently Visited';
    header.appendChild(title);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'recent-searches-clear';
    clearBtn.textContent = 'Clear';
    clearBtn.title = 'Clear recently visited';
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearRecentInteractions().then(() => container.remove()).catch(e => log.debug('recentHistory', 'Failed to clear', e));
    });
    header.appendChild(clearBtn);
    container.appendChild(header);

    for (const entry of entries) {
      const item = document.createElement('div');
      item.className = 'recent-search-item';
      item.tabIndex = 0;
      item.title = entry.title || entry.url;

      const icon = document.createElement('span');
      icon.className = 'recent-search-icon';
      icon.textContent = entry.action === 'copy' ? '📋' : '🔗';
      item.appendChild(icon);

      const labelSpan = document.createElement('span');
      labelSpan.className = 'recent-search-query';
      labelSpan.textContent = entry.title || entry.url;
      item.appendChild(labelSpan);

      item.addEventListener('click', () => {
        hideOverlay();
        window.open(entry.url, '_blank');
      });
      item.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {item.click();}
      });
      container.appendChild(item);
    }
    return container;
  }

  // --- Toggle Chip Bar for Quick-Search ---
  function renderQSToggleBar() {
    if (!toggleBarEl) {return;}
    toggleBarEl.innerHTML = '';
    const visibleKeys = cachedSettings?.toolbarToggles ?? ['ollamaEnabled', 'indexBookmarks', 'showDuplicateUrls'];
    for (const key of visibleKeys) {
      const def = getToggleDef(key);
      if (!def) {continue;}

      const chip = document.createElement('button');
      chip.className = 'toggle-chip';
      chip.dataset.toggleKey = key;
      chip.type = 'button';

      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        const s = cachedSettings as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (def.type === 'boolean') {
          const cur = s?.[def.key] as boolean ?? false;
          const next = !cur;
          if (s) { s[def.key] = next; }
          try {
            chrome.runtime.sendMessage({ type: 'SETTINGS_CHANGED', settings: { [def.key]: next } });
          } catch { /* context invalidated */ }
        } else if (def.type === 'cycle') {
          const cur = s?.[def.key];
          const next = getNextCycleValue(def, cur);
          if (s) { s[def.key] = next; }
          try {
            chrome.runtime.sendMessage({ type: 'SETTINGS_CHANGED', settings: { [def.key]: next } });
          } catch { /* context invalidated */ }
        }
        applySettingSideEffects(def.key);
        if (def.key !== 'displayMode' && def.key !== 'highlightMatches') {
          if (inputEl?.value?.trim()) {
            handleInput();
          } else {
            loadRecentHistory();
          }
        }
      });

      toggleBarEl.appendChild(chip);
    }
    syncQSToggleBar();
  }

  function syncQSToggleBar() {
    if (!toggleBarEl) {return;}
    const chips = toggleBarEl.querySelectorAll<HTMLButtonElement>('.toggle-chip');
    chips.forEach(chip => {
      const key = chip.dataset.toggleKey;
      if (!key) {return;}
      const def = getToggleDef(key);
      if (!def) {return;}

      const val = (cachedSettings as any)?.[key]; // eslint-disable-line @typescript-eslint/no-explicit-any

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

  // Load recent history (smart default results when query is empty)
  let recentHistoryRetryCount = 0;
  async function loadRecentHistory(): Promise<void> {
    const t0 = performance.now();
    perfLog('loadRecentHistory called');

    if (!isExtensionContextValid()) {
      perfLog('Extension context invalid - showing error');
      currentResults = [];
      renderErrorResults(
        '🔄 Extension was updated. Click reconnect or press the shortcut again.',
        attemptNoReloadReconnect
      );
      return;
    }

    try {
      const showRecentlyVisited = cachedSettings?.showRecentHistory ?? true;
      const showSearches = cachedSettings?.showRecentSearches ?? true;

      const defaultResultCount = cachedSettings?.defaultResultCount ?? 50;
      const response = await new Promise<{ results?: SearchResult[]; error?: string; _lastError?: boolean }>((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'GET_RECENT_HISTORY', limit: defaultResultCount },
          (resp) => {
            if (chrome.runtime.lastError) {
              perfLog('GET_RECENT_HISTORY error: ' + chrome.runtime.lastError.message);
              resolve({ results: [], _lastError: true });
            } else {
              resolve(resp || { results: [] });
            }
          }
        );
      });

      if (currentMode !== 'history') {
        perfLog('loadRecentHistory — aborting, palette mode active: ' + currentMode);
        return;
      }

      // Service worker not ready or connection failed (e.g., SW still cold-starting
      // after hibernation wake) — retry with backoff before giving up
      const shouldRetry = (response.error || response._lastError) && recentHistoryRetryCount < 2;
      if (shouldRetry) {
        recentHistoryRetryCount++;
        const reason = response.error || 'lastError (connection failed)';
        log.debug('loadRecentHistory', `SW unavailable: "${reason}", retry ${recentHistoryRetryCount}/2`);
        setTimeout(() => loadRecentHistory(), 500);
        return;
      }

      let recentItems: SearchResult[] = response.results || [];
      const sortBy = cachedSettings?.sortBy || 'most-recent';
      recentItems = sortResults(recentItems, sortBy as any); // eslint-disable-line @typescript-eslint/no-explicit-any
      currentResults = recentItems;
      recentHistoryRetryCount = 0;

      selectedIndex = -1;
      renderResults(currentResults);

      // "⚡ Recently Visited" section — gated by showRecentHistory toggle
      if (showRecentlyVisited && resultsEl) {
        getRecentInteractions().then(entries => {
          if (entries.length > 0 && resultsEl) {
            const section = buildRecentInteractionsSection(entries.slice(0, 5));
            resultsEl.insertBefore(section, resultsEl.firstChild);
          }
        }).catch(e => log.debug('loadRecent', 'Failed to load recent interactions', e));
      }

      if (showSearches && resultsEl) {
        getRecentSearches().then(entries => {
          if (entries.length > 0 && resultsEl) {
            const section = buildRecentSearchesSection(entries.slice(0, 5));
            resultsEl.insertBefore(section, resultsEl.firstChild);
          }
        }).catch(e => log.debug('loadRecent', 'Failed to load recent searches', e));
      }
      
      perfLog('loadRecentHistory completed', t0);
      perfLog(`Loaded ${currentResults.length} recent items`);
    } catch (error) {
      log.warn('loadRecentHistory', 'Failed to load recent history:', (error as Error).message);
      currentResults = [];
      renderResults([]);
    }
  }

  function performSearch(query: string, skipAI: boolean = false): void {
    log.debug('performSearch', `query="${query}" skipAI=${skipAI}`);

    // Sanitize query to prevent issues with special characters
    const sanitizedQuery = sanitizeQuery(query);
    if (!sanitizedQuery) {
      // Empty query after sanitization - load recent history (smart default results)
      log.debug('performSearch', 'Query empty after sanitization — loading recent history');
      aiSearchPending = false;
      hideSpinner();
      renderAIStatus(null);
      loadRecentHistory();
      return;
    }

    // Spinner is NOT shown here — it's managed by response handlers.
    // Phase 1 results render without spinner; spinner appears only when AI is pending.

    if (!isExtensionContextValid()) {
      log.debug('performSearch', 'Extension context invalid — showing reconnect UI');
      currentResults = [];
      renderErrorResults(
        '🔄 Extension was updated. Click reconnect or press the shortcut again.',
        attemptNoReloadReconnect
      );
      return;
    }

    // Use port if available (faster), otherwise fallback to sendMessage
    if (searchPort) {
      try {
        searchPort.postMessage({ type: 'SEARCH_QUERY', query: sanitizedQuery, source: 'inline', skipAI });
        log.debug('performSearch', `Query sent via port: "${sanitizedQuery}" (skipAI=${skipAI})`);
        // Check for runtime errors after async operation
        if (chrome.runtime.lastError) {
          log.warn('performSearch', 'Port message error (likely bfcache):', chrome.runtime.lastError.message);
          searchPort = null;
          openSearchPort();
          return;
        }
      } catch (err) {
        log.warn('performSearch', 'Failed to send via port, reconnecting:', (err as Error).message);
        searchPort = null;
        openSearchPort();
        // Try once more with new port
        if (searchPort) {
          try {
            searchPort.postMessage({ type: 'SEARCH_QUERY', query: sanitizedQuery, source: 'inline', skipAI });
            log.debug('performSearch', 'Query sent via reconnected port');
            // Check for runtime errors after async operation
            if (chrome.runtime.lastError) {
              log.warn('performSearch', 'Reconnected port error:', chrome.runtime.lastError.message);
              searchPort = null;
            }
            return;
          } catch (e) {
            log.warn('performSearch', 'Reconnected port also failed:', (e as Error).message);
          }
        }
        // Fall through to sendMessage fallback
      }
    }

    // Fallback to one-shot sendMessage if no port
    if (!searchPort) {
      log.info('performSearch', 'Using sendMessage fallback (no port)');

      // Attempt one-shot sendMessage and handle errors
      try {
        chrome.runtime.sendMessage(
          { type: 'SEARCH_QUERY', query: sanitizedQuery, source: 'inline', skipAI },
          (response) => {
            if (chrome.runtime.lastError) {
              aiSearchPending = false;
              hideSpinner();
              log.error('performSearch', 'sendMessage error:', chrome.runtime.lastError.message);
              currentResults = [];
              renderErrorResults(
                'Search failed: ' + chrome.runtime.lastError.message,
                () => {
                  // Try to reconnect and search again
                  openSearchPort();
                  setTimeout(() => performSearch(query), 300);
                }
              );
              return;
            }
            if (response?.error) {
              // Service worker returned an error (e.g., SyntaxError, init failure)
              log.warn('performSearch', 'Service worker error response:', response.error);
              aiSearchPending = false;
              hideSpinner();
              return;
            }
            if (response?.results) {
              // Staleness guard: ignore responses for old queries
              // Compare both sides lowercased to avoid case mismatch
              const currentInputQuery = (inputEl?.value?.trim() || '').toLowerCase();
              const responseQuery = (response.query || '').toLowerCase();
              if (responseQuery && responseQuery !== currentInputQuery) {
                log.debug('sendMessage', `Ignoring stale response for "${responseQuery}" (current: "${currentInputQuery}")`);
                return;
              }

              const isPhase1 = response.skipAI === true;
              log.debug('sendMessage', `Results received (${isPhase1 ? 'Phase 1 LEXICAL' : 'Phase 2 AI'}): ${response.results.length} results`);

              currentResults = response.results.slice(0, cachedSettings?.maxResults ?? MAX_RESULTS);

              // Apply current sort setting from cached settings
              const currentSort = cachedSettings?.sortBy || 'best-match';
              sortResults(currentResults, currentSort);

              currentAIExpandedTokens = response.aiStatus?.aiExpandedKeywords ?? [];
              selectedIndex = currentResults.length > 0 ? 0 : -1;
              renderResults(currentResults);

              // Loading state: same logic as port handler
              if (isPhase1 && aiSearchPending) {
                log.debug('sendMessage', 'Phase 1 done, AI Phase 2 still pending — showing spinner');
                showSpinner(); // Show spinner NOW — Phase 1 results are already rendered above
              } else {
                log.debug('sendMessage', 'Final response — hiding spinner, rendering AI status');
                aiSearchPending = false;
                hideSpinner();
                renderAIStatus(response.aiStatus);
              }
            }
          }
        );
      } catch (e) {
        aiSearchPending = false;
        hideSpinner();
        log.error('performSearch', 'sendMessage threw:', (e as Error).message);
        currentResults = [];
        const errorMsg = e instanceof Error ? e.message : 'Unknown error';
        renderErrorResults(
          `Search failed: ${errorMsg}. This may be due to page restrictions.`,
          () => {
            // Attempt to reconnect
            if (isExtensionContextValid()) {
              openSearchPort();
              showToast('Attempting reconnect...', 'info');
            } else {
              showToast('Extension context lost. Press Ctrl+Shift+S to reconnect.', 'error', 8000);
            }
          }
        );
      }
    }
  }

  // ===== HIGHLIGHT HELPER — thin wrapper over shared highlightHtml =====
  function highlightText(text: string, tokens: string[], aiTokens: string[] = []): string {
    return highlightHtml(
      text, tokens, aiTokens,
      m => `<span class="highlight">${m}</span>`,
      m => `<span class="highlight-ai">${m}</span>`
    );
  }

  // ===== RENDER RESULTS (card + list mode, mirrors popup.ts renderResults) =====
  function renderResults(results: SearchResult[]): void {
    if (!resultsEl) {return;}
    try {
    const t0 = performance.now();

    const isCards = cachedSettings?.displayMode === DisplayMode.CARDS;
    resultsEl.className = isCards ? 'results cards' : 'results';

    // Clear existing results
    while (resultsEl.firstChild) {
      resultsEl.removeChild(resultsEl.firstChild);
    }

    const query = inputEl?.value?.trim() || '';
    const tokens = tokenizeQuery(query);
    const emptyMessage = query ? 'No results found' : 'Type to search your history...';

    updateOverlayReportButton(results.length > 0);

    if (results.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'empty';
      emptyDiv.textContent = emptyMessage;
      resultsEl.appendChild(emptyDiv);
      perfLog('renderResults (empty)', t0);
      return;
    }

    if (isCards) {
      // Card rendering — mirrors popup.ts card branch
      const loadFavicons = cachedSettings?.loadFavicons !== false; // default: true
      results.forEach((item, idx) => {
        const card = document.createElement('div');
        card.className = 'result-card';
        card.tabIndex = 0;
        card.dataset.index = String(idx);
        if (idx === selectedIndex) { card.classList.add('selected'); }

        const fav = document.createElement('img');
        fav.className = 'card-favicon';
        const qsFavFallback = chrome.runtime.getURL('../assets/icon-favicon-fallback.svg');
        fav.src = qsFavFallback;
        fav.addEventListener('error', () => { fav.src = qsFavFallback; }, { once: true });
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
        const bookmarkIndicator = item.isBookmark ? '<span class="bookmark-indicator" title="Bookmarked">★</span> ' : '';
        title.innerHTML = bookmarkIndicator + highlightText(item.title || item.url, tokens, currentAIExpandedTokens);
        details.appendChild(title);

        if (item.bookmarkFolders && item.bookmarkFolders.length > 0) {
          const folder = document.createElement('div');
          folder.className = 'bookmark-folder';
          folder.textContent = '📁 ' + item.bookmarkFolders.join(' › ');
          details.appendChild(folder);
        }

        const url = document.createElement('div');
        url.className = 'card-url';
        url.innerHTML = highlightText(item.url, tokens, currentAIExpandedTokens);
        details.appendChild(url);

        card.appendChild(fav);
        card.appendChild(details);

        card.addEventListener('click', (e) => {
          e.stopPropagation();
          openResult(idx, true);
        });

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        resultsEl!.appendChild(card);
      });
    } else {
      // List rendering — use shared function (DRY principle)
      const fragment = renderResultsShared(results, tokens, {
        selectedIndex,
        emptyMessage,
        resultClassName: 'result',
        selectedClassName: 'selected',
        titleClassName: 'result-title',
        urlClassName: 'result-url',
        highlightClassName: 'highlight',
        emptyClassName: 'empty',
        aiTokens: currentAIExpandedTokens,
        aiHighlightClassName: 'highlight-ai',
        onResultClick: (index, _result, _ctrlOrMeta) => {
          openResult(index, true);
        }
      });
      resultsEl.appendChild(fragment);

      // Make list items focusable for keyboard navigation
      resultsEl.querySelectorAll('.result').forEach((result, index) => {
        (result as HTMLElement).tabIndex = 0;
        (result as HTMLElement).dataset.index = String(index);
      });
    }

    // Post-render: focus first result after focusDelayMs — ONLY for search results, not recent history.
    // When selectedIndex === -1, user is browsing default results or cleared the input → don't steal focus.
    const renderSelectedSnapshot = selectedIndex;
    const focusDelay = typeof cachedSettings?.focusDelayMs === 'number'
      ? Math.max(0, Math.min(2000, cachedSettings.focusDelayMs))
      : 450; // Default 450ms
    if (results.length > 0 && focusDelay > 0 && renderSelectedSnapshot >= 0) {
      if (qsFocusTimer) {clearTimeout(qsFocusTimer);}
      qsFocusTimer = window.setTimeout(() => {
        qsFocusTimer = null;
        // If user navigated or typed since render, skip — stale focus
        if (selectedIndex !== renderSelectedSnapshot) {return;}
        const itemSel = resultsEl?.classList.contains('cards') ? '.result-card' : '.result';
        const first = resultsEl?.querySelector(itemSel) as HTMLElement | null;
        if (first) {
          updateSelection();
          try { first.focus(); } catch { /* ignore */ }
        }
      }, focusDelay) as unknown as number;
    }

    perfLog(`renderResults (${results.length} items, ${isCards ? 'cards' : 'list'})`, t0);
    } catch (err) {
      if (resultsEl) {
        resultsEl.innerHTML = '<div style="padding:12px;color:#ef4444;">Render error — try a new search</div>';
      }
      console.error('[SmrutiCortex] renderResults error:', err);
    }
  }

  // ===== RENDER ERROR MESSAGE =====
  function renderErrorResults(message: string, reconnect?: () => void): void {
    if (!resultsEl) {return;}
    
    while (resultsEl.firstChild) {
      resultsEl.removeChild(resultsEl.firstChild);
    }

    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.alignItems = 'center';
    wrapper.style.padding = '20px';
    wrapper.style.textAlign = 'center';

    const errorDiv = document.createElement('div');
    errorDiv.className = 'empty';
    errorDiv.textContent = message;
    errorDiv.style.color = 'var(--text-danger, #ef4444)';
    errorDiv.style.lineHeight = '1.5';
    wrapper.appendChild(errorDiv);
    
    if (reconnect) {
      const btn = document.createElement('button');
      btn.className = 'reconnect-btn';
      btn.textContent = '🔄 Try to Reconnect';
      btn.style.marginTop = '12px';
      btn.style.padding = '8px 16px';
      btn.style.background = 'var(--bg-hover, #f0f0f0)';
      btn.style.border = '1px solid var(--border, #ccc)';
      btn.style.borderRadius = '6px';
      btn.style.cursor = 'pointer';
      btn.style.fontSize = '14px';
      btn.style.fontWeight = '500';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (btn.disabled) {return;}
        try {
          btn.disabled = true;
          btn.textContent = '⏳ Reconnecting...';
          btn.style.opacity = '0.6';
          reconnect();
          setTimeout(() => {
            if (btn.parentElement) {
              btn.disabled = false;
              btn.textContent = '🔄 Try Again';
              btn.style.opacity = '1';
            }
          }, 2000);
        } catch (err) {
          btn.disabled = false;
          btn.textContent = '❌ Failed - Try Again';
          btn.style.opacity = '1';
          log.error('reconnect', 'Reconnect failed:', (err as Error).message);
        }
      });
      wrapper.appendChild(btn);
      
      const tipDiv = document.createElement('div');
      tipDiv.style.marginTop = '16px';
      tipDiv.style.fontSize = '12px';
      tipDiv.style.color = 'var(--text-secondary, #666)';
      tipDiv.textContent = 'Tip: If this persists, press the keyboard shortcut (Ctrl+Shift+S) to trigger automatic re-injection.';
      wrapper.appendChild(tipDiv);
    }

    resultsEl.appendChild(wrapper);
  }

  // ===== COPY TO CLIPBOARD (using shared utility) =====
  function copyMarkdownLink(index: number): void {
    const result = currentResults[index];
    if (!result?.url) {return;}
    
    const markdown = createMarkdownLink(result);
    
    navigator.clipboard.writeText(markdown).then(() => {
      showToast('📋 Copied markdown link!');
    }).catch(() => {
      showToast('❌ Copy failed', 'error');
    });
    addRecentInteraction(result.url, result.title || '', 'copy').catch(e => log.debug('copyMarkdown', 'Failed to record interaction', e));
  }

  function copyHtmlLink(index: number): void {
    const result = currentResults[index];
    if (!result?.url) {return;}
    
    copyHtmlLinkToClipboard(result).then(() => {
      showToast('📋 Copied HTML link!');
    }).catch(() => {
      showToast('📋 Copied (text only)', 'info');
    });
    addRecentInteraction(result.url, result.title || '', 'copy').catch(e => log.debug('copyHtml', 'Failed to record interaction', e));
  }

  // ===== TAB NAVIGATION =====
  // Generic, extensible, fully cyclic tab navigation using shared utility
  function handleTabNavigation(backward: boolean): void {
    if (!inputEl || !resultsEl || !settingsBtn) { return; }

    // REVERSED ORDER: input → settings → results
    // This makes Tab from results go back to input (most common use case)
    const focusGroups: FocusableGroup[] = [
      {
        name: 'input',
        element: inputEl,
        onFocus: () => {
          inputEl?.focus();
          // Apply select-all behavior based on settings
          try {
            const selectAllOnFocus = Boolean(cachedSettings?.selectAllOnFocus);
            if (selectAllOnFocus && inputEl) {
              inputEl.setSelectionRange(0, inputEl.value.length);
            }
          } catch { /* ignore */ }
        }
      },
      {
        name: 'settings',
        element: settingsBtn
      },
      {
        name: 'results',
        element: null,
        onFocus: () => {
          const itemSel = getActiveItemSelector();
          const selectedResult = resultsEl?.querySelector(`${itemSel}.selected`) as HTMLElement;
          if (selectedResult) {
            selectedResult.focus();
          } else {
            const firstResult = resultsEl?.querySelector(itemSel) as HTMLElement;
            if (firstResult) {
              selectedIndex = 0;
              updateSelection();
              firstResult.focus();
            }
          }
        },
        shouldSkip: () => {
          const itemSel = getActiveItemSelector();
          return !resultsEl?.querySelector(itemSel);
        }
      }
    ];

    // Determine current focused group
    const getCurrentGroupIndex = (): number => {
      const currentFocused = getFocusedElement() as HTMLElement;

      if (currentFocused === inputEl) {return 0;}
      if (currentFocused === settingsBtn) {return 1;}
      if (currentFocused && (
        currentFocused.classList?.contains('result') ||
        currentFocused.classList?.contains('result-card')
      )) {return 2;}

      return -1; // Unknown/not focused
    };

    // Use shared cyclic navigation
    handleCyclicTabNavigation(focusGroups, getCurrentGroupIndex, backward);
  }
  function handleKeydown(e: KeyboardEvent): void {
    // Check if input is focused - if so, only intercept specific navigation keys
    const focused = getFocusedElement() as HTMLElement | null;
    const isInputFocused = focused === inputEl;
    
    if (isInputFocused) {
      // In input: only handle Escape, ArrowDown, Enter, Tab, Shift+Tab
      // Allow ALL other keys (including Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+Z, Ctrl+Backspace, etc.) to work normally
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (qsWindowPickerActive) {
          qsWindowPickerActive = false;
          const raw = inputEl?.value ?? '';
          const { query } = detectMode(raw.trim());
          renderCommandResults(query, currentMode === 'power' ? 'power' : 'everyday');
          return;
        }
        if (confirmingCommand) {
          confirmingCommand = null;
          const raw = inputEl?.value ?? '';
          const { query } = detectMode(raw.trim());
          renderCommandResults(query, currentMode === 'power' ? 'power' : 'everyday');
          return;
        }
        if (inputEl && inputEl.value.length > 0) {
          inputEl.value = '';
          currentMode = 'history';
          updateModeBadge('history');
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
          syncClearButton();
          return;
        }
        hideOverlay();
        return;
      }
      if (e.key === 'Enter') {
        if (currentMode !== 'history') {
          e.preventDefault();
          e.stopPropagation();
          handlePaletteEnter(e.shiftKey);
          return;
        }
        if (currentResults.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          const idx = selectedIndex >= 0 ? selectedIndex : 0;
          openResult(idx, !e.shiftKey);
          return;
        }
      }
      if (e.key === 'ArrowDown') {
        if (currentMode !== 'history') {
          e.preventDefault();
          e.stopPropagation();
          handlePaletteArrow('down');
          return;
        }
        if (currentResults.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          selectedIndex = (selectedIndex + 1) % currentResults.length;
          updateSelection();
          return;
        }
      }
      if (e.key === 'ArrowUp') {
        if (currentMode !== 'history') {
          e.preventDefault();
          e.stopPropagation();
          handlePaletteArrow('up');
          return;
        }
        if (currentResults.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          selectedIndex = (selectedIndex - 1 + currentResults.length) % currentResults.length;
          updateSelection();
          return;
        }
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        handleTabNavigation(e.shiftKey);
        return;
      }
      // All other keys (including Ctrl+A, Ctrl+Backspace, Ctrl+Z, Ctrl+V, text editing, etc.) work normally
      // DO NOT stopPropagation here - let browser handle text editing shortcuts
      return;
    }
    
    // Not in input - stop propagation for result navigation
    e.stopPropagation();
    
    // Parse action and handle result navigation
    const action = parseKeyboardAction(e);
    if (!action) {return;}
    
    // Determine if a result element currently has focus and derive its index
    let focusedIndex: number | null = null;
    if (focused && focused.dataset?.index) {
      const idx = parseInt(focused.dataset.index, 10);
      if (!Number.isNaN(idx)) { focusedIndex = idx; }
    }
    
    e.preventDefault();
    
    switch (action) {
      case KeyboardAction.CLOSE:
        hideOverlay();
        break;
      
      case KeyboardAction.CLEAR:
        if (inputEl) {
          inputEl.value = '';
          inputEl.focus();
          currentResults = [];
          renderResults([]);
        }
        break;
      
      case KeyboardAction.NAVIGATE_DOWN:
        if (currentMode !== 'history') {
          handlePaletteArrow('down');
        } else if (currentResults.length > 0) {
          if (focusedIndex !== null) {
            selectedIndex = (focusedIndex + 1) % currentResults.length;
          } else {
            selectedIndex = (selectedIndex + 1) % currentResults.length;
          }
          updateSelection();
        }
        break;
      
      case KeyboardAction.NAVIGATE_UP:
        if (currentMode !== 'history') {
          handlePaletteArrow('up');
        } else if (currentResults.length > 0) {
          if (focusedIndex !== null) {
            selectedIndex = (focusedIndex - 1 + currentResults.length) % currentResults.length;
          } else {
            selectedIndex = (selectedIndex - 1 + currentResults.length) % currentResults.length;
          }
          updateSelection();
        }
        break;
      
      case KeyboardAction.OPEN_NEW_TAB:
        if (currentResults.length > 0) {
          const idx = focusedIndex !== null ? focusedIndex : selectedIndex;
          if (idx >= 0) { openResult(idx, true, false); }
        }
        break;
      
      case KeyboardAction.OPEN_BACKGROUND_TAB:
        if (currentResults.length > 0) {
          const idx = focusedIndex !== null ? focusedIndex : selectedIndex;
          if (idx >= 0) { openResult(idx, true, true); }
        }
        break;
      
      case KeyboardAction.OPEN:
        if (currentResults.length > 0) {
          const idx = focusedIndex !== null ? focusedIndex : selectedIndex;
          if (idx >= 0) { openResult(idx, false, false); }
        }
        break;
      
      case KeyboardAction.COPY_MARKDOWN:
        if (currentResults.length > 0) {
          const idx = focusedIndex !== null ? focusedIndex : selectedIndex;
          if (idx >= 0) { copyMarkdownLink(idx); }
        }
        break;
      
      case KeyboardAction.COPY_HTML:
        if (currentResults.length > 0) {
          const idx = focusedIndex !== null ? focusedIndex : selectedIndex;
          if (idx >= 0) { copyHtmlLink(idx); }
        }
        break;
      
      case KeyboardAction.TAB_FORWARD:
        handleTabNavigation(false); // Forward tab
        break;
      
      case KeyboardAction.TAB_BACKWARD:
        handleTabNavigation(true); // Backward tab (Shift+Tab)
        break;
    }
  }

  function getActiveItemSelector(): string {
    if (currentMode === 'tabs') {return '.tab-row';}
    if (currentMode === 'bookmarks') {return '.bookmark-row';}
    if (currentMode === 'commands' || currentMode === 'power' || currentMode === 'websearch') {return '.command-row';}
    const isCards = resultsEl?.classList.contains('cards');
    return isCards ? '.result-card' : '.result';
  }

  function updateSelection(): void {
    if (!resultsEl) {return;}
    const itemSel = getActiveItemSelector();
    resultsEl.querySelectorAll(itemSel).forEach((el, i) => {
      el.classList.toggle('selected', i === selectedIndex);
    });
    const selected = resultsEl.querySelector(`${itemSel}.selected`);
    selected?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const currentlyFocused = getFocusedElement();
    if (selected && currentlyFocused !== selected) {
      try {
        (selected as HTMLElement).focus();
      } catch {
        // ignore focus errors
      }
    }
  }

  function openResult(index: number, newTab: boolean, background: boolean = false): void {
    const result = currentResults[index];
    if (!result?.url) {return;}

    const query = inputEl?.value?.trim();
    if (query) {
      addRecentSearch(query, result.url).catch(e => log.debug('openResult', 'Failed to record recent search', e));
    }

    const action = background ? 'background-tab' : 'click';
    addRecentInteraction(result.url, result.title || '', action).catch(e => log.debug('openResult', 'Failed to record interaction', e));

    hideOverlay();

    if (newTab) {
      window.open(result.url, '_blank');
    } else {
      window.location.href = result.url;
    }
  }

  // ===== GLOBAL KEYBOARD LISTENER =====
  const isOverlayKey = isOverlayKeyPure;

  function handleGlobalKeydown(e: KeyboardEvent): void {
    if (!isOverlayVisible()) {
      // Only handle Ctrl+Shift+S to open the overlay
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        showOverlay();
      }
      return;
    }

    // Overlay is visible — only intercept keys we explicitly handle.
    // All browser shortcuts (Ctrl+R, Ctrl+K, F5, Alt+Left, etc.) pass through.
    if (!isOverlayKey(e)) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    if (e.key === 'Tab') {
      handleTabNavigation(e.shiftKey);
      return;
    }

    if (e.key === 'Escape') {
      if (inputEl && inputEl.value.length > 0) {
        inputEl.value = '';
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        syncClearButton();
        inputEl.focus();
        return;
      }
      hideOverlay();
      return;
    }

    // Ctrl+Shift+S toggles overlay closed
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') {
      hideOverlay();
      return;
    }

    const focusedElement = getFocusedElement();

    if (focusedElement === inputEl) {
      if (inputEl) { handleKeyInput(e); }
      return;
    }

    if (focusedElement && (
      focusedElement.classList?.contains('result') ||
      focusedElement.classList?.contains('result-card') ||
      focusedElement.classList?.contains('command-row') ||
      focusedElement.classList?.contains('tab-row') ||
      focusedElement.classList?.contains('bookmark-row') ||
      focusedElement === settingsBtn
    )) {
      handleKeydown(e);
      return;
    }

    // Nothing specific focused — focus input and handle the key there
    if (inputEl) {
      inputEl.focus();
      handleKeyInput(e);
    }
  }

  // ===== TEXT EDITING HELPERS =====
  const undoStack: string[] = [];
  const redoStack: string[] = [];

  function pushUndo(prevValue: string): void {
    undoStack.push(prevValue);
    redoStack.length = 0; // any new edit clears redo
  }

  function triggerInputEvent(): void {
    const ev = new Event('input', { bubbles: true });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    inputEl!.dispatchEvent(ev);
  }

  // prevWordBoundary and nextWordBoundary imported from quick-search-utils

  // ===== DIRECT KEY INPUT HANDLING =====
  function handleKeyInput(e: KeyboardEvent): void {
    if (!inputEl) { return; }

    const key = e.key;
    const start = inputEl.selectionStart ?? 0;
    const end = inputEl.selectionEnd ?? 0;
    const val = inputEl.value;
    const len = val.length;

    // ── Modifier shortcuts (Ctrl/Cmd) ──────────────────────────────────────
    const isMod = e.ctrlKey || e.metaKey;
    if (isMod) {
      const lk = key.toLowerCase();

      // Ctrl+A => Select All
      if (lk === 'a') {
        inputEl.setSelectionRange(0, len);
        return;
      }

      // Ctrl+C => Copy selection (or HTML link if nothing selected)
      if (lk === 'c') {
        const sel = val.substring(start, end);
        if (sel.length > 0) {
          try { navigator.clipboard.writeText(sel); showToast('📋 Copied'); } catch { showToast('Copy failed', 'error'); }
        } else if (currentResults.length > 0) {
          copyHtmlLink(selectedIndex >= 0 ? selectedIndex : 0);
        }
        return;
      }

      // Ctrl+X => Cut selection
      if (lk === 'x') {
        const sel = val.substring(start, end);
        if (sel.length > 0) {
          try { navigator.clipboard.writeText(sel); } catch { /* ignore */ }
          pushUndo(val);
          inputEl.value = val.substring(0, start) + val.substring(end);
          inputEl.setSelectionRange(start, start);
          triggerInputEvent();
        }
        return;
      }

      // Ctrl+V => Paste
      if (lk === 'v') {
        navigator.clipboard.readText().then((text) => {
          if (!inputEl) {return;}
          const s = inputEl.selectionStart ?? 0;
          const ep = inputEl.selectionEnd ?? 0;
          pushUndo(inputEl.value);
          inputEl.value = inputEl.value.substring(0, s) + text + inputEl.value.substring(ep);
          inputEl.setSelectionRange(s + text.length, s + text.length);
          triggerInputEvent();
        }).catch(() => { showToast('Paste failed', 'error'); });
        return;
      }

      // Ctrl+M => Copy markdown link
      if (lk === 'm') {
        if (currentResults.length > 0) {
          copyMarkdownLink(selectedIndex >= 0 ? selectedIndex : 0);
        }
        return;
      }

      // Ctrl+Z => Undo
      if (lk === 'z' && !e.shiftKey) {
        if (undoStack.length > 0) {
          redoStack.push(val);
          inputEl.value = undoStack.pop()!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
          inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
          triggerInputEvent();
        }
        return;
      }

      // Ctrl+Shift+Z or Ctrl+Y => Redo
      if ((lk === 'z' && e.shiftKey) || lk === 'y') {
        if (redoStack.length > 0) {
          undoStack.push(val);
          inputEl.value = redoStack.pop()!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
          inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
          triggerInputEvent();
        }
        return;
      }

      // Ctrl+Backspace => delete word before cursor
      if (key === 'Backspace') {
        if (start === end) {
          const boundary = prevWordBoundary(val, start);
          if (boundary !== start) {
            pushUndo(val);
            inputEl.value = val.substring(0, boundary) + val.substring(start);
            inputEl.setSelectionRange(boundary, boundary);
            triggerInputEvent();
          }
        } else {
          pushUndo(val);
          inputEl.value = val.substring(0, start) + val.substring(end);
          inputEl.setSelectionRange(start, start);
          triggerInputEvent();
        }
        return;
      }

      // Ctrl+Delete => delete word after cursor
      if (key === 'Delete') {
        if (start === end) {
          const boundary = nextWordBoundary(val, end);
          if (boundary !== end) {
            pushUndo(val);
            inputEl.value = val.substring(0, start) + val.substring(boundary);
            inputEl.setSelectionRange(start, start);
            triggerInputEvent();
          }
        } else {
          pushUndo(val);
          inputEl.value = val.substring(0, start) + val.substring(end);
          inputEl.setSelectionRange(start, start);
          triggerInputEvent();
        }
        return;
      }

      // Ctrl+ArrowLeft => move/extend to previous word boundary
      if (key === 'ArrowLeft') {
        const boundary = prevWordBoundary(val, start);
        if (e.shiftKey) {
          inputEl.setSelectionRange(boundary, end);
        } else {
          inputEl.setSelectionRange(boundary, boundary);
        }
        return;
      }

      // Ctrl+ArrowRight => move/extend to next word boundary
      if (key === 'ArrowRight') {
        const boundary = nextWordBoundary(val, end);
        if (e.shiftKey) {
          inputEl.setSelectionRange(start, boundary);
        } else {
          inputEl.setSelectionRange(boundary, boundary);
        }
        return;
      }

      // Ctrl+Home / Ctrl+End
      if (key === 'Home') { inputEl.setSelectionRange(0, 0); return; }
      if (key === 'End') { inputEl.setSelectionRange(len, len); return; }

      // Any other Ctrl+key: ignore (don't insert char, don't fire search)
      return;
    }

    // ── Non-modifier special keys ──────────────────────────────────────────

    if (key === 'Backspace') {
      pushUndo(val);
      if (start === end && start > 0) {
        inputEl.value = val.substring(0, start - 1) + val.substring(end);
        inputEl.setSelectionRange(start - 1, start - 1);
      } else {
        inputEl.value = val.substring(0, start) + val.substring(end);
        inputEl.setSelectionRange(start, start);
      }
      triggerInputEvent();
      return;
    }

    if (key === 'Delete') {
      pushUndo(val);
      if (start === end) {
        inputEl.value = val.substring(0, start) + val.substring(end + 1);
      } else {
        inputEl.value = val.substring(0, start) + val.substring(end);
      }
      inputEl.setSelectionRange(start, start);
      triggerInputEvent();
      return;
    }

    if (key === 'ArrowLeft') {
      if (e.shiftKey) {
        inputEl.setSelectionRange(Math.max(0, start - 1), end);
      } else if (start !== end) {
        inputEl.setSelectionRange(start, start); // collapse to start of selection
      } else {
        inputEl.setSelectionRange(Math.max(0, start - 1), Math.max(0, start - 1));
      }
      return; // cursor move — no input event
    }

    if (key === 'ArrowRight') {
      if (e.shiftKey) {
        inputEl.setSelectionRange(start, Math.min(len, end + 1));
      } else if (start !== end) {
        inputEl.setSelectionRange(end, end); // collapse to end of selection
      } else {
        inputEl.setSelectionRange(Math.min(len, end + 1), Math.min(len, end + 1));
      }
      return; // cursor move — no input event
    }

    if (key === 'Home') {
      if (e.shiftKey) {
        inputEl.setSelectionRange(0, end);
      } else {
        inputEl.setSelectionRange(0, 0);
      }
      return;
    }

    if (key === 'End') {
      if (e.shiftKey) {
        inputEl.setSelectionRange(start, len);
      } else {
        inputEl.setSelectionRange(len, len);
      }
      return;
    }

    if (key === 'ArrowDown') {
      if (currentMode !== 'history') {
        handlePaletteArrow('down');
      } else if (currentResults.length > 0) {
        selectedIndex = (selectedIndex + 1) % currentResults.length;
        updateSelection();
      }
      return;
    }

    if (key === 'ArrowUp') {
      if (currentMode !== 'history') {
        handlePaletteArrow('up');
      } else if (currentResults.length > 0) {
        selectedIndex = (selectedIndex - 1 + currentResults.length) % currentResults.length;
        updateSelection();
      }
      return;
    }

    if (key === 'Enter') {
      if (currentMode !== 'history') {
        handlePaletteEnter(e.shiftKey);
        return;
      }
      if (currentResults.length > 0) {
        const idx = selectedIndex >= 0 ? selectedIndex : 0;
        openResult(idx, !e.shiftKey);
      }
      return;
    }

    // ── Regular character insertion ────────────────────────────────────────
    if (key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      pushUndo(val);
      inputEl.value = val.substring(0, start) + key + val.substring(end);
      inputEl.setSelectionRange(start + 1, start + 1);
      triggerInputEvent();
    }
    // Unrecognised key — do nothing (no input event, value unchanged)
  }

  // ===== MESSAGE LISTENER (for service worker commands) =====
  function handleMessage(
    message: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void // eslint-disable-line @typescript-eslint/no-explicit-any
  ): boolean {
    if (message?.type === 'OPEN_INLINE_SEARCH') {
      const t0 = performance.now();
      log.info('message', 'OPEN_INLINE_SEARCH received');
      showOverlay(); // showOverlay now handles all focus attempts
      perfLog('Overlay shown via message', t0);
      sendResponse({ success: true, time: performance.now() - t0 });
      return true; // Indicate async response
    }
    // Update log level when settings change
    if (message?.type === 'LOG_LEVEL_CHANGED' && typeof message?.logLevel === 'number') {
      currentLogLevel = message.logLevel;
      sendResponse({ success: true });
      return true;
    }
    // Update cached settings when background notifies of changes
    if (message?.type === 'SETTINGS_CHANGED' && message?.settings) {
      try {
        const changedKeys = Object.keys(message.settings) as (keyof AppSettings)[];
        cachedSettings = { ...(cachedSettings || {}), ...message.settings };
        searchDebounceMs = DEBOUNCE_MS;

        // Apply visual side effects for each changed key
        for (const key of changedKeys) {
          applySettingSideEffects(key);
        }

        // If toolbarToggles changed, re-render the whole chip bar (not just sync)
        if (changedKeys.includes('toolbarToggles' as keyof AppSettings)) {
          renderQSToggleBar();
        }

        // Reload recent history if relevant settings changed while input is empty
        const historyKeys: string[] = ['showRecentHistory', 'showRecentSearches', 'sortBy', 'defaultResultCount'];
        if (changedKeys.some(k => historyKeys.includes(k)) && !inputEl?.value?.trim()) {
          loadRecentHistory();
        }
      } catch {
        // ignore
      }
      sendResponse({ success: true });
      return true;
    }
    return false; // Not handled
  }

  // ===== CLEANUP =====
  function cleanup(): void {
    log.debug('cleanup', 'Cleaning up quick-search resources');
    
    // Disconnect search port
    if (searchPort) {
      try {
        searchPort.disconnect();
        searchPort = null;
      } catch {
        // Ignore - port may already be disconnected
      }
    }
    
    // Clear any pending timers
    if (debounceTimer) {clearTimeout(debounceTimer); debounceTimer = null;}
    if (aiDebounceTimer) {clearTimeout(aiDebounceTimer); aiDebounceTimer = null;}
    if (qsFocusTimer) {clearTimeout(qsFocusTimer); qsFocusTimer = null;}
    if (overlayFocusInterval) {clearInterval(overlayFocusInterval); overlayFocusInterval = null;}
    overlayFocusTimeouts.forEach(t => clearTimeout(t));
    overlayFocusTimeouts = [];
    if (hidePortCloseTimer) {clearTimeout(hidePortCloseTimer); hidePortCloseTimer = null;}
    clearSpinnerTimeout();
    
    // Remove shadow DOM
    if (shadowHost && shadowHost.parentNode) {
      shadowHost.parentNode.removeChild(shadowHost);
      shadowHost = null;
      shadowRoot = null;
      overlayEl = null;
      inputEl = null;
      resultsEl = null;
      settingsBtn = null;
    }
    
    // Remove event listeners
    try {
      document.removeEventListener('keydown', handleGlobalKeydown, true);
      document.removeEventListener('keydown', prewarmServiceWorker, true);
      if (visibilityChangeHandler) {
        document.removeEventListener('visibilitychange', visibilityChangeHandler);
        visibilityChangeHandler = null;
      }
      if (chrome?.runtime?.onMessage) {
        chrome.runtime.onMessage.removeListener(handleMessage);
      }
    } catch {
      // Ignore - listeners may already be removed
    }
    
    // Reset loaded flag so content script can re-initialize after extension update
    window.__SMRUTI_QUICK_SEARCH_LOADED__ = false;

    perfLog('Cleanup complete');
  }
  
  // ===== INITIALIZATION =====
  function init(): void {
    const t0 = performance.now();
    
    log.info('init', 'Quick-search initializing');
    
    // Fetch log level from settings first (async, non-blocking)
    fetchLogLevel();
    
    perfLog('Initializing quick-search');

    // Global keyboard listener (capture phase for highest priority)
    document.addEventListener('keydown', handleGlobalKeydown, true);
    
    // Pre-warm service worker on first keyboard activity
    document.addEventListener('keydown', prewarmServiceWorker, { once: true, passive: true, capture: true });
    
    // Pre-warm on visibility change (tab becomes active)
    visibilityChangeHandler = () => {
      if (document.visibilityState === 'visible') {
        prewarmServiceWorker();
        fetchLogLevel();
      }
    };
    document.addEventListener('visibilitychange', visibilityChangeHandler, { passive: true });

    // Message listener from service worker
    if (chrome?.runtime?.onMessage) {
      try {
        chrome.runtime.onMessage.addListener(handleMessage);
        log.debug('init', 'Message listener registered');
      } catch (err) {
        log.error('init', 'Failed to register message listener:', (err as Error).message);
      }
    } else {
      log.warn('init', 'chrome.runtime.onMessage not available');
    }
    
    // Cleanup on page unload/navigation
    window.addEventListener('beforeunload', cleanup, { once: true, passive: true });
    window.addEventListener('pagehide', cleanup, { once: true, passive: true });
    
    // Pre-create overlay earlier for faster first show
    // Use requestIdleCallback if available, otherwise setTimeout
    if ('requestIdleCallback' in window) {
      (window as Window & { requestIdleCallback: (callback: () => void, options?: { timeout: number }) => void }).requestIdleCallback(() => createOverlay(), { timeout: 500 });
    } else {
      setTimeout(createOverlay, 50);
    }

    perfLog('Initialization complete', t0);
  }

  // Run immediately
  init();
}

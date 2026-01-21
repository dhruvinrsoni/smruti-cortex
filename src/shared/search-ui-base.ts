/**
 * search-ui-base.ts
 * 
 * SOLID/DRY principle: Shared abstractions and utilities for both UI implementations.
 * This ensures consistency and prevents duplication between:
 * - Inline Overlay (quick-search.ts) - content script with Shadow DOM
 * - Extension Popup (popup.ts) - traditional extension popup
 * 
 * When updating search UI behavior, update it HERE to affect both implementations.
 */

/**
 * Interface for search result items (matches IndexedItem from database schema)
 */
export interface SearchResult {
  url: string;
  title: string;
  hostname?: string;
  metaDescription?: string;
  metaKeywords?: string[];
  visitCount: number;
  lastVisit: number;
  tokens?: string[];
}

/**
 * Shared keyboard action types
 */
export enum KeyboardAction {
  OPEN = 'open',
  OPEN_NEW_TAB = 'open_new_tab',
  OPEN_BACKGROUND_TAB = 'open_background_tab',
  COPY_MARKDOWN = 'copy_markdown',
  COPY_HTML = 'copy_html',
  NAVIGATE_UP = 'navigate_up',
  NAVIGATE_DOWN = 'navigate_down',
  TAB_FORWARD = 'tab_forward',
  TAB_BACKWARD = 'tab_backward',
  CLEAR = 'clear',
  CLOSE = 'close'
}

/**
 * Abstract interface that both UIs implement
 */
export interface ISearchUI {
  showUI(): void;
  hideUI(): void;
  isVisible(): boolean;
  focusInput(): void;
  setResults(results: SearchResult[]): void;
  getSelectedIndex(): number;
  setSelectedIndex(index: number): void;
}

/**
 * Focusable group configuration for cyclic tab navigation
 */
export interface FocusableGroup {
  name: string;
  /** Element to focus (null for special handling like results list) */
  element: HTMLElement | null;
  /** Custom focus handler (e.g., for results that need to select & focus a specific item) */
  onFocus?: () => void;
  /** Check if this group should be skipped (e.g., results when empty) */
  shouldSkip?: () => boolean;
}

/**
 * Cyclic tab navigation helper (generic, extensible, open/closed principle)
 * 
 * Usage:
 * 1. Define focusable groups in order
 * 2. Call this function on Tab/Shift+Tab
 * 3. Handles wrapping automatically (fully cyclic)
 * 4. Skips groups that return shouldSkip() === true
 * 
 * @param groups Array of focusable groups in tab order
 * @param getCurrentGroupIndex Function that returns current focused group index (-1 if unknown)
 * @param backward True for Shift+Tab (reverse direction)
 */
export function handleCyclicTabNavigation(
  groups: FocusableGroup[],
  getCurrentGroupIndex: () => number,
  backward: boolean = false
): void {
  if (groups.length === 0) return;

  // Filter out groups that should be skipped
  const activeGroups = groups.filter(g => !g.shouldSkip || !g.shouldSkip());
  if (activeGroups.length === 0) return;

  // Get current position
  let currentIndex = getCurrentGroupIndex();
  
  // If no group is focused, start from first (or last if backward)
  if (currentIndex === -1) {
    currentIndex = backward ? activeGroups.length - 1 : 0;
    const targetGroup = activeGroups[currentIndex];
    focusGroup(targetGroup);
    return;
  }

  // Find current group in active groups
  const currentGroupName = groups[currentIndex]?.name;
  const currentActiveIndex = activeGroups.findIndex(g => g.name === currentGroupName);
  
  if (currentActiveIndex === -1) {
    // Current group not in active list, go to first/last
    const targetIndex = backward ? activeGroups.length - 1 : 0;
    focusGroup(activeGroups[targetIndex]);
    return;
  }

  // Calculate next index with wrapping (fully cyclic)
  let nextIndex: number;
  if (backward) {
    nextIndex = currentActiveIndex === 0 ? activeGroups.length - 1 : currentActiveIndex - 1;
  } else {
    nextIndex = (currentActiveIndex + 1) % activeGroups.length;
  }

  // Focus next group
  focusGroup(activeGroups[nextIndex]);
}

function focusGroup(group: FocusableGroup): void {
  if (group.onFocus) {
    group.onFocus();
  } else if (group.element) {
    group.element.focus();
  }
}

/**
 * Shared utility: Truncate URL for display
 */
export function truncateUrl(url: string, maxLength: number = 60): string {
  try {
    const urlObj = new URL(url);
    let display = urlObj.hostname + urlObj.pathname;
    if (display.length > maxLength) {
      display = display.substring(0, maxLength - 3) + '...';
    }
    return display;
  } catch {
    return url.substring(0, maxLength);
  }
}

/**
 * Shared utility: Escape regex special characters
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Shared utility: Highlight matching text in a string
 * Returns array of text segments with highlight markers
 */
export interface TextSegment {
  text: string;
  isHighlight: boolean;
}

export function highlightText(text: string, tokens: string[]): TextSegment[] {
  if (!text || tokens.length === 0) {
    return [{ text, isHighlight: false }];
  }

  const validTokens = tokens.filter(t => t.length >= 2);
  if (validTokens.length === 0) {
    return [{ text, isHighlight: false }];
  }

  const pattern = validTokens.map(escapeRegex).join('|');
  const regex = new RegExp(`(${pattern})`, 'gi');

  const segments: TextSegment[] = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, match.index),
        isHighlight: false
      });
    }
    // Add highlighted match
    segments.push({
      text: match[1],
      isHighlight: true
    });
    lastIndex = regex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      isHighlight: false
    });
  }

  return segments;
}

/**
 * Shared utility: Append highlighted text to a DOM element using DOM APIs (CSP-safe)
 */
export function appendHighlightedTextToDOM(
  parent: HTMLElement,
  text: string,
  tokens: string[],
  highlightClassName: string = 'highlight'
): void {
  const segments = highlightText(text, tokens);
  
  segments.forEach(segment => {
    if (segment.isHighlight) {
      const span = document.createElement('span');
      span.className = highlightClassName;
      span.textContent = segment.text;
      parent.appendChild(span);
    } else {
      parent.appendChild(document.createTextNode(segment.text));
    }
  });
}

/**
 * Shared utility: Create markdown link from result
 */
export function createMarkdownLink(result: SearchResult): string {
  const title = result.title || result.url;
  return `[${title}](${result.url})`;
}

/**
 * Shared utility: Create HTML link from result (rich text format)
 * Returns an object with both HTML and plain text for clipboard
 */
export function createHtmlLink(result: SearchResult): { html: string; text: string } {
  const title = result.title || result.url;
  const html = `<a href="${result.url}">${title}</a>`;
  return { html, text: title };
}

/**
 * Shared utility: Open URL with modifiers
 */
export function openUrl(url: string, openInNewTab: boolean = false, openInBackground: boolean = false): void {
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    if (openInNewTab || openInBackground) {
      chrome.tabs.create({ url, active: !openInBackground });
    } else {
      chrome.tabs.update({ url });
    }
  } else {
    // Fallback for contexts without chrome.tabs
    if (openInNewTab) {
      window.open(url, '_blank');
    } else {
      window.location.href = url;
    }
  }
}

/**
 * Shared keyboard handler logic
 * Returns the action to take based on keyboard event
 */
export function parseKeyboardAction(e: KeyboardEvent): KeyboardAction | null {
  // Copy markdown: Ctrl/Cmd + M
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') {
    return KeyboardAction.COPY_MARKDOWN;
  }
  
  // Copy HTML (rich text): Ctrl/Cmd + C
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
    return KeyboardAction.COPY_HTML;
  }

  switch (e.key) {
    case 'Escape':
      return KeyboardAction.CLOSE;
    
    case 'ArrowDown':
      return KeyboardAction.NAVIGATE_DOWN;
    
    case 'ArrowUp':
      return KeyboardAction.NAVIGATE_UP;
    
    case 'ArrowRight':
      // ArrowRight opens in new tab (like popup)
      return KeyboardAction.OPEN_NEW_TAB;
    
    case 'Enter':
      if (e.shiftKey) {
        return KeyboardAction.OPEN_BACKGROUND_TAB;
      } else if (e.ctrlKey || e.metaKey) {
        return KeyboardAction.OPEN_NEW_TAB;
      } else {
        return KeyboardAction.OPEN;
      }
    
    case 'Tab':
      if (e.shiftKey) {
        return KeyboardAction.TAB_BACKWARD;
      } else {
        return KeyboardAction.TAB_FORWARD;
      }
    
    default:
      return null;
  }
}

/**
 * Shared result renderer using DocumentFragment for performance
 * Implementation-agnostic: returns a DocumentFragment that can be inserted into any container
 */
export interface RenderOptions {
  selectedIndex: number;
  emptyMessage: string;
  resultClassName: string;
  selectedClassName: string;
  titleClassName: string;
  urlClassName: string;
  highlightClassName: string;
  emptyClassName: string;
  onResultClick?: (index: number, result: SearchResult, ctrlOrMeta: boolean) => void;
}

export function renderResults(
  results: SearchResult[],
  tokens: string[],
  options: RenderOptions
): DocumentFragment {
  const fragment = document.createDocumentFragment();

  if (results.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = options.emptyClassName;
    emptyDiv.textContent = options.emptyMessage;
    fragment.appendChild(emptyDiv);
    return fragment;
  }

  results.forEach((result, index) => {
    const div = document.createElement('div');
    div.className = options.resultClassName;
    if (index === options.selectedIndex) {
      div.classList.add(options.selectedClassName);
    }
    div.dataset.index = String(index);
    div.dataset.url = result.url;

    // Title
    const titleDiv = document.createElement('div');
    titleDiv.className = options.titleClassName;
    appendHighlightedTextToDOM(titleDiv, result.title || result.url, tokens, options.highlightClassName);
    div.appendChild(titleDiv);

    // URL
    const urlDiv = document.createElement('div');
    urlDiv.className = options.urlClassName;
    appendHighlightedTextToDOM(urlDiv, truncateUrl(result.url), tokens, options.highlightClassName);
    div.appendChild(urlDiv);

    // Click handler
    if (options.onResultClick) {
      div.addEventListener('click', (e: MouseEvent) => {
        options.onResultClick!(index, result, e.ctrlKey || e.metaKey);
      });
    }

    fragment.appendChild(div);
  });

  return fragment;
}

/**
 * Shared utility: Copy HTML link to clipboard (rich text format)
 * Copies both HTML and plain text representations to clipboard
 */
export async function copyHtmlLinkToClipboard(result: SearchResult): Promise<void> {
  const { html, text } = createHtmlLink(result);
  
  try {
    // Modern Clipboard API with multiple formats
    const clipboardItem = new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([text], { type: 'text/plain' })
    });
    await navigator.clipboard.write([clipboardItem]);
  } catch (err) {
    // Fallback: copy just the plain text if rich text fails
    await navigator.clipboard.writeText(text);
    throw err; // Re-throw so caller knows rich text failed
  }
}

/**
 * Shared utility: Debounce function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: number | null = null;
  
  return function(this: any, ...args: Parameters<T>): void {
    const later = () => {
      timeout = null;
      func.apply(this, args);
    };
    
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = window.setTimeout(later, wait);
  };
}

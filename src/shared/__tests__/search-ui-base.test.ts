/**
 * Unit tests for search-ui-base.ts shared utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  truncateUrl,
  escapeRegex,
  highlightText,
  createMarkdownLink,
  createHtmlLink,
  parseKeyboardAction,
  KeyboardAction,
  sortResults,
  handleCyclicTabNavigation,
  appendHighlightedTextToDOM,
  openUrl,
  debounce,
  escapeHtml,
  tokenizeQuery,
  highlightHtml,
  renderResults,
  renderAIStatus,
  copyHtmlLinkToClipboard,
  type SearchResult,
  type FocusableGroup,
  type AIStatus,
} from '../search-ui-base';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    url: 'https://example.com',
    title: 'Example',
    visitCount: 1,
    lastVisit: Date.now(),
    ...overrides,
  };
}

const createKeyboardEvent = (key: string, modifiers: Partial<KeyboardEvent> = {}): KeyboardEvent => {
  return { key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...modifiers } as KeyboardEvent;
};

// ---------------------------------------------------------------------------
// truncateUrl
// ---------------------------------------------------------------------------
describe('truncateUrl', () => {
  it('should return host + path for valid URLs', () => {
    expect(truncateUrl('https://github.com/user/repo')).toBe('github.com/user/repo');
  });

  it('should preserve non-default port in display', () => {
    expect(truncateUrl('http://localhost:3000/api/data')).toBe('localhost:3000/api/data');
    expect(truncateUrl('https://dev.local:8443/dashboard')).toBe('dev.local:8443/dashboard');
  });

  it('should not show port for standard ports (443, 80)', () => {
    expect(truncateUrl('https://example.com/path')).toBe('example.com/path');
    expect(truncateUrl('http://example.com/path')).toBe('example.com/path');
  });

  it('should truncate long URLs with ellipsis', () => {
    const longPath = '/very/long/path/that/exceeds/sixty/characters/and/needs/truncation';
    const result = truncateUrl(`https://example.com${longPath}`, 30);
    expect(result.length).toBeLessThanOrEqual(30);
    expect(result).toContain('...');
  });

  it('should handle URLs without path', () => {
    expect(truncateUrl('https://github.com')).toBe('github.com/');
  });

  it('should handle invalid URLs gracefully', () => {
    expect(truncateUrl('not-a-url', 20)).toBe('not-a-url');
  });

  it('should respect custom maxLength', () => {
    expect(truncateUrl('https://example.com/path', 15).length).toBeLessThanOrEqual(15);
  });
});

// ---------------------------------------------------------------------------
// escapeRegex
// ---------------------------------------------------------------------------
describe('escapeRegex', () => {
  it('should escape special regex characters', () => {
    expect(escapeRegex('test.com')).toBe('test\\.com');
    expect(escapeRegex('a*b+c?')).toBe('a\\*b\\+c\\?');
    expect(escapeRegex('[test]')).toBe('\\[test\\]');
    expect(escapeRegex('(group)')).toBe('\\(group\\)');
    expect(escapeRegex('a|b')).toBe('a\\|b');
    expect(escapeRegex('a^b$c')).toBe('a\\^b\\$c');
    expect(escapeRegex('path\\file')).toBe('path\\\\file');
  });

  it('should not modify strings without special characters', () => {
    expect(escapeRegex('hello world')).toBe('hello world');
    expect(escapeRegex('simple123')).toBe('simple123');
  });
});

// ---------------------------------------------------------------------------
// highlightText
// ---------------------------------------------------------------------------
describe('highlightText', () => {
  it('should return unhighlighted text when no tokens provided', () => {
    expect(highlightText('hello world', [])).toEqual([
      { text: 'hello world', isHighlight: false, isHighlightAI: false },
    ]);
  });

  it('should highlight matching tokens', () => {
    expect(highlightText('hello world', ['hello'])).toEqual([
      { text: 'hello', isHighlight: true, isHighlightAI: false },
      { text: ' world', isHighlight: false, isHighlightAI: false },
    ]);
  });

  it('should highlight multiple occurrences', () => {
    expect(highlightText('test test test', ['test']).filter(s => s.isHighlight)).toHaveLength(3);
  });

  it('should be case-insensitive', () => {
    expect(highlightText('Hello HELLO hello', ['hello']).filter(s => s.isHighlight)).toHaveLength(3);
  });

  it('should ignore tokens shorter than 2 characters', () => {
    expect(highlightText('a b c', ['a', 'b', 'c'])).toEqual([
      { text: 'a b c', isHighlight: false, isHighlightAI: false },
    ]);
  });

  it('should handle multiple different tokens', () => {
    expect(highlightText('hello world', ['hello', 'world'])).toEqual([
      { text: 'hello', isHighlight: true, isHighlightAI: false },
      { text: ' ', isHighlight: false, isHighlightAI: false },
      { text: 'world', isHighlight: true, isHighlightAI: false },
    ]);
  });

  it('should handle empty text', () => {
    expect(highlightText('', ['test'])).toEqual([
      { text: '', isHighlight: false, isHighlightAI: false },
    ]);
  });

  it('should mark AI-only tokens with isHighlightAI', () => {
    const result = highlightText('hello world', ['hello'], ['world']);
    expect(result).toEqual([
      { text: 'hello', isHighlight: true, isHighlightAI: false },
      { text: ' ', isHighlight: false, isHighlightAI: false },
      { text: 'world', isHighlight: false, isHighlightAI: true },
    ]);
  });

  it('should not double-highlight tokens that are both original and AI', () => {
    const result = highlightText('hello', ['hello'], ['hello']);
    expect(result).toEqual([
      { text: 'hello', isHighlight: true, isHighlightAI: false },
    ]);
  });
});

// ---------------------------------------------------------------------------
// sortResults
// ---------------------------------------------------------------------------
describe('sortResults', () => {
  const now = Date.now();
  const results: SearchResult[] = [
    makeResult({ title: 'Banana', visitCount: 5, lastVisit: now - 1000 }),
    makeResult({ title: 'Apple', visitCount: 10, lastVisit: now }),
    makeResult({ title: 'Cherry', visitCount: 1, lastVisit: now - 5000 }),
  ];

  it('should sort by most recent (lastVisit descending)', () => {
    const sorted = sortResults([...results], 'most-recent');
    expect(sorted.map(r => r.title)).toEqual(['Apple', 'Banana', 'Cherry']);
  });

  it('should sort by most visited (visitCount descending)', () => {
    const sorted = sortResults([...results], 'most-visited');
    expect(sorted.map(r => r.title)).toEqual(['Apple', 'Banana', 'Cherry']);
  });

  it('should sort alphabetically by title', () => {
    const sorted = sortResults([...results], 'alphabetical');
    expect(sorted.map(r => r.title)).toEqual(['Apple', 'Banana', 'Cherry']);
  });

  it('should preserve order for best-match (default)', () => {
    const copy = [...results];
    const sorted = sortResults(copy, 'best-match');
    expect(sorted.map(r => r.title)).toEqual(['Banana', 'Apple', 'Cherry']);
  });

  it('should return the same array reference (in-place sort)', () => {
    const copy = [...results];
    const sorted = sortResults(copy, 'most-recent');
    expect(sorted).toBe(copy);
  });

  it('should handle unknown sort option as best-match', () => {
    const copy = [...results];
    sortResults(copy, 'unknown-sort');
    expect(copy.map(r => r.title)).toEqual(['Banana', 'Apple', 'Cherry']);
  });
});

// ---------------------------------------------------------------------------
// createMarkdownLink
// ---------------------------------------------------------------------------
describe('createMarkdownLink', () => {
  it('should create markdown link with title', () => {
    expect(createMarkdownLink(makeResult({ title: 'GitHub', url: 'https://github.com' }))).toBe('[GitHub](https://github.com)');
  });

  it('should use URL as title when title is missing', () => {
    expect(createMarkdownLink(makeResult({ title: '', url: 'https://github.com' }))).toBe('[https://github.com](https://github.com)');
  });
});

// ---------------------------------------------------------------------------
// createHtmlLink
// ---------------------------------------------------------------------------
describe('createHtmlLink', () => {
  it('should create HTML anchor tag', () => {
    const { html, text } = createHtmlLink(makeResult({ title: 'GitHub', url: 'https://github.com' }));
    expect(html).toBe('<a href="https://github.com">GitHub</a>');
    expect(text).toBe('GitHub');
  });

  it('should use URL as title when title is missing', () => {
    const { html, text } = createHtmlLink(makeResult({ title: '', url: 'https://github.com' }));
    expect(html).toBe('<a href="https://github.com">https://github.com</a>');
    expect(text).toBe('https://github.com');
  });
});

// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------
describe('escapeHtml', () => {
  it('should escape &, <, >, "', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;');
  });

  it('should handle string with all special chars', () => {
    expect(escapeHtml('<a href="x">&')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;');
  });

  it('should pass through safe strings unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});

// ---------------------------------------------------------------------------
// tokenizeQuery
// ---------------------------------------------------------------------------
describe('tokenizeQuery', () => {
  it('should lowercase and split on whitespace', () => {
    expect(tokenizeQuery('Hello World')).toEqual(['hello', 'world']);
  });

  it('should filter empty tokens', () => {
    expect(tokenizeQuery('  hello   world  ')).toEqual(['hello', 'world']);
  });

  it('should return empty array for empty string', () => {
    expect(tokenizeQuery('')).toEqual([]);
    expect(tokenizeQuery('   ')).toEqual([]);
  });

  it('should handle single token', () => {
    expect(tokenizeQuery('test')).toEqual(['test']);
  });
});

// ---------------------------------------------------------------------------
// highlightHtml
// ---------------------------------------------------------------------------
describe('highlightHtml', () => {
  const normalWrap = (m: string) => `<mark>${m}</mark>`;
  const aiWrap = (m: string) => `<mark class="ai">${m}</mark>`;

  it('should return empty string for empty text', () => {
    expect(highlightHtml('', ['test'], [], normalWrap, aiWrap)).toBe('');
  });

  it('should return escaped text when no tokens match', () => {
    expect(highlightHtml('hello <world>', [], [], normalWrap, aiWrap)).toBe('hello &lt;world&gt;');
  });

  it('should wrap matched tokens with normalWrap', () => {
    expect(highlightHtml('hello world', ['hello'], [], normalWrap, aiWrap)).toBe('<mark>hello</mark> world');
  });

  it('should wrap AI-only tokens with aiWrap', () => {
    expect(highlightHtml('hello world', ['hello'], ['world'], normalWrap, aiWrap)).toBe(
      '<mark>hello</mark> <mark class="ai">world</mark>'
    );
  });

  it('should ignore tokens shorter than 2 characters', () => {
    expect(highlightHtml('a b c', ['a'], [], normalWrap, aiWrap)).toBe('a b c');
  });

  it('should escape HTML in text before highlighting', () => {
    expect(highlightHtml('<b>test</b>', ['test'], [], normalWrap, aiWrap)).toContain('&lt;b&gt;');
    expect(highlightHtml('<b>test</b>', ['test'], [], normalWrap, aiWrap)).toContain('<mark>test</mark>');
  });
});

// ---------------------------------------------------------------------------
// parseKeyboardAction
// ---------------------------------------------------------------------------
describe('parseKeyboardAction', () => {
  it('should return CLOSE for Escape', () => {
    expect(parseKeyboardAction(createKeyboardEvent('Escape'))).toBe(KeyboardAction.CLOSE);
  });

  it('should return NAVIGATE_DOWN for ArrowDown', () => {
    expect(parseKeyboardAction(createKeyboardEvent('ArrowDown'))).toBe(KeyboardAction.NAVIGATE_DOWN);
  });

  it('should return NAVIGATE_UP for ArrowUp', () => {
    expect(parseKeyboardAction(createKeyboardEvent('ArrowUp'))).toBe(KeyboardAction.NAVIGATE_UP);
  });

  it('should return OPEN_NEW_TAB for ArrowRight', () => {
    expect(parseKeyboardAction(createKeyboardEvent('ArrowRight'))).toBe(KeyboardAction.OPEN_NEW_TAB);
  });

  it('should return OPEN for plain Enter', () => {
    expect(parseKeyboardAction(createKeyboardEvent('Enter'))).toBe(KeyboardAction.OPEN);
  });

  it('should return OPEN_NEW_TAB for Ctrl+Enter', () => {
    expect(parseKeyboardAction(createKeyboardEvent('Enter', { ctrlKey: true }))).toBe(KeyboardAction.OPEN_NEW_TAB);
  });

  it('should return OPEN_NEW_TAB for Cmd+Enter (Mac)', () => {
    expect(parseKeyboardAction(createKeyboardEvent('Enter', { metaKey: true }))).toBe(KeyboardAction.OPEN_NEW_TAB);
  });

  it('should return OPEN_BACKGROUND_TAB for Shift+Enter', () => {
    expect(parseKeyboardAction(createKeyboardEvent('Enter', { shiftKey: true }))).toBe(KeyboardAction.OPEN_BACKGROUND_TAB);
  });

  it('should return COPY_MARKDOWN for Ctrl+M', () => {
    expect(parseKeyboardAction(createKeyboardEvent('m', { ctrlKey: true }))).toBe(KeyboardAction.COPY_MARKDOWN);
  });

  it('should return COPY_MARKDOWN for Cmd+M (Mac)', () => {
    expect(parseKeyboardAction(createKeyboardEvent('m', { metaKey: true }))).toBe(KeyboardAction.COPY_MARKDOWN);
  });

  it('should return COPY_HTML for Ctrl+C', () => {
    expect(parseKeyboardAction(createKeyboardEvent('c', { ctrlKey: true }))).toBe(KeyboardAction.COPY_HTML);
  });

  it('should return null for unrecognized keys', () => {
    expect(parseKeyboardAction(createKeyboardEvent('a'))).toBeNull();
  });

  it('should return TAB_FORWARD for Tab', () => {
    expect(parseKeyboardAction(createKeyboardEvent('Tab'))).toBe(KeyboardAction.TAB_FORWARD);
  });

  it('should return TAB_BACKWARD for Shift+Tab', () => {
    expect(parseKeyboardAction(createKeyboardEvent('Tab', { shiftKey: true }))).toBe(KeyboardAction.TAB_BACKWARD);
  });
});

// ---------------------------------------------------------------------------
// handleCyclicTabNavigation
// ---------------------------------------------------------------------------
describe('handleCyclicTabNavigation', () => {
  it('should do nothing with empty groups', () => {
    handleCyclicTabNavigation([], () => -1, false);
    // No error thrown = pass
  });

  it('should focus first group when current index is -1 (forward)', () => {
    const focusFn = vi.fn();
    const groups: FocusableGroup[] = [
      { name: 'a', element: null, onFocus: focusFn },
      { name: 'b', element: null },
    ];
    handleCyclicTabNavigation(groups, () => -1, false);
    expect(focusFn).toHaveBeenCalledOnce();
  });

  it('should focus last group when current index is -1 (backward)', () => {
    const focusA = vi.fn();
    const focusB = vi.fn();
    const groups: FocusableGroup[] = [
      { name: 'a', element: null, onFocus: focusA },
      { name: 'b', element: null, onFocus: focusB },
    ];
    handleCyclicTabNavigation(groups, () => -1, true);
    expect(focusB).toHaveBeenCalledOnce();
    expect(focusA).not.toHaveBeenCalled();
  });

  it('should wrap forward from last to first', () => {
    const focusA = vi.fn();
    const groups: FocusableGroup[] = [
      { name: 'a', element: null, onFocus: focusA },
      { name: 'b', element: null },
    ];
    handleCyclicTabNavigation(groups, () => 1, false);
    expect(focusA).toHaveBeenCalledOnce();
  });

  it('should wrap backward from first to last', () => {
    const focusB = vi.fn();
    const groups: FocusableGroup[] = [
      { name: 'a', element: null },
      { name: 'b', element: null, onFocus: focusB },
    ];
    handleCyclicTabNavigation(groups, () => 0, true);
    expect(focusB).toHaveBeenCalledOnce();
  });

  it('should skip groups where shouldSkip returns true', () => {
    const focusC = vi.fn();
    const groups: FocusableGroup[] = [
      { name: 'a', element: null },
      { name: 'b', element: null, shouldSkip: () => true },
      { name: 'c', element: null, onFocus: focusC },
    ];
    handleCyclicTabNavigation(groups, () => 0, false);
    expect(focusC).toHaveBeenCalledOnce();
  });

  it('should do nothing if all groups are skipped', () => {
    const groups: FocusableGroup[] = [
      { name: 'a', element: null, shouldSkip: () => true },
    ];
    handleCyclicTabNavigation(groups, () => -1, false);
    // No error thrown = pass
  });

  it('should focus element.focus() when no onFocus handler', () => {
    const el = document.createElement('button');
    const focusSpy = vi.spyOn(el, 'focus');
    const groups: FocusableGroup[] = [
      { name: 'a', element: null },
      { name: 'b', element: el },
    ];
    handleCyclicTabNavigation(groups, () => 0, false);
    expect(focusSpy).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// appendHighlightedTextToDOM
// ---------------------------------------------------------------------------
describe('appendHighlightedTextToDOM', () => {
  it('should append plain text node when no tokens match', () => {
    const parent = document.createElement('div');
    appendHighlightedTextToDOM(parent, 'hello world', []);
    expect(parent.textContent).toBe('hello world');
    expect(parent.children.length).toBe(0); // text nodes, not elements
  });

  it('should append highlighted spans for matching tokens', () => {
    const parent = document.createElement('div');
    appendHighlightedTextToDOM(parent, 'hello world', ['hello']);
    const span = parent.querySelector('span.highlight');
    expect(span).not.toBeNull();
    expect(span!.textContent).toBe('hello');
  });

  it('should use custom highlight class names', () => {
    const parent = document.createElement('div');
    appendHighlightedTextToDOM(parent, 'hello world', ['hello'], 'my-hl');
    expect(parent.querySelector('span.my-hl')).not.toBeNull();
  });

  it('should append AI-highlighted spans with AI class', () => {
    const parent = document.createElement('div');
    appendHighlightedTextToDOM(parent, 'hello world', ['hello'], 'highlight', ['world'], 'highlight-ai');
    expect(parent.querySelector('span.highlight')!.textContent).toBe('hello');
    expect(parent.querySelector('span.highlight-ai')!.textContent).toBe('world');
  });

  it('should preserve full text content', () => {
    const parent = document.createElement('div');
    appendHighlightedTextToDOM(parent, 'the quick brown fox', ['quick', 'fox']);
    expect(parent.textContent).toBe('the quick brown fox');
  });
});

// ---------------------------------------------------------------------------
// openUrl
// ---------------------------------------------------------------------------
describe('openUrl', () => {
  let originalChrome: unknown;

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    originalChrome = (globalThis as any).chrome;
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).chrome = originalChrome;
  });

  it('should call chrome.tabs.update for same-tab open', () => {
    const update = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).chrome = { tabs: { update, create: vi.fn() } };
    openUrl('https://example.com');
    expect(update).toHaveBeenCalledWith({ url: 'https://example.com' });
  });

  it('should call chrome.tabs.create for new tab', () => {
    const create = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).chrome = { tabs: { update: vi.fn(), create } };
    openUrl('https://example.com', true);
    expect(create).toHaveBeenCalledWith({ url: 'https://example.com', active: true });
  });

  it('should call chrome.tabs.create with active=false for background tab', () => {
    const create = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).chrome = { tabs: { update: vi.fn(), create } };
    openUrl('https://example.com', true, true);
    expect(create).toHaveBeenCalledWith({ url: 'https://example.com', active: false });
  });

  it('should fall back to window.open when chrome.tabs unavailable', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).chrome = undefined;
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);
    openUrl('https://example.com', true);
    expect(openSpy).toHaveBeenCalledWith('https://example.com', '_blank');
    vi.unstubAllGlobals();
  });
});

// ---------------------------------------------------------------------------
// debounce
// ---------------------------------------------------------------------------
describe('debounce', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('should delay function execution', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);
    debounced();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('should reset timer on subsequent calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);
    debounced();
    vi.advanceTimersByTime(100);
    debounced(); // reset
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('should pass arguments to the original function', () => {
    const fn = vi.fn();
    const debounced = debounce(fn as (...args: unknown[]) => unknown, 100);
    debounced('a', 'b');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith('a', 'b');
  });

  it('should use the last call arguments', () => {
    const fn = vi.fn();
    const debounced = debounce(fn as (...args: unknown[]) => unknown, 100);
    debounced('first');
    debounced('second');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith('second');
    expect(fn).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// renderResults
// ---------------------------------------------------------------------------
describe('renderResults', () => {
  const baseOptions = {
    selectedIndex: 0,
    emptyMessage: 'No results found',
    resultClassName: 'result',
    selectedClassName: 'selected',
    titleClassName: 'title',
    urlClassName: 'url',
    highlightClassName: 'highlight',
    emptyClassName: 'empty',
  };

  it('should render empty message when no results', () => {
    const fragment = renderResults([], [], baseOptions);
    const container = document.createElement('div');
    container.appendChild(fragment);
    expect(container.querySelector('.empty')!.textContent).toBe('No results found');
  });

  it('should render result items with title and url', () => {
    const results = [makeResult({ title: 'Test', url: 'https://test.com' })];
    const fragment = renderResults(results, [], baseOptions);
    const container = document.createElement('div');
    container.appendChild(fragment);
    expect(container.querySelector('.title')!.textContent).toBe('Test');
    expect(container.querySelector('.url')!.textContent).toContain('test.com');
  });

  it('should apply selected class to the selected index', () => {
    const results = [makeResult({ title: 'A' }), makeResult({ title: 'B' })];
    const fragment = renderResults(results, [], { ...baseOptions, selectedIndex: 1 });
    const container = document.createElement('div');
    container.appendChild(fragment);
    const items = container.querySelectorAll('.result');
    expect(items[0].classList.contains('selected')).toBe(false);
    expect(items[1].classList.contains('selected')).toBe(true);
  });

  it('should set data-index and data-url attributes', () => {
    const results = [makeResult({ url: 'https://test.com' })];
    const fragment = renderResults(results, [], baseOptions);
    const container = document.createElement('div');
    container.appendChild(fragment);
    const item = container.querySelector('.result') as HTMLElement;
    expect(item.dataset.index).toBe('0');
    expect(item.dataset.url).toBe('https://test.com');
  });

  it('should show bookmark indicator for bookmarked results', () => {
    const results = [makeResult({ isBookmark: true })];
    const fragment = renderResults(results, [], baseOptions);
    const container = document.createElement('div');
    container.appendChild(fragment);
    expect(container.querySelector('.bookmark-indicator')!.textContent).toBe('★');
  });

  it('should show bookmark folder path when available', () => {
    const results = [makeResult({ isBookmark: true, bookmarkFolders: ['Dev', 'Tools'] })];
    const fragment = renderResults(results, [], baseOptions);
    const container = document.createElement('div');
    container.appendChild(fragment);
    const folder = container.querySelector('.bookmark-folder');
    expect(folder!.textContent).toContain('Dev');
    expect(folder!.textContent).toContain('Tools');
  });

  it('should call onResultClick handler', () => {
    const onClick = vi.fn();
    const results = [makeResult()];
    const fragment = renderResults(results, [], { ...baseOptions, onResultClick: onClick });
    const container = document.createElement('div');
    container.appendChild(fragment);
    const item = container.querySelector('.result') as HTMLElement;
    item.click();
    expect(onClick).toHaveBeenCalledWith(0, results[0], false);
  });

  it('should highlight tokens in title and URL', () => {
    const results = [makeResult({ title: 'Hello World', url: 'https://hello.com' })];
    const fragment = renderResults(results, ['hello'], baseOptions);
    const container = document.createElement('div');
    container.appendChild(fragment);
    expect(container.querySelectorAll('.highlight').length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// renderAIStatus
// ---------------------------------------------------------------------------
describe('renderAIStatus', () => {
  it('should do nothing when container is null', () => {
    renderAIStatus(null, { aiKeywords: 'expanded', expandedCount: 3 });
    // No error thrown = pass
  });

  it('should clear container and remove visible class when aiStatus is null', () => {
    const container = document.createElement('div');
    container.textContent = 'old';
    container.classList.add('visible');
    renderAIStatus(container, null);
    expect(container.textContent).toBe('');
    expect(container.classList.contains('visible')).toBe(false);
  });

  it('should always render LEXICAL badge', () => {
    const container = document.createElement('div');
    renderAIStatus(container, {});
    expect(container.querySelector('.ai-lexical')!.textContent).toContain('LEXICAL');
    expect(container.classList.contains('visible')).toBe(true);
  });

  it('should render NEURAL badge for expanded AI keywords', () => {
    const container = document.createElement('div');
    renderAIStatus(container, { aiKeywords: 'expanded', expandedCount: 5 });
    const badges = container.querySelectorAll('.ai-badge');
    const neuralBadge = Array.from(badges).find(b => b.textContent!.includes('NEURAL'));
    expect(neuralBadge).toBeDefined();
    expect(neuralBadge!.textContent).toContain('+5');
    expect(neuralBadge!.classList.contains('ai-active')).toBe(true);
  });

  it('should render ENGRAM badge for cache-hit', () => {
    const container = document.createElement('div');
    renderAIStatus(container, { aiKeywords: 'cache-hit', expandedCount: 2 });
    const badges = container.querySelectorAll('.ai-badge');
    const engramBadge = Array.from(badges).find(b => b.textContent!.includes('ENGRAM'));
    expect(engramBadge).toBeDefined();
    expect(engramBadge!.classList.contains('ai-cache')).toBe(true);
  });

  it('should render ENGRAM badge for prefix-hit', () => {
    const container = document.createElement('div');
    renderAIStatus(container, { aiKeywords: 'prefix-hit', expandedCount: 1 });
    const badge = Array.from(container.querySelectorAll('.ai-badge')).find(b => b.textContent!.includes('ENGRAM'));
    expect(badge).toBeDefined();
  });

  it('should render OLLAMA error badge', () => {
    const container = document.createElement('div');
    renderAIStatus(container, { aiKeywords: 'error' });
    const badge = Array.from(container.querySelectorAll('.ai-badge')).find(b => b.textContent!.includes('OLLAMA'));
    expect(badge).toBeDefined();
    expect(badge!.classList.contains('ai-error')).toBe(true);
  });

  it('should render AI Active badge for no-new-keywords', () => {
    const container = document.createElement('div');
    renderAIStatus(container, { aiKeywords: 'no-new-keywords' });
    const badge = Array.from(container.querySelectorAll('.ai-badge')).find(b => b.textContent!.includes('AI Active'));
    expect(badge).toBeDefined();
    expect(badge!.classList.contains('ai-active')).toBe(true);
  });

  it('should render semantic active badge', () => {
    const container = document.createElement('div');
    renderAIStatus(container, { semantic: 'active', embeddingsGenerated: 10 });
    const badge = Array.from(container.querySelectorAll('.ai-badge')).find(b => b.textContent!.includes('Semantic'));
    expect(badge).toBeDefined();
    expect(badge!.textContent).toContain('+10 cached');
  });

  it('should render semantic error badge', () => {
    const container = document.createElement('div');
    renderAIStatus(container, { semantic: 'error' });
    const badge = Array.from(container.querySelectorAll('.ai-badge')).find(b => b.textContent!.includes('Semantic error'));
    expect(badge).toBeDefined();
  });

  it('should render circuit breaker badge', () => {
    const container = document.createElement('div');
    renderAIStatus(container, { semantic: 'circuit-breaker' });
    const badge = Array.from(container.querySelectorAll('.ai-badge')).find(b => b.textContent!.includes('Circuit breaker'));
    expect(badge).toBeDefined();
  });

  it('should render search time when provided', () => {
    const container = document.createElement('div');
    renderAIStatus(container, { searchTimeMs: 42 });
    expect(container.querySelector('.ai-time')!.textContent).toBe('42ms');
  });

  it('should not render AI keywords badge when disabled', () => {
    const container = document.createElement('div');
    renderAIStatus(container, { aiKeywords: 'disabled' });
    const badges = container.querySelectorAll('.ai-badge');
    // Only LEXICAL badge (the always-present one)
    expect(badges.length).toBe(1);
    expect(badges[0].textContent).toContain('LEXICAL');
  });

  it('should render semantic active without embeddings count', () => {
    const container = document.createElement('div');
    renderAIStatus(container, { semantic: 'active' });
    const badge = Array.from(container.querySelectorAll('.ai-badge')).find(b => b.textContent!.includes('Semantic'));
    expect(badge!.textContent).toContain('Semantic active');
  });
});

// ---------------------------------------------------------------------------
// copyHtmlLinkToClipboard
// ---------------------------------------------------------------------------
describe('copyHtmlLinkToClipboard', () => {
  it('should use ClipboardItem API when available', async () => {
    const writeFn = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { write: writeFn, writeText: vi.fn() } });
    vi.stubGlobal('ClipboardItem', class {
      constructor(public items: Record<string, Blob>) {}
    });

    await copyHtmlLinkToClipboard(makeResult({ title: 'Test', url: 'https://test.com' }));
    expect(writeFn).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('should fall back to writeText on error and re-throw', async () => {
    const writeTextFn = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        write: vi.fn().mockRejectedValue(new Error('not supported')),
        writeText: writeTextFn,
      },
    });
    vi.stubGlobal('ClipboardItem', class {
      constructor(public items: Record<string, Blob>) {}
    });

    await expect(copyHtmlLinkToClipboard(makeResult({ title: 'Test', url: 'https://test.com' }))).rejects.toThrow('not supported');
    expect(writeTextFn).toHaveBeenCalledWith('Test');
    vi.unstubAllGlobals();
  });
});

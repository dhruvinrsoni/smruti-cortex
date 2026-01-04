/**
 * Unit tests for search-ui-base.ts shared utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  truncateUrl,
  escapeRegex,
  highlightText,
  createMarkdownLink,
  parseKeyboardAction,
  KeyboardAction,
  type SearchResult,
} from '../search-ui-base';

describe('truncateUrl', () => {
  it('should return hostname + path for valid URLs', () => {
    const result = truncateUrl('https://github.com/user/repo');
    expect(result).toBe('github.com/user/repo');
  });

  it('should truncate long URLs with ellipsis', () => {
    const longPath = '/very/long/path/that/exceeds/sixty/characters/and/needs/truncation';
    const result = truncateUrl(`https://example.com${longPath}`, 30);
    expect(result.length).toBeLessThanOrEqual(30);
    expect(result).toContain('...');
  });

  it('should handle URLs without path', () => {
    const result = truncateUrl('https://github.com');
    expect(result).toBe('github.com/');
  });

  it('should handle invalid URLs gracefully', () => {
    const result = truncateUrl('not-a-url', 20);
    expect(result).toBe('not-a-url');
  });

  it('should respect custom maxLength', () => {
    const result = truncateUrl('https://example.com/path', 15);
    expect(result.length).toBeLessThanOrEqual(15);
  });
});

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

describe('highlightText', () => {
  it('should return unhighlighted text when no tokens provided', () => {
    const result = highlightText('hello world', []);
    expect(result).toEqual([{ text: 'hello world', isHighlight: false }]);
  });

  it('should highlight matching tokens', () => {
    const result = highlightText('hello world', ['hello']);
    expect(result).toEqual([
      { text: 'hello', isHighlight: true },
      { text: ' world', isHighlight: false },
    ]);
  });

  it('should highlight multiple occurrences', () => {
    const result = highlightText('test test test', ['test']);
    expect(result.filter(s => s.isHighlight)).toHaveLength(3);
  });

  it('should be case-insensitive', () => {
    const result = highlightText('Hello HELLO hello', ['hello']);
    expect(result.filter(s => s.isHighlight)).toHaveLength(3);
  });

  it('should ignore tokens shorter than 2 characters', () => {
    const result = highlightText('a b c', ['a', 'b', 'c']);
    expect(result).toEqual([{ text: 'a b c', isHighlight: false }]);
  });

  it('should handle multiple different tokens', () => {
    const result = highlightText('hello world', ['hello', 'world']);
    expect(result).toEqual([
      { text: 'hello', isHighlight: true },
      { text: ' ', isHighlight: false },
      { text: 'world', isHighlight: true },
    ]);
  });

  it('should handle empty text', () => {
    const result = highlightText('', ['test']);
    expect(result).toEqual([{ text: '', isHighlight: false }]);
  });
});

describe('createMarkdownLink', () => {
  it('should create markdown link with title', () => {
    const result: SearchResult = {
      url: 'https://github.com',
      title: 'GitHub',
      visitCount: 1,
      lastVisit: Date.now(),
    };
    expect(createMarkdownLink(result)).toBe('[GitHub](https://github.com)');
  });

  it('should use URL as title when title is missing', () => {
    const result: SearchResult = {
      url: 'https://github.com',
      title: '',
      visitCount: 1,
      lastVisit: Date.now(),
    };
    expect(createMarkdownLink(result)).toBe('[https://github.com](https://github.com)');
  });
});

describe('parseKeyboardAction', () => {
  const createKeyboardEvent = (key: string, modifiers: Partial<KeyboardEvent> = {}): KeyboardEvent => {
    return {
      key,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      ...modifiers,
    } as KeyboardEvent;
  };

  it('should return CLOSE for Escape', () => {
    const event = createKeyboardEvent('Escape');
    expect(parseKeyboardAction(event)).toBe(KeyboardAction.CLOSE);
  });

  it('should return NAVIGATE_DOWN for ArrowDown', () => {
    const event = createKeyboardEvent('ArrowDown');
    expect(parseKeyboardAction(event)).toBe(KeyboardAction.NAVIGATE_DOWN);
  });

  it('should return NAVIGATE_UP for ArrowUp', () => {
    const event = createKeyboardEvent('ArrowUp');
    expect(parseKeyboardAction(event)).toBe(KeyboardAction.NAVIGATE_UP);
  });

  it('should return OPEN_NEW_TAB for ArrowRight', () => {
    const event = createKeyboardEvent('ArrowRight');
    expect(parseKeyboardAction(event)).toBe(KeyboardAction.OPEN_NEW_TAB);
  });

  it('should return OPEN for plain Enter', () => {
    const event = createKeyboardEvent('Enter');
    expect(parseKeyboardAction(event)).toBe(KeyboardAction.OPEN);
  });

  it('should return OPEN_NEW_TAB for Ctrl+Enter', () => {
    const event = createKeyboardEvent('Enter', { ctrlKey: true });
    expect(parseKeyboardAction(event)).toBe(KeyboardAction.OPEN_NEW_TAB);
  });

  it('should return OPEN_NEW_TAB for Cmd+Enter (Mac)', () => {
    const event = createKeyboardEvent('Enter', { metaKey: true });
    expect(parseKeyboardAction(event)).toBe(KeyboardAction.OPEN_NEW_TAB);
  });

  it('should return OPEN_BACKGROUND_TAB for Shift+Enter', () => {
    const event = createKeyboardEvent('Enter', { shiftKey: true });
    expect(parseKeyboardAction(event)).toBe(KeyboardAction.OPEN_BACKGROUND_TAB);
  });

  it('should return COPY_MARKDOWN for Ctrl+M', () => {
    const event = createKeyboardEvent('m', { ctrlKey: true });
    expect(parseKeyboardAction(event)).toBe(KeyboardAction.COPY_MARKDOWN);
  });

  it('should return COPY_MARKDOWN for Cmd+M (Mac)', () => {
    const event = createKeyboardEvent('m', { metaKey: true });
    expect(parseKeyboardAction(event)).toBe(KeyboardAction.COPY_MARKDOWN);
  });

  it('should return null for unrecognized keys', () => {
    const event = createKeyboardEvent('a');
    expect(parseKeyboardAction(event)).toBeNull();
  });

  it('should return TAB_FORWARD for Tab', () => {
    const event = createKeyboardEvent('Tab');
    expect(parseKeyboardAction(event)).toBe(KeyboardAction.TAB_FORWARD);
  });

  it('should return TAB_BACKWARD for Shift+Tab', () => {
    const event = createKeyboardEvent('Tab', { shiftKey: true });
    expect(parseKeyboardAction(event)).toBe(KeyboardAction.TAB_BACKWARD);
  });
});

import { describe, it, expect } from 'vitest';
import {
  detectPopupMode,
  formatBytes,
  formatModelSize,
  buildHintMap,
  shouldRefreshRecentAfterManualIndex,
  resolvePopupCopyTarget,
  type DetectModeSettings,
} from '../popup-utils';

const allModes: DetectModeSettings = {
  commandPaletteEnabled: true,
  commandPaletteInPopup: true,
  commandPaletteModes: ['/', '>', '@', '#', '??'],
};

describe('detectPopupMode', () => {
  it('returns history for empty string', () => {
    expect(detectPopupMode('', allModes)).toEqual({ mode: 'history', query: '' });
  });

  it('returns history for plain text', () => {
    expect(detectPopupMode('react docs', allModes)).toEqual({ mode: 'history', query: 'react docs' });
  });

  it('returns help for single ?', () => {
    expect(detectPopupMode('?', allModes)).toEqual({ mode: 'help', query: '' });
  });

  it('returns websearch for ?? prefix', () => {
    expect(detectPopupMode('?? cats', allModes)).toEqual({ mode: 'websearch', query: 'cats' });
  });

  it('returns websearch with trimmed query', () => {
    expect(detectPopupMode('??  dogs  ', allModes)).toEqual({ mode: 'websearch', query: 'dogs' });
  });

  it('returns commands for / prefix', () => {
    expect(detectPopupMode('/sort', allModes)).toEqual({ mode: 'commands', query: 'sort' });
  });

  it('returns power for > prefix', () => {
    expect(detectPopupMode('>reload', allModes)).toEqual({ mode: 'power', query: 'reload' });
  });

  it('returns tabs for @ prefix', () => {
    expect(detectPopupMode('@github', allModes)).toEqual({ mode: 'tabs', query: 'github' });
  });

  it('returns bookmarks for # prefix', () => {
    expect(detectPopupMode('#react', allModes)).toEqual({ mode: 'bookmarks', query: 'react' });
  });

  it('returns history when palette is disabled', () => {
    const disabled = { ...allModes, commandPaletteEnabled: false };
    expect(detectPopupMode('/sort', disabled)).toEqual({ mode: 'history', query: '/sort' });
  });

  it('returns history when popup palette is disabled', () => {
    const notInPopup = { ...allModes, commandPaletteInPopup: false };
    expect(detectPopupMode('/sort', notInPopup)).toEqual({ mode: 'history', query: '/sort' });
  });

  it('returns history when prefix mode is not in allowed list', () => {
    const limited = { ...allModes, commandPaletteModes: ['/'] };
    expect(detectPopupMode('>reload', limited)).toEqual({ mode: 'history', query: '>reload' });
  });

  it('trims query after prefix', () => {
    expect(detectPopupMode('/  sort by  ', allModes)).toEqual({ mode: 'commands', query: 'sort by' });
  });

  it('returns history for prefix-only input with no further text', () => {
    expect(detectPopupMode('/', allModes)).toEqual({ mode: 'commands', query: '' });
  });
});

describe('formatBytes', () => {
  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(2048)).toBe('2 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(5_242_880)).toBe('5.0 MB');
  });

  it('formats zero', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats exactly 1 KB', () => {
    expect(formatBytes(1024)).toBe('1 KB');
  });

  it('formats exactly 1 MB', () => {
    expect(formatBytes(1_048_576)).toBe('1.0 MB');
  });

  it('rounds KB correctly', () => {
    expect(formatBytes(1500)).toBe('1 KB');
  });
});

describe('formatModelSize', () => {
  it('formats gigabytes', () => {
    expect(formatModelSize(1.3e9)).toBe('1.3 GB');
  });

  it('formats megabytes', () => {
    expect(formatModelSize(256e6)).toBe('256 MB');
  });

  it('formats kilobytes', () => {
    expect(formatModelSize(512e3)).toBe('512 KB');
  });

  it('formats sub-megabyte', () => {
    expect(formatModelSize(999_999)).toBe('1000 KB');
  });
});

describe('buildHintMap', () => {
  const defaults = [
    { value: 'llama3.2:1b', hint: '1.3 GB · Fast' },
    { value: 'gemma2:2b', hint: '1.6 GB · Google' },
    { value: 'nohint' },
  ];

  it('maps full model name to hint', () => {
    const map = buildHintMap(defaults);
    expect(map.get('llama3.2:1b')).toBe('1.3 GB · Fast');
  });

  it('maps base model name (before colon) to hint', () => {
    const map = buildHintMap(defaults);
    expect(map.get('llama3.2')).toBe('1.3 GB · Fast');
  });

  it('skips entries without hints', () => {
    const map = buildHintMap(defaults);
    expect(map.has('nohint')).toBe(false);
  });

  it('returns empty map for empty input', () => {
    expect(buildHintMap([]).size).toBe(0);
  });

  it('maps both entries correctly', () => {
    const map = buildHintMap(defaults);
    expect(map.get('gemma2')).toBe('1.6 GB · Google');
    expect(map.size).toBe(4);
  });
});

describe('shouldRefreshRecentAfterManualIndex', () => {
  it('returns true on a successful index that wrote new rows', () => {
    expect(shouldRefreshRecentAfterManualIndex({ status: 'OK', added: 3, updated: 0, total: 3 })).toBe(true);
  });

  it('returns true on a successful index that only updated existing rows', () => {
    // Updating lastVisit / visitCount on an existing row still shifts the
    // sort order on the popup's "Recent" list, so we must re-fetch.
    expect(shouldRefreshRecentAfterManualIndex({ status: 'OK', added: 0, updated: 5, total: 5 })).toBe(true);
  });

  it('returns true when total > 0 even if added/updated were not reported', () => {
    // Defensive: older indexer responses may not break out added/updated.
    expect(shouldRefreshRecentAfterManualIndex({ status: 'OK', total: 7 })).toBe(true);
  });

  it('returns false when the index reported success but found nothing to do', () => {
    // No-op index: re-fetching would just repaint the same rows. Skip the
    // round-trip so the popup doesn't flicker.
    expect(shouldRefreshRecentAfterManualIndex({ status: 'OK', added: 0, updated: 0, total: 0 })).toBe(false);
  });

  it('returns false on an ERROR response regardless of counts', () => {
    expect(shouldRefreshRecentAfterManualIndex({ status: 'ERROR', added: 5, total: 5, message: 'boom' })).toBe(false);
  });

  it('returns false on null / undefined / missing-status responses', () => {
    expect(shouldRefreshRecentAfterManualIndex(null)).toBe(false);
    expect(shouldRefreshRecentAfterManualIndex(undefined)).toBe(false);
    expect(shouldRefreshRecentAfterManualIndex({} as unknown as Parameters<typeof shouldRefreshRecentAfterManualIndex>[0])).toBe(false);
  });
});

describe('resolvePopupCopyTarget', () => {
  const history = [
    { url: 'https://example.com/0', title: 'Hist 0' },
    { url: 'https://example.com/1', title: 'Hist 1' },
  ];

  it('reads url+title off a focused palette row (post-A2 enrichment)', () => {
    const target = resolvePopupCopyTarget(
      {
        className: 'palette-selectable-row',
        dataset: { url: 'https://news.ycombinator.com/', title: 'Hacker News' },
      },
      [],
      -1,
    );
    expect(target).toEqual({ url: 'https://news.ycombinator.com/', title: 'Hacker News' });
  });

  it('falls back to tabUrl when generic url dataset is empty (pre-A2 tab rows still copy)', () => {
    const target = resolvePopupCopyTarget(
      {
        className: 'palette-selectable-row',
        dataset: { tabUrl: 'https://tab.example/x', title: 'Open tab' },
      },
      [],
      -1,
    );
    expect(target).toEqual({ url: 'https://tab.example/x', title: 'Open tab' });
  });

  it('falls back to bookmarkUrl when generic url dataset is empty', () => {
    const target = resolvePopupCopyTarget(
      {
        className: 'palette-selectable-row',
        dataset: { bookmarkUrl: 'https://bm.example', title: 'Bookmark' },
      },
      [],
      -1,
    );
    expect(target).toEqual({ url: 'https://bm.example', title: 'Bookmark' });
  });

  it('returns null for a palette row that has no URL of any flavour (e.g. /command row)', () => {
    // Critical: must NOT silently fall through to resultsLocal[0] —
    // that would copy a stale history row when the user pressed Ctrl+C
    // on a selected command palette entry.
    const target = resolvePopupCopyTarget(
      { className: 'palette-selectable-row', dataset: {} },
      history,
      0,
    );
    expect(target).toBeNull();
  });

  it('returns null when no row is focused AND currentIndex is unset (Ctrl+C with focus on input or container)', () => {
    // -1 is the popup's "nothing selected" sentinel for activeIndex.
    expect(resolvePopupCopyTarget(null, history, -1)).toBeNull();
  });

  it('null focusedRow with a valid currentIndex still copies the active history row (legacy parity)', () => {
    // Pre-A2 behaviour: container-level focus on the results <ul> still
    // copies the active-highlighted history row. We must preserve that so
    // existing users don't lose Ctrl+C on the default list.
    expect(resolvePopupCopyTarget(null, history, 0)).toEqual({
      url: 'https://example.com/0',
      title: 'Hist 0',
    });
  });

  it('falls back to resultsLocal[currentIndex] for history rows (legacy default-list path)', () => {
    const target = resolvePopupCopyTarget(
      { className: '', dataset: { index: '1' } },
      history,
      1,
    );
    expect(target).toEqual({ url: 'https://example.com/1', title: 'Hist 1' });
  });

  it('returns null when currentIndex is -1 even with a focused non-palette row (no selection state)', () => {
    expect(
      resolvePopupCopyTarget({ className: '', dataset: {} }, history, -1),
    ).toBeNull();
  });

  it('returns null when currentIndex is out of bounds (defensive against stale state)', () => {
    expect(
      resolvePopupCopyTarget({ className: '', dataset: {} }, history, 99),
    ).toBeNull();
  });

  it('returns null when the resultsLocal entry at currentIndex has no URL', () => {
    expect(
      resolvePopupCopyTarget(
        { className: '', dataset: {} },
        [{ title: 'Title only', url: undefined }],
        0,
      ),
    ).toBeNull();
  });

  it('coerces missing title on a palette row to empty string (no "undefined" in clipboard)', () => {
    const target = resolvePopupCopyTarget(
      {
        className: 'palette-selectable-row',
        dataset: { url: 'https://example.com' },
      },
      [],
      -1,
    );
    expect(target).toEqual({ url: 'https://example.com', title: '' });
  });

  it('trims whitespace around dataset url + title', () => {
    const target = resolvePopupCopyTarget(
      {
        className: 'palette-selectable-row',
        dataset: { url: '  https://example.com  ', title: '  Spacey  ' },
      },
      [],
      -1,
    );
    expect(target).toEqual({ url: 'https://example.com', title: 'Spacey' });
  });

  it('treats whitespace-only URL as missing (palette row with no real URL)', () => {
    expect(
      resolvePopupCopyTarget(
        {
          className: 'palette-selectable-row',
          dataset: { url: '   ', title: 'X' },
        },
        history,
        0,
      ),
    ).toBeNull();
  });

  it('palette row with URL wins over a stale resultsLocal entry at the same index', () => {
    const target = resolvePopupCopyTarget(
      {
        className: 'palette-selectable-row',
        dataset: { url: 'https://palette-wins.example', title: 'Palette' },
      },
      history,
      0,
    );
    expect(target?.url).toBe('https://palette-wins.example');
  });
});

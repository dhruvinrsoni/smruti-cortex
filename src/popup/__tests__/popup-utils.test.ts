import { describe, it, expect } from 'vitest';
import {
  detectPopupMode,
  formatBytes,
  formatModelSize,
  buildHintMap,
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

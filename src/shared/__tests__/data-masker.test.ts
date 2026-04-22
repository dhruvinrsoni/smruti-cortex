// Tests for data-masker.ts — privacy masking for ranking reports
//
// All test data uses RFC-2606 placeholder domains (example.com, example.org,
// etc.) and neutral fictional product names (Acme Wiki, Acme Tracker). No
// company- or product-specific identifiers may appear here — the repo-wide
// blocklist guard (scripts/check-blocklist.mjs) enforces this.

import { describe, it, expect } from 'vitest';
import { maskTitle, maskUrl, maskMetaDescription, maskQuery, maskToken, type MaskingLevel } from '../data-masker';

describe('maskTitle', () => {
  const tokens = ['wiki', 'calendar'];

  describe('level = none', () => {
    it('returns original title unchanged', () => {
      expect(maskTitle('Sprint 4.3 Team Calendar - Acme Wiki', tokens, 'none'))
        .toBe('Sprint 4.3 Team Calendar - Acme Wiki');
    });
  });

  describe('level = partial', () => {
    it('masks non-matching words with partial reveal and keeps matched tokens bold', () => {
      const result = maskTitle('Sprint 4.3 Team Calendar - Acme Wiki', tokens, 'partial');
      expect(result).toContain('**Calendar**');
      expect(result).toContain('**Wiki**');
      // Non-matching words should be redacted (not [MASKED])
      expect(result).not.toContain('[MASKED]');
      expect(result).not.toContain('Sprint');
      expect(result).not.toContain('Acme');
    });

    it('redacts short words (1-3 chars) entirely with dots', () => {
      const result = maskTitle('Go wiki now', tokens, 'partial');
      expect(result).toContain('**wiki**');
      expect(result).toContain('••');  // "Go" → "••"
      expect(result).toContain('•••'); // "now" → "•••"
    });

    it('redacts medium words keeping first/last chars', () => {
      const result = maskTitle('Page wiki Sprint', tokens, 'partial');
      expect(result).toContain('**wiki**');
      // "Page" (4 chars) → "P••e"
      expect(result).toContain('P••e');
      // "Sprint" (6 chars) → "Sp••nt"
      expect(result).toContain('Sp••nt');
    });

    it('redacts long words keeping first 3 and last 2 chars', () => {
      const result = maskTitle('Dashboard wiki', tokens, 'partial');
      expect(result).toContain('**wiki**');
      // "Dashboard" (9 chars) → "Das••••rd"
      expect(result).toContain('Das••••rd');
    });

    it('handles title with no matches', () => {
      const result = maskTitle('Login Page', tokens, 'partial');
      expect(result).not.toContain('Login');
      expect(result).not.toContain('Page');
      expect(result).toContain('•');
    });

    it('handles title with only matching tokens', () => {
      const result = maskTitle('wiki calendar', tokens, 'partial');
      expect(result).toContain('**wiki**');
      expect(result).toContain('**calendar**');
    });
  });

  describe('level = full', () => {
    it('returns hash with matched tokens', () => {
      const result = maskTitle('Sprint 4.3 Team Calendar - Acme Wiki', tokens, 'full');
      expect(result).toMatch(/^\[.+\] \*\*wiki\*\* \*\*calendar\*\*$/);
    });

    it('returns only hash when no tokens match', () => {
      const result = maskTitle('Login Page', tokens, 'full');
      expect(result).toMatch(/^\[.+\]$/);
      expect(result).not.toContain('Login');
    });

    it('produces deterministic hashes for the same input', () => {
      const a = maskTitle('Hello World', tokens, 'full');
      const b = maskTitle('Hello World', tokens, 'full');
      expect(a).toBe(b);
    });

    it('produces different hashes for different inputs', () => {
      const a = maskTitle('Hello World', tokens, 'full');
      const b = maskTitle('Goodbye World', tokens, 'full');
      expect(a).not.toBe(b);
    });
  });
});

describe('maskUrl', () => {
  const tokens = ['wiki'];

  describe('level = none', () => {
    it('returns unchanged', () => {
      expect(maskUrl('https://wiki.example.com/spaces/RAR/pages/123', tokens, 'none'))
        .toBe('https://wiki.example.com/spaces/RAR/pages/123');
    });
  });

  describe('level = partial', () => {
    it('redacts company domain parts and path for full URLs', () => {
      const result = maskUrl('https://wiki.example.com/spaces/RAR/pages/123', tokens, 'partial');
      expect(result).toContain('wiki.');
      expect(result).not.toContain('example');
      expect(result).toContain('.com/•••');
    });

    it('redacts company parts in bare hostnames', () => {
      const result = maskUrl('wiki.example.com', tokens, 'partial');
      expect(result).toContain('wiki.');
      expect(result).not.toContain('example');
      expect(result).toContain('.com');
    });

    it('keeps 2-part domains as-is (SLD is site identity)', () => {
      const result = maskUrl('https://github.com/owner/repo', ['test'], 'partial');
      expect(result).toBe('github.com/•••');
    });

    it('keeps any 2-part domain unchanged even without whitelist', () => {
      const result = maskUrl('https://acme.com/about', ['test'], 'partial');
      expect(result).toBe('acme.com/•••');
    });

    it('keeps query-matching domain parts visible', () => {
      const result = maskUrl('tracker.example.com', ['tracker'], 'partial');
      expect(result).toContain('tracker.');
      expect(result).not.toContain('example');
    });

    it('handles compound TLDs like .co.uk', () => {
      const result = maskUrl('https://app.company.co.uk/dashboard', ['app'], 'partial');
      expect(result).toContain('app.');
      expect(result).not.toContain('company');
      expect(result).toContain('.co.uk/•••');
    });

    it('keeps 2-part compound TLD domains as-is', () => {
      const result = maskUrl('https://example.co.uk/page', ['test'], 'partial');
      expect(result).toBe('example.co.uk/•••');
    });

    it('redacts all non-TLD parts for internal TLDs', () => {
      const result = maskUrl('wiki.acme.local', ['test'], 'partial');
      expect(result).not.toContain('wiki');
      expect(result).not.toContain('acme');
      expect(result).toContain('.local');
    });

    it('keeps query-matching parts even with internal TLDs', () => {
      const result = maskUrl('tracker.sample.corp', ['tracker'], 'partial');
      expect(result).toContain('tracker.');
      expect(result).not.toContain('sample');
      expect(result).toContain('.corp');
    });
  });

  describe('level = full', () => {
    it('hashes hostname and shows TLD structure', () => {
      const result = maskUrl('https://wiki.example.com/pages/123', tokens, 'full');
      expect(result).toMatch(/^\[.+\]\.example\.com\/•••$/);
    });

    it('hashes bare hostnames', () => {
      const result = maskUrl('wiki.example.com', tokens, 'full');
      expect(result).toMatch(/^\[.+\]\.domain$/);
    });
  });
});

describe('maskMetaDescription', () => {
  const tokens = ['test'];

  it('returns unchanged for none', () => {
    expect(maskMetaDescription('A description about testing', tokens, 'none'))
      .toBe('A description about testing');
  });

  it('truncates for partial (10 chars + ellipsis)', () => {
    const result = maskMetaDescription('A very long description that goes on and on', tokens, 'partial');
    expect(result).toHaveLength(13); // 10 chars + "..."
    expect(result).toMatch(/\.\.\.$/);
    expect(result.startsWith('A very lon')).toBe(true);
  });

  it('returns short strings unchanged for partial', () => {
    expect(maskMetaDescription('Short', tokens, 'partial')).toBe('Short');
  });

  it('returns strings <= 10 chars unchanged for partial', () => {
    expect(maskMetaDescription('Ten chars!', tokens, 'partial')).toBe('Ten chars!');
  });

  it('returns dots for full', () => {
    expect(maskMetaDescription('Anything here', tokens, 'full')).toBe('•••');
  });
});

describe('maskQuery', () => {
  it('returns raw query at level=none', () => {
    expect(maskQuery('project dashboard', ['project', 'dashboard'], 'none'))
      .toBe('project dashboard');
  });

  it('returns raw query at level=partial (query is the repro hook)', () => {
    expect(maskQuery('project dashboard', ['project', 'dashboard'], 'partial'))
      .toBe('project dashboard');
  });

  it('hashes query and reports token count at level=full', () => {
    const result = maskQuery('project dashboard', ['project', 'dashboard'], 'full');
    expect(result).toMatch(/^\[[a-z0-9]{1,8}\] \(2 tokens\)$/);
    expect(result).not.toContain('project');
    expect(result).not.toContain('dashboard');
  });

  it('produces deterministic hashes at level=full', () => {
    const a = maskQuery('identical', ['identical'], 'full');
    const b = maskQuery('identical', ['identical'], 'full');
    expect(a).toBe(b);
  });

  it('produces different hashes for different queries at level=full', () => {
    const a = maskQuery('first query', [], 'full');
    const b = maskQuery('second query', [], 'full');
    expect(a).not.toBe(b);
  });
});

describe('maskToken', () => {
  it('returns raw token at level=none', () => {
    expect(maskToken('project', 'none')).toBe('project');
  });

  it('returns raw token at level=partial', () => {
    expect(maskToken('project', 'partial')).toBe('project');
  });

  it('masks token at level=full with first char + dots + length', () => {
    expect(maskToken('project', 'full')).toBe('p•••(7)');
    expect(maskToken('go', 'full')).toBe('g•(2)');
    expect(maskToken('hi', 'full')).toBe('h•(2)');
  });

  it('caps dots at 3 for long tokens', () => {
    expect(maskToken('supercalifragilistic', 'full')).toBe('s•••(20)');
  });

  it('handles single-char tokens at level=full', () => {
    expect(maskToken('a', 'full')).toBe('(1)');
  });

  it('handles empty string at level=full', () => {
    expect(maskToken('', 'full')).toBe('(0)');
  });
});

describe('masking level type safety', () => {
  it('accepts all valid levels', () => {
    const levels: MaskingLevel[] = ['none', 'partial', 'full'];
    for (const level of levels) {
      expect(() => maskTitle('test', [], level)).not.toThrow();
      expect(() => maskUrl('test', [], level)).not.toThrow();
      expect(() => maskMetaDescription('test', [], level)).not.toThrow();
      expect(() => maskQuery('test query', ['test'], level)).not.toThrow();
      expect(() => maskToken('test', level)).not.toThrow();
    }
  });
});

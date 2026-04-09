// Tests for data-masker.ts — privacy masking for ranking reports

import { describe, it, expect } from 'vitest';
import { maskTitle, maskUrl, maskMetaDescription, type MaskingLevel } from '../data-masker';

describe('maskTitle', () => {
  const tokens = ['confluence', 'pto'];

  describe('level = none', () => {
    it('returns original title unchanged', () => {
      expect(maskTitle('PI 1.26 PTO Calendar - Zebra Confluence', tokens, 'none'))
        .toBe('PI 1.26 PTO Calendar - Zebra Confluence');
    });
  });

  describe('level = partial', () => {
    it('masks non-matching words with partial reveal and keeps matched tokens bold', () => {
      const result = maskTitle('PI 1.26 PTO Calendar - Zebra Confluence', tokens, 'partial');
      expect(result).toContain('**PTO**');
      expect(result).toContain('**Confluence**');
      // Non-matching words should be redacted (not [MASKED])
      expect(result).not.toContain('[MASKED]');
      expect(result).not.toContain('Zebra');
      expect(result).not.toContain('Calendar');
    });

    it('redacts short words (1-3 chars) entirely with dots', () => {
      const result = maskTitle('Go PTO now', tokens, 'partial');
      expect(result).toContain('**PTO**');
      expect(result).toContain('••');  // "Go" → "••"
      expect(result).toContain('•••'); // "now" → "•••"
    });

    it('redacts medium words keeping first/last chars', () => {
      const result = maskTitle('Page pto Sprint', tokens, 'partial');
      expect(result).toContain('**pto**');
      // "Page" (4 chars) → "P••e"
      expect(result).toContain('P••e');
      // "Sprint" (6 chars) → "Sp••nt"
      expect(result).toContain('Sp••nt');
    });

    it('redacts long words keeping first 3 and last 2 chars', () => {
      const result = maskTitle('Dashboard pto', tokens, 'partial');
      expect(result).toContain('**pto**');
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
      const result = maskTitle('confluence pto', tokens, 'partial');
      expect(result).toContain('**confluence**');
      expect(result).toContain('**pto**');
    });
  });

  describe('level = full', () => {
    it('returns hash with matched tokens', () => {
      const result = maskTitle('PI 1.26 PTO Calendar - Zebra Confluence', tokens, 'full');
      expect(result).toMatch(/^\[.+\] \*\*confluence\*\* \*\*pto\*\*$/);
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
  const tokens = ['confluence'];

  describe('level = none', () => {
    it('returns unchanged', () => {
      expect(maskUrl('https://confluence.zebra.com/spaces/RAR/pages/123', tokens, 'none'))
        .toBe('https://confluence.zebra.com/spaces/RAR/pages/123');
    });
  });

  describe('level = partial', () => {
    it('redacts company domain parts and path for full URLs', () => {
      const result = maskUrl('https://confluence.zebra.com/spaces/RAR/pages/123', tokens, 'partial');
      expect(result).toContain('confluence.');
      expect(result).not.toContain('zebra');
      expect(result).toContain('.com/•••');
    });

    it('redacts company parts in bare hostnames', () => {
      const result = maskUrl('confluence.zebra.com', tokens, 'partial');
      expect(result).toContain('confluence.');
      expect(result).not.toContain('zebra');
      expect(result).toContain('.com');
    });

    it('keeps 2-part domains as-is (SLD is site identity)', () => {
      const result = maskUrl('https://github.com/owner/repo', ['test'], 'partial');
      expect(result).toBe('github.com/•••');
    });

    it('keeps any 2-part domain unchanged even without whitelist', () => {
      const result = maskUrl('https://zebra.com/about', ['test'], 'partial');
      expect(result).toBe('zebra.com/•••');
    });

    it('keeps query-matching domain parts visible', () => {
      const result = maskUrl('jira.zebra.com', ['jira'], 'partial');
      expect(result).toContain('jira.');
      expect(result).not.toContain('zebra');
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
      const result = maskUrl('jira.acme.corp', ['jira'], 'partial');
      expect(result).toContain('jira.');
      expect(result).not.toContain('acme');
      expect(result).toContain('.corp');
    });
  });

  describe('level = full', () => {
    it('hashes hostname and shows TLD structure', () => {
      const result = maskUrl('https://confluence.zebra.com/pages/123', tokens, 'full');
      expect(result).toMatch(/^\[.+\]\.zebra\.com\/•••$/);
    });

    it('hashes bare hostnames', () => {
      const result = maskUrl('confluence.zebra.com', tokens, 'full');
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

  it('truncates for partial', () => {
    const result = maskMetaDescription('A very long description that goes on and on', tokens, 'partial');
    expect(result).toHaveLength(23); // 20 chars + "..."
    expect(result).toMatch(/\.\.\.$/);
  });

  it('returns short strings unchanged for partial', () => {
    expect(maskMetaDescription('Short', tokens, 'partial')).toBe('Short');
  });

  it('returns dots for full', () => {
    expect(maskMetaDescription('Anything here', tokens, 'full')).toBe('•••');
  });
});

describe('masking level type safety', () => {
  it('accepts all valid levels', () => {
    const levels: MaskingLevel[] = ['none', 'partial', 'full'];
    for (const level of levels) {
      expect(() => maskTitle('test', [], level)).not.toThrow();
      expect(() => maskUrl('test', [], level)).not.toThrow();
      expect(() => maskMetaDescription('test', [], level)).not.toThrow();
    }
  });
});

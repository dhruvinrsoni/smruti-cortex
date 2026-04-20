import { describe, it, expect } from 'vitest';
import {
  SEARCH_ENGINES,
  parseWebSearchQuery,
  buildWebSearchUrl,
  sortedWebSearchPrefixKeys,
  escapeAtlassianSearchQuotedFragment,
  getWebSearchEngineDisplayName,
  getWebSearchPrefixHintLines,
  webSearchSiteUrlToastMessage,
  webSearchSiteUrlPreviewLabel,
} from '../web-search';

describe('web-search parseWebSearchQuery', () => {
  it('uses default engine when no prefix matches', () => {
    expect(parseWebSearchQuery('hello world', 'google')).toEqual({
      engineKey: 'google',
      searchTerms: 'hello world',
      usedPrefix: false,
    });
  });

  it('detects prefix-only y as YouTube', () => {
    expect(parseWebSearchQuery('y', 'google')).toEqual({
      engineKey: 'youtube',
      searchTerms: '',
      usedPrefix: true,
      matchedPrefix: 'y',
    });
  });

  it('detects y with search terms', () => {
    expect(parseWebSearchQuery('y cats', 'google')).toEqual({
      engineKey: 'youtube',
      searchTerms: 'cats',
      usedPrefix: true,
      matchedPrefix: 'y',
    });
  });

  it('prefers gh over g', () => {
    expect(parseWebSearchQuery('gh topic', 'google')).toEqual({
      engineKey: 'github',
      searchTerms: 'topic',
      usedPrefix: true,
      matchedPrefix: 'gh',
    });
  });

  it('does not treat ghost as g prefix', () => {
    expect(parseWebSearchQuery('ghost', 'google')).toEqual({
      engineKey: 'google',
      searchTerms: 'ghost',
      usedPrefix: false,
    });
  });

  it('matches gc prefix', () => {
    expect(parseWebSearchQuery('gc vpc', 'google')).toEqual({
      engineKey: 'gcp',
      searchTerms: 'vpc',
      usedPrefix: true,
      matchedPrefix: 'gc',
    });
  });
});

describe('web-search buildWebSearchUrl', () => {
  it('returns no-terms when search terms empty', () => {
    const p = parseWebSearchQuery('y', 'google');
    expect(buildWebSearchUrl(p, {})).toEqual({ error: 'no-terms' });
  });

  it('builds GCP URL', () => {
    const p = parseWebSearchQuery('gc bigquery', 'google');
    const r = buildWebSearchUrl(p, {});
    expect('url' in r).toBe(true);
    if ('url' in r) {
      expect(r.url).toBe(SEARCH_ENGINES.gcp + encodeURIComponent('bigquery'));
    }
  });

  it('requires Jira URL for jira', () => {
    const p = parseWebSearchQuery('j PROJ-1', 'google');
    expect(buildWebSearchUrl(p, {})).toEqual({ error: 'no-jira-site' });
    const ok = buildWebSearchUrl(p, { jiraSiteUrl: 'https://jira.acme.com' });
    expect('url' in ok).toBe(true);
    if ('url' in ok) {
      expect(ok.url).toBe(
        'https://jira.acme.com/issues?jql=' + encodeURIComponent('text ~ "PROJ-1"'),
      );
    }
  });

  it('builds Jira issues URL with text ~ query (encoding)', () => {
    const p = parseWebSearchQuery('j open source', 'google');
    const r = buildWebSearchUrl(p, { jiraSiteUrl: 'https://jira.zebra.com' });
    expect('url' in r).toBe(true);
    if ('url' in r) {
      expect(r.url).toBe(
        'https://jira.zebra.com/issues?jql=' + encodeURIComponent('text ~ "open source"'),
      );
    }
  });

  it('does not use Jira URL for Confluence', () => {
    const p = parseWebSearchQuery('c runbook', 'google');
    expect(buildWebSearchUrl(p, { jiraSiteUrl: 'https://jira.acme.com' })).toEqual({
      error: 'no-confluence-site',
    });
  });

  it('builds Confluence search URL', () => {
    const p = parseWebSearchQuery('c runbook', 'google');
    const r = buildWebSearchUrl(p, { confluenceSiteUrl: 'https://confluence.acme.com' });
    expect('url' in r).toBe(true);
    if ('url' in r) {
      expect(r.url).toBe(
        'https://confluence.acme.com/dosearchsite.action?cql='
          + encodeURIComponent('siteSearch ~ "runbook"'),
      );
    }
  });

  it('builds Confluence dosearchsite URL matching siteSearch CQL pattern', () => {
    const p = parseWebSearchQuery('c open source', 'google');
    const r = buildWebSearchUrl(p, { confluenceSiteUrl: 'https://confluence.zebra.com' });
    expect('url' in r).toBe(true);
    if ('url' in r) {
      expect(r.url).toBe(
        'https://confluence.zebra.com/dosearchsite.action?cql='
          + encodeURIComponent('siteSearch ~ "open source"'),
      );
    }
  });

  it('escapes backslash and quote inside Jira/Confluence search fragment', () => {
    expect(escapeAtlassianSearchQuotedFragment('a\\b"c')).toBe('a\\\\b\\"c');
  });
});

describe('web-search sortedWebSearchPrefixKeys', () => {
  it('lists two-letter prefixes before one-letter', () => {
    const keys = sortedWebSearchPrefixKeys();
    const iGh = keys.indexOf('gh');
    const iG = keys.indexOf('g');
    expect(iGh).toBeLessThan(iG);
  });
});

describe('getWebSearchEngineDisplayName', () => {
  it('returns display name for known engines', () => {
    expect(getWebSearchEngineDisplayName('google')).toBe('Google');
    expect(getWebSearchEngineDisplayName('youtube')).toBe('YouTube');
    expect(getWebSearchEngineDisplayName('github')).toBe('GitHub');
    expect(getWebSearchEngineDisplayName('gcp')).toBe('Google Cloud console');
    expect(getWebSearchEngineDisplayName('jira')).toBe('Jira');
    expect(getWebSearchEngineDisplayName('confluence')).toBe('Confluence');
  });

  it('capitalizes first letter for unknown engines', () => {
    expect(getWebSearchEngineDisplayName('duckduckgo')).toBe('Duckduckgo');
    expect(getWebSearchEngineDisplayName('bing')).toBe('Bing');
  });
});

describe('getWebSearchPrefixHintLines', () => {
  it('returns hint lines for all valid prefixes', () => {
    const lines = getWebSearchPrefixHintLines();
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.prefix).toBeTruthy();
      expect(line.engineKey).toBeTruthy();
      expect(line.engineLabel).toBeTruthy();
    }
  });

  it('includes gh, gc, g, y, j, c prefixes', () => {
    const lines = getWebSearchPrefixHintLines();
    const prefixes = lines.map(l => l.prefix);
    expect(prefixes).toContain('gh');
    expect(prefixes).toContain('g');
    expect(prefixes).toContain('y');
    expect(prefixes).toContain('j');
    expect(prefixes).toContain('c');
  });
});

describe('webSearchSiteUrlToastMessage', () => {
  it('returns Jira message for no-jira-site', () => {
    expect(webSearchSiteUrlToastMessage('no-jira-site')).toContain('Jira site URL');
  });

  it('returns Confluence message for no-confluence-site', () => {
    expect(webSearchSiteUrlToastMessage('no-confluence-site')).toContain('Confluence site URL');
  });
});

describe('webSearchSiteUrlPreviewLabel', () => {
  it('returns Jira preview label', () => {
    expect(webSearchSiteUrlPreviewLabel('no-jira-site', 'Jira')).toContain('set Jira site URL');
  });

  it('returns Confluence preview label', () => {
    expect(webSearchSiteUrlPreviewLabel('no-confluence-site', 'Confluence')).toContain('set Confluence site URL');
  });
});

describe('parseWebSearchQuery edge cases', () => {
  it('returns default engine for empty string', () => {
    const result = parseWebSearchQuery('', 'google');
    expect(result).toEqual({
      engineKey: 'google',
      searchTerms: '',
      usedPrefix: false,
    });
  });

  it('returns default engine for whitespace-only input', () => {
    const result = parseWebSearchQuery('   ', 'google');
    expect(result).toEqual({
      engineKey: 'google',
      searchTerms: '',
      usedPrefix: false,
    });
  });
});

describe('buildWebSearchUrl edge cases', () => {
  it('returns no-terms for unknown engine key', () => {
    const result = buildWebSearchUrl(
      { engineKey: 'unknown_engine', searchTerms: 'test', usedPrefix: false },
      {},
    );
    expect(result).toEqual({ error: 'no-terms' });
  });

  it('builds Google URL for default engine', () => {
    const result = buildWebSearchUrl(
      { engineKey: 'google', searchTerms: 'hello', usedPrefix: false },
      {},
    );
    expect('url' in result).toBe(true);
    if ('url' in result) {
      expect(result.url).toBe(SEARCH_ENGINES.google + encodeURIComponent('hello'));
    }
  });
});

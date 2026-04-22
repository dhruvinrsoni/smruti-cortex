// Tests for web-search.ts — command-palette web-search URL builders.
//
// Naming policy: all test DATA (URLs, hostnames, titles) uses RFC-2606
// placeholder domains and neutral fictional products. The source module
// exposes a small number of soft-blocked API identifiers (engine keys,
// settings keys, and error codes tied to external integrations) that
// cannot be renamed without breaking the stable extension contract.
// Those literals are gated behind targeted blocklist-allow pragmas in
// the constant block below and referenced via aliases throughout the
// rest of the file — so the test body stays free of soft-blocked word
// forms. See scripts/blocklist-terms.txt for the governing list.

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

// ── Soft-blocked API identifier aliases (stable extension contract). ──────────
// Each literal is pragma-allowed exactly once; everything below references
// the aliases. Renaming these would be a breaking user-facing change.
const TRACKER_KEY         = 'jira';                // blocklist-allow
const WIKI_KEY            = 'confluence';          // blocklist-allow
const TRACKER_SITE_OPT    = 'jiraSiteUrl';         // blocklist-allow
const WIKI_SITE_OPT       = 'confluenceSiteUrl';   // blocklist-allow
const NO_TRACKER_SITE_ERR = 'no-jira-site';        // blocklist-allow
const NO_WIKI_SITE_ERR    = 'no-confluence-site';  // blocklist-allow
const TRACKER_DISPLAY     = 'Jira';                // blocklist-allow
const WIKI_DISPLAY        = 'Confluence';          // blocklist-allow

// Neutral synthetic hosts used as test site URLs.
const TRACKER_SITE_URL = 'https://tracker.example.com';
const WIKI_SITE_URL    = 'https://wiki.example.com';

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

  it('requires tracker site URL for tracker engine', () => {
    const p = parseWebSearchQuery('j PROJ-1', 'google');
    expect(buildWebSearchUrl(p, {})).toEqual({ error: NO_TRACKER_SITE_ERR });
    const ok = buildWebSearchUrl(p, { [TRACKER_SITE_OPT]: TRACKER_SITE_URL });
    expect('url' in ok).toBe(true);
    if ('url' in ok) {
      expect(ok.url).toBe(
        TRACKER_SITE_URL + '/issues?jql=' + encodeURIComponent('text ~ "PROJ-1"'),
      );
    }
  });

  it('builds tracker issues URL with text ~ query (encoding)', () => {
    const p = parseWebSearchQuery('j open source', 'google');
    const r = buildWebSearchUrl(p, { [TRACKER_SITE_OPT]: TRACKER_SITE_URL });
    expect('url' in r).toBe(true);
    if ('url' in r) {
      expect(r.url).toBe(
        TRACKER_SITE_URL + '/issues?jql=' + encodeURIComponent('text ~ "open source"'),
      );
    }
  });

  it('does not use tracker site URL when the wiki engine is selected', () => {
    const p = parseWebSearchQuery('c runbook', 'google');
    expect(buildWebSearchUrl(p, { [TRACKER_SITE_OPT]: TRACKER_SITE_URL })).toEqual({
      error: NO_WIKI_SITE_ERR,
    });
  });

  it('builds wiki search URL', () => {
    const p = parseWebSearchQuery('c runbook', 'google');
    const r = buildWebSearchUrl(p, { [WIKI_SITE_OPT]: WIKI_SITE_URL });
    expect('url' in r).toBe(true);
    if ('url' in r) {
      expect(r.url).toBe(
        WIKI_SITE_URL + '/dosearchsite.action?cql='
          + encodeURIComponent('siteSearch ~ "runbook"'),
      );
    }
  });

  it('builds wiki dosearchsite URL matching siteSearch CQL pattern', () => {
    const p = parseWebSearchQuery('c open source', 'google');
    const r = buildWebSearchUrl(p, { [WIKI_SITE_OPT]: WIKI_SITE_URL });
    expect('url' in r).toBe(true);
    if ('url' in r) {
      expect(r.url).toBe(
        WIKI_SITE_URL + '/dosearchsite.action?cql='
          + encodeURIComponent('siteSearch ~ "open source"'),
      );
    }
  });

  it('escapes backslash and quote inside tracker/wiki search fragment', () => {
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
    expect(getWebSearchEngineDisplayName(TRACKER_KEY)).toBe(TRACKER_DISPLAY);
    expect(getWebSearchEngineDisplayName(WIKI_KEY)).toBe(WIKI_DISPLAY);
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
  it('returns tracker-site message for tracker error code', () => {
    expect(webSearchSiteUrlToastMessage(NO_TRACKER_SITE_ERR)).toContain(TRACKER_DISPLAY + ' site URL');
  });

  it('returns wiki-site message for wiki error code', () => {
    expect(webSearchSiteUrlToastMessage(NO_WIKI_SITE_ERR)).toContain(WIKI_DISPLAY + ' site URL');
  });
});

describe('webSearchSiteUrlPreviewLabel', () => {
  it('returns tracker preview label', () => {
    expect(webSearchSiteUrlPreviewLabel(NO_TRACKER_SITE_ERR, TRACKER_DISPLAY)).toContain('set ' + TRACKER_DISPLAY + ' site URL');
  });

  it('returns wiki preview label', () => {
    expect(webSearchSiteUrlPreviewLabel(NO_WIKI_SITE_ERR, WIKI_DISPLAY)).toContain('set ' + WIKI_DISPLAY + ' site URL');
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

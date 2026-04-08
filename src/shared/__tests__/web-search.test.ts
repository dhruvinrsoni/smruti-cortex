import { describe, it, expect } from 'vitest';
import {
  SEARCH_ENGINES,
  parseWebSearchQuery,
  buildWebSearchUrl,
  sortedWebSearchPrefixKeys,
  escapeAtlassianSearchQuotedFragment,
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

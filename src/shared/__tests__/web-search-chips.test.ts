import { describe, it, expect } from 'vitest';
import {
  allWebSearchEngineKeys,
  getAvailableWebSearchEngines,
  SEARCH_ENGINES,
  SEARCH_ENGINE_PREFIXES,
} from '../web-search';

describe('allWebSearchEngineKeys', () => {
  it('returns a de-duplicated key list', () => {
    const keys = allWebSearchEngineKeys();
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('covers every static engine and every prefix-mapped engine (registry-derived)', () => {
    const keys = new Set(allWebSearchEngineKeys());
    for (const k of Object.keys(SEARCH_ENGINES)) {
      expect(keys.has(k), `missing static engine ${k}`).toBe(true);
    }
    for (const k of Object.values(SEARCH_ENGINE_PREFIXES)) {
      expect(keys.has(k), `missing prefix engine ${k}`).toBe(true);
    }
  });
});

describe('getAvailableWebSearchEngines', () => {
  it('returns [] for empty / whitespace terms', () => {
    expect(getAvailableWebSearchEngines('', {})).toEqual([]);
    expect(getAvailableWebSearchEngines('   ', {})).toEqual([]);
  });

  it('builds enabled chips for the static engines with real URLs', () => {
    const chips = getAvailableWebSearchEngines('cats', {});
    const google = chips.find(c => c.key === 'google');
    expect(google).toBeDefined();
    expect(google?.disabled).toBeFalsy();
    expect(google?.url).toBe('https://www.google.com/search?q=cats');
    expect(google?.displayName).toBe('Google');
    expect(google?.mode).toBe('static-engine');
  });

  it('marks jira/confluence disabled when no site URL is configured', () => {
    const chips = getAvailableWebSearchEngines('cats', {});
    const jira = chips.find(c => c.key === 'jira');
    const conf = chips.find(c => c.key === 'confluence');
    expect(jira?.disabled).toBe(true);
    expect(jira?.disabledReason).toBe('no-jira-site');
    expect(jira?.url).toBe('');
    expect(conf?.disabled).toBe(true);
    expect(conf?.disabledReason).toBe('no-confluence-site');
  });

  it('enables jira/confluence chips once site URLs are set', () => {
    const chips = getAvailableWebSearchEngines('PROJ-1', {
      jiraSiteUrl: 'https://acme.atlassian.net',
      confluenceSiteUrl: 'https://acme.atlassian.net/wiki',
    });
    const jira = chips.find(c => c.key === 'jira');
    expect(jira?.disabled).toBeFalsy();
    expect(jira?.url).toContain('acme.atlassian.net');
  });

  it('produces one chip per registered engine key', () => {
    const chips = getAvailableWebSearchEngines('cats', {});
    expect(chips.map(c => c.key).sort()).toEqual(allWebSearchEngineKeys().sort());
  });
});

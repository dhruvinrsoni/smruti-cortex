import { describe, it, expect } from 'vitest';
import {
  BRAND_NAME,
  DB_NAME,
  INJECTED_FLAG,
  SortBy,
  SENSITIVE_SITE_PATTERNS,
  SENSITIVE_DOMAINS,
} from '../constants';

describe('constants', () => {
  describe('BRAND_NAME', () => {
    it('should be SmrutiCortex', () => {
      expect(BRAND_NAME).toBe('SmrutiCortex');
    });
  });

  describe('DB_NAME', () => {
    it('should be smruti_cortex_db', () => {
      expect(DB_NAME).toBe('smruti_cortex_db');
    });
  });

  describe('INJECTED_FLAG', () => {
    it('should be __smruti_cortex_injected', () => {
      expect(INJECTED_FLAG).toBe('__smruti_cortex_injected');
    });
  });
});

describe('SortBy', () => {
  it('should have BEST_MATCH value', () => {
    expect(SortBy.BEST_MATCH).toBe('best-match');
  });

  it('should have MOST_RECENT value', () => {
    expect(SortBy.MOST_RECENT).toBe('most-recent');
  });

  it('should have MOST_VISITED value', () => {
    expect(SortBy.MOST_VISITED).toBe('most-visited');
  });

  it('should have ALPHABETICAL value', () => {
    expect(SortBy.ALPHABETICAL).toBe('alphabetical');
  });

  it('should have exactly 4 values', () => {
    const values = Object.values(SortBy);
    expect(values).toHaveLength(4);
  });
});

describe('SENSITIVE_SITE_PATTERNS', () => {
  it('should be an array', () => {
    expect(Array.isArray(SENSITIVE_SITE_PATTERNS)).toBe(true);
  });

  it('should not be empty', () => {
    expect(SENSITIVE_SITE_PATTERNS.length).toBeGreaterThan(0);
  });

  it('should include "bank"', () => {
    expect(SENSITIVE_SITE_PATTERNS).toContain('bank');
  });

  it('should include "login"', () => {
    expect(SENSITIVE_SITE_PATTERNS).toContain('login');
  });

  it('should include "paypal"', () => {
    expect(SENSITIVE_SITE_PATTERNS).toContain('paypal');
  });

  it('should only contain strings', () => {
    for (const pattern of SENSITIVE_SITE_PATTERNS) {
      expect(typeof pattern).toBe('string');
    }
  });
});

describe('SENSITIVE_DOMAINS', () => {
  it('should be an array', () => {
    expect(Array.isArray(SENSITIVE_DOMAINS)).toBe(true);
  });

  it('should not be empty', () => {
    expect(SENSITIVE_DOMAINS.length).toBeGreaterThan(0);
  });

  it('should include chase.com', () => {
    expect(SENSITIVE_DOMAINS).toContain('chase.com');
  });

  it('should include paypal.com', () => {
    expect(SENSITIVE_DOMAINS).toContain('paypal.com');
  });

  it('should only contain strings', () => {
    for (const domain of SENSITIVE_DOMAINS) {
      expect(typeof domain).toBe('string');
    }
  });

  it('should only contain valid-looking domain names', () => {
    for (const domain of SENSITIVE_DOMAINS) {
      expect(domain).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/);
    }
  });
});

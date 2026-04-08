import { describe, it, expect } from 'vitest';
import {
  SENSITIVE_SITE_PATTERNS,
  SENSITIVE_DOMAINS,
} from '../constants';

describe('SENSITIVE_SITE_PATTERNS', () => {
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
});

describe('SENSITIVE_DOMAINS', () => {
  it('should not be empty', () => {
    expect(SENSITIVE_DOMAINS.length).toBeGreaterThan(0);
  });

  it('should include chase.com', () => {
    expect(SENSITIVE_DOMAINS).toContain('chase.com');
  });

  it('should include paypal.com', () => {
    expect(SENSITIVE_DOMAINS).toContain('paypal.com');
  });

  it('should only contain valid-looking domain names', () => {
    for (const domain of SENSITIVE_DOMAINS) {
      expect(domain).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/);
    }
  });
});

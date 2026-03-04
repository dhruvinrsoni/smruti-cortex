import { describe, it, expect } from 'vitest';
import { buildEmbeddingText } from '../embedding-text';

describe('buildEmbeddingText', () => {

  // === Basic assembly ===

  describe('basic assembly', () => {
    it('should join title, description, and cleaned URL with spaces', () => {
      const result = buildEmbeddingText({
        title: 'My Page',
        metaDescription: 'A great page',
        url: 'https://example.com/path',
      });
      expect(result).toBe('My Page A great page https://example.com/path');
    });

    it('should include only title when description is empty and URL is chrome://', () => {
      const result = buildEmbeddingText({
        title: 'Extensions',
        metaDescription: '',
        url: 'chrome://extensions/',
      });
      expect(result).toBe('Extensions');
    });

    it('should include title and URL when description is undefined', () => {
      const result = buildEmbeddingText({
        title: 'My Page',
        url: 'https://example.com/',
      });
      expect(result).toBe('My Page https://example.com/');
    });

    it('should return empty string when all inputs are empty', () => {
      const result = buildEmbeddingText({ title: '', url: '' });
      expect(result).toBe('');
    });

    it('should trim whitespace from each component', () => {
      const result = buildEmbeddingText({
        title: '  My Page  ',
        metaDescription: '  Description  ',
        url: 'https://example.com/',
      });
      expect(result).toBe('My Page Description https://example.com/');
    });
  });

  // === Title truncation ===

  describe('title handling', () => {
    it('should truncate title to 200 characters', () => {
      const longTitle = 'A'.repeat(250);
      const result = buildEmbeddingText({ title: longTitle, url: '' });
      expect(result.length).toBeLessThanOrEqual(200);
      expect(result).toBe('A'.repeat(200));
    });

    it('should pass through title shorter than 200 characters', () => {
      const result = buildEmbeddingText({ title: 'Short Title', url: '' });
      expect(result).toBe('Short Title');
    });

    it('should handle empty title', () => {
      const result = buildEmbeddingText({
        title: '',
        metaDescription: 'Only description',
        url: 'https://example.com/',
      });
      expect(result).toBe('Only description https://example.com/');
    });
  });

  // === Description truncation ===

  describe('description handling', () => {
    it('should truncate metaDescription to 300 characters', () => {
      const longDesc = 'D'.repeat(350);
      const result = buildEmbeddingText({
        title: '',
        metaDescription: longDesc,
        url: '',
      });
      expect(result.length).toBeLessThanOrEqual(300);
      expect(result).toBe('D'.repeat(300));
    });

    it('should handle undefined metaDescription', () => {
      const result = buildEmbeddingText({ title: 'Title', url: 'https://example.com/' });
      expect(result).toBe('Title https://example.com/');
    });

    it('should handle empty string metaDescription', () => {
      const result = buildEmbeddingText({
        title: 'Title',
        metaDescription: '',
        url: 'https://example.com/',
      });
      expect(result).toBe('Title https://example.com/');
    });
  });

  // === URL cleaning ===

  describe('URL cleaning', () => {
    it('should strip query parameters from URL', () => {
      const result = buildEmbeddingText({
        title: '',
        url: 'https://example.com/page?utm_source=twitter&ref=123',
      });
      expect(result).toBe('https://example.com/page');
    });

    it('should strip fragment/hash from URL', () => {
      const result = buildEmbeddingText({
        title: '',
        url: 'https://example.com/page#section-2',
      });
      expect(result).toBe('https://example.com/page');
    });

    it('should strip both query params and fragment', () => {
      const result = buildEmbeddingText({
        title: '',
        url: 'https://example.com/page?key=value#anchor',
      });
      expect(result).toBe('https://example.com/page');
    });

    it('should keep scheme, host, and pathname', () => {
      const result = buildEmbeddingText({
        title: '',
        url: 'https://docs.example.com/api/v2/users',
      });
      expect(result).toBe('https://docs.example.com/api/v2/users');
    });

    it('should truncate cleaned URL to 300 characters', () => {
      const longPath = '/segment'.repeat(50); // 400 chars
      const result = buildEmbeddingText({
        title: '',
        url: `https://example.com${longPath}`,
      });
      expect(result.length).toBeLessThanOrEqual(300);
    });

    it('should handle empty URL', () => {
      const result = buildEmbeddingText({ title: 'Title', url: '' });
      expect(result).toBe('Title');
    });
  });

  // === URL scheme skipping ===

  describe('URL scheme skipping', () => {
    it('should return empty for chrome:// URLs', () => {
      const result = buildEmbeddingText({ title: 'Extensions', url: 'chrome://extensions/' });
      expect(result).toBe('Extensions');
      expect(result).not.toContain('chrome://');
    });

    it('should return empty for chrome-extension:// URLs', () => {
      const result = buildEmbeddingText({
        title: 'Popup',
        url: 'chrome-extension://abcdef123/popup.html',
      });
      expect(result).toBe('Popup');
    });

    it('should return empty for about: URLs', () => {
      const result = buildEmbeddingText({ title: 'Blank', url: 'about:blank' });
      expect(result).toBe('Blank');
    });

    it('should return empty for data: URLs', () => {
      const result = buildEmbeddingText({
        title: 'Image',
        url: 'data:image/png;base64,iVBORw0KGgo=',
      });
      expect(result).toBe('Image');
    });

    it('should return empty for blob: URLs', () => {
      const result = buildEmbeddingText({
        title: 'Blob',
        url: 'blob:https://example.com/uuid-here',
      });
      expect(result).toBe('Blob');
    });

    it('should return empty for javascript: URLs', () => {
      const result = buildEmbeddingText({
        title: 'Link',
        url: 'javascript:void(0)',
      });
      expect(result).toBe('Link');
    });

    it('should be case-insensitive for scheme detection', () => {
      const result = buildEmbeddingText({ title: 'Test', url: 'CHROME://settings/' });
      expect(result).toBe('Test');
    });
  });

  // === Malformed URLs ===

  describe('malformed URLs', () => {
    it('should fallback to raw truncation for unparseable URLs', () => {
      const result = buildEmbeddingText({ title: '', url: 'not-a-valid-url' });
      expect(result).toBe('not-a-valid-url');
    });

    it('should truncate malformed URL to 300 characters', () => {
      const longGarbage = 'x'.repeat(400);
      const result = buildEmbeddingText({ title: '', url: longGarbage });
      expect(result.length).toBeLessThanOrEqual(300);
    });
  });

  // === Total length enforcement ===

  describe('total length enforcement', () => {
    it('should enforce 2000-char hard limit', () => {
      const result = buildEmbeddingText({
        title: 'T'.repeat(200),
        metaDescription: 'D'.repeat(300),
        url: 'https://example.com/' + 'p'.repeat(280),
      });
      expect(result.length).toBeLessThanOrEqual(2000);
    });

    it('should not truncate text under 2000 characters', () => {
      const result = buildEmbeddingText({
        title: 'Short Title',
        metaDescription: 'Short description',
        url: 'https://example.com/page',
      });
      expect(result).toBe('Short Title Short description https://example.com/page');
    });
  });

  // === Real-world cases ===

  describe('real-world cases', () => {
    it('should clean massive OAuth URL to just origin+path', () => {
      const oauthUrl = 'https://accounts.google.com/signin/oauth/id?' +
        'authuser=0&part=AJi8hAOr' + 'X'.repeat(500) +
        '&as=' + 'Y'.repeat(500) +
        '#fragment';
      const result = buildEmbeddingText({
        title: 'Sign in - Google Accounts',
        url: oauthUrl,
      });
      expect(result).toBe('Sign in - Google Accounts https://accounts.google.com/signin/oauth/id');
      expect(result).not.toContain('authuser');
      expect(result).not.toContain('#fragment');
    });

    it('should strip UTM tracking parameters', () => {
      const result = buildEmbeddingText({
        title: 'Article',
        url: 'https://blog.example.com/post?utm_source=twitter&utm_medium=social&utm_campaign=launch',
      });
      expect(result).toBe('Article https://blog.example.com/post');
    });

    it('should handle GitHub URL with query params', () => {
      const result = buildEmbeddingText({
        title: 'Issues',
        url: 'https://github.com/user/repo/issues?q=is%3Aissue+is%3Aopen&sort=updated',
      });
      expect(result).toBe('Issues https://github.com/user/repo/issues');
    });

    it('should handle localhost URLs normally', () => {
      const result = buildEmbeddingText({
        title: 'Dev Server',
        url: 'http://localhost:3000/dashboard?debug=true',
      });
      expect(result).toBe('Dev Server http://localhost:3000/dashboard');
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IndexedItem } from '../../../schema';

// === Mocks ===

vi.mock('../../../../core/logger', () => ({
  Logger: {
    info: vi.fn(), debug: vi.fn(), trace: vi.fn(), warn: vi.fn(), error: vi.fn(),
    forComponent: () => ({
      info: vi.fn(), debug: vi.fn(), trace: vi.fn(), warn: vi.fn(), error: vi.fn(),
    }),
  },
}));

const mockGetSetting = vi.fn();
vi.mock('../../../../core/settings', () => ({
  SettingsManager: { getSetting: (...args: unknown[]) => mockGetSetting(...args) },
}));

const mockGenerateEmbedding = vi.fn();
const mockIsCircuitBreakerOpen = vi.fn(() => false);
const mockCheckMemoryPressure = vi.fn(() => ({ ok: true, usedMB: 100, limitMB: 512 }));
vi.mock('../../../ollama-service', () => ({
  getOllamaService: () => ({ generateEmbedding: mockGenerateEmbedding }),
  getOllamaConfigFromSettings: async () => ({}),
  isCircuitBreakerOpen: () => mockIsCircuitBreakerOpen(),
  checkMemoryPressure: () => mockCheckMemoryPressure(),
}));

vi.mock('../../../embedding-text', () => ({
  buildEmbeddingText: vi.fn(() => 'mocked embedding text'),
}));

// === Helpers ===

function createMockItem(overrides?: Partial<IndexedItem>): IndexedItem {
  return {
    url: 'https://example.com',
    title: 'Test Page',
    hostname: 'example.com',
    visitCount: 1,
    lastVisit: Date.now(),
    tokens: ['test'],
    ...overrides,
  };
}

describe('embeddingScorer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-establish defaults (vi.restoreAllMocks resets mock implementations)
    mockIsCircuitBreakerOpen.mockReturnValue(false);
    mockCheckMemoryPressure.mockReturnValue({ ok: true, usedMB: 100, limitMB: 512 });
  });

  // Lazy import to ensure mocks are registered
  async function getModule() {
    return await import('../embedding-scorer');
  }

  describe('metadata', () => {
    it('should have name "semantic"', async () => {
      const { default: scorer } = await getModule();
      expect(scorer.name).toBe('semantic');
    });

    it('should have default weight of 0.0', async () => {
      const { default: scorer } = await getModule();
      expect(scorer.weight).toBe(0.0);
    });
  });

  describe('score()', () => {
    it('should return 0 when embeddingsEnabled is false', async () => {
      const { default: scorer } = await getModule();
      mockGetSetting.mockReturnValue(false);

      const item = createMockItem({ embedding: [1, 0, 0] });
      const result = scorer.score(item, 'test', [], { queryEmbedding: [1, 0, 0] });
      expect(result).toBe(0);
    });

    it('should return 0 when embeddingsEnabled is undefined', async () => {
      const { default: scorer } = await getModule();
      mockGetSetting.mockReturnValue(undefined);

      const item = createMockItem({ embedding: [1, 0, 0] });
      const result = scorer.score(item, 'test', [], { queryEmbedding: [1, 0, 0] });
      expect(result).toBe(0);
    });

    it('should return 0 when context has no queryEmbedding', async () => {
      const { default: scorer } = await getModule();
      mockGetSetting.mockReturnValue(true);

      const item = createMockItem({ embedding: [1, 0, 0] });
      const result = scorer.score(item, 'test', [], {});
      expect(result).toBe(0);
    });

    it('should return 0 when queryEmbedding is empty array', async () => {
      const { default: scorer } = await getModule();
      mockGetSetting.mockReturnValue(true);

      const item = createMockItem({ embedding: [1, 0, 0] });
      const result = scorer.score(item, 'test', [], { queryEmbedding: [] });
      expect(result).toBe(0);
    });

    it('should return 0 when item has no embedding', async () => {
      const { default: scorer } = await getModule();
      mockGetSetting.mockReturnValue(true);

      const item = createMockItem(); // no embedding
      const result = scorer.score(item, 'test', [], { queryEmbedding: [1, 0, 0] });
      expect(result).toBe(0);
    });

    it('should return 0 when item embedding is empty array', async () => {
      const { default: scorer } = await getModule();
      mockGetSetting.mockReturnValue(true);

      const item = createMockItem({ embedding: [] });
      const result = scorer.score(item, 'test', [], { queryEmbedding: [1, 0, 0] });
      expect(result).toBe(0);
    });

    it('should return high similarity for identical embeddings', async () => {
      const { default: scorer } = await getModule();
      mockGetSetting.mockReturnValue(true);

      const item = createMockItem({ embedding: [1, 0, 0] });
      const result = scorer.score(item, 'test', [], { queryEmbedding: [1, 0, 0] });
      expect(result).toBeCloseTo(1.0);
    });

    it('should return low similarity for dissimilar embeddings', async () => {
      const { default: scorer } = await getModule();
      mockGetSetting.mockReturnValue(true);

      const item = createMockItem({ embedding: [1, 0, 0] });
      const result = scorer.score(item, 'test', [], { queryEmbedding: [0, 1, 0] });
      expect(result).toBeCloseTo(0);
    });
  });

  describe('generateItemEmbedding()', () => {
    it('should return empty array when circuit breaker is open', async () => {
      const { generateItemEmbedding } = await getModule();
      mockIsCircuitBreakerOpen.mockReturnValue(true);

      const result = await generateItemEmbedding({ title: 'Test', url: 'https://example.com' });
      expect(result).toEqual([]);
    });

    it('should return empty array when memory pressure is too high', async () => {
      const { generateItemEmbedding } = await getModule();
      mockCheckMemoryPressure.mockReturnValue({ ok: false, usedMB: 600, limitMB: 512 });

      const result = await generateItemEmbedding({ title: 'Test', url: 'https://example.com' });
      expect(result).toEqual([]);
    });

    it('should return embedding on success', async () => {
      const { generateItemEmbedding } = await getModule();
      mockGenerateEmbedding.mockResolvedValue({
        success: true, embedding: [0.1, 0.2, 0.3], model: 'test', duration: 100,
      });

      const result = await generateItemEmbedding({ title: 'Test', url: 'https://example.com' });
      expect(result).toEqual([0.1, 0.2, 0.3]);
    });

    it('should return empty array when OllamaService returns failure', async () => {
      const { generateItemEmbedding } = await getModule();
      mockGenerateEmbedding.mockResolvedValue({
        success: false, embedding: [], model: 'test', duration: 100, error: 'Failed',
      });

      const result = await generateItemEmbedding({ title: 'Test', url: 'https://example.com' });
      expect(result).toEqual([]);
    });

    it('should return empty array when OllamaService throws', async () => {
      const { generateItemEmbedding } = await getModule();
      mockGenerateEmbedding.mockRejectedValue(new Error('Network error'));

      const result = await generateItemEmbedding({ title: 'Test', url: 'https://example.com' });
      expect(result).toEqual([]);
    });
  });
});

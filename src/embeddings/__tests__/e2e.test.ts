import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmbeddingRouter, DEFAULT_CONFIG } from '../index.js';

describe('E2E: Full Integration', () => {
  let router: EmbeddingRouter;

  beforeEach(() => {
    router = new EmbeddingRouter({
      config: DEFAULT_CONFIG,
      apiKeys: {
        anthropic: 'test-anthropic-key',
        openrouter: 'test-openrouter-key',
      },
    });

    // Mock successful API responses
    global.fetch = vi.fn().mockImplementation((url: string) => {
      const isOpenRouter = url.includes('openrouter.ai');

      return Promise.resolve({
        ok: true,
        json: async () => {
          if (isOpenRouter) {
            return {
              data: [
                {
                  embedding: Array.from({ length: 1536 }, () => Math.random()),
                },
              ],
            };
          } else {
            // Anthropic format
            return {
              embedding: Array.from({ length: 1024 }, () => Math.random()),
            };
          }
        },
      });
    });
  });

  it('should handle complete workflow: simple text', async () => {
    const result = await router.route({
      text: 'Hello world',
    });

    expect(result.tier).toBe('simple');
    expect(result.model).toBe('openai/text-embedding-3-small');
    expect(result.provider).toBe('openrouter');
    expect(result.cached).toBe(false);
    expect(result.embedding.length).toBeGreaterThan(0);
    expect(result.cost).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should handle complete workflow: medium text with caching', async () => {
    const text = 'This is a medium-length text that will be classified as mid-tier. '.repeat(5);

    // First request
    const first = await router.route({ text });
    expect(first.tier).toBe('mid');
    expect(first.model).toBe('openai/text-embedding-3-large');
    expect(first.cached).toBe(false);

    // Second request (should be cached)
    const second = await router.route({ text });
    expect(second.cached).toBe(true);
    expect(second.embedding).toEqual(first.embedding);
    expect(second.cost).toBe(0);

    // Verify metrics
    const metrics = router.getMetrics();
    expect(metrics.totalRequests).toBe(2);
    expect(metrics.cacheHits).toBe(1);
    expect(metrics.cacheMisses).toBe(1);
  });

  it('should handle complete workflow: complex text', async () => {
    const text = `
      This is a very long technical document that discusses advanced concepts in machine learning.
      Vector embeddings are dense numerical representations of text in high-dimensional space.
      They capture semantic meaning and enable similarity search operations.
    `.repeat(10);

    const result = await router.route({ text });

    expect(result.tier).toBe('complex');
    expect(result.model).toBe('cohere/cohere-embed-english-v3.0');
    expect(result.provider).toBe('openrouter');
  });

  it('should track comprehensive metrics across multiple requests', async () => {
    // Make various requests
    await router.route({ text: 'Short' });
    await router.route({ text: 'Short' }); // Cache hit
    await router.route({ text: 'A'.repeat(500) });
    await router.route({ text: 'B'.repeat(1500) });

    const metrics = router.getMetrics();

    expect(metrics.totalRequests).toBe(4);
    expect(metrics.cacheHits).toBe(1);
    expect(metrics.cacheMisses).toBe(3);
    expect(metrics.totalCost).toBeGreaterThan(0);
    expect(metrics.requestsByTier.simple).toBeGreaterThan(0);
    expect(metrics.averageDurationMs).toBeGreaterThanOrEqual(0);
    expect(Object.keys(metrics.costByModel).length).toBeGreaterThan(0);
  });

  it('should handle explicit tier and model overrides', async () => {
    // Override to use complex tier for short text
    const result = await router.route({
      text: 'Short',
      options: {
        tier: 'complex',
      },
    });

    expect(result.tier).toBe('complex');
    expect(result.model).toBe('cohere/cohere-embed-english-v3.0');
  });

  it('should handle model hints', async () => {
    const result = await router.route({
      text: 'Test',
      options: {
        modelHint: 'openai/text-embedding-3-large',
      },
    });

    expect(result.model).toBe('openai/text-embedding-3-large');
  });

  it('should maintain cache across multiple tiers', async () => {
    const shortText = 'Hello';
    const longText = 'A'.repeat(1500);

    await router.route({ text: shortText });
    await router.route({ text: longText });

    expect(router.getCacheSize()).toBe(2);

    // Cached requests
    await router.route({ text: shortText });
    await router.route({ text: longText });

    const metrics = router.getMetrics();
    expect(metrics.cacheHits).toBe(2);
  });

  it('should clear cache and reset metrics independently', async () => {
    await router.route({ text: 'Test 1' });
    await router.route({ text: 'Test 1' }); // Cache hit

    expect(router.getCacheSize()).toBe(1);
    expect(router.getMetrics().totalRequests).toBe(2);

    router.clearCache();
    expect(router.getCacheSize()).toBe(0);
    expect(router.getMetrics().totalRequests).toBe(2); // Metrics unchanged

    router.resetMetrics();
    expect(router.getMetrics().totalRequests).toBe(0);
  });

  it('should handle API errors gracefully', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    });

    await expect(router.route({ text: 'Test' })).rejects.toThrow(
      'OpenRouter API error: 429 Too Many Requests',
    );
  });
});

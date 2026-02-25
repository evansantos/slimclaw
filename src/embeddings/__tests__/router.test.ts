import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmbeddingRouter } from '../router.js';
import type { EmbeddingConfig } from '../config/types.js';

const TEST_CONFIG: EmbeddingConfig = {
  enabled: true,
  routing: {
    tiers: {
      simple: 'openai/text-embedding-3-small',
      mid: 'openai/text-embedding-3-large',
      complex: 'cohere/cohere-embed-english-v3.0',
    },
    tierProviders: {
      'openai/*': 'openrouter',
      'cohere/*': 'openrouter',
      'anthropic/*': 'anthropic',
    },
  },
  caching: {
    enabled: true,
    ttlMs: 60000,
    maxSize: 100,
  },
  metrics: {
    enabled: true,
    trackCosts: true,
  },
};

describe('EmbeddingRouter', () => {
  let router: EmbeddingRouter;

  beforeEach(() => {
    router = new EmbeddingRouter({
      config: TEST_CONFIG,
      apiKeys: {
        anthropic: 'test-anthropic-key',
        openrouter: 'test-openrouter-key',
      },
    });

    // Mock fetch for all tests
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
          },
        ],
      }),
    });
  });

  it('should route short text to simple tier', async () => {
    const result = await router.route({
      text: 'Hello world',
    });

    expect(result.tier).toBe('simple');
    expect(result.model).toBe('openai/text-embedding-3-small');
    expect(result.provider).toBe('openrouter');
  });

  it('should route medium text to mid tier', async () => {
    const mediumText = 'a'.repeat(500);
    const result = await router.route({
      text: mediumText,
    });

    expect(result.tier).toBe('mid');
    expect(result.model).toBe('openai/text-embedding-3-large');
  });

  it('should route long text to complex tier', async () => {
    const longText = 'a'.repeat(1500);
    const result = await router.route({
      text: longText,
    });

    expect(result.tier).toBe('complex');
    expect(result.model).toBe('cohere/cohere-embed-english-v3.0');
  });

  it('should respect explicit tier override', async () => {
    const result = await router.route({
      text: 'Short text',
      options: {
        tier: 'complex',
      },
    });

    expect(result.tier).toBe('complex');
    expect(result.model).toBe('cohere/cohere-embed-english-v3.0');
  });

  it('should respect explicit model hint', async () => {
    const result = await router.route({
      text: 'Test',
      options: {
        modelHint: 'openai/text-embedding-3-large',
      },
    });

    expect(result.model).toBe('openai/text-embedding-3-large');
  });

  it('should use cache for duplicate requests', async () => {
    const text = 'Test caching';

    const first = await router.route({ text });
    expect(first.cached).toBe(false);

    const second = await router.route({ text });
    expect(second.cached).toBe(true);
    expect(second.embedding).toEqual(first.embedding);

    // Should only make one API call
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should track metrics correctly', async () => {
    await router.route({ text: 'Test 1' });
    await router.route({ text: 'Test 1' }); // Cache hit
    await router.route({ text: 'Test 2' });

    const metrics = router.getMetrics();
    expect(metrics.totalRequests).toBe(3);
    expect(metrics.cacheHits).toBe(1);
    expect(metrics.cacheMisses).toBe(2);
  });

  it('should calculate costs correctly', async () => {
    await router.route({ text: 'Test' });

    const metrics = router.getMetrics();
    expect(metrics.totalCost).toBeGreaterThan(0);
    expect(metrics.costByModel['openai/text-embedding-3-small']).toBeGreaterThan(0);
  });

  it('should include duration in response', async () => {
    const result = await router.route({ text: 'Test' });

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.durationMs).toBe('number');
  });

  it('should return valid embedding array', async () => {
    const result = await router.route({ text: 'Test' });

    expect(Array.isArray(result.embedding)).toBe(true);
    expect(result.embedding.length).toBeGreaterThan(0);
    expect(result.embedding.every((n) => typeof n === 'number')).toBe(true);
  });

  it('should handle API errors gracefully', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(router.route({ text: 'Test' })).rejects.toThrow();
  });

  it('should clear cache', async () => {
    const text = 'Test';
    await router.route({ text });

    router.clearCache();

    const result = await router.route({ text });
    expect(result.cached).toBe(false);
  });

  it('should reset metrics', async () => {
    await router.route({ text: 'Test' });

    router.resetMetrics();

    const metrics = router.getMetrics();
    expect(metrics.totalRequests).toBe(0);
  });

  // Task 2: Retry logic tests
  it('should retry on transient failure', async () => {
    let attempts = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      attempts++;
      if (attempts === 1) {
        // First attempt fails
        return {
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
        };
      }
      // Second attempt succeeds
      return {
        ok: true,
        json: async () => ({
          data: [
            {
              embedding: [0.1, 0.2, 0.3],
            },
          ],
        }),
      };
    });

    const result = await router.route({ text: 'Test' });

    expect(result).toBeDefined();
    expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
    expect(attempts).toBe(2); // Called twice
  });

  it('should throw after max retries', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    });

    await expect(router.route({ text: 'Test' })).rejects.toThrow(/Service Unavailable|503/);

    // Should have tried 3 times (maxRetries = 3)
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('should apply exponential backoff between retries', async () => {
    const timestamps: number[] = [];
    let attempts = 0;

    global.fetch = vi.fn().mockImplementation(async () => {
      timestamps.push(Date.now());
      attempts++;
      if (attempts < 3) {
        return {
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
        };
      }
      return {
        ok: true,
        json: async () => ({
          data: [{ embedding: [0.1] }],
        }),
      };
    });

    await router.route({ text: 'Test' });

    // Check delays between attempts (should be ~1s, ~2s)
    // Allow for some timing variance
    expect(attempts).toBe(3);
    if (timestamps.length >= 2) {
      const delay1 = timestamps[1] - timestamps[0];
      expect(delay1).toBeGreaterThanOrEqual(900); // ~1s
    }
  });

  it('should include provider and attempt info in error messages', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    try {
      await router.route({ text: 'Test' });
      expect.fail('Should have thrown an error');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('openrouter'); // Provider name
      expect(message.toLowerCase()).toMatch(/500|internal server error/);
    }
  });

  it('should not retry on client errors (4xx)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    await expect(router.route({ text: 'Test' })).rejects.toThrow();

    // Should only try once for 4xx errors
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

/**
 * Embeddings Dashboard Route Tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setupRoutes } from '../routes';
import type { MetricsCollector } from '../../metrics/index.js';
import { EmbeddingMetricsTracker } from '../../embeddings/metrics/embedding-metrics.js';

describe('Embeddings Dashboard Routes', () => {
  let mockCollector: MetricsCollector;
  let metricsTracker: EmbeddingMetricsTracker;

  beforeEach(() => {
    mockCollector = {
      getAll: () => [],
      getRecent: () => [],
      getStats: () => ({
        totalRequests: 0,
        averageOriginalTokens: 0,
        averageOptimizedTokens: 0,
        averageTokensSaved: 0,
        averageSavingsPercent: 0,
        windowingUsagePercent: 0,
        cacheUsagePercent: 0,
        classificationDistribution: { simple: 0, mid: 0, complex: 0, reasoning: 0 },
        routingUsagePercent: 0,
        modelDowngradePercent: 0,
        averageLatencyMs: 0,
        totalCostSaved: 0,
        averageRoutingSavings: 0,
        routingTierDistribution: { simple: 0, mid: 0, complex: 0, reasoning: 0 },
        modelUpgradePercent: 0,
        combinedSavingsPercent: 0,
        totalCachedTokens: 0,
        totalFreshTokens: 0,
        averageCacheSavingsPercent: 0,
      }),
      getStatus: () => ({
        enabled: true,
        totalProcessed: 0,
        bufferSize: 0,
        ringSize: 100,
        pendingFlush: 0,
      }),
    } as unknown as MetricsCollector;

    // Create real metrics tracker
    metricsTracker = new EmbeddingMetricsTracker({
      enabled: true,
      trackCosts: true,
    });
  });

  it('should return real embedding metrics from tracker', async () => {
    // Record some test data
    metricsTracker.recordRequest('voyage-3', 'simple', 0.0001, 150, false);
    metricsTracker.recordRequest('voyage-3', 'mid', 0.0002, 200, true);
    metricsTracker.recordRequest('text-embedding-004', 'complex', 0.0003, 300, false);

    const app = setupRoutes(mockCollector, metricsTracker);

    const req = new Request('http://localhost/api/embeddings/metrics');
    const res = await app.fetch(req);

    expect(res.status).toBe(200);

    const data = await res.json();

    // Verify structure
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('totalRequests');
    expect(data).toHaveProperty('cacheHits');
    expect(data).toHaveProperty('cacheMisses');
    expect(data).toHaveProperty('totalCost');
    expect(data).toHaveProperty('costByModel');
    expect(data).toHaveProperty('requestsByTier');
    expect(data).toHaveProperty('averageDurationMs');
    expect(data).toHaveProperty('cacheHitRate');

    // Verify real data (not zeros)
    expect(data.totalRequests).toBe(3);
    expect(data.cacheHits).toBe(1);
    expect(data.cacheMisses).toBe(2);
    expect(data.totalCost).toBeGreaterThan(0);
    expect(data.averageDurationMs).toBeGreaterThan(0);

    // Verify tier distribution
    expect(data.requestsByTier.simple).toBe(1);
    expect(data.requestsByTier.mid).toBe(1);
    expect(data.requestsByTier.complex).toBe(1);

    // Verify cache hit rate calculation
    expect(data.cacheHitRate).toBeCloseTo(33.33, 1);
  });

  it('should handle empty metrics gracefully', async () => {
    const app = setupRoutes(mockCollector, metricsTracker);

    const req = new Request('http://localhost/api/embeddings/metrics');
    const res = await app.fetch(req);

    expect(res.status).toBe(200);

    const data = await res.json();

    expect(data.totalRequests).toBe(0);
    expect(data.cacheHits).toBe(0);
    expect(data.cacheMisses).toBe(0);
    expect(data.totalCost).toBe(0);
    expect(data.averageDurationMs).toBe(0);
    expect(data.cacheHitRate).toBe(0);
  });

  it('should handle missing tracker gracefully', async () => {
    // Pass undefined tracker
    const app = setupRoutes(mockCollector);

    const req = new Request('http://localhost/api/embeddings/metrics');
    const res = await app.fetch(req);

    expect(res.status).toBe(200);

    const data = await res.json();

    // Should return zeros when no tracker
    expect(data.totalRequests).toBe(0);
    expect(data.cacheHits).toBe(0);
  });
});

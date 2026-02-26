import { describe, it, expect, beforeEach } from 'vitest';
import { EmbeddingMetricsTracker } from '../metrics/embedding-metrics.js';
import type { ComplexityTier } from '../config/types.js';

describe('EmbeddingMetricsTracker', () => {
  let tracker: EmbeddingMetricsTracker;

  beforeEach(() => {
    tracker = new EmbeddingMetricsTracker({ enabled: true, trackCosts: true });
  });

  it('should track cache hits and misses', () => {
    tracker.recordCacheHit();
    tracker.recordCacheHit();
    tracker.recordCacheMiss();

    const metrics = tracker.getMetrics();
    expect(metrics.cacheHits).toBe(2);
    expect(metrics.cacheMisses).toBe(1);
    expect(metrics.totalRequests).toBe(3);
  });

  it('should track costs by model', () => {
    tracker.recordRequest('model-a', 'simple', 0.001, 100, false);
    tracker.recordRequest('model-a', 'mid', 0.002, 150, false);
    tracker.recordRequest('model-b', 'simple', 0.003, 120, false);

    const metrics = tracker.getMetrics();
    expect(metrics.totalCost).toBeCloseTo(0.006, 5);
    expect(metrics.costByModel['model-a']).toBeCloseTo(0.003, 5);
    expect(metrics.costByModel['model-b']).toBeCloseTo(0.003, 5);
  });

  it('should track requests by tier', () => {
    tracker.recordRequest('model', 'simple', 0.001, 100, false);
    tracker.recordRequest('model', 'simple', 0.001, 100, false);
    tracker.recordRequest('model', 'mid', 0.002, 150, false);
    tracker.recordRequest('model', 'complex', 0.003, 200, false);

    const metrics = tracker.getMetrics();
    expect(metrics.requestsByTier.simple).toBe(2);
    expect(metrics.requestsByTier.mid).toBe(1);
    expect(metrics.requestsByTier.complex).toBe(1);
  });

  it('should calculate average duration', () => {
    tracker.recordRequest('model', 'simple', 0.001, 100, false);
    tracker.recordRequest('model', 'mid', 0.002, 200, false);
    tracker.recordRequest('model', 'complex', 0.003, 300, false);

    const metrics = tracker.getMetrics();
    expect(metrics.averageDurationMs).toBeCloseTo(200, 0);
  });

  it('should handle zero requests gracefully', () => {
    const metrics = tracker.getMetrics();
    expect(metrics.totalRequests).toBe(0);
    expect(metrics.totalCost).toBe(0);
    expect(metrics.averageDurationMs).toBe(0);
  });

  it('should differentiate cached vs non-cached requests', () => {
    tracker.recordRequest('model', 'simple', 0.001, 100, false); // Not cached
    tracker.recordRequest('model', 'simple', 0.0, 5, true); // Cached (no cost, fast)

    const metrics = tracker.getMetrics();
    expect(metrics.cacheHits).toBe(1);
    expect(metrics.cacheMisses).toBe(1);
    expect(metrics.totalCost).toBeCloseTo(0.001, 5); // Only the non-cached request
  });

  it('should reset metrics', () => {
    tracker.recordRequest('model', 'simple', 0.001, 100, false);
    tracker.recordCacheHit();

    let metrics = tracker.getMetrics();
    expect(metrics.totalRequests).toBe(2);

    tracker.reset();

    metrics = tracker.getMetrics();
    expect(metrics.totalRequests).toBe(0);
    expect(metrics.cacheHits).toBe(0);
    expect(metrics.cacheMisses).toBe(0);
    expect(metrics.totalCost).toBe(0);
    expect(Object.keys(metrics.costByModel)).toHaveLength(0);
  });

  it('should not track when disabled', () => {
    const disabledTracker = new EmbeddingMetricsTracker({ enabled: false, trackCosts: false });

    disabledTracker.recordRequest('model', 'simple', 0.001, 100, false);
    disabledTracker.recordCacheHit();

    const metrics = disabledTracker.getMetrics();
    expect(metrics.totalRequests).toBe(0);
    expect(metrics.cacheHits).toBe(0);
  });

  it('should not track costs when trackCosts is false', () => {
    const noCostTracker = new EmbeddingMetricsTracker({ enabled: true, trackCosts: false });

    noCostTracker.recordRequest('model', 'simple', 0.001, 100, false);

    const metrics = noCostTracker.getMetrics();
    expect(metrics.totalCost).toBe(0);
    expect(Object.keys(metrics.costByModel)).toHaveLength(0);
  });

  it('should accumulate costs correctly over multiple requests', () => {
    tracker.recordRequest('model-a', 'simple', 0.0001, 100, false);
    tracker.recordRequest('model-a', 'simple', 0.0002, 100, false);
    tracker.recordRequest('model-b', 'mid', 0.0003, 150, false);

    const metrics = tracker.getMetrics();
    expect(metrics.totalCost).toBeCloseTo(0.0006, 5);
    expect(metrics.costByModel['model-a']).toBeCloseTo(0.0003, 5);
    expect(metrics.costByModel['model-b']).toBeCloseTo(0.0003, 5);
  });
});

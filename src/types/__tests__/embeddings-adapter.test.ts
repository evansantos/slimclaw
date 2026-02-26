/**
 * Tests for EmbeddingMetricsAdapter type
 */
import { describe, it, expect } from 'vitest';
import type { EmbeddingMetricsAdapter } from '../embeddings-adapter.js';
import type { EmbeddingMetrics } from '../../embeddings/config/types.js';

describe('EmbeddingMetricsAdapter', () => {
  it('should type-check a valid adapter with all methods', () => {
    const mockMetrics: EmbeddingMetrics = {
      totalRequests: 100,
      cacheHits: 50,
      cacheMisses: 50,
      totalCost: 0.05,
      costByModel: { 'voyage-3-lite': 0.05 },
      requestsByTier: { simple: 40, mid: 40, complex: 20 },
      averageDurationMs: 123.45,
    };

    const adapter: EmbeddingMetricsAdapter = {
      getMetrics: () => mockMetrics,
      reset: () => {
        /* no-op for test */
      },
    };

    expect(adapter.getMetrics()).toEqual(mockMetrics);
    expect(typeof adapter.reset).toBe('function');
  });

  it('should type-check a valid adapter without reset method', () => {
    const mockMetrics: EmbeddingMetrics = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalCost: 0,
      costByModel: {},
      requestsByTier: { simple: 0, mid: 0, complex: 0 },
      averageDurationMs: 0,
    };

    const adapter: EmbeddingMetricsAdapter = {
      getMetrics: () => mockMetrics,
    };

    expect(adapter.getMetrics()).toEqual(mockMetrics);
    expect(adapter.reset).toBeUndefined();
  });

  it('should be compatible with EmbeddingRouter wrapper pattern', () => {
    // Simulate the pattern used in src/index.ts
    const mockRouter = {
      getMetrics: (): EmbeddingMetrics => ({
        totalRequests: 42,
        cacheHits: 21,
        cacheMisses: 21,
        totalCost: 0.01,
        costByModel: {},
        requestsByTier: { simple: 42, mid: 0, complex: 0 },
        averageDurationMs: 50,
      }),
      resetMetrics: () => {
        /* no-op */
      },
    };

    // This is the pattern from index.ts lines 1323-1334
    const wrappedAdapter: EmbeddingMetricsAdapter = {
      getMetrics: () => mockRouter.getMetrics(),
      reset: () => mockRouter.resetMetrics(),
    };

    const metrics = wrappedAdapter.getMetrics();
    expect(metrics.totalRequests).toBe(42);
    expect(metrics.cacheHits).toBe(21);
  });
});

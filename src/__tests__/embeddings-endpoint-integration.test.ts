/**
 * Integration Tests: EmbeddingRouter → Dashboard API Endpoints
 * Verifies that dashboard endpoints return real data from EmbeddingRouter
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupRoutes } from '../../src/dashboard/routes.js';
import type { MetricsCollector } from '../../src/metrics/index.js';
import { getEmbeddingRouter, resetEmbeddingRouter } from '../../src/index.js';
import slimclawPlugin from '../../src/index.js';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';

describe('Embeddings Plugin → Dashboard Integration', () => {
  let mockApi: OpenClawPluginApi;

  beforeEach(() => {
    resetEmbeddingRouter();
    process.env.ANTHROPIC_API_KEY = 'test-key-embeddings';

    mockApi = {
      logger: {
        info: () => {},
        debug: () => {},
        error: () => {},
      },
      on: () => {},
      registerCommand: () => {},
      registerProvider: () => {},
      registerService: () => {},
      config: {},
      pluginConfig: {
        enabled: true,
        embeddings: {
          enabled: true,
          routing: {
            tiers: {
              simple: 'anthropic/claude-3-haiku-20240307',
              mid: 'anthropic/claude-3-haiku-20240307',
              complex: 'anthropic/claude-3-haiku-20240307',
            },
            tierProviders: {
              'anthropic/*': 'anthropic',
            },
          },
          caching: {
            enabled: false,
            ttlMs: 0,
            maxSize: 0,
          },
          metrics: {
            enabled: true,
            trackCosts: true,
          },
        },
        dashboard: {
          enabled: false, // Don't start server
        },
      },
    } as unknown as OpenClawPluginApi;
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    resetEmbeddingRouter();
  });

  it('should return embeddings metrics from dashboard endpoint', async () => {
    // Arrange
    slimclawPlugin.register(mockApi);
    const router = getEmbeddingRouter();
    expect(router).not.toBeNull();

    // Create mock metrics collector
    const mockCollector: MetricsCollector = {
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
    };

    // Create embedding metrics tracker from router
    const embeddingMetrics = {
      getMetrics: () => router!.getMetrics(),
      recordRequest: () => {},
      recordCacheHit: () => {},
      recordCacheMiss: () => {},
      reset: () => router!.resetMetrics(),
    };

    // Setup routes with both collectors
    const app = setupRoutes(mockCollector, embeddingMetrics);

    // Act - call the embeddings metrics endpoint
    const response = await app.request('/api/embeddings/metrics');

    // Assert
    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toBeDefined();
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('totalRequests');
    expect(data).toHaveProperty('cacheHits');
    expect(data).toHaveProperty('cacheMisses');
    expect(data).toHaveProperty('totalCost');
    expect(data).toHaveProperty('costByModel');
    expect(data).toHaveProperty('requestsByTier');
    expect(data).toHaveProperty('averageDurationMs');
    expect(data).toHaveProperty('cacheHitRate');
  });

  it('should return zero metrics when no embedding requests made', async () => {
    // Arrange
    slimclawPlugin.register(mockApi);
    const router = getEmbeddingRouter();
    expect(router).not.toBeNull();

    const mockCollector: MetricsCollector = {
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
    };

    const embeddingMetrics = {
      getMetrics: () => router!.getMetrics(),
      recordRequest: () => {},
      recordCacheHit: () => {},
      recordCacheMiss: () => {},
      reset: () => router!.resetMetrics(),
    };

    const app = setupRoutes(mockCollector, embeddingMetrics);

    // Act
    const response = await app.request('/api/embeddings/metrics');
    const data = await response.json();

    // Assert - should have zero counts
    expect(data.totalRequests).toBe(0);
    expect(data.cacheHits).toBe(0);
    expect(data.cacheMisses).toBe(0);
    expect(data.totalCost).toBe(0);
    expect(data.cacheHitRate).toBe(0);
  });

  it('should handle missing embeddingMetrics gracefully', async () => {
    // Arrange - don't initialize router
    mockApi.pluginConfig = {
      ...mockApi.pluginConfig,
      embeddings: {
        enabled: false,
        routing: { tiers: {}, tierProviders: {} },
        caching: { enabled: false, ttlMs: 0, maxSize: 0 },
        metrics: { enabled: false, trackCosts: false },
      },
    };

    slimclawPlugin.register(mockApi);
    expect(getEmbeddingRouter()).toBeNull();

    const mockCollector: MetricsCollector = {
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
    };

    // Setup routes without embedding metrics
    const app = setupRoutes(mockCollector, undefined);

    // Act
    const response = await app.request('/api/embeddings/metrics');

    // Assert - should still return valid response with zeros
    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.totalRequests).toBe(0);
    expect(data.cacheHits).toBe(0);
    expect(data.cacheMisses).toBe(0);
  });

  it('should calculate cacheHitRate correctly when requests exist', async () => {
    // This test verifies the dashboard formula for cache hit rate
    // Arrange
    slimclawPlugin.register(mockApi);
    const router = getEmbeddingRouter();
    expect(router).not.toBeNull();

    const mockCollector: MetricsCollector = {
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
    };

    // Mock metrics with some requests
    const fakeMetrics = {
      totalRequests: 10,
      cacheHits: 7,
      cacheMisses: 3,
      totalCost: 0.05,
      costByModel: {},
      requestsByTier: { simple: 10, mid: 0, complex: 0 },
      averageDurationMs: 150,
    };

    const embeddingMetrics = {
      getMetrics: () => fakeMetrics,
      recordRequest: () => {},
      recordCacheHit: () => {},
      recordCacheMiss: () => {},
      reset: () => {},
    };

    const app = setupRoutes(mockCollector, embeddingMetrics);

    // Act
    const response = await app.request('/api/embeddings/metrics');
    const data = await response.json();

    // Assert
    expect(data.cacheHitRate).toBe(70); // 7/10 * 100 = 70%
  });
});

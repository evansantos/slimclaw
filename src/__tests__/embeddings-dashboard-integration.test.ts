/**
 * Integration test: EmbeddingRouter → SlimClaw plugin → Dashboard
 * Verifies that EmbeddingRouter is instantiated and metrics flow to dashboard
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import slimclawPlugin, { getEmbeddingRouter, resetEmbeddingRouter } from '../index.js';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { createDashboard } from '../dashboard/index.js';

describe('EmbeddingRouter → Dashboard Integration', () => {
  let mockApi: OpenClawPluginApi;
  let logMessages: string[] = [];

  beforeEach(() => {
    // Reset module state
    resetEmbeddingRouter();

    // Set up API key for embedding router
    process.env.ANTHROPIC_API_KEY = 'test-key-12345';

    logMessages = [];

    // Mock OpenClaw plugin API
    mockApi = {
      logger: {
        info: vi.fn((msg: string) => logMessages.push(msg)),
        debug: vi.fn(),
        error: vi.fn(),
      },
      on: vi.fn(),
      registerCommand: vi.fn(),
      registerProvider: vi.fn(),
      registerService: vi.fn(),
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
          enabled: false, // Don't actually start server
        },
      },
    } as unknown as OpenClawPluginApi;
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('should instantiate EmbeddingRouter when embeddings.enabled = true', () => {
    // Act
    slimclawPlugin.register(mockApi);

    // Assert - check logs for initialization message
    expect(logMessages).toContain('[SlimClaw] EmbeddingRouter initialized');
  });

  it('should NOT instantiate EmbeddingRouter when embeddings.enabled = false', () => {
    // Arrange
    mockApi.pluginConfig = {
      ...mockApi.pluginConfig,
      embeddings: {
        enabled: false,
        routing: { tiers: {}, tierProviders: {} },
        caching: { enabled: false, ttlMs: 0, maxSize: 0 },
        metrics: { enabled: false, trackCosts: false },
      },
    };

    // Act
    slimclawPlugin.register(mockApi);

    // Assert
    const hasInitMessage = logMessages.some((msg) => msg.includes('EmbeddingRouter initialized'));
    expect(hasInitMessage).toBe(false);
  });

  it('should NOT instantiate EmbeddingRouter when no API keys present', () => {
    // Arrange
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    // Act
    slimclawPlugin.register(mockApi);

    // Assert
    expect(logMessages).toContain(
      '[SlimClaw] EmbeddingRouter not initialized (no API keys or disabled)',
    );
  });

  it('should export EmbeddingRouter instance for dashboard access', () => {
    // This test verifies the MAIN GAP: router must be globally accessible
    // Act
    slimclawPlugin.register(mockApi);

    // Assert - we should be able to import getEmbeddingRouter() function
    // and get the router instance
    expect(getEmbeddingRouter).toBeDefined();

    const router = getEmbeddingRouter();
    expect(router).not.toBeNull();
    expect(router).toHaveProperty('route');
    expect(router).toHaveProperty('getMetrics');
  });

  it('should provide EmbeddingRouter metrics to dashboard', () => {
    // Arrange
    slimclawPlugin.register(mockApi);
    const router = getEmbeddingRouter();

    expect(router).not.toBeNull();

    // Act - get metrics via router
    const metrics = router!.getMetrics();

    // Assert - metrics should have correct shape for dashboard
    expect(metrics).toBeDefined();
    expect(metrics).toHaveProperty('totalRequests');
    expect(metrics).toHaveProperty('cacheHits');
    expect(metrics).toHaveProperty('cacheMisses');
    expect(metrics).toHaveProperty('totalCost');
    expect(metrics).toHaveProperty('costByModel');
    expect(metrics).toHaveProperty('requestsByTier');
    expect(metrics).toHaveProperty('averageDurationMs');
  });

  it('should return null from getEmbeddingRouter() when router not initialized', () => {
    // Arrange - disable embeddings
    mockApi.pluginConfig = {
      ...mockApi.pluginConfig,
      embeddings: {
        enabled: false,
        routing: { tiers: {}, tierProviders: {} },
        caching: { enabled: false, ttlMs: 0, maxSize: 0 },
        metrics: { enabled: false, trackCosts: false },
      },
    };

    // Act
    slimclawPlugin.register(mockApi);
    const router = getEmbeddingRouter();

    // Assert
    expect(router).toBeNull();
  });
});

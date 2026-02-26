/**
 * Integration tests for EmbeddingRouter plugin integration
 * Tests that EmbeddingRouter is properly instantiated and wired to SlimClaw plugin
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { EmbeddingRouter } from '../index.js';
import { createEmbeddingRouter } from '../../config/embeddings.js';
import type { SlimClawConfig } from '../../config.js';
import { DEFAULT_CONFIG } from '../../config.js';

describe('EmbeddingRouter Plugin Integration', () => {
  beforeEach(() => {
    // Reset environment
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
  });

  describe('createEmbeddingRouter factory', () => {
    it('should create EmbeddingRouter instance with valid config and API keys', () => {
      // Arrange
      process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
      const config: SlimClawConfig = {
        ...DEFAULT_CONFIG,
        embeddings: {
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
            ttlMs: 604800000,
            maxSize: 1000,
          },
          metrics: {
            enabled: true,
            trackCosts: true,
          },
        },
      };

      // Act
      const router = createEmbeddingRouter(config);

      // Assert
      expect(router).toBeDefined();
      expect(router).toHaveProperty('route');
      expect(router).toHaveProperty('getMetrics');
    });

    it('should return null when embeddings disabled', () => {
      // Arrange
      const config: SlimClawConfig = {
        ...DEFAULT_CONFIG,
        embeddings: {
          enabled: false,
          routing: {
            tiers: {
              simple: 'openai/text-embedding-3-small',
              mid: 'openai/text-embedding-3-large',
              complex: 'cohere/cohere-embed-english-v3.0',
            },
            tierProviders: {},
          },
          caching: {
            enabled: false,
            ttlMs: 0,
            maxSize: 0,
          },
          metrics: {
            enabled: false,
            trackCosts: false,
          },
        },
      };

      // Act
      const router = createEmbeddingRouter(config);

      // Assert
      expect(router).toBeNull();
    });

    it('should return null when no API keys available', () => {
      // Arrange - no env vars set
      const config: SlimClawConfig = {
        ...DEFAULT_CONFIG,
        embeddings: {
          enabled: true,
          routing: {
            tiers: {
              simple: 'openai/text-embedding-3-small',
              mid: 'openai/text-embedding-3-large',
              complex: 'cohere/cohere-embed-english-v3.0',
            },
            tierProviders: {
              'openai/*': 'openrouter',
            },
          },
          caching: {
            enabled: true,
            ttlMs: 604800000,
            maxSize: 1000,
          },
          metrics: {
            enabled: true,
            trackCosts: true,
          },
        },
      };

      // Act
      const router = createEmbeddingRouter(config);

      // Assert
      expect(router).toBeNull();
    });

    it('should use ANTHROPIC_API_KEY from environment', () => {
      // Arrange
      const testKey = 'sk-ant-test-12345';
      process.env.ANTHROPIC_API_KEY = testKey;
      const config: SlimClawConfig = {
        ...DEFAULT_CONFIG,
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
            enabled: true,
            ttlMs: 604800000,
            maxSize: 1000,
          },
          metrics: {
            enabled: true,
            trackCosts: true,
          },
        },
      };

      // Act
      const router = createEmbeddingRouter(config);

      // Assert
      expect(router).not.toBeNull();
      expect(router).toHaveProperty('route');
    });
  });

  describe('Dashboard integration', () => {
    it('should expose metrics via getMetrics() with correct shape', () => {
      // Arrange
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const config: SlimClawConfig = {
        ...DEFAULT_CONFIG,
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
            enabled: false, // Disable cache for predictable test
            ttlMs: 0,
            maxSize: 0,
          },
          metrics: {
            enabled: true,
            trackCosts: true,
          },
        },
      };

      const router = createEmbeddingRouter(config);
      expect(router).not.toBeNull();

      // Act
      const metrics = router!.getMetrics();

      // Assert - check that metrics have the expected shape for dashboard
      expect(metrics).toBeDefined();
      expect(metrics).toHaveProperty('totalRequests');
      expect(metrics).toHaveProperty('cacheHits');
      expect(metrics).toHaveProperty('cacheMisses');
      expect(metrics).toHaveProperty('totalCost');
      expect(metrics).toHaveProperty('costByModel');
      expect(metrics).toHaveProperty('requestsByTier');
      expect(metrics).toHaveProperty('averageDurationMs');
    });

    it('should return zero metrics when no requests made', () => {
      // Arrange
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const config: SlimClawConfig = {
        ...DEFAULT_CONFIG,
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
      };

      const router = createEmbeddingRouter(config);
      expect(router).not.toBeNull();

      // Act
      const metrics = router!.getMetrics();

      // Assert
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.cacheHits).toBe(0);
      expect(metrics.cacheMisses).toBe(0);
      expect(metrics.totalCost).toBe(0);
    });
  });
});

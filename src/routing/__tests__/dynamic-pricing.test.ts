import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  DynamicPricingCache,
  type DynamicPricingConfig 
} from '../dynamic-pricing.js';

// Mock fetch for testing
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('DynamicPricingCache', () => {
  let cache: DynamicPricingCache;
  let config: DynamicPricingConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    config = {
      enabled: true,
      openRouterApiUrl: 'https://openrouter.ai/api/v1/models',
      cacheTtlMs: 21600000, // 6 hours
      fetchTimeoutMs: 5000,
      fallbackToHardcoded: true
    };
    cache = new DynamicPricingCache(config);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    test('should initialize with empty cache', () => {
      const stats = cache.getStats();
      expect(stats.models).toBe(0);
      expect(stats.lastFetch).toBeNull();
      expect(stats.stale).toBe(true);
    });

    test('should accept custom configuration', () => {
      const customConfig = {
        ...config,
        cacheTtlMs: 3600000, // 1 hour
        fetchTimeoutMs: 3000
      };
      const customCache = new DynamicPricingCache(customConfig);
      const stats = customCache.getStats();
      expect(stats.models).toBe(0);
    });
  });

  describe('getPricing', () => {
    test('should return hardcoded pricing for unknown models when cache empty', () => {
      const pricing = cache.getPricing('anthropic/claude-sonnet-4-20250514');
      expect(pricing.inputPer1k).toBeGreaterThan(0);
      expect(pricing.outputPer1k).toBeGreaterThan(0);
    });

    test('should return cached pricing when available and fresh', async () => {
      // Mock successful API response
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [
            {
              id: 'openai/gpt-4.1-nano',
              pricing: {
                prompt: '0.0001',  // $0.0001 per token
                completion: '0.0004'
              }
            }
          ]
        })
      });

      // Pre-populate cache by calling refresh directly
      await cache.refresh();
      
      // Now both calls should use cached data
      const pricing1 = cache.getPricing('openai/gpt-4.1-nano');
      const pricing2 = cache.getPricing('openai/gpt-4.1-nano');
      
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(pricing1).toEqual(pricing2);
      expect(pricing1.inputPer1k).toBe(0.1); // 0.0001 * 1000
      expect(pricing1.outputPer1k).toBe(0.4); // 0.0004 * 1000
    });

    test('should trigger background refresh when cache is stale', async () => {
      // Mock successful API response
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [
            {
              id: 'openai/gpt-4.1-nano',
              pricing: {
                prompt: '0.0001',
                completion: '0.0004'
              }
            }
          ]
        })
      });

      // First refresh to populate cache
      await cache.refresh();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Advance time beyond TTL
      vi.advanceTimersByTime(config.cacheTtlMs + 1000);

      // Call getPricing which should trigger background refresh
      cache.getPricing('openai/gpt-4.1-nano');
      
      // Give background refresh time to start
      await vi.runAllTimersAsync();
      
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('should fallback to hardcoded pricing on fetch failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const pricing = cache.getPricing('openai/gpt-4.1-nano');
      
      // Should still return valid pricing (hardcoded fallback)
      expect(pricing.inputPer1k).toBeGreaterThan(0);
      expect(pricing.outputPer1k).toBeGreaterThan(0);
    });

    test('should handle malformed API response gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ invalid: 'response' })
      });

      const pricing = cache.getPricing('openai/gpt-4.1-nano');
      await vi.runAllTimersAsync();
      
      // Should fallback to hardcoded pricing
      expect(pricing.inputPer1k).toBeGreaterThan(0);
    });
  });

  describe('refresh', () => {
    test('should fetch from OpenRouter API and return success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [
            {
              id: 'openai/gpt-4.1-nano',
              pricing: {
                prompt: '0.0001',
                completion: '0.0004'
              }
            },
            {
              id: 'google/gemini-2.5-flash',
              pricing: {
                prompt: '0.0003',
                completion: '0.0025'
              }
            }
          ]
        })
      });

      const success = await cache.refresh();
      
      expect(success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        config.openRouterApiUrl,
        expect.objectContaining({
          signal: expect.any(AbortSignal)
        })
      );
      
      const stats = cache.getStats();
      expect(stats.models).toBe(2);
      expect(stats.lastFetch).toBeTruthy();
      expect(stats.stale).toBe(false);
    });

    test('should handle HTTP errors gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests'
      });

      const success = await cache.refresh();
      
      expect(success).toBe(false);
    });

    test('should handle network timeout', async () => {
      mockFetch.mockImplementation(() => 
        new Promise((_, reject) => {
          // Simulate immediate timeout by rejecting the promise
          reject(new Error('Timeout'));
        })
      );

      const success = await cache.refresh();
      
      expect(success).toBe(false);
    });

    test('should filter models to relevant providers only', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [
            { id: 'openai/gpt-4.1-nano', pricing: { prompt: '0.0001', completion: '0.0004' } },
            { id: 'anthropic/claude-sonnet-4', pricing: { prompt: '0.003', completion: '0.015' } },
            { id: 'google/gemini-2.5-flash', pricing: { prompt: '0.0003', completion: '0.0025' } },
            { id: 'deepseek/deepseek-r1', pricing: { prompt: '0.00014', completion: '0.00028' } },
            { id: 'meta-llama/llama-4', pricing: { prompt: '0.0002', completion: '0.0002' } },
            { id: 'qwen/qwq-32b', pricing: { prompt: '0.0001', completion: '0.0001' } },
            { id: 'unrelated/model', pricing: { prompt: '1.0', completion: '2.0' } }, // Should be filtered
            { id: 'custom-provider/test', pricing: { prompt: '0.5', completion: '1.0' } } // Should be filtered
          ]
        })
      });

      const success = await cache.refresh();
      
      expect(success).toBe(true);
      const stats = cache.getStats();
      expect(stats.models).toBe(6); // Only relevant providers
    });
  });

  describe('getStats', () => {
    test('should return accurate cache statistics', async () => {
      const initialStats = cache.getStats();
      expect(initialStats).toEqual({
        models: 0,
        lastFetch: null,
        stale: true
      });

      // Populate cache
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [
            { id: 'openai/gpt-4.1-nano', pricing: { prompt: '0.0001', completion: '0.0004' } }
          ]
        })
      });

      await cache.refresh();
      
      const populatedStats = cache.getStats();
      expect(populatedStats.models).toBe(1);
      expect(populatedStats.lastFetch).toBeTruthy();
      expect(populatedStats.stale).toBe(false);

      // Make cache stale
      vi.advanceTimersByTime(config.cacheTtlMs + 1000);
      
      const staleStats = cache.getStats();
      expect(staleStats.stale).toBe(true);
    });
  });

  describe('disabled cache behavior', () => {
    test('should always return hardcoded pricing when disabled', () => {
      const disabledConfig = { ...config, enabled: false };
      const disabledCache = new DynamicPricingCache(disabledConfig);
      
      const pricing = disabledCache.getPricing('openai/gpt-4.1-nano');
      
      expect(pricing.inputPer1k).toBeGreaterThan(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
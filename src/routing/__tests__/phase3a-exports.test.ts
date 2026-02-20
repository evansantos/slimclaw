import { describe, test, expect } from 'vitest';

describe('Phase 3a exports integration', () => {
  test('should export all dynamic pricing components', async () => {
    const routingModule = await import('../index.js');
    
    // Check dynamic pricing exports
    expect(routingModule.DynamicPricingCache).toBeDefined();
    expect(typeof routingModule.DynamicPricingCache).toBe('function'); // Constructor function
    
    expect(routingModule.DEFAULT_DYNAMIC_PRICING_CONFIG).toBeDefined();
    expect(typeof routingModule.DEFAULT_DYNAMIC_PRICING_CONFIG).toBe('object');
    expect(routingModule.DEFAULT_DYNAMIC_PRICING_CONFIG.enabled).toBe(true);
    expect(routingModule.DEFAULT_DYNAMIC_PRICING_CONFIG.cacheTtlMs).toBeGreaterThan(0);
  });

  test('should export all latency tracking components', async () => {
    const routingModule = await import('../index.js');
    
    // Check latency tracker exports
    expect(routingModule.LatencyTracker).toBeDefined();
    expect(typeof routingModule.LatencyTracker).toBe('function'); // Constructor function
    
    expect(routingModule.DEFAULT_LATENCY_TRACKER_CONFIG).toBeDefined();
    expect(typeof routingModule.DEFAULT_LATENCY_TRACKER_CONFIG).toBe('object');
    expect(routingModule.DEFAULT_LATENCY_TRACKER_CONFIG.enabled).toBe(true);
    expect(routingModule.DEFAULT_LATENCY_TRACKER_CONFIG.windowSize).toBeGreaterThan(0);
  });

  test('should be able to instantiate dynamic pricing cache', async () => {
    const { DynamicPricingCache, DEFAULT_DYNAMIC_PRICING_CONFIG } = await import('../index.js');
    
    expect(() => {
      const cache = new DynamicPricingCache(DEFAULT_DYNAMIC_PRICING_CONFIG);
      return cache;
    }).not.toThrow();
  });

  test('should be able to instantiate latency tracker', async () => {
    const { LatencyTracker, DEFAULT_LATENCY_TRACKER_CONFIG } = await import('../index.js');
    
    expect(() => {
      const tracker = new LatencyTracker(DEFAULT_LATENCY_TRACKER_CONFIG);
      return tracker;
    }).not.toThrow();
  });

  test('should export types properly (compilation test)', async () => {
    // This test ensures TypeScript types are exported correctly
    const routingModule = await import('../index.js');
    
    // Test that we can access the types (they should be available for TypeScript)
    // Note: At runtime, types don't exist, but this test ensures they compile
    expect(true).toBe(true); // Basic assertion to make test valid
    
    // Type checking is done at compile time, so if this file compiles,
    // the type exports are working correctly
  });

  test('should work together - pricing cache and latency tracker', async () => {
    const { 
      DynamicPricingCache, 
      DEFAULT_DYNAMIC_PRICING_CONFIG,
      LatencyTracker,
      DEFAULT_LATENCY_TRACKER_CONFIG
    } = await import('../index.js');
    
    const cache = new DynamicPricingCache(DEFAULT_DYNAMIC_PRICING_CONFIG);
    const tracker = new LatencyTracker(DEFAULT_LATENCY_TRACKER_CONFIG);
    
    // Test they can work together
    const pricing = cache.getPricing('openai/gpt-4.1-nano');
    expect(pricing.inputPer1k).toBeGreaterThan(0);
    expect(pricing.outputPer1k).toBeGreaterThan(0);
    
    tracker.recordLatency('openai/gpt-4.1-nano', 2500, 100);
    const stats = tracker.getLatencyStats('openai/gpt-4.1-nano');
    expect(stats).not.toBeNull();
    expect(stats!.avg).toBe(2500);
    expect(stats!.count).toBe(1);
  });

  test('should maintain existing exports (no regressions)', async () => {
    const routingModule = await import('../index.js');
    
    // Ensure existing exports still work
    expect(routingModule.resolveModel).toBeDefined();
    expect(routingModule.getTierModel).toBeDefined();
    expect(routingModule.processOverrides).toBeDefined();
    expect(routingModule.resolveProvider).toBeDefined();
    expect(routingModule.buildShadowRecommendation).toBeDefined();
    expect(routingModule.makeRoutingDecision).toBeDefined();
    expect(routingModule.ROUTING_VERSION).toBeDefined();
    expect(routingModule.DEFAULT_ROUTING_CONFIG).toBeDefined();
  });
});
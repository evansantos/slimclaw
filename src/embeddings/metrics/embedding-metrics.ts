import type { EmbeddingMetrics, MetricsConfig, ComplexityTier } from '../config/types.js';

/**
 * Tracks embedding request metrics and costs
 */
export class EmbeddingMetricsTracker {
  private config: MetricsConfig;
  private cacheHits = 0;
  private cacheMisses = 0;
  private totalCost = 0;
  private costByModel: Map<string, number> = new Map();
  private requestsByTier: Map<ComplexityTier, number> = new Map([
    ['simple', 0],
    ['mid', 0],
    ['complex', 0],
  ]);
  private durations: number[] = [];

  constructor(config: MetricsConfig) {
    this.config = config;
  }

  /**
   * Record a cache hit
   */
  recordCacheHit(): void {
    if (!this.config.enabled) {
      return;
    }
    this.cacheHits++;
  }

  /**
   * Record a cache miss
   */
  recordCacheMiss(): void {
    if (!this.config.enabled) {
      return;
    }
    this.cacheMisses++;
  }

  /**
   * Record an embedding request
   *
   * @param model - Model used
   * @param tier - Complexity tier
   * @param cost - Cost in dollars
   * @param durationMs - Request duration in milliseconds
   * @param cached - Whether the request was served from cache
   */
  recordRequest(
    model: string,
    tier: ComplexityTier,
    cost: number,
    durationMs: number,
    cached: boolean,
  ): void {
    if (!this.config.enabled) {
      return;
    }

    // Record cache hit/miss
    if (cached) {
      this.recordCacheHit();
    } else {
      this.recordCacheMiss();
    }

    // Track costs
    if (this.config.trackCosts && !cached) {
      this.totalCost += cost;
      const currentCost = this.costByModel.get(model) || 0;
      this.costByModel.set(model, currentCost + cost);
    }

    // Track tier distribution
    const currentTierCount = this.requestsByTier.get(tier) || 0;
    this.requestsByTier.set(tier, currentTierCount + 1);

    // Track duration
    this.durations.push(durationMs);
  }

  /**
   * Get current metrics snapshot
   *
   * @returns Metrics summary
   */
  getMetrics(): EmbeddingMetrics {
    const totalRequests = this.cacheHits + this.cacheMisses;
    const averageDurationMs =
      this.durations.length > 0
        ? this.durations.reduce((sum, d) => sum + d, 0) / this.durations.length
        : 0;

    return {
      totalRequests,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      totalCost: this.totalCost,
      costByModel: Object.fromEntries(this.costByModel),
      requestsByTier: {
        simple: this.requestsByTier.get('simple') || 0,
        mid: this.requestsByTier.get('mid') || 0,
        complex: this.requestsByTier.get('complex') || 0,
      },
      averageDurationMs,
    };
  }

  /**
   * Reset all metrics to zero
   */
  reset(): void {
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.totalCost = 0;
    this.costByModel.clear();
    this.requestsByTier.set('simple', 0);
    this.requestsByTier.set('mid', 0);
    this.requestsByTier.set('complex', 0);
    this.durations = [];
  }
}

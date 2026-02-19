/**
 * SlimClaw Metrics Collector - Enhanced ring buffer with JSONL flushing
 * Replaces the basic MetricsCollector from middleware/metrics.ts
 */

import type { OptimizerMetrics, MetricsStats, MetricsConfig } from './types.js';
import { createSlimClawLogger } from '../logging/index.js';

export class MetricsCollector {
  private buffer: OptimizerMetrics[] = [];
  private ring: OptimizerMetrics[] = [];
  private ringIndex = 0;
  private totalProcessed = 0;
  private logger = createSlimClawLogger('debug', { component: 'MetricsCollector' });

  constructor(
    private config: MetricsConfig,
    private reporter?: import('./reporter.js').MetricsReporter
  ) {
    this.logger.debug('MetricsCollector initialized', {
      enabled: config.enabled,
      ringBufferSize: config.ringBufferSize,
      flushInterval: config.flushInterval,
    });
  }

  /**
   * Record a new metric in the ring buffer and flush buffer
   */
  record(metrics: OptimizerMetrics): void {
    if (!this.config.enabled) {
      return;
    }

    this.logger.debug('Recording metrics', {
      requestId: metrics.requestId,
      tokensSaved: metrics.tokensSaved,
      windowingApplied: metrics.windowingApplied,
      cacheBreakpointsInjected: metrics.cacheBreakpointsInjected,
    });

    // Add to ring buffer (fixed size, wraps around)
    if (this.ring.length < this.config.ringBufferSize) {
      this.ring.push(metrics);
    } else {
      this.ring[this.ringIndex % this.config.ringBufferSize] = metrics;
    }
    this.ringIndex++;
    this.totalProcessed++;

    // Add to flush buffer
    this.buffer.push(metrics);

    // Auto-flush if interval reached
    if (this.buffer.length >= this.config.flushInterval) {
      this.logger.debug('Auto-flushing metrics', { bufferSize: this.buffer.length });
      this.flush();
    }
  }

  /**
   * Flush buffered metrics to reporter
   */
  async flush(): Promise<number> {
    if (!this.config.enabled || this.buffer.length === 0) {
      return 0;
    }

    const toFlush = this.buffer.splice(0);
    
    this.logger.debug('Flushing metrics to reporter', { count: toFlush.length });
    
    if (this.reporter) {
      try {
        await this.reporter.writeMetrics(toFlush);
        this.logger.debug('Successfully flushed metrics', { count: toFlush.length });
      } catch (error) {
        this.logger.error('Failed to flush metrics', error instanceof Error ? error : { error });
        // Re-add to buffer for retry (keep only recent ones to avoid memory issues)
        this.buffer.unshift(...toFlush.slice(-this.config.flushInterval));
      }
    }

    return toFlush.length;
  }

  /**
   * Get all metrics from ring buffer
   */
  getAll(): OptimizerMetrics[] {
    const actualSize = Math.min(this.totalProcessed, this.config.ringBufferSize);
    return this.ring.slice(0, actualSize);
  }

  /**
   * Get recent metrics (last N)
   */
  getRecent(count: number): OptimizerMetrics[] {
    const all = this.getAll();
    return all.slice(-count);
  }

  /**
   * Get aggregated statistics
   */
  getStats(): MetricsStats {
    const data = this.getAll();
    if (this.reporter) {
      return this.reporter.computeStats(data);
    }
    return this.getEmptyStats();
  }

  private getEmptyStats(): MetricsStats {
    return {
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
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.buffer = [];
    this.ring = [];
    this.ringIndex = 0;
    this.totalProcessed = 0;
  }

  /**
   * Get current buffer status
   */
  getStatus(): {
    enabled: boolean;
    totalProcessed: number;
    bufferSize: number;
    ringSize: number;
    pendingFlush: number;
  } {
    return {
      enabled: this.config.enabled,
      totalProcessed: this.totalProcessed,
      bufferSize: this.ring.length,
      ringSize: this.config.ringBufferSize,
      pendingFlush: this.buffer.length,
    };
  }

  /**
   * Format status for display
   */
  formatStatus(): string {
    const stats = this.getStats();
    const status = this.getStatus();

    if (stats.totalRequests === 0) {
      return "🔬 SlimClaw Metrics — No data yet";
    }

    const reduction = stats.averageOriginalTokens > 0
      ? ((1 - stats.averageOptimizedTokens / stats.averageOriginalTokens) * 100).toFixed(1)
      : "0";

    const tiersList = Object.entries(stats.classificationDistribution)
      .map(([tier, count]) => `${tier}=${count}`)
      .join(", ");

    return [
      `🔬 SlimClaw Metrics`,
      ``,
      `Requests analyzed: ${stats.totalRequests} (total: ${status.totalProcessed})`,
      `Avg tokens: ${stats.averageOriginalTokens.toLocaleString()} → ${stats.averageOptimizedTokens.toLocaleString()} (↓${reduction}%)`,
      `Windowing: ${stats.windowingUsagePercent}% of requests`,
      `Caching: ${stats.cacheUsagePercent}% of requests`,
      ``,
      `Complexity tiers: ${tiersList}`,
      `Routing applied: ${stats.routingUsagePercent}%`,
      `Model downgrades: ${stats.modelDowngradePercent}%`,
      ``,
      `Avg latency: ${stats.averageLatencyMs}ms`,
      `Total cost saved: $${stats.totalCostSaved}`,
    ].join("\n");
  }

}
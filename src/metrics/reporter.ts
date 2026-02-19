/**
 * SlimClaw Metrics Reporter - JSONL file output
 * Handles periodic flushing of metrics to ~/.openclaw/data/slimclaw/metrics/YYYY-MM-DD.jsonl
 */

import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { OptimizerMetrics, MetricsConfig, MetricsStats, ComplexityTier } from './types.js';

export class MetricsReporter {
  private flushTimer: NodeJS.Timeout | null = null;
  private baseDir: string;

  constructor(
    private config: MetricsConfig,
    dataDir?: string
  ) {
    // Default to ~/.openclaw/data/slimclaw/
    this.baseDir = dataDir || join(homedir(), '.openclaw', 'data', 'slimclaw');
  }

  /**
   * Start periodic flushing (called by plugin activation)
   */
  startPeriodicFlush(collector: import('./collector.js').MetricsCollector): void {
    if (!this.config.enabled) return;

    // Flush every 60 seconds as safety net
    this.flushTimer = setInterval(async () => {
      await collector.flush();
    }, 60_000);
  }

  /**
   * Stop periodic flushing
   */
  stopPeriodicFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Write metrics to JSONL file
   */
  async writeMetrics(metrics: OptimizerMetrics[]): Promise<void> {
    if (metrics.length === 0) return;

    const metricsDir = join(this.baseDir, this.config.logDir);
    this.ensureDirectoryExists(metricsDir);

    // Group by date for separate files
    const grouped = this.groupMetricsByDate(metrics);

    for (const [dateStr, dayMetrics] of Object.entries(grouped)) {
      const filePath = join(metricsDir, `${dateStr}.jsonl`);
      const content = dayMetrics
        .map(m => JSON.stringify(m, null, 0))
        .join('\n') + '\n';

      try {
        // Use append for efficiency (most common case)
        appendFileSync(filePath, content, 'utf8');
      } catch (error) {
        console.error(`Failed to write metrics to ${filePath}:`, error);
        throw error;
      }
    }
  }

  /**
   * Read metrics from JSONL file for a specific date
   */
  async readMetricsForDate(date: string): Promise<OptimizerMetrics[]> {
    const filePath = join(this.baseDir, this.config.logDir, `${date}.jsonl`);
    
    if (!existsSync(filePath)) {
      return [];
    }

    try {
      const content = require('fs').readFileSync(filePath, 'utf8') as string;
      return content
        .trim()
        .split('\n')
        .filter((line: string) => line.trim().length > 0)
        .map((line: string) => JSON.parse(line));
    } catch (error) {
      console.error(`Failed to read metrics from ${filePath}:`, error);
      return [];
    }
  }

  /**
   * Get available metric dates (YYYY-MM-DD format)
   */
  async getAvailableDates(): Promise<string[]> {
    const metricsDir = join(this.baseDir, this.config.logDir);
    
    if (!existsSync(metricsDir)) {
      return [];
    }

    try {
      const files = require('fs').readdirSync(metricsDir) as string[];
      return files
        .filter((f: string) => f.endsWith('.jsonl'))
        .map((f: string) => f.replace('.jsonl', ''))
        .sort()
        .reverse(); // Most recent first
    } catch (error) {
      console.error(`Failed to list metric files:`, error);
      return [];
    }
  }

  /**
   * Generate a summary report for a date range
   */
  async generateReport(
    startDate: string,
    endDate: string
  ): Promise<{
    totalRequests: number;
    totalTokensSaved: number;
    totalCostSaved: number;
    averageSavingsPercent: number;
    topOptimizations: string[];
  }> {
    const dates = await this.getAvailableDates();
    const relevantDates = dates.filter(date => date >= startDate && date <= endDate);
    
    let allMetrics: OptimizerMetrics[] = [];
    for (const date of relevantDates) {
      const dayMetrics = await this.readMetricsForDate(date);
      allMetrics = allMetrics.concat(dayMetrics);
    }

    if (allMetrics.length === 0) {
      return {
        totalRequests: 0,
        totalTokensSaved: 0,
        totalCostSaved: 0,
        averageSavingsPercent: 0,
        topOptimizations: [],
      };
    }

    const totalRequests = allMetrics.length;
    const totalTokensSaved = allMetrics.reduce((sum, m) => sum + (m.tokensSaved ?? 0), 0);
    const totalCostSaved = allMetrics.reduce((sum, m) => sum + (m.estimatedCostSaved ?? 0), 0);
    
    const savingsPercents = allMetrics
      .filter(m => m.originalTokenEstimate > 0)
      .map(m => ((m.originalTokenEstimate - m.windowedTokenEstimate) / m.originalTokenEstimate) * 100);
    const averageSavingsPercent = savingsPercents.length > 0
      ? savingsPercents.reduce((a, b) => a + b, 0) / savingsPercents.length
      : 0;

    // Find top optimizations
    const topOptimizations = allMetrics
      .filter(m => (m.tokensSaved ?? 0) > 1000)
      .sort((a, b) => (b.tokensSaved ?? 0) - (a.tokensSaved ?? 0))
      .slice(0, 5)
      .map(m => `${m.agentId}: ${m.tokensSaved} tokens (${m.classificationTier})`);

    return {
      totalRequests,
      totalTokensSaved,
      totalCostSaved: Math.round(totalCostSaved * 100) / 100,
      averageSavingsPercent: Math.round(averageSavingsPercent * 100) / 100,
      topOptimizations,
    };
  }

  /**
   * Ensure directory exists, create if needed
   */
  private ensureDirectoryExists(dir: string): void {
    try {
      mkdirSync(dir, { recursive: true });
    } catch (error) {
      console.error(`Failed to create directory ${dir}:`, error);
      throw error;
    }
  }

  /**
   * Group metrics by date string (YYYY-MM-DD)
   */
  private groupMetricsByDate(metrics: OptimizerMetrics[]): Record<string, OptimizerMetrics[]> {
    const grouped: Record<string, OptimizerMetrics[]> = {};
    
    for (const metric of metrics) {
      const dateStr = metric.timestamp.split('T')[0]; // Extract YYYY-MM-DD
      if (!grouped[dateStr]) {
        grouped[dateStr] = [];
      }
      grouped[dateStr].push(metric);
    }
    
    return grouped;
  }

  /**
   * Get the current data directory path
   */
  getDataDir(): string {
    return this.baseDir;
  }

  /**
   * Get the metrics directory path
   */
  getMetricsDir(): string {
    return join(this.baseDir, this.config.logDir);
  }

  /**
   * Compute aggregate statistics from metrics array
   */
  computeStats(metrics: OptimizerMetrics[]): MetricsStats {
    if (metrics.length === 0) {
      return {
        totalRequests: 0,
        averageOriginalTokens: 0,
        averageOptimizedTokens: 0,
        averageTokensSaved: 0,
        averageSavingsPercent: 0,
        windowingUsagePercent: 0,
        cacheUsagePercent: 0,
        classificationDistribution: {
          simple: 0,
          mid: 0,
          complex: 0,
          reasoning: 0,
        },
        routingUsagePercent: 0,
        modelDowngradePercent: 0,
        averageLatencyMs: 0,
        totalCostSaved: 0,
        averageRoutingSavings: 0,
        routingTierDistribution: {
          simple: 0,
          mid: 0,
          complex: 0,
          reasoning: 0,
        },
        modelUpgradePercent: 0,
        combinedSavingsPercent: 0,
      };
    }

    const totalRequests = metrics.length;

    // Basic token stats
    const averageOriginalTokens = 
      metrics.reduce((sum, m) => sum + m.originalTokenEstimate, 0) / totalRequests;
    const averageOptimizedTokens = 
      metrics.reduce((sum, m) => sum + m.windowedTokenEstimate, 0) / totalRequests;
    const averageTokensSaved = 
      metrics.reduce((sum, m) => sum + (m.tokensSaved ?? 0), 0) / totalRequests;

    // Savings percent
    const savingsPercents = metrics
      .filter(m => m.originalTokenEstimate > 0)
      .map(m => ((m.originalTokenEstimate - m.windowedTokenEstimate) / m.originalTokenEstimate) * 100);
    const averageSavingsPercent = savingsPercents.length > 0
      ? savingsPercents.reduce((a, b) => a + b, 0) / savingsPercents.length
      : 0;

    // Windowing and cache usage
    const windowingUsagePercent = (metrics.filter(m => m.windowingApplied).length / totalRequests) * 100;
    const cacheUsagePercent = (metrics.filter(m => (m.cacheReadTokens ?? 0) > 0).length / totalRequests) * 100;

    // Classification distribution
    const classificationDistribution: Record<ComplexityTier, number> = {
      simple: 0,
      mid: 0,
      complex: 0,
      reasoning: 0,
    };
    metrics.forEach(m => {
      classificationDistribution[m.classificationTier]++;
    });

    // Routing stats
    const routingUsagePercent = (metrics.filter(m => m.routingApplied).length / totalRequests) * 100;
    const modelDowngradePercent = (metrics.filter(m => m.modelDowngraded).length / totalRequests) * 100;

    // Average latency
    const latencies = metrics.filter(m => m.latencyMs !== null).map(m => m.latencyMs!);
    const averageLatencyMs = latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0;

    // Total cost saved
    const totalCostSaved = metrics.reduce((sum, m) => sum + (m.estimatedCostSaved ?? 0), 0);

    // NEW ROUTING STATS

    // Average routing savings (only for metrics with routing applied)
    const routingMetrics = metrics.filter(m => m.routingApplied && m.routingSavingsPercent !== undefined);
    const averageRoutingSavings = routingMetrics.length > 0
      ? routingMetrics.reduce((sum, m) => sum + m.routingSavingsPercent!, 0) / routingMetrics.length
      : 0;

    // Routing tier distribution (only for metrics with routing applied)
    const routingTierDistribution: Record<ComplexityTier, number> = {
      simple: 0,
      mid: 0,
      complex: 0,
      reasoning: 0,
    };
    metrics.filter(m => m.routingApplied && m.routingTier !== undefined).forEach(m => {
      routingTierDistribution[m.routingTier!]++;
    });

    // Model upgrade percent
    const modelUpgradePercent = (metrics.filter(m => m.modelUpgraded).length / totalRequests) * 100;

    // Combined savings percent (if available)
    const combinedSavingsMetrics = metrics.filter(m => m.combinedSavingsPercent !== undefined);
    const combinedSavingsPercent = combinedSavingsMetrics.length > 0
      ? combinedSavingsMetrics.reduce((sum, m) => sum + m.combinedSavingsPercent!, 0) / combinedSavingsMetrics.length
      : 0;

    return {
      totalRequests,
      averageOriginalTokens,
      averageOptimizedTokens,
      averageTokensSaved,
      averageSavingsPercent,
      windowingUsagePercent,
      cacheUsagePercent,
      classificationDistribution,
      routingUsagePercent,
      modelDowngradePercent,
      averageLatencyMs,
      totalCostSaved,
      averageRoutingSavings,
      routingTierDistribution,
      modelUpgradePercent,
      combinedSavingsPercent,
    };
  }
}
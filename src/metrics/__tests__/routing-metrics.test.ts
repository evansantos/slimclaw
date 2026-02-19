/**
 * Tests for routing metrics extensions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { OptimizerMetrics, MetricsStats, MetricsConfig } from '../types.js';
import { MetricsReporter } from '../reporter.js';

describe('Routing Metrics', () => {
  let config: MetricsConfig;
  let reporter: MetricsReporter;
  
  beforeEach(() => {
    config = {
      enabled: true,
      flushInterval: 5,
      ringBufferSize: 100,
      logDir: 'test-metrics',
      trackRouting: true,
    };
    
    reporter = new MetricsReporter(config, '/tmp/test-routing');
  });

  const createMetricWithRouting = (overrides: Partial<OptimizerMetrics> = {}): OptimizerMetrics => ({
    requestId: `test-${Date.now()}-${Math.random()}`,
    timestamp: '2026-02-19T10:30:00.000Z',
    agentId: 'test-agent',
    sessionKey: 'test-session',
    mode: 'shadow',
    originalModel: 'anthropic/claude-opus-4-20250514',
    originalMessageCount: 20,
    originalTokenEstimate: 8000,
    windowingApplied: true,
    windowedMessageCount: 10,
    windowedTokenEstimate: 3000,
    trimmedMessages: 10,
    summaryTokens: 200,
    summarizationMethod: 'heuristic',
    classificationTier: 'mid',
    classificationConfidence: 0.7,
    classificationScores: { simple: 0.1, mid: 0.7, complex: 0.15, reasoning: 0.05 },
    classificationSignals: ['test_signal'],
    routingApplied: true,
    targetModel: 'anthropic/claude-haiku-4-20250514',
    modelDowngraded: true,
    modelUpgraded: false,
    routingTier: 'mid',
    routingConfidence: 0.8,
    routingSavingsPercent: 60,
    routingCostEstimate: 0.02,
    combinedSavingsPercent: 75,
    cacheBreakpointsInjected: 2,
    actualInputTokens: 3000,
    actualOutputTokens: 500,
    cacheReadTokens: 800,
    cacheWriteTokens: null,
    latencyMs: 1500,
    tokensSaved: 5000,
    estimatedCostOriginal: 0.12,
    estimatedCostOptimized: 0.045,
    estimatedCostSaved: 0.075,
    ...overrides,
  });

  describe('computeStats', () => {
    it('should calculate routing aggregate stats correctly', async () => {
      const metrics: OptimizerMetrics[] = [
        createMetricWithRouting({
          routingSavingsPercent: 50,
          routingTier: 'simple',
          modelUpgraded: false,
          modelDowngraded: true,
        }),
        createMetricWithRouting({
          routingSavingsPercent: 70,
          routingTier: 'mid',
          modelUpgraded: true,
          modelDowngraded: false,
        }),
        createMetricWithRouting({
          routingSavingsPercent: 30,
          routingTier: 'complex',
          modelUpgraded: false,
          modelDowngraded: false,
        }),
      ];

      const stats = reporter.computeStats(metrics);

      expect(stats.averageRoutingSavings).toBe(50); // (50 + 70 + 30) / 3 = 50
      expect(stats.routingTierDistribution).toEqual({
        simple: 1,
        mid: 1,
        complex: 1,
        reasoning: 0,
      });
      expect(stats.modelUpgradePercent).toBeCloseTo(33.33, 2); // 1/3 * 100 = 33.33%
    });

    it('should handle mixed routing and non-routing metrics', async () => {
      const metrics: OptimizerMetrics[] = [
        createMetricWithRouting({
          routingApplied: true,
          routingSavingsPercent: 40,
          routingTier: 'simple',
          modelUpgraded: false,
        }),
        createMetricWithRouting({
          routingApplied: false,
          routingSavingsPercent: 0,
          routingTier: 'mid', // Should be ignored since routingApplied is false
          modelUpgraded: false,
        }),
        createMetricWithRouting({
          routingApplied: true,
          routingSavingsPercent: 60,
          routingTier: 'complex',
          modelUpgraded: true,
        }),
      ];

      const stats = reporter.computeStats(metrics);

      expect(stats.averageRoutingSavings).toBe(50); // (40 + 60) / 2 = 50 (ignoring non-routing metric)
      expect(stats.routingTierDistribution).toEqual({
        simple: 1,
        mid: 0, // Ignored because routingApplied is false
        complex: 1,
        reasoning: 0,
      });
      expect(stats.modelUpgradePercent).toBeCloseTo(33.33, 2); // 1/3 * 100 = 33.33%
    });

    it('should calculate tier distribution correctly', async () => {
      const metrics: OptimizerMetrics[] = [
        createMetricWithRouting({ routingTier: 'simple' }),
        createMetricWithRouting({ routingTier: 'simple' }),
        createMetricWithRouting({ routingTier: 'mid' }),
        createMetricWithRouting({ routingTier: 'complex' }),
        createMetricWithRouting({ routingTier: 'reasoning' }),
        createMetricWithRouting({ routingTier: 'reasoning' }),
        createMetricWithRouting({ routingTier: 'reasoning' }),
      ];

      const stats = reporter.computeStats(metrics);

      expect(stats.routingTierDistribution).toEqual({
        simple: 2,
        mid: 1,
        complex: 1,
        reasoning: 3,
      });
    });

    it('should calculate combined savings correctly', async () => {
      const windowingSavings = 20; // 20%
      const routingSavings = 50; // 50%
      const expectedCombined = 1 - (1 - 0.20) * (1 - 0.50); // 1 - 0.8 * 0.5 = 60%

      const metrics: OptimizerMetrics[] = [
        createMetricWithRouting({
          originalTokenEstimate: 10000,
          windowedTokenEstimate: 8000, // 20% windowing savings
          routingSavingsPercent: 50,
          combinedSavingsPercent: expectedCombined * 100,
        }),
      ];

      const stats = reporter.computeStats(metrics);

      // The combinedSavingsPercent should be calculated using the formula
      expect(stats.combinedSavingsPercent).toBeCloseTo(60, 2);
    });

    it('should handle empty metrics array', async () => {
      const stats = reporter.computeStats([]);

      expect(stats.averageRoutingSavings).toBe(0);
      expect(stats.routingTierDistribution).toEqual({
        simple: 0,
        mid: 0,
        complex: 0,
        reasoning: 0,
      });
      expect(stats.modelUpgradePercent).toBe(0);
    });

    it('should handle metrics with no routing data', async () => {
      const metrics: OptimizerMetrics[] = [
        createMetricWithRouting({
          routingApplied: false,
          routingSavingsPercent: 0,
          modelUpgraded: false,
          modelDowngraded: false,
        }),
      ];

      const stats = reporter.computeStats(metrics);

      expect(stats.averageRoutingSavings).toBe(0);
      expect(stats.routingTierDistribution).toEqual({
        simple: 0,
        mid: 0,
        complex: 0,
        reasoning: 0,
      });
      expect(stats.modelUpgradePercent).toBe(0);
    });
  });
});
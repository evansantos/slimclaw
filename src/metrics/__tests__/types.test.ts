/**
 * Tests for SlimClaw Metrics Types
 */

import { describe, it, expect } from '@jest/globals';
import type {
  OptimizerMetrics,
  MetricsStats,
  MetricsConfig,
  ComplexityTier,
} from '../types.js';

describe('Metrics Types', () => {
  describe('ComplexityTier', () => {
    it('should include all expected tiers', () => {
      const tiers: ComplexityTier[] = ['simple', 'mid', 'complex', 'reasoning'];
      expect(tiers).toHaveLength(4);
    });
  });

  describe('OptimizerMetrics', () => {
    it('should create valid metrics object', () => {
      const metrics: OptimizerMetrics = {
        requestId: 'test-123',
        timestamp: '2026-02-19T04:00:00.000Z',
        agentId: 'main',
        sessionKey: 'session-abc',
        mode: 'shadow',
        
        originalModel: 'anthropic/claude-opus-4-20250514',
        originalMessageCount: 25,
        originalTokenEstimate: 12000,
        
        windowingApplied: true,
        windowedMessageCount: 10,
        windowedTokenEstimate: 4500,
        trimmedMessages: 15,
        summaryTokens: 300,
        summarizationMethod: 'heuristic',
        
        classificationTier: 'mid',
        classificationConfidence: 0.75,
        classificationScores: { simple: 0.1, mid: 0.75, complex: 0.1, reasoning: 0.05 },
        classificationSignals: ['code_blocks', 'file_operations'],
        
        routingApplied: true,
        targetModel: 'anthropic/claude-sonnet-4-20250514',
        modelDowngraded: true,
        modelUpgraded: false,
        
        cacheBreakpointsInjected: 3,
        
        actualInputTokens: 4500,
        actualOutputTokens: 800,
        cacheReadTokens: 1200,
        cacheWriteTokens: null,
        latencyMs: 2500,
        
        tokensSaved: 7500,
        estimatedCostOriginal: 0.18,
        estimatedCostOptimized: 0.0675,
        estimatedCostSaved: 0.1125,
      };

      expect(metrics.requestId).toBe('test-123');
      expect(metrics.mode).toBe('shadow');
      expect(metrics.tokensSaved).toBe(7500);
      expect(metrics.classificationTier).toBe('mid');
      expect(metrics.windowingApplied).toBe(true);
      expect(metrics.routingApplied).toBe(true);
    });
  });

  describe('MetricsStats', () => {
    it('should create valid stats object', () => {
      const stats: MetricsStats = {
        totalRequests: 100,
        averageOriginalTokens: 8500,
        averageOptimizedTokens: 3200,
        averageTokensSaved: 5300,
        averageSavingsPercent: 62.4,
        windowingUsagePercent: 85,
        cacheUsagePercent: 45,
        classificationDistribution: {
          simple: 35,
          mid: 40,
          complex: 20,
          reasoning: 5,
        },
        routingUsagePercent: 75,
        modelDowngradePercent: 60,
        averageLatencyMs: 2100,
        totalCostSaved: 42.50,
      };

      expect(stats.totalRequests).toBe(100);
      expect(stats.averageSavingsPercent).toBe(62.4);
      expect(stats.classificationDistribution.mid).toBe(40);
      expect(stats.totalCostSaved).toBe(42.50);
    });
  });

  describe('MetricsConfig', () => {
    it('should create valid config object', () => {
      const config: MetricsConfig = {
        enabled: true,
        flushInterval: 25,
        ringBufferSize: 2000,
        logDir: 'custom-metrics',
      };

      expect(config.enabled).toBe(true);
      expect(config.flushInterval).toBe(25);
      expect(config.ringBufferSize).toBe(2000);
      expect(config.logDir).toBe('custom-metrics');
    });

    it('should handle default values', () => {
      const config: MetricsConfig = {
        enabled: true,
        flushInterval: 10,
        ringBufferSize: 1000,
        logDir: 'metrics',
      };

      expect(config.flushInterval).toBe(10);
      expect(config.ringBufferSize).toBe(1000);
    });
  });
});
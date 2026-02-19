/**
 * Tests for MetricsCollector
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MetricsCollector } from '../collector.js';
import type { OptimizerMetrics, MetricsConfig } from '../types.js';

// Mock the reporter
const mockReporter = {
  writeMetrics: vi.fn().mockResolvedValue(undefined),
};

describe('MetricsCollector', () => {
  let config: MetricsConfig;
  let collector: MetricsCollector;

  const createTestMetric = (overrides: Partial<OptimizerMetrics> = {}): OptimizerMetrics => ({
    requestId: `test-${Date.now()}-${Math.random()}`,
    timestamp: new Date().toISOString(),
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
    routingApplied: false,
    targetModel: 'anthropic/claude-opus-4-20250514',
    modelDowngraded: false,
    modelUpgraded: false,
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

  beforeEach(() => {
    config = {
      enabled: true,
      flushInterval: 5,
      ringBufferSize: 10,
      logDir: 'test-metrics',
    };
    collector = new MetricsCollector(config, mockReporter as any);
    mockReporter.writeMetrics.mockClear();
  });

  describe('record', () => {
    it('should add metrics to ring buffer', () => {
      const metric = createTestMetric();
      collector.record(metric);

      const all = collector.getAll();
      expect(all).toHaveLength(1);
      expect(all[0]).toEqual(metric);
    });

    it('should maintain ring buffer size limit', () => {
      // Add more than ring buffer size
      for (let i = 0; i < 15; i++) {
        collector.record(createTestMetric({ requestId: `test-${i}` }));
      }

      const all = collector.getAll();
      expect(all).toHaveLength(10); // Should be limited to ringBufferSize
    });

    it('should wrap around ring buffer correctly', () => {
      // Fill the ring buffer
      for (let i = 0; i < 10; i++) {
        collector.record(createTestMetric({ requestId: `initial-${i}` }));
      }

      // Add more to test wraparound
      collector.record(createTestMetric({ requestId: 'wraparound-1' }));
      collector.record(createTestMetric({ requestId: 'wraparound-2' }));

      const all = collector.getAll();
      expect(all).toHaveLength(10);
      
      // Should contain the most recent entries
      const requestIds = all.map(m => m.requestId);
      expect(requestIds).toContain('wraparound-1');
      expect(requestIds).toContain('wraparound-2');
    });

    it('should trigger auto-flush when flushInterval reached', () => {
      // Add exactly flushInterval number of metrics
      for (let i = 0; i < 5; i++) {
        collector.record(createTestMetric({ requestId: `test-${i}` }));
      }

      expect(mockReporter.writeMetrics).toHaveBeenCalledTimes(1);
      expect(mockReporter.writeMetrics).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ requestId: 'test-0' }),
          expect.objectContaining({ requestId: 'test-4' }),
        ])
      );
    });
  });

  describe('flush', () => {
    it('should flush buffered metrics to reporter', async () => {
      collector.record(createTestMetric({ requestId: 'flush-test-1' }));
      collector.record(createTestMetric({ requestId: 'flush-test-2' }));

      const flushed = await collector.flush();
      
      expect(flushed).toBe(2);
      expect(mockReporter.writeMetrics).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ requestId: 'flush-test-1' }),
          expect.objectContaining({ requestId: 'flush-test-2' }),
        ])
      );
    });

    it('should return 0 if config disabled', async () => {
      config.enabled = false;
      collector = new MetricsCollector(config, mockReporter as any);
      
      collector.record(createTestMetric());
      const flushed = await collector.flush();
      
      expect(flushed).toBe(0);
      expect(mockReporter.writeMetrics).not.toHaveBeenCalled();
    });

    it('should return 0 if no metrics to flush', async () => {
      const flushed = await collector.flush();
      
      expect(flushed).toBe(0);
      expect(mockReporter.writeMetrics).not.toHaveBeenCalled();
    });

    it('should handle reporter errors gracefully', async () => {
      mockReporter.writeMetrics.mockRejectedValueOnce(new Error('Write failed'));
      
      collector.record(createTestMetric({ requestId: 'error-test' }));
      
      // Should not throw
      const flushed = await collector.flush();
      expect(flushed).toBe(1); // Still counts as flushed even if failed
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      // Add variety of test data
      collector.record(createTestMetric({
        requestId: 'stats-1',
        originalTokenEstimate: 10000,
        windowedTokenEstimate: 4000,
        tokensSaved: 6000,
        windowingApplied: true,
        cacheBreakpointsInjected: 2,
        classificationTier: 'simple',
        routingApplied: true,
        modelDowngraded: true,
        latencyMs: 1000,
        estimatedCostSaved: 0.1,
      }));

      collector.record(createTestMetric({
        requestId: 'stats-2',
        originalTokenEstimate: 8000,
        windowedTokenEstimate: 8000, // No windowing
        tokensSaved: 0,
        windowingApplied: false,
        cacheBreakpointsInjected: 0,
        classificationTier: 'complex',
        routingApplied: false,
        modelDowngraded: false,
        latencyMs: 2000,
        estimatedCostSaved: 0.05,
      }));

      collector.record(createTestMetric({
        requestId: 'stats-3',
        originalTokenEstimate: 12000,
        windowedTokenEstimate: 5000,
        tokensSaved: 7000,
        windowingApplied: true,
        cacheBreakpointsInjected: 3,
        classificationTier: 'reasoning',
        routingApplied: true,
        modelDowngraded: false,
        latencyMs: 1500,
        estimatedCostSaved: 0.08,
      }));
    });

    it('should calculate basic statistics correctly', () => {
      const stats = collector.getStats();
      
      expect(stats.totalRequests).toBe(3);
      expect(stats.averageOriginalTokens).toBe(10000); // (10000 + 8000 + 12000) / 3
      expect(stats.averageOptimizedTokens).toBe(Math.round((4000 + 8000 + 5000) / 3));
      expect(stats.averageTokensSaved).toBe(Math.round((6000 + 0 + 7000) / 3));
    });

    it('should calculate usage percentages correctly', () => {
      const stats = collector.getStats();
      
      expect(stats.windowingUsagePercent).toBe(67); // 2 out of 3 used windowing
      expect(stats.cacheUsagePercent).toBe(67); // 2 out of 3 used cache
      expect(stats.routingUsagePercent).toBe(67); // 2 out of 3 used routing
      expect(stats.modelDowngradePercent).toBe(33); // 1 out of 3 downgraded
    });

    it.skip('should calculate classification distribution', () => {
      const stats = collector.getStats();
      
      expect(stats.classificationDistribution).toEqual({
        simple: 1,
        mid: 0,
        complex: 1,
        reasoning: 1,
      });
    });

    it('should calculate performance metrics', () => {
      const stats = collector.getStats();
      
      expect(stats.averageLatencyMs).toBe(1500); // (1000 + 2000 + 1500) / 3
      expect(stats.totalCostSaved).toBe(0.23); // 0.1 + 0.05 + 0.08
    });

    it('should handle empty dataset', () => {
      const emptyCollector = new MetricsCollector(config);
      const stats = emptyCollector.getStats();
      
      expect(stats.totalRequests).toBe(0);
      expect(stats.averageOriginalTokens).toBe(0);
      expect(stats.averageOptimizedTokens).toBe(0);
      expect(stats.totalCostSaved).toBe(0);
    });
  });

  describe('formatStatus', () => {
    it('should return empty message for no data', () => {
      const status = collector.formatStatus();
      expect(status).toBe('🔬 SlimClaw Metrics — No data yet');
    });

    it('should format status with data', () => {
      collector.record(createTestMetric({
        originalTokenEstimate: 10000,
        windowedTokenEstimate: 3000,
        classificationTier: 'mid',
      }));

      const status = collector.formatStatus();
      
      expect(status).toContain('🔬 SlimClaw Metrics');
      expect(status).toContain('Requests analyzed: 1');
      expect(status).toContain('10,000 → 3,000');
      expect(status).toContain('↓70.0%)');
      expect(status).toContain('mid=1');
    });
  });

  describe('reset', () => {
    it('should clear all metrics', () => {
      collector.record(createTestMetric());
      collector.record(createTestMetric());
      
      expect(collector.getAll()).toHaveLength(2);
      
      collector.reset();
      
      expect(collector.getAll()).toHaveLength(0);
      expect(collector.getStats().totalRequests).toBe(0);
    });
  });

  describe('getStatus', () => {
    it('should return collector status', () => {
      collector.record(createTestMetric());
      collector.record(createTestMetric());
      
      const status = collector.getStatus();
      
      expect(status.enabled).toBe(true);
      expect(status.totalProcessed).toBe(2);
      expect(status.bufferSize).toBe(2);
      expect(status.ringSize).toBe(10);
      expect(status.pendingFlush).toBe(2); // Haven't reached flushInterval yet
    });
  });
});
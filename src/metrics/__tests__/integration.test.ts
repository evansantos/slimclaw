/**
 * Integration Tests for SlimClaw Metrics System
 * Tests the complete metrics pipeline: Collector + Reporter + Types
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { join } from 'node:path';
import { rmSync, existsSync, readFileSync } from 'node:fs';
import { MetricsCollector } from '../collector.js';
import { MetricsReporter } from '../reporter.js';
import { createMetricsInstance } from '../index.js';
import type { OptimizerMetrics, MetricsConfig } from '../types.js';

describe('Metrics Integration', () => {
  let testDir: string;
  let config: MetricsConfig;
  let reporter: MetricsReporter;
  let collector: MetricsCollector;

  const createCompleteMetric = (overrides: Partial<OptimizerMetrics> = {}): OptimizerMetrics => ({
    ...createMetricsInstance(
      `integration-${Date.now()}`,
      'integration-agent',
      'integration-session',
      {
        mode: 'shadow',
        originalModel: 'anthropic/claude-opus-4-20250514',
        originalMessageCount: 25,
        originalTokenEstimate: 10000,
      }
    ),
    // Fill in the required fields that createMetricsInstance returns as partial
    windowingApplied: true,
    windowedMessageCount: 10,
    windowedTokenEstimate: 4000,
    trimmedMessages: 15,
    summaryTokens: 300,
    summarizationMethod: 'heuristic',
    classificationTier: 'mid',
    classificationConfidence: 0.72,
    classificationScores: { simple: 0.1, mid: 0.72, complex: 0.15, reasoning: 0.03 },
    classificationSignals: ['file_operations', 'code_blocks'],
    routingApplied: true,
    targetModel: 'anthropic/claude-sonnet-4-20250514',
    modelDowngraded: true,
    modelUpgraded: false,
    cacheBreakpointsInjected: 2,
    actualInputTokens: 4000,
    actualOutputTokens: 850,
    cacheReadTokens: 1200,
    cacheWriteTokens: null,
    latencyMs: 2100,
    tokensSaved: 6000,
    estimatedCostOriginal: 0.15,
    estimatedCostOptimized: 0.06,
    estimatedCostSaved: 0.09,
    ...overrides,
  } as OptimizerMetrics);

  beforeEach(() => {
    testDir = join(process.cwd(), 'integration-test-metrics');
    
    config = {
      enabled: true,
      flushInterval: 3, // Small flush interval for testing
      ringBufferSize: 10,
      logDir: 'metrics',
    };
    
    reporter = new MetricsReporter(config, testDir);
    collector = new MetricsCollector(config, reporter);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('End-to-End Metrics Flow', () => {
    it('should record, buffer, and flush metrics to JSONL files', async () => {
      // Record some metrics (should auto-flush at flushInterval)
      const metrics = [
        createCompleteMetric({ 
          requestId: 'e2e-test-1',
          timestamp: '2026-02-19T10:00:00.000Z',
          agentId: 'agent-1',
        }),
        createCompleteMetric({ 
          requestId: 'e2e-test-2',
          timestamp: '2026-02-19T11:00:00.000Z',
          agentId: 'agent-2',
        }),
        createCompleteMetric({ 
          requestId: 'e2e-test-3',
          timestamp: '2026-02-19T12:00:00.000Z',
          agentId: 'agent-1',
        }),
      ];

      // Record all metrics - should trigger auto-flush after 3
      metrics.forEach(m => collector.record(m));

      // Verify ring buffer contains metrics
      const allMetrics = collector.getAll();
      expect(allMetrics).toHaveLength(3);

      // Verify JSONL file was created and contains data
      const jsonlPath = join(testDir, 'metrics', '2026-02-19.jsonl');
      expect(existsSync(jsonlPath)).toBe(true);

      const fileContent = readFileSync(jsonlPath, 'utf8');
      const lines = fileContent.trim().split('\n');
      expect(lines).toHaveLength(3);

      // Verify each line is valid JSON and contains expected data
      const parsedMetrics = lines.map(line => JSON.parse(line));
      expect(parsedMetrics[0].requestId).toBe('e2e-test-1');
      expect(parsedMetrics[1].requestId).toBe('e2e-test-2');
      expect(parsedMetrics[2].requestId).toBe('e2e-test-3');
    });

    it('should handle metrics across multiple days', async () => {
      const metricsDay1 = [
        createCompleteMetric({ 
          requestId: 'multiday-1',
          timestamp: '2026-02-18T23:59:00.000Z',
        }),
        createCompleteMetric({ 
          requestId: 'multiday-2',
          timestamp: '2026-02-18T12:00:00.000Z',
        }),
      ];

      const metricsDay2 = [
        createCompleteMetric({ 
          requestId: 'multiday-3',
          timestamp: '2026-02-19T01:00:00.000Z',
        }),
      ];

      // Record metrics
      [...metricsDay1, ...metricsDay2].forEach(m => collector.record(m));

      // Force flush any remaining
      await collector.flush();

      // Verify separate files were created
      const file1 = join(testDir, 'metrics', '2026-02-18.jsonl');
      const file2 = join(testDir, 'metrics', '2026-02-19.jsonl');
      
      expect(existsSync(file1)).toBe(true);
      expect(existsSync(file2)).toBe(true);

      // Verify content
      const content1 = readFileSync(file1, 'utf8').trim().split('\n');
      const content2 = readFileSync(file2, 'utf8').trim().split('\n');
      
      expect(content1).toHaveLength(2);
      expect(content2).toHaveLength(1);
    });

    it('should accumulate accurate statistics', () => {
      // Add diverse metrics for comprehensive stats testing
      const testMetrics = [
        createCompleteMetric({
          requestId: 'stats-1',
          originalTokenEstimate: 10000,
          windowedTokenEstimate: 3000,
          tokensSaved: 7000,
          classificationTier: 'simple',
          windowingApplied: true,
          cacheBreakpointsInjected: 1,
          routingApplied: true,
          modelDowngraded: true,
          latencyMs: 1500,
          estimatedCostSaved: 0.1,
        }),
        createCompleteMetric({
          requestId: 'stats-2',
          originalTokenEstimate: 8000,
          windowedTokenEstimate: 8000, // No optimization
          tokensSaved: 0,
          classificationTier: 'complex',
          windowingApplied: false,
          cacheBreakpointsInjected: 0,
          routingApplied: false,
          modelDowngraded: false,
          latencyMs: 800,
          estimatedCostSaved: 0,
        }),
        createCompleteMetric({
          requestId: 'stats-3',
          originalTokenEstimate: 12000,
          windowedTokenEstimate: 5000,
          tokensSaved: 7000,
          classificationTier: 'reasoning',
          windowingApplied: true,
          cacheBreakpointsInjected: 3,
          routingApplied: true,
          modelDowngraded: false,
          latencyMs: 3000,
          estimatedCostSaved: 0.15,
        }),
      ];

      testMetrics.forEach(m => collector.record(m));
      const stats = collector.getStats();

      // Verify comprehensive statistics
      expect(stats.totalRequests).toBe(3);
      expect(stats.averageOriginalTokens).toBe(10000); // (10k + 8k + 12k) / 3
      expect(stats.averageOptimizedTokens).toBe(Math.round((3000 + 8000 + 5000) / 3));
      expect(stats.windowingUsagePercent).toBe(67); // 2 out of 3
      expect(stats.cacheUsagePercent).toBe(67); // 2 out of 3 (cache > 0)
      expect(stats.routingUsagePercent).toBe(67); // 2 out of 3
      expect(stats.modelDowngradePercent).toBe(33); // 1 out of 3
      expect(stats.averageLatencyMs).toBe(1767); // (1500 + 800 + 3000) / 3
      expect(stats.totalCostSaved).toBe(0.25); // 0.1 + 0 + 0.15

      // Verify classification distribution
      expect(stats.classificationDistribution).toEqual({
        simple: 1,
        mid: 0,
        complex: 1,
        reasoning: 1,
      });
    });

    it('should persist and reload metrics correctly', async () => {
      // Record initial batch
      const initialMetrics = [
        createCompleteMetric({ 
          requestId: 'persist-1',
          timestamp: '2026-02-19T10:00:00.000Z',
          tokensSaved: 1000,
        }),
        createCompleteMetric({ 
          requestId: 'persist-2',
          timestamp: '2026-02-19T11:00:00.000Z',
          tokensSaved: 2000,
        }),
      ];

      initialMetrics.forEach(m => collector.record(m));
      await collector.flush();

      // Create new reporter instance and read back data
      const newReporter = new MetricsReporter(config, testDir);
      const reloadedMetrics = await newReporter.readMetricsForDate('2026-02-19');

      expect(reloadedMetrics).toHaveLength(2);
      expect(reloadedMetrics[0].requestId).toBe('persist-1');
      expect(reloadedMetrics[1].requestId).toBe('persist-2');
      expect(reloadedMetrics[0].tokensSaved).toBe(1000);
      expect(reloadedMetrics[1].tokensSaved).toBe(2000);
    });

    it('should generate comprehensive reports', async () => {
      // Setup data across multiple days with varying optimization results
      const day1Metrics = [
        createCompleteMetric({
          timestamp: '2026-02-18T10:00:00.000Z',
          tokensSaved: 5000,
          estimatedCostSaved: 0.2,
          originalTokenEstimate: 10000,
          windowedTokenEstimate: 5000,
          agentId: 'agent-productive',
        }),
        createCompleteMetric({
          timestamp: '2026-02-18T14:00:00.000Z',
          tokensSaved: 3000,
          estimatedCostSaved: 0.12,
          originalTokenEstimate: 8000,
          windowedTokenEstimate: 5000,
          agentId: 'agent-efficient',
        }),
      ];

      const day2Metrics = [
        createCompleteMetric({
          timestamp: '2026-02-19T09:00:00.000Z',
          tokensSaved: 8000,
          estimatedCostSaved: 0.3,
          originalTokenEstimate: 15000,
          windowedTokenEstimate: 7000,
          agentId: 'agent-optimizer',
        }),
      ];

      [...day1Metrics, ...day2Metrics].forEach(m => collector.record(m));
      await collector.flush();

      // Generate report
      const report = await reporter.generateReport('2026-02-18', '2026-02-19');

      expect(report.totalRequests).toBe(3);
      expect(report.totalTokensSaved).toBe(16000);
      expect(report.totalCostSaved).toBe(0.62);
      
      // Average savings: (50% + 37.5% + 53.3%) / 3 ≈ 46.9%
      expect(report.averageSavingsPercent).toBeCloseTo(46.9, 1);
      
      expect(report.topOptimizations).toHaveLength(3);
      expect(report.topOptimizations[0]).toContain('8000 tokens'); // Highest first
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle disabled config gracefully', async () => {
      config.enabled = false;
      const disabledCollector = new MetricsCollector(config, reporter);
      
      disabledCollector.record(createCompleteMetric({ requestId: 'disabled-test' }));
      const flushed = await disabledCollector.flush();
      
      expect(flushed).toBe(0);
      
      // Verify no files were created
      const metricsDir = join(testDir, 'metrics');
      expect(existsSync(metricsDir)).toBe(false);
    });

    it('should continue working after reporter errors', async () => {
      // Create collector with invalid reporter path to force error
      const badReporter = new MetricsReporter(config, '/invalid/path');
      const resilientCollector = new MetricsCollector(config, badReporter);
      
      // This should not throw even though reporter will fail
      resilientCollector.record(createCompleteMetric({ requestId: 'error-test' }));
      
      // Collector should still maintain internal state
      expect(resilientCollector.getAll()).toHaveLength(1);
      expect(resilientCollector.getStats().totalRequests).toBe(1);
    });

    it('should handle ring buffer overflow correctly', () => {
      // Test with small ring buffer
      config.ringBufferSize = 3;
      const overflowCollector = new MetricsCollector(config, reporter);
      
      // Add more metrics than ring buffer can hold
      for (let i = 0; i < 10; i++) {
        overflowCollector.record(createCompleteMetric({ requestId: `overflow-${i}` }));
      }
      
      const all = overflowCollector.getAll();
      expect(all).toHaveLength(3); // Should be limited to ring buffer size
      
      // Should contain the most recent entries
      const requestIds = all.map(m => m.requestId);
      expect(requestIds).toContain('overflow-7');
      expect(requestIds).toContain('overflow-8');
      expect(requestIds).toContain('overflow-9');
    });
  });

  describe('Utility Functions', () => {
    it('should create complete metrics instances', () => {
      const partial = createMetricsInstance(
        'util-test',
        'util-agent',
        'util-session',
        {
          mode: 'active',
          originalModel: 'test-model',
          originalMessageCount: 15,
          originalTokenEstimate: 5000,
        }
      );

      expect(partial.requestId).toBe('util-test');
      expect(partial.agentId).toBe('util-agent');
      expect(partial.sessionKey).toBe('util-session');
      expect(partial.mode).toBe('active');
      expect(partial.originalModel).toBe('test-model');
      expect(partial.originalMessageCount).toBe(15);
      expect(partial.originalTokenEstimate).toBe(5000);

      // Verify defaults
      expect(partial.windowingApplied).toBe(false);
      expect(partial.classificationTier).toBe('complex');
      expect(partial.routingApplied).toBe(false);
      expect(partial.actualInputTokens).toBe(null);
    });
  });
});
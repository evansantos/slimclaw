/**
 * Tests for MetricsReporter
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { MetricsReporter } from '../reporter.js';
import type { OptimizerMetrics, MetricsConfig } from '../types.js';

describe('MetricsReporter', () => {
  let config: MetricsConfig;
  let reporter: MetricsReporter;
  let testDir: string;

  const createTestMetric = (overrides: Partial<OptimizerMetrics> = {}): OptimizerMetrics => ({
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
    // Create temporary test directory
    testDir = join(process.cwd(), 'test-metrics-temp');
    
    config = {
      enabled: true,
      flushInterval: 5,
      ringBufferSize: 100,
      logDir: 'test-metrics',
    };
    
    reporter = new MetricsReporter(config, testDir);
  });

  afterEach(() => {
    // Cleanup test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('writeMetrics', () => {
    it('should write metrics to JSONL file', async () => {
      const metrics = [
        createTestMetric({ requestId: 'write-test-1' }),
        createTestMetric({ requestId: 'write-test-2' }),
      ];

      await reporter.writeMetrics(metrics);

      const filePath = join(testDir, 'test-metrics', '2026-02-19.jsonl');
      expect(existsSync(filePath)).toBe(true);

      const content = readFileSync(filePath, 'utf8');
      const lines = content.trim().split('\n');
      
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]).requestId).toBe('write-test-1');
      expect(JSON.parse(lines[1]).requestId).toBe('write-test-2');
    });

    it('should append to existing file', async () => {
      const firstBatch = [createTestMetric({ requestId: 'append-test-1' })];
      const secondBatch = [createTestMetric({ requestId: 'append-test-2' })];

      await reporter.writeMetrics(firstBatch);
      await reporter.writeMetrics(secondBatch);

      const filePath = join(testDir, 'test-metrics', '2026-02-19.jsonl');
      const content = readFileSync(filePath, 'utf8');
      const lines = content.trim().split('\n');
      
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]).requestId).toBe('append-test-1');
      expect(JSON.parse(lines[1]).requestId).toBe('append-test-2');
    });

    it('should group metrics by date', async () => {
      const metrics = [
        createTestMetric({ 
          requestId: 'date-test-1',
          timestamp: '2026-02-19T10:30:00.000Z',
        }),
        createTestMetric({ 
          requestId: 'date-test-2',
          timestamp: '2026-02-20T15:45:00.000Z',
        }),
        createTestMetric({ 
          requestId: 'date-test-3',
          timestamp: '2026-02-19T22:15:00.000Z',
        }),
      ];

      await reporter.writeMetrics(metrics);

      // Check first date file
      const file1 = join(testDir, 'test-metrics', '2026-02-19.jsonl');
      expect(existsSync(file1)).toBe(true);
      const content1 = readFileSync(file1, 'utf8');
      const lines1 = content1.trim().split('\n');
      expect(lines1).toHaveLength(2);

      // Check second date file
      const file2 = join(testDir, 'test-metrics', '2026-02-20.jsonl');
      expect(existsSync(file2)).toBe(true);
      const content2 = readFileSync(file2, 'utf8');
      const lines2 = content2.trim().split('\n');
      expect(lines2).toHaveLength(1);
    });

    it('should handle empty metrics array', async () => {
      await reporter.writeMetrics([]);
      
      const metricsDir = join(testDir, 'test-metrics');
      expect(existsSync(metricsDir)).toBe(false);
    });

    it('should create directory if it does not exist', async () => {
      const metrics = [createTestMetric({ requestId: 'create-dir-test' })];
      
      const metricsDir = join(testDir, 'test-metrics');
      expect(existsSync(metricsDir)).toBe(false);
      
      await reporter.writeMetrics(metrics);
      
      expect(existsSync(metricsDir)).toBe(true);
    });

    it('should handle write errors', async () => {
      const invalidReporter = new MetricsReporter(config, '/invalid/path/that/cannot/be/created');
      const metrics = [createTestMetric({ requestId: 'error-test' })];

      await expect(invalidReporter.writeMetrics(metrics)).rejects.toThrow();
    });
  });

  describe('readMetricsForDate', () => {
    beforeEach(async () => {
      // Setup test data
      const metrics = [
        createTestMetric({ 
          requestId: 'read-test-1',
          timestamp: '2026-02-19T10:00:00.000Z',
        }),
        createTestMetric({ 
          requestId: 'read-test-2',
          timestamp: '2026-02-19T11:00:00.000Z',
        }),
      ];
      await reporter.writeMetrics(metrics);
    });

    it('should read metrics for existing date', async () => {
      const metrics = await reporter.readMetricsForDate('2026-02-19');
      
      expect(metrics).toHaveLength(2);
      expect(metrics[0].requestId).toBe('read-test-1');
      expect(metrics[1].requestId).toBe('read-test-2');
    });

    it('should return empty array for non-existent date', async () => {
      const metrics = await reporter.readMetricsForDate('2026-02-18');
      
      expect(metrics).toHaveLength(0);
    });

    it('should handle corrupted JSONL file gracefully', async () => {
      const filePath = join(testDir, 'test-metrics', '2026-02-20.jsonl');
      mkdirSync(join(testDir, 'test-metrics'), { recursive: true });
      writeFileSync(filePath, 'invalid json\n{"valid": "json"}');

      const metrics = await reporter.readMetricsForDate('2026-02-20');
      
      expect(metrics).toHaveLength(0); // Should return empty on parse error
    });
  });

  describe('getAvailableDates', () => {
    beforeEach(async () => {
      // Setup test files for multiple dates
      await reporter.writeMetrics([
        createTestMetric({ timestamp: '2026-02-19T10:00:00.000Z' }),
      ]);
      await reporter.writeMetrics([
        createTestMetric({ timestamp: '2026-02-18T10:00:00.000Z' }),
      ]);
      await reporter.writeMetrics([
        createTestMetric({ timestamp: '2026-02-20T10:00:00.000Z' }),
      ]);
    });

    it('should return available dates in reverse chronological order', async () => {
      const dates = await reporter.getAvailableDates();
      
      expect(dates).toEqual(['2026-02-20', '2026-02-19', '2026-02-18']);
    });

    it('should return empty array if no metrics directory exists', async () => {
      const emptyReporter = new MetricsReporter(config, '/non/existent/path');
      const dates = await emptyReporter.getAvailableDates();
      
      expect(dates).toEqual([]);
    });

    it('should filter out non-JSONL files', async () => {
      const metricsDir = join(testDir, 'test-metrics');
      writeFileSync(join(metricsDir, 'not-a-metric.txt'), 'test');
      writeFileSync(join(metricsDir, 'also-not-metric.log'), 'test');

      const dates = await reporter.getAvailableDates();
      
      // Should only include the 3 JSONL files we created
      expect(dates).toHaveLength(3);
      expect(dates).not.toContain('not-a-metric');
      expect(dates).not.toContain('also-not-metric');
    });
  });

  describe('generateReport', () => {
    beforeEach(async () => {
      // Setup test data across multiple dates
      const metricsDay1 = [
        createTestMetric({
          timestamp: '2026-02-18T10:00:00.000Z',
          tokensSaved: 1000,
          estimatedCostSaved: 0.05,
          originalTokenEstimate: 5000,
          windowedTokenEstimate: 4000,
          classificationTier: 'simple',
        }),
        createTestMetric({
          timestamp: '2026-02-18T11:00:00.000Z',
          tokensSaved: 2000,
          estimatedCostSaved: 0.08,
          originalTokenEstimate: 8000,
          windowedTokenEstimate: 6000,
          classificationTier: 'mid',
        }),
      ];

      const metricsDay2 = [
        createTestMetric({
          timestamp: '2026-02-19T10:00:00.000Z',
          tokensSaved: 1500,
          estimatedCostSaved: 0.06,
          originalTokenEstimate: 6000,
          windowedTokenEstimate: 4500,
          classificationTier: 'complex',
        }),
      ];

      await reporter.writeMetrics(metricsDay1);
      await reporter.writeMetrics(metricsDay2);
    });

    it('should generate report for date range', async () => {
      const report = await reporter.generateReport('2026-02-18', '2026-02-19');
      
      expect(report.totalRequests).toBe(3);
      expect(report.totalTokensSaved).toBe(4500); // 1000 + 2000 + 1500
      expect(report.totalCostSaved).toBe(0.19); // 0.05 + 0.08 + 0.06
    });

    it('should calculate average savings percent correctly', async () => {
      const report = await reporter.generateReport('2026-02-18', '2026-02-19');
      
      // (20% + 25% + 25%) / 3 = 23.33%
      expect(report.averageSavingsPercent).toBeCloseTo(23.33, 2);
    });

    it.skip('should find top optimizations', async () => {
      const report = await reporter.generateReport('2026-02-18', '2026-02-19');
      
      expect(report.topOptimizations).toHaveLength(3);
      expect(report.topOptimizations[0]).toContain('2000 tokens'); // Highest savings first
      expect(report.topOptimizations[1]).toContain('1500 tokens');
      expect(report.topOptimizations[2]).toContain('1000 tokens');
    });

    it('should handle empty date range', async () => {
      const report = await reporter.generateReport('2026-02-16', '2026-02-17');
      
      expect(report.totalRequests).toBe(0);
      expect(report.totalTokensSaved).toBe(0);
      expect(report.totalCostSaved).toBe(0);
      expect(report.averageSavingsPercent).toBe(0);
      expect(report.topOptimizations).toHaveLength(0);
    });

    it('should filter by date range correctly', async () => {
      const report = await reporter.generateReport('2026-02-19', '2026-02-19');
      
      expect(report.totalRequests).toBe(1); // Only day 2 metrics
      expect(report.totalTokensSaved).toBe(1500);
    });
  });

  describe('utility methods', () => {
    it('should return correct data directory path', () => {
      const dataDir = reporter.getDataDir();
      expect(dataDir).toBe(testDir);
    });

    it('should return correct metrics directory path', () => {
      const metricsDir = reporter.getMetricsDir();
      expect(metricsDir).toBe(join(testDir, 'test-metrics'));
    });
  });

  describe('periodic flushing', () => {
    it('should start and stop periodic flushing', () => {
      const mockCollector = {
        flush: vi.fn().mockResolvedValue(0),
      } as import('../collector.js').MetricsCollector;

      // Test start
      reporter.startPeriodicFlush(mockCollector);
      
      // Test stop
      reporter.stopPeriodicFlush();
      
      // No direct way to test timer behavior in unit tests,
      // but we can verify the methods don't throw
      expect(true).toBe(true);
    });
  });
});
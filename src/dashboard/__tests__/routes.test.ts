/**
 * SlimClaw Dashboard Routes Tests
 * Basic tests for API endpoints
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsCollector } from '../../metrics/collector.js';
import { MetricsReporter } from '../../metrics/reporter.js';
import { setupRoutes } from '../routes.js';
import type { MetricsConfig, OptimizerMetrics } from '../../metrics/types.js';

// Mock metrics for testing
const mockMetric: OptimizerMetrics = {
  requestId: 'test-001',
  timestamp: new Date().toISOString(),
  agentId: 'test-agent',
  sessionKey: 'test-session',
  mode: 'active',
  originalModel: 'claude-3-sonnet',
  originalMessageCount: 10,
  originalTokenEstimate: 5000,
  windowingApplied: true,
  windowedMessageCount: 8,
  windowedTokenEstimate: 4000,
  trimmedMessages: 2,
  summaryTokens: 500,
  summarizationMethod: 'heuristic',
  classificationTier: 'complex',
  classificationConfidence: 0.85,
  classificationScores: { simple: 0.1, mid: 0.2, complex: 0.85, reasoning: 0.05 },
  classificationSignals: ['long_context', 'multi_turn'],
  routingApplied: true,
  targetModel: 'claude-3-haiku',
  modelDowngraded: true,
  modelUpgraded: false,
  cacheBreakpointsInjected: 3,
  actualInputTokens: 4000,
  actualOutputTokens: 800,
  cacheReadTokens: 1000,
  cacheWriteTokens: 200,
  latencyMs: 1500,
  tokensSaved: 1000,
  estimatedCostOriginal: 0.015,
  estimatedCostOptimized: 0.012,
  estimatedCostSaved: 0.003,
};

describe('Dashboard Routes', () => {
  let collector: MetricsCollector;
  let routes: any;

  beforeEach(() => {
    const config: MetricsConfig = {
      enabled: true,
      flushInterval: 10,
      ringBufferSize: 100,
      logDir: 'metrics'
    };
    
    const reporter = new MetricsReporter(config);
    collector = new MetricsCollector(config, reporter);
    routes = setupRoutes(collector);
    
    // Add some test data
    collector.record(mockMetric);
    collector.record({
      ...mockMetric,
      requestId: 'test-002',
      windowingApplied: false,
      cacheBreakpointsInjected: 0,
      classificationTier: 'simple',
      tokensSaved: 500,
    });
  });

  describe('GET /', () => {
    it('should serve dashboard HTML', async () => {
      const req = new Request('http://localhost:3001/');
      const res = await routes.request(req);
      
      expect(res.status).toBe(200);
      // Note: In real test, we'd check that HTML contains expected elements
      // For now, we just verify it returns a response
    });
  });

  describe('GET /metrics/optimizer', () => {
    it('should return current optimizer metrics', async () => {
      const req = new Request('http://localhost:3001/metrics/optimizer');
      const res = await routes.request(req);
      
      expect(res.status).toBe(200);
      
      const data = await res.json();
      
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('totalRequests');
      expect(data).toHaveProperty('tokensSaved');
      expect(data).toHaveProperty('cacheHitRate');
      expect(data).toHaveProperty('breakdown');
      expect(data).toHaveProperty('complexityDistribution');
      expect(data).toHaveProperty('systemStatus');
      
      expect(data.totalRequests).toBe(2);
      expect(data.tokensSaved.total).toBe(1500); // 1000 + 500
      expect(data.cacheHitRate).toBe(50); // 1 out of 2 requests has cache
      
      expect(data.breakdown).toHaveProperty('windowing');
      expect(data.breakdown).toHaveProperty('cache');
      expect(data.breakdown).toHaveProperty('routing');
      
      expect(data.systemStatus.enabled).toBe(true);
      expect(data.systemStatus.totalProcessed).toBe(2);
    });
  });

  describe('GET /metrics/history', () => {
    it('should return historical metrics with default period', async () => {
      const req = new Request('http://localhost:3001/metrics/history');
      const res = await routes.request(req);
      
      expect(res.status).toBe(200);
      
      const data = await res.json();
      
      expect(data).toHaveProperty('period');
      expect(data).toHaveProperty('timeFormat');
      expect(data).toHaveProperty('data');
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.period).toBe('hour');
    });

    it('should accept different time periods', async () => {
      const periods = ['hour', 'day', 'week'];
      
      for (const period of periods) {
        const req = new Request(`http://localhost:3001/metrics/history?period=${period}`);
        const res = await routes.request(req);
        
        expect(res.status).toBe(200);
        
        const data = await res.json();
        expect(data.period).toBe(period);
      }
    });

    it('should reject invalid periods', async () => {
      const req = new Request('http://localhost:3001/metrics/history?period=invalid');
      const res = await routes.request(req);
      
      expect(res.status).toBe(400);
      
      const data = await res.json();
      expect(data).toHaveProperty('error');
      expect(data.error).toContain('Invalid period');
    });

    it('should respect limit parameter', async () => {
      const req = new Request('http://localhost:3001/metrics/history?limit=1');
      const res = await routes.request(req);
      
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data.data.length).toBeLessThanOrEqual(1);
    });
  });

  describe('GET /metrics/raw', () => {
    it('should return raw metrics data', async () => {
      const req = new Request('http://localhost:3001/metrics/raw');
      const res = await routes.request(req);
      
      expect(res.status).toBe(200);
      
      const data = await res.json();
      
      expect(data).toHaveProperty('count');
      expect(data).toHaveProperty('data');
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.count).toBe(2);
      expect(data.data.length).toBe(2);
      
      // Check structure of raw data
      const first = data.data[0];
      expect(first).toHaveProperty('requestId');
      expect(first).toHaveProperty('timestamp');
      expect(first).toHaveProperty('agentId');
      expect(first).toHaveProperty('originalTokens');
      expect(first).toHaveProperty('optimizedTokens');
      expect(first).toHaveProperty('tokensSaved');
    });

    it('should respect limit parameter', async () => {
      const req = new Request('http://localhost:3001/metrics/raw?limit=1');
      const res = await routes.request(req);
      
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data.count).toBeLessThanOrEqual(1);
      expect(data.data.length).toBeLessThanOrEqual(1);
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const req = new Request('http://localhost:3001/health');
      const res = await routes.request(req);
      
      expect(res.status).toBe(200);
      
      const data = await res.json();
      
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('metrics');
      
      expect(data.status).toBe('healthy');
      expect(data.metrics.enabled).toBe(true);
      expect(data.metrics.totalProcessed).toBe(2);
    });
  });
});

describe('Dashboard Utilities', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    const config: MetricsConfig = {
      enabled: true,
      flushInterval: 10,
      ringBufferSize: 100,
      logDir: 'metrics'
    };
    
    collector = new MetricsCollector(config);
  });

  describe('calculateCacheHitRate', () => {
    it('should calculate cache hit rate correctly', async () => {
      // Add metrics with and without cache
      collector.record({
        ...mockMetric,
        requestId: 'cache-1',
        cacheBreakpointsInjected: 2
      });
      
      collector.record({
        ...mockMetric,
        requestId: 'no-cache-1',
        cacheBreakpointsInjected: 0
      });

      const routes = setupRoutes(collector);
      const req = new Request('http://localhost:3001/metrics/optimizer');
      const res = await routes.request(req);
      const data = await res.json();
      
      expect(data.cacheHitRate).toBe(50); // 1 out of 2 requests
    });
  });

  describe('windowing vs cache breakdown', () => {
    it('should calculate feature breakdown correctly', async () => {
      collector.record({
        ...mockMetric,
        requestId: 'windowing-only',
        windowingApplied: true,
        cacheBreakpointsInjected: 0
      });
      
      collector.record({
        ...mockMetric,
        requestId: 'cache-only',
        windowingApplied: false,
        cacheBreakpointsInjected: 3
      });

      const routes = setupRoutes(collector);
      const req = new Request('http://localhost:3001/metrics/optimizer');
      const res = await routes.request(req);
      const data = await res.json();
      
      expect(data.breakdown.windowing).toBe(50); // 1 out of 2
      expect(data.breakdown.cache).toBe(50);     // 1 out of 2
    });
  });
});
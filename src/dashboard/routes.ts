/**
 * SlimClaw Dashboard Routes - API endpoints for metrics visualization
 * Provides JSON endpoints for optimizer metrics and history
 */

import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { MetricsCollector } from '../metrics/index.js';
import type { OptimizerMetrics, ComplexityTier } from '../metrics/types.js';
import { createSlimClawLogger } from '../logging/index.js';

// Get current file's directory for template serving
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Input validation schemas
const historyQuerySchema = z.object({
  period: z.enum(['hour', 'day', 'week']).optional().default('hour'),
  limit: z.coerce.number().min(1).max(1000).optional().default(100),
});

const rawQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(20),
});

// Type definitions for grouped data
interface GroupedMetrics {
  timestamp: string;
  requests: number;
  tokensSaved: number;
  averageLatency: number;
  cacheHitRate: number;
  savingsPercentage: number;
  complexityDistribution: Record<ComplexityTier, number>;
}

export function setupRoutes(collector: MetricsCollector): Hono {
  const app = new Hono();
  const logger = createSlimClawLogger('info', { component: 'dashboard' });

  /**
   * GET / - Serve main dashboard HTML
   */
  app.get('/', async (c) => {
    try {
      const htmlPath = join(__dirname, 'views', 'index.html');
      const html = await readFile(htmlPath, 'utf-8');
      
      return c.html(html);
    } catch (error) {
      logger.error('Failed to serve dashboard HTML', error instanceof Error ? error : { error });
      return c.html(`
        <html>
          <head><title>SlimClaw Dashboard</title></head>
          <body>
            <h1>Dashboard Error</h1>
            <p>Failed to load dashboard configuration. Please check server logs.</p>
            <p>Make sure <code>src/dashboard/views/index.html</code> exists.</p>
          </body>
        </html>
      `, 500);
    }
  });

  /**
   * GET /metrics/optimizer - Current optimizer metrics summary
   */
  app.get('/metrics/optimizer', (c) => {
    try {
      const stats = collector.getStats();
      const status = collector.getStatus();
      const recent = collector.getRecent(10);

      // Calculate additional breakdowns
      const cacheHitRate = calculateCacheHitRate(recent);
      const windowingVsCache = calculateWindowingVsCacheBreakdown(recent);

      return c.json({
        timestamp: new Date().toISOString(),
        totalRequests: stats.totalRequests,
        
        // Token savings
        tokensSaved: {
          total: Math.round(stats.averageTokensSaved * stats.totalRequests),
          average: Math.round(stats.averageTokensSaved),
          percentage: Math.round(stats.averageSavingsPercent * 100) / 100
        },
        
        // Cache metrics
        cacheHitRate,
        
        // Feature breakdown
        breakdown: {
          windowing: windowingVsCache.windowing.percentage,
          cache: windowingVsCache.cache.percentage,
          routing: Math.round(stats.routingUsagePercent * 100) / 100,
          modelDowngrade: Math.round(stats.modelDowngradePercent * 100) / 100
        },
        
        // Performance
        averageLatencyMs: Math.round(stats.averageLatencyMs),
        totalCostSaved: Math.round(stats.totalCostSaved * 10000) / 10000,
        
        // Classification distribution
        complexityDistribution: stats.classificationDistribution,
        
        // System status
        systemStatus: {
          enabled: status.enabled,
          bufferSize: status.bufferSize,
          pendingFlush: status.pendingFlush,
          totalProcessed: status.totalProcessed
        }
      });
    } catch (error) {
      logger.error('Failed to fetch optimizer metrics', error instanceof Error ? error : { error });
      return c.json({ 
        error: 'Internal server error',
        timestamp: new Date().toISOString()
      }, 500);
    }
  });

  /**
   * GET /metrics/history - Historical metrics by period
   */
  app.get('/metrics/history', (c) => {
    try {
      // Validate and parse query parameters
      const rawQuery = {
        period: c.req.query('period'),
        limit: c.req.query('limit'),
      };
      
      const validatedQuery = historyQuerySchema.safeParse(rawQuery);
      if (!validatedQuery.success) {
        return c.json({ 
          error: 'Invalid period. Use: hour, day, or week',
          details: validatedQuery.error.issues
        }, 400);
      }

      const { period, limit } = validatedQuery.data;
      const data = collector.getRecent(limit);
      
      let groupedData: GroupedMetrics[];
      let timeFormat: string;

      switch (period) {
        case 'hour':
          groupedData = groupByHour(data);
          timeFormat = 'HH:mm';
          break;
        case 'day':
          groupedData = groupByDay(data);
          timeFormat = 'MM-DD';
          break;
        case 'week':
          groupedData = groupByWeek(data);
          timeFormat = 'Week of MM-DD';
          break;
        default:
          return c.json({ error: 'Invalid period. Use: hour, day, or week' }, 400);
      }

      return c.json({
        period,
        timeFormat,
        data: groupedData.map(group => ({
          timestamp: group.timestamp,
          label: formatTimeLabel(group.timestamp, period),
          metrics: {
            requests: group.requests,
            tokensSaved: group.tokensSaved,
            averageLatency: group.averageLatency,
            cacheHitRate: group.cacheHitRate,
            savingsPercentage: group.savingsPercentage,
            complexityDistribution: group.complexityDistribution
          }
        }))
      });
    } catch (error) {
      logger.error('Failed to fetch metrics history', error instanceof Error ? error : { error });
      return c.json({ 
        error: 'Internal server error',
        timestamp: new Date().toISOString()
      }, 500);
    }
  });

  /**
   * GET /metrics/raw - Raw recent metrics (for debugging)
   */
  app.get('/metrics/raw', (c) => {
    try {
      // Validate and parse query parameters
      const rawQuery = {
        limit: c.req.query('limit'),
      };
      
      const validatedQuery = rawQuerySchema.safeParse(rawQuery);
      if (!validatedQuery.success) {
        return c.json({ 
          error: 'Invalid query parameters',
          details: validatedQuery.error.issues
        }, 400);
      }

      const { limit } = validatedQuery.data;
      const recent = collector.getRecent(limit);

      return c.json({
        count: recent.length,
        data: recent.map(metric => ({
          requestId: metric.requestId,
          timestamp: metric.timestamp,
          agentId: metric.agentId,
          originalTokens: metric.originalTokenEstimate,
          optimizedTokens: metric.windowedTokenEstimate,
          tokensSaved: metric.tokensSaved,
          classificationTier: metric.classificationTier,
          windowingApplied: metric.windowingApplied,
          cacheBreakpointsInjected: metric.cacheBreakpointsInjected,
          latencyMs: metric.latencyMs
        }))
      });
    } catch (error) {
      logger.error('Failed to fetch raw metrics', error instanceof Error ? error : { error });
      return c.json({ 
        error: 'Internal server error',
        timestamp: new Date().toISOString()
      }, 500);
    }
  });

  /**
   * GET /api/routing-stats - Routing and combined optimization metrics
   */
  app.get('/api/routing-stats', (c) => {
    try {
      const stats = collector.getStats();
      const recent = collector.getRecent(100); // Get more data for routing analysis

      // Calculate routing-specific metrics
      const routingMetrics = recent.filter(m => m.routingApplied);
      const hasRoutingData = routingMetrics.length > 0;

      // Tier distribution percentages
      const totalRoutingRequests = Object.values(stats.routingTierDistribution).reduce((a, b) => a + b, 0);
      const tierDistribution = totalRoutingRequests > 0 ? {
        simple: Math.round((stats.routingTierDistribution.simple / totalRoutingRequests) * 100),
        mid: Math.round((stats.routingTierDistribution.mid / totalRoutingRequests) * 100), 
        complex: Math.round((stats.routingTierDistribution.complex / totalRoutingRequests) * 100),
        reasoning: Math.round((stats.routingTierDistribution.reasoning / totalRoutingRequests) * 100)
      } : {
        simple: 0,
        mid: 0,
        complex: 0,
        reasoning: 0
      };

      return c.json({
        timestamp: new Date().toISOString(),
        hasData: hasRoutingData,
        
        // Core routing metrics
        routingUsage: Math.round(stats.routingUsagePercent * 100) / 100,
        averageRoutingSavings: Math.round(stats.averageRoutingSavings * 100) / 100,
        tierDistribution,
        
        // Model routing behavior  
        modelDowngrade: Math.round(stats.modelDowngradePercent * 100) / 100,
        modelUpgrade: Math.round(stats.modelUpgradePercent * 100) / 100,
        
        // Combined optimization results
        combinedSavings: Math.round(stats.combinedSavingsPercent * 100) / 100,
        
        // Additional context
        totalRequests: stats.totalRequests,
        routingRequests: totalRoutingRequests
      });
    } catch (error) {
      logger.error('Failed to fetch routing stats', error instanceof Error ? error : { error });
      return c.json({ 
        error: 'Internal server error',
        timestamp: new Date().toISOString(),
        hasData: false
      }, 500);
    }
  });

  /**
   * GET /health - Health check endpoint
   */
  app.get('/health', (c) => {
    try {
      const status = collector.getStatus();
      
      return c.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        metrics: {
          enabled: status.enabled,
          totalProcessed: status.totalProcessed,
          bufferSize: status.bufferSize
        }
      });
    } catch (error) {
      logger.error('Health check failed', error instanceof Error ? error : { error });
      return c.json({ 
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Service health check failed'
      }, 503);
    }
  });

  return app;
}

// Helper functions

function calculateCacheHitRate(metrics: OptimizerMetrics[]): number {
  if (metrics.length === 0) return 0;
  
  const withCache = metrics.filter(m => m.cacheBreakpointsInjected > 0).length;
  return Math.round((withCache / metrics.length) * 100);
}

function calculateWindowingVsCacheBreakdown(metrics: OptimizerMetrics[]): {
  windowing: { percentage: number; savings: number };
  cache: { percentage: number; savings: number };
} {
  if (metrics.length === 0) {
    return {
      windowing: { percentage: 0, savings: 0 },
      cache: { percentage: 0, savings: 0 }
    };
  }

  const windowingMetrics = metrics.filter(m => m.windowingApplied);
  const cacheMetrics = metrics.filter(m => m.cacheBreakpointsInjected > 0);

  const windowingSavings = windowingMetrics.reduce((sum, m) => sum + (m.tokensSaved || 0), 0);
  const cacheSavings = cacheMetrics.reduce((sum, m) => sum + (m.tokensSaved || 0), 0);

  return {
    windowing: {
      percentage: Math.round((windowingMetrics.length / metrics.length) * 100),
      savings: Math.round(windowingSavings)
    },
    cache: {
      percentage: Math.round((cacheMetrics.length / metrics.length) * 100),
      savings: Math.round(cacheSavings)
    }
  };
}

function groupByHour(data: OptimizerMetrics[]): GroupedMetrics[] {
  const groups = new Map<string, OptimizerMetrics[]>();

  for (const metric of data) {
    const hour = metric.timestamp.substring(0, 13); // YYYY-MM-DDTHH
    if (!groups.has(hour)) {
      groups.set(hour, []);
    }
    groups.get(hour)!.push(metric);
  }

  return Array.from(groups.entries()).map(([timestamp, metrics]) => ({
    timestamp,
    requests: metrics.length,
    tokensSaved: metrics.reduce((sum, m) => sum + (m.tokensSaved || 0), 0),
    averageLatency: Math.round(metrics.reduce((sum, m) => sum + (m.latencyMs || 0), 0) / metrics.length),
    cacheHitRate: calculateCacheHitRate(metrics),
    savingsPercentage: calculateAverageSavings(metrics),
    complexityDistribution: calculateComplexityDistribution(metrics)
  }));
}

function groupByDay(data: OptimizerMetrics[]): GroupedMetrics[] {
  const groups = new Map<string, OptimizerMetrics[]>();

  for (const metric of data) {
    const day = metric.timestamp.substring(0, 10); // YYYY-MM-DD
    if (!groups.has(day)) {
      groups.set(day, []);
    }
    groups.get(day)!.push(metric);
  }

  return Array.from(groups.entries()).map(([timestamp, metrics]) => ({
    timestamp,
    requests: metrics.length,
    tokensSaved: metrics.reduce((sum, m) => sum + (m.tokensSaved || 0), 0),
    averageLatency: Math.round(metrics.reduce((sum, m) => sum + (m.latencyMs || 0), 0) / metrics.length),
    cacheHitRate: calculateCacheHitRate(metrics),
    savingsPercentage: calculateAverageSavings(metrics),
    complexityDistribution: calculateComplexityDistribution(metrics)
  }));
}

function groupByWeek(data: OptimizerMetrics[]): GroupedMetrics[] {
  // Simple weekly grouping by ISO week
  const groups = new Map<string, OptimizerMetrics[]>();

  for (const metric of data) {
    const date = new Date(metric.timestamp);
    const weekStart = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
    const weekKey = weekStart.toISOString().substring(0, 10);
    
    if (!groups.has(weekKey)) {
      groups.set(weekKey, []);
    }
    groups.get(weekKey)!.push(metric);
  }

  return Array.from(groups.entries()).map(([timestamp, metrics]) => ({
    timestamp,
    requests: metrics.length,
    tokensSaved: metrics.reduce((sum, m) => sum + (m.tokensSaved || 0), 0),
    averageLatency: Math.round(metrics.reduce((sum, m) => sum + (m.latencyMs || 0), 0) / (metrics.length || 1)),
    cacheHitRate: calculateCacheHitRate(metrics),
    savingsPercentage: calculateAverageSavings(metrics),
    complexityDistribution: calculateComplexityDistribution(metrics)
  }));
}

function calculateAverageSavings(metrics: OptimizerMetrics[]): number {
  if (metrics.length === 0) return 0;
  
  const validMetrics = metrics.filter(m => m.originalTokenEstimate > 0);
  if (validMetrics.length === 0) return 0;

  const totalSavings = validMetrics.reduce((sum, m) => {
    const savings = ((m.originalTokenEstimate - m.windowedTokenEstimate) / m.originalTokenEstimate) * 100;
    return sum + savings;
  }, 0);

  return Math.round(totalSavings / validMetrics.length);
}

function calculateComplexityDistribution(metrics: OptimizerMetrics[]): Record<ComplexityTier, number> {
  const distribution: Record<ComplexityTier, number> = {
    simple: 0,
    mid: 0,
    complex: 0,
    reasoning: 0
  };

  for (const metric of metrics) {
    distribution[metric.classificationTier]++;
  }

  return distribution;
}

function formatTimeLabel(timestamp: string, period: string): string {
  const date = new Date(timestamp);
  
  switch (period) {
    case 'hour':
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    case 'day':
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    case 'week':
      return `Week of ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    default:
      return timestamp;
  }
}
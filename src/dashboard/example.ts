/**
 * SlimClaw Dashboard Usage Example
 * Demonstrates how to integrate the dashboard with the metrics system
 */

import { MetricsCollector, MetricsReporter } from '../metrics/index.js';
import { startDashboard } from './server.js';
import type { MetricsConfig } from '../metrics/types.js';

/**
 * Example: Setting up the dashboard with a metrics collector
 */
async function setupDashboardExample() {
  // 1. Configure metrics collection
  const metricsConfig: MetricsConfig = {
    enabled: true,
    flushInterval: 50, // Flush every 50 requests
    ringBufferSize: 1000, // Keep last 1000 requests in memory
    logDir: 'metrics', // Store in ~/.openclaw/data/slimclaw/metrics/
    trackRouting: true // Enable routing metrics tracking
  };

  // 2. Create metrics collector and reporter
  const reporter = new MetricsReporter(metricsConfig);
  const collector = new MetricsCollector(metricsConfig, reporter);

  // 3. Add some sample data for demonstration
  await addSampleData(collector);

  // 4. Start the dashboard server
  const dashboard = await startDashboard(collector, {
    port: 3001,
    host: 'localhost'
  });

  // Note: In production, these would be logged via api.logger
  if (process.env.NODE_ENV !== 'production') {
    console.log('✅ Dashboard example setup complete!');
    console.log('📊 View dashboard at: http://localhost:3001');
    console.log('🔧 API endpoints:');
    console.log('   • GET /metrics/optimizer - Current metrics');
    console.log('   • GET /metrics/history?period=hour - Historical data');
    console.log('   • GET /health - Health check');
  }
  
  // Setup graceful shutdown
  process.on('SIGINT', async () => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('\n🛑 Shutting down dashboard...');
    }
    await dashboard.stop();
    process.exit(0);
  });

  return dashboard;
}

/**
 * Add sample optimization data for dashboard demonstration
 */
async function addSampleData(collector: MetricsCollector) {
  // Note: In production, use api.logger.debug() instead
  if (process.env.NODE_ENV !== 'production') {
    console.log('📝 Adding sample metrics data...');
  }

  const baseTimestamp = new Date();
  const samples = [
    {
      requestId: 'req-001',
      agentId: 'demo-agent',
      sessionKey: 'demo-session-1',
      originalTokens: 5000,
      optimizedTokens: 3500,
      classificationTier: 'complex' as const,
      windowingApplied: true,
      cacheBreakpoints: 2,
      tokensSaved: 1500,
      latencyMs: 1200,
    },
    {
      requestId: 'req-002',
      agentId: 'demo-agent',
      sessionKey: 'demo-session-2',
      originalTokens: 2000,
      optimizedTokens: 1800,
      classificationTier: 'mid' as const,
      windowingApplied: false,
      cacheBreakpoints: 1,
      tokensSaved: 200,
      latencyMs: 800,
    },
    {
      requestId: 'req-003',
      agentId: 'demo-agent',
      sessionKey: 'demo-session-1',
      originalTokens: 8000,
      optimizedTokens: 5000,
      classificationTier: 'reasoning' as const,
      windowingApplied: true,
      cacheBreakpoints: 0,
      tokensSaved: 3000,
      latencyMs: 2500,
    },
    {
      requestId: 'req-004',
      agentId: 'demo-agent',
      sessionKey: 'demo-session-3',
      originalTokens: 1200,
      optimizedTokens: 1200,
      classificationTier: 'simple' as const,
      windowingApplied: false,
      cacheBreakpoints: 0,
      tokensSaved: 0,
      latencyMs: 400,
    },
    {
      requestId: 'req-005',
      agentId: 'demo-agent',
      sessionKey: 'demo-session-2',
      originalTokens: 3500,
      optimizedTokens: 2800,
      classificationTier: 'mid' as const,
      windowingApplied: true,
      cacheBreakpoints: 3,
      tokensSaved: 700,
      latencyMs: 1100,
    },
  ];

  // Add sample metrics with slight time offsets
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const timestamp = new Date(baseTimestamp.getTime() - (i * 5 * 60 * 1000)); // 5 minutes apart

    collector.record({
      requestId: sample.requestId,
      timestamp: timestamp.toISOString(),
      agentId: sample.agentId,
      sessionKey: sample.sessionKey,
      mode: 'active',
      originalModel: 'claude-3-sonnet',
      originalMessageCount: Math.floor(sample.originalTokens / 400), // Rough estimate
      originalTokenEstimate: sample.originalTokens,
      windowingApplied: sample.windowingApplied,
      windowedMessageCount: Math.floor(sample.optimizedTokens / 400),
      windowedTokenEstimate: sample.optimizedTokens,
      trimmedMessages: sample.windowingApplied ? 2 : 0,
      summaryTokens: sample.windowingApplied ? 200 : 0,
      summarizationMethod: sample.windowingApplied ? 'heuristic' : 'none',
      classificationTier: sample.classificationTier,
      classificationConfidence: 0.8,
      classificationScores: {
        simple: sample.classificationTier === 'simple' ? 0.8 : 0.1,
        mid: sample.classificationTier === 'mid' ? 0.8 : 0.1,
        complex: sample.classificationTier === 'complex' ? 0.8 : 0.1,
        reasoning: sample.classificationTier === 'reasoning' ? 0.8 : 0.1,
      },
      classificationSignals: ['demo_signal'],
      routingApplied: sample.classificationTier !== 'simple',
      targetModel: sample.classificationTier === 'simple' ? 'claude-3-haiku' : 'claude-3-sonnet',
      modelDowngraded: sample.classificationTier === 'simple',
      modelUpgraded: false,
      routingTier: sample.classificationTier,
      routingConfidence: 0.8,
      routingSavingsPercent: sample.classificationTier === 'simple' ? 50 : 20,
      routingCostEstimate: sample.optimizedTokens * 0.000001,
      combinedSavingsPercent: ((sample.originalTokens - sample.optimizedTokens) / sample.originalTokens) * 100,
      cacheBreakpointsInjected: sample.cacheBreakpoints,
      actualInputTokens: sample.optimizedTokens,
      actualOutputTokens: Math.floor(sample.optimizedTokens * 0.2), // 20% output
      cacheReadTokens: sample.cacheBreakpoints * 100,
      cacheWriteTokens: sample.cacheBreakpoints * 50,
      latencyMs: sample.latencyMs,
      tokensSaved: sample.tokensSaved,
      estimatedCostOriginal: sample.originalTokens * 0.000003, // $3 per 1M tokens
      estimatedCostOptimized: sample.optimizedTokens * 0.000003,
      estimatedCostSaved: sample.tokensSaved * 0.000003,
    });
  }

  // Note: In production, use api.logger.debug() instead  
  if (process.env.NODE_ENV !== 'production') {
    console.log(`✅ Added ${samples.length} sample metrics entries`);
    
    // Display current stats
    const stats = collector.getStats();
    console.log(`📈 Current stats: ${stats.totalRequests} requests, ${stats.averageTokensSaved} avg tokens saved`);
  }
}

/**
 * Example: Custom dashboard configuration for development
 */
export const developmentConfig = {
  port: 3001,
  host: 'localhost', // Restrict to localhost for dev
};

/**
 * Example: Production dashboard configuration
 */
export const productionConfig = {
  port: 8080,
  host: '0.0.0.0', // Listen on all interfaces
  basePath: '/slimclaw', // Mount under /slimclaw path
};

/**
 * Run the example if this file is executed directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  setupDashboardExample().catch(error => {
    // Note: In production, use api.logger.error() instead
    if (process.env.NODE_ENV !== 'production') {
      console.error('❌ Failed to setup dashboard example:', error);
    }
    process.exit(1);
  });
}

export { setupDashboardExample, addSampleData };
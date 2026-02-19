/**
 * SlimClaw - OpenClaw Plugin
 * 
 * Complementa o contextPruning built-in do OpenClaw com:
 * 1. Métricas e observabilidade de economia de tokens
 * 2. Cache breakpoint injection (Anthropic prompt caching)
 * 3. Dashboard para visualização em tempo real
 */

import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { classifyWithRouter } from './classifier/clawrouter-classifier.js';
import type { Message } from './classifier/classify.js';

// Dashboard exports
export { 
  DashboardServer, 
  startDashboard,
  createDashboard,
  DashboardUtils,
  DEFAULT_DASHBOARD_CONFIG,
  type DashboardConfig,
  type DashboardMetrics,
  type HistoryResponse
} from './dashboard/index.js';

// Import dashboard functionality for internal use
import { createDashboard } from './dashboard/index.js';
import type { MetricsCollector, OptimizerMetrics, MetricsStats } from './metrics/index.js';

// Config schema for OpenClaw
const slimclawConfigSchema = {
  type: 'object' as const,
  properties: {
    enabled: { type: 'boolean' as const, default: true },
    metrics: { 
      type: 'object' as const,
      properties: {
        enabled: { type: 'boolean' as const, default: true },
        logLevel: { type: 'string' as const, enum: ['silent', 'summary', 'verbose'], default: 'summary' },
      }
    },
    cacheBreakpoints: {
      type: 'object' as const,
      properties: {
        enabled: { type: 'boolean' as const, default: true },
        minContentLength: { type: 'number' as const, default: 1000 },
        provider: { type: 'string' as const, enum: ['anthropic'], default: 'anthropic' },
      }
    },
    dashboard: {
      type: 'object' as const,
      properties: {
        enabled: { type: 'boolean' as const, default: false },
        port: { type: 'number' as const, default: 3333 },
      }
    }
  },
  additionalProperties: false,
};

// Types
interface SlimClawMetrics {
  totalRequests: number;
  totalInputTokens: number;        // Billed input tokens
  totalOriginalTokens: number;     // Total tokens before caching (input + cacheRead)
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  estimatedSavings: number;
  requestHistory: RequestMetric[];
}

interface RequestMetric {
  runId: string;
  timestamp: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  savingsPercent: number;
  routingTier?: string | undefined;
  routingConfidence?: number | undefined;
  routingModel?: string | undefined;
  routingSignals?: string[] | undefined;
}

// Global metrics store
const metrics: SlimClawMetrics = {
  totalRequests: 0,
  totalInputTokens: 0,
  totalOriginalTokens: 0,
  totalOutputTokens: 0,
  totalCacheReadTokens: 0,
  totalCacheWriteTokens: 0,
  estimatedSavings: 0,
  requestHistory: [],
};

// Bridge adapter for dashboard - converts our simple metrics to MetricsCollector interface
class SlimClawMetricsAdapter implements Pick<MetricsCollector, 'getAll' | 'getRecent' | 'getStats' | 'getStatus'> {
  getAll(): OptimizerMetrics[] {
    return metrics.requestHistory.map(this.convertToOptimizerMetrics);
  }

  getRecent(count: number): OptimizerMetrics[] {
    const recent = metrics.requestHistory.slice(-count);
    return recent.map(this.convertToOptimizerMetrics);
  }

  getStats(): MetricsStats {
    const totalRequests = metrics.totalRequests;
    if (totalRequests === 0) {
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

    const avgOriginalTokens = metrics.totalOriginalTokens / totalRequests;
    const avgSaved = metrics.estimatedSavings / totalRequests;
    // Percentage should be savings / original tokens, not savings / billed tokens
    const avgSavingsPercent = avgOriginalTokens > 0 ? (avgSaved / avgOriginalTokens) * 100 : 0;
    
    const cacheUsagePercent = totalRequests > 0 
      ? (metrics.requestHistory.filter(r => r.cacheReadTokens > 0).length / totalRequests) * 100 
      : 0;

    // Estimate cost saved (rough approximation based on token savings)
    const estimatedCostPerToken = 0.000003; // ~$3 per 1M tokens (rough average)
    const totalCostSaved = metrics.estimatedSavings * estimatedCostPerToken;

    return {
      totalRequests,
      averageOriginalTokens: Math.round(avgOriginalTokens),
      averageOptimizedTokens: Math.round(avgOriginalTokens - avgSaved),
      averageTokensSaved: Math.round(avgSaved),
      averageSavingsPercent: Math.round(avgSavingsPercent * 100) / 100,
      windowingUsagePercent: 0, // We don't track windowing in simple metrics
      cacheUsagePercent: Math.round(cacheUsagePercent),
      classificationDistribution: { simple: 0, mid: 0, complex: totalRequests, reasoning: 0 },
      routingUsagePercent: totalRequests > 0 
        ? (metrics.requestHistory.filter(r => r.routingTier).length / totalRequests) * 100 : 0,
      modelDowngradePercent: totalRequests > 0
        ? (metrics.requestHistory.filter(r => r.routingTier && r.routingModel && r.routingModel !== r.model).length / totalRequests) * 100 : 0,
      averageLatencyMs: 0,
      totalCostSaved: Math.round(totalCostSaved * 100) / 100,
      averageRoutingSavings: 0,
      routingTierDistribution: (() => {
        const dist = { simple: 0, mid: 0, complex: 0, reasoning: 0 };
        for (const r of metrics.requestHistory) {
          if (r.routingTier && r.routingTier in dist) {
            dist[r.routingTier as keyof typeof dist]++;
          }
        }
        return dist;
      })(),
      modelUpgradePercent: 0,
      combinedSavingsPercent: 0,
    };
  }

  getStatus(): {
    enabled: boolean;
    totalProcessed: number;
    bufferSize: number;
    ringSize: number;
    pendingFlush: number;
  } {
    return {
      enabled: true,
      totalProcessed: metrics.totalRequests,
      bufferSize: metrics.requestHistory.length,
      ringSize: 100, // We keep last 100 in history
      pendingFlush: 0,
    };
  }

  private convertToOptimizerMetrics = (request: RequestMetric): OptimizerMetrics => ({
    requestId: request.runId,
    timestamp: new Date(request.timestamp).toISOString(),
    agentId: 'unknown',
    sessionKey: 'unknown',
    mode: 'active' as const,
    originalModel: request.model,
    originalMessageCount: 0, // Not tracked in simple metrics
    originalTokenEstimate: request.inputTokens,
    windowingApplied: false,
    windowedMessageCount: 0,
    windowedTokenEstimate: request.inputTokens,
    trimmedMessages: 0,
    summaryTokens: 0,
    summarizationMethod: 'none' as const,
    classificationTier: (request.routingTier as any) || 'complex',
    classificationConfidence: request.routingConfidence ?? 1,
    classificationScores: { simple: 0, mid: 0, complex: 1, reasoning: 0 },
    classificationSignals: request.routingSignals || [],
    routingApplied: !!request.routingTier,
    targetModel: request.routingModel || request.model,
    modelDowngraded: !!(request.routingModel && request.routingModel !== request.model),
    modelUpgraded: false,
    cacheBreakpointsInjected: request.cacheReadTokens > 0 ? 1 : 0,
    actualInputTokens: request.inputTokens,
    actualOutputTokens: request.outputTokens,
    cacheReadTokens: request.cacheReadTokens,
    cacheWriteTokens: request.cacheWriteTokens,
    latencyMs: null,
    tokensSaved: request.cacheReadTokens * 0.9, // 90% savings from cache
    estimatedCostOriginal: null,
    estimatedCostOptimized: null,
    estimatedCostSaved: null,
    combinedSavingsPercent: 0,
  });
}

const metricsAdapter = new SlimClawMetricsAdapter();

// Pending requests for correlation
const pendingRequests = new Map<string, { inputTokens: number; timestamp: number; routing?: { tier: string; confidence: number; model: string; signals: string[] } | null }>();

// Plugin config (loaded at register)
let pluginConfig = {
  enabled: true,
  metrics: { enabled: true, logLevel: 'summary' },
  cacheBreakpoints: { enabled: true, minContentLength: 1000, provider: 'anthropic' },
  routing: { enabled: false, tiers: {} as Record<string, string>, minConfidence: 0.4, pinnedModels: [] as string[] },
  dashboard: { enabled: false, port: 3333 },
};

/**
 * Estimate token count (rough approximation)
 */
function estimateTokens(text: string): number {
  // ~4 chars per token for English, ~2-3 for code
  return Math.ceil(text.length / 3.5);
}

// Plugin definition
const slimclawPlugin = {
  id: 'slimclaw',
  name: 'SlimClaw',
  description: 'Token optimization metrics, cache breakpoints, and savings dashboard',
  configSchema: slimclawConfigSchema,

  register(api: OpenClawPluginApi) {
    // Load config from local file first, then merge with api.pluginConfig
    let fileConfig: Record<string, unknown> = {};
    try {
      const fs = require('fs');
      const path = require('path');
      const configPath = path.join(__dirname, '..', 'slimclaw.config.json');
      if (fs.existsSync(configPath)) {
        fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        api.logger.info(`[SlimClaw] Loaded config from ${configPath}`);
      }
    } catch (err) {
      api.logger.info(`[SlimClaw] Could not load local config: ${err}`);
    }
    
    // Merge: file config takes precedence, then api.pluginConfig
    const rawConfig = { ...fileConfig, ...(api.pluginConfig as Record<string, unknown> || {}) };
    pluginConfig = {
      enabled: rawConfig.enabled !== false,
      metrics: {
        enabled: (rawConfig.metrics as any)?.enabled !== false,
        logLevel: (rawConfig.metrics as any)?.logLevel || 'summary',
      },
      cacheBreakpoints: {
        enabled: (rawConfig.cacheBreakpoints as any)?.enabled !== false,
        minContentLength: (rawConfig.cacheBreakpoints as any)?.minContentLength || 1000,
        provider: (rawConfig.cacheBreakpoints as any)?.provider || 'anthropic',
      },
      routing: {
        enabled: (rawConfig.routing as any)?.enabled || false,
        tiers: (rawConfig.routing as any)?.tiers || {},
        minConfidence: (rawConfig.routing as any)?.minConfidence || 0.4,
        pinnedModels: (rawConfig.routing as any)?.pinnedModels || [],
      },
      dashboard: {
        enabled: (rawConfig.dashboard as any)?.enabled || false,
        port: (rawConfig.dashboard as any)?.port || 3333,
      },
    };

    if (pluginConfig.routing.enabled) {
      api.logger.info(`SlimClaw routing enabled (observation mode) - tiers: ${JSON.stringify(pluginConfig.routing.tiers)}`);
    }

    api.logger.info(`SlimClaw registered - metrics: ${pluginConfig.metrics.enabled}, cache: ${pluginConfig.cacheBreakpoints.enabled}`);

    if (!pluginConfig.enabled) {
      api.logger.info('SlimClaw is disabled');
      return;
    }

    // =========================================================================
    // Hook: llm_input - Track request metrics
    // =========================================================================
    api.on('llm_input', (event, _ctx) => {
      try {
        api.logger.info(`[SlimClaw] llm_input hook fired! runId=${event.runId}, metricsEnabled=${pluginConfig.metrics.enabled}`);
        if (!pluginConfig.metrics.enabled) {
          api.logger.info('[SlimClaw] llm_input: metrics disabled, skipping');
          return;
        }

        const { runId, historyMessages, systemPrompt, prompt } = event;
        api.logger.info(`[SlimClaw] llm_input: runId=${runId}, historyLen=${(historyMessages as any[])?.length || 0}`);
        
        // Estimate input tokens
        let totalChars = (systemPrompt || '').length + (prompt || '').length;
        for (const msg of (historyMessages as any[]) || []) {
          if (!msg || msg.content === undefined || msg.content === null) continue;
          const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
          totalChars += content?.length || 0;
        }
        
        const estimatedTokens = estimateTokens(String(totalChars));
        api.logger.info(`[SlimClaw] llm_input: totalChars=${totalChars}, estimatedTokens=${estimatedTokens}`);
        
        // Routing classification (observation mode — classify but don't mutate model)
        let routingResult: { tier: string; confidence: number; model: string; signals: string[] } | null = null;
        if (pluginConfig.routing.enabled) {
          try {
            // Only classify the CURRENT request intent, not the full history.
            // Full history causes everything to be "reasoning/lengthy-content".
            // Include: system prompt (for context) + last 3 messages (conversational flow) + current prompt.
            const classificationMessages: Message[] = [];
            
            if (systemPrompt) {
              classificationMessages.push({ role: 'system', content: systemPrompt });
            }
            
            // Last few messages for conversational context
            const history = (historyMessages as any[]) || [];
            const recentHistory = history.slice(-3);
            for (const msg of recentHistory) {
              if (!msg) continue;
              classificationMessages.push({
                role: msg.role || 'user',
                content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || ''),
              });
            }
            
            if (prompt) {
              classificationMessages.push({ role: 'user', content: prompt });
            }
            
            const classification = classifyWithRouter(classificationMessages, { originalModel: (event as any).model });
            const tierModel = pluginConfig.routing.tiers[classification.tier];
            routingResult = {
              tier: classification.tier,
              confidence: classification.confidence,
              model: tierModel || 'unknown',
              signals: classification.signals,
            };
            
            api.logger.info(
              `[SlimClaw] 🔀 Routing recommendation: ${classification.tier} tier ` +
              `(confidence: ${classification.confidence.toFixed(2)}) → ${tierModel || 'no tier model'} | ` +
              `signals: [${classification.signals.join(', ')}]`
            );
          } catch (err) {
            api.logger.info(`[SlimClaw] Routing classification failed: ${err}`);
          }
        }

        pendingRequests.set(runId, {
          inputTokens: estimatedTokens,
          timestamp: Date.now(),
          routing: routingResult,
        });
        api.logger.info(`[SlimClaw] llm_input: STORED runId=${runId}, mapSize=${pendingRequests.size}`);
      } catch (err) {
        api.logger.info(`[SlimClaw] llm_input ERROR: ${err}`);
      }
    });

    // =========================================================================
    // Hook: llm_output - Calculate actual savings
    // =========================================================================
    api.on('llm_output', (event, _ctx) => {
      api.logger.info(`[SlimClaw] llm_output hook fired! usage=${JSON.stringify(event.usage)}`);
      if (!pluginConfig.metrics.enabled) return;

      const { runId, model, usage } = event;
      const pending = pendingRequests.get(runId);
      
      api.logger.info(`[SlimClaw] llm_output: runId=${runId}, pending=${!!pending}, usage=${!!usage}`);
      
      if (!pending || !usage) {
        api.logger.info(`[SlimClaw] llm_output: early return (pending=${!!pending}, usage=${!!usage})`);
        pendingRequests.delete(runId);
        return;
      }

      const inputTokens = usage.input || 0;
      const outputTokens = usage.output || 0;
      const cacheReadTokens = usage.cacheRead || 0;
      const cacheWriteTokens = usage.cacheWrite || 0;

      // Calculate savings from cache hits
      // Cache reads are 90% cheaper than regular input tokens
      // Total tokens = billed input + cached input (what would have been billed without cache)
      const totalInputTokens = inputTokens + cacheReadTokens;
      const cacheSavings = cacheReadTokens * 0.9; // 90% discount on cached tokens
      const savingsPercent = totalInputTokens > 0 
        ? (cacheSavings / totalInputTokens * 100) 
        : 0;

      // Update global metrics
      metrics.totalRequests++;
      metrics.totalInputTokens += inputTokens;
      metrics.totalOriginalTokens += totalInputTokens; // Track original (before cache discount)
      metrics.totalOutputTokens += outputTokens;
      metrics.totalCacheReadTokens += cacheReadTokens;
      metrics.totalCacheWriteTokens += cacheWriteTokens;
      metrics.estimatedSavings += cacheSavings;
      
      api.logger.info(`[SlimClaw] Metrics updated! requests=${metrics.totalRequests}, in=${metrics.totalInputTokens}, out=${metrics.totalOutputTokens}`);

      // Add to history (keep last 100)
      metrics.requestHistory.push({
        runId,
        timestamp: Date.now(),
        model,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheWriteTokens,
        savingsPercent,
        routingTier: pending.routing?.tier,
        routingConfidence: pending.routing?.confidence,
        routingModel: pending.routing?.model,
        routingSignals: pending.routing?.signals,
      });

      if (metrics.requestHistory.length > 100) {
        metrics.requestHistory.shift();
      }

      // Log based on level
      const logLevel = pluginConfig.metrics.logLevel;
      if (logLevel === 'verbose') {
        api.logger.info(
          `[SlimClaw] ${model} | In: ${inputTokens} | Out: ${outputTokens} | ` +
          `Cache R/W: ${cacheReadTokens}/${cacheWriteTokens} | ` +
          `Savings: ${savingsPercent.toFixed(1)}%`
        );
      } else if (logLevel === 'summary' && cacheReadTokens > 0) {
        api.logger.info(
          `[SlimClaw] Cache hit: ${cacheReadTokens} tokens (~${savingsPercent.toFixed(0)}% savings)`
        );
      }

      pendingRequests.delete(runId);
    });

    // =========================================================================
    // Hook: tool_result_persist - Inject cache breakpoints (MUTATION!)
    // =========================================================================
    if (pluginConfig.cacheBreakpoints.enabled) {
      api.on('tool_result_persist', (event, _ctx) => {
        const { message } = event;
        
        // Only process tool result messages
        if (!message || (message as any).role !== 'tool_result') return;

        // Get content from the message
        const msgAny = message as any;
        const content = msgAny.content;
        if (!content) return;

        // Check if content is large enough to benefit from caching
        const contentStr = Array.isArray(content) 
          ? content.map((c: any) => c.text || '').join('')
          : String(content);

        if (contentStr.length >= pluginConfig.cacheBreakpoints.minContentLength) {
          // Mark this content for caching by returning modified message
          if (api.logger.debug) {
            api.logger.debug(`[SlimClaw] Marking ${contentStr.length} char tool result for cache`);
          }
          
          // Return modified message with cache hint
          return {
            message: {
              ...message,
              _slimclaw_cache: true,
              _slimclaw_cache_type: 'ephemeral',
            } as any,
          };
        }

        return; // No modification
      });

      api.logger.info('SlimClaw cache breakpoint injection enabled');
    }

    // =========================================================================
    // Register /slimclaw command for status
    // =========================================================================
    api.registerCommand({
      name: 'slimclaw',
      description: 'SlimClaw optimizer status and metrics',
      handler: async (_ctx) => {
        const totalCacheOps = metrics.totalCacheReadTokens + metrics.totalCacheWriteTokens;
        const cacheHitRate = totalCacheOps > 0
          ? (metrics.totalCacheReadTokens / totalCacheOps * 100)
          : 0;

        const lines = [
          '🔄 **SlimClaw Metrics**',
          '',
          `📊 Total requests: ${metrics.totalRequests}`,
          `📥 Input tokens: ${metrics.totalInputTokens.toLocaleString()}`,
          `📤 Output tokens: ${metrics.totalOutputTokens.toLocaleString()}`,
          `💾 Cache reads: ${metrics.totalCacheReadTokens.toLocaleString()}`,
          `✍️ Cache writes: ${metrics.totalCacheWriteTokens.toLocaleString()}`,
          `📈 Cache hit rate: ${cacheHitRate.toFixed(1)}%`,
          `💰 Est. savings: ~${metrics.estimatedSavings.toFixed(0)} tokens`,
          '',
          `⚙️ Config:`,
          `• Metrics: ${pluginConfig.metrics.enabled ? 'ON' : 'OFF'} (${pluginConfig.metrics.logLevel})`,
          `• Cache breakpoints: ${pluginConfig.cacheBreakpoints.enabled ? 'ON' : 'OFF'}`,
          `• Dashboard: ${pluginConfig.dashboard.enabled ? `ON (port ${pluginConfig.dashboard.port})` : 'OFF'}`,
        ];

        return {
          text: lines.join('\n'),
          announce: true,
        };
      },
    });

    api.logger.info('SlimClaw ready - /slimclaw for metrics');

    // Start dashboard if enabled
    if (pluginConfig.dashboard.enabled) {
      try {
        api.logger.info(`Starting SlimClaw dashboard on port ${pluginConfig.dashboard.port}`);
        
        // Create dashboard with our metrics adapter
        const dashboard = createDashboard(metricsAdapter as any, pluginConfig.dashboard.port);
        
        // Start the dashboard server asynchronously
        dashboard.start()
          .then(() => {
            api.logger.info(`SlimClaw dashboard started successfully on http://localhost:${pluginConfig.dashboard.port}`);
          })
          .catch((error: unknown) => {
            api.logger.info(`Failed to start SlimClaw dashboard: ${error instanceof Error ? error.message : error}`);
          });
          
      } catch (error) {
        api.logger.info(`Failed to create SlimClaw dashboard: ${error instanceof Error ? error.message : error}`);
      }
    }
  },
};

// Export metrics for external access (dashboard, etc.)
export function getMetrics(): SlimClawMetrics {
  return { ...metrics };
}

export function resetMetrics(): void {
  metrics.totalRequests = 0;
  metrics.totalInputTokens = 0;
  metrics.totalOriginalTokens = 0;
  metrics.totalOutputTokens = 0;
  metrics.totalCacheReadTokens = 0;
  metrics.totalCacheWriteTokens = 0;
  metrics.estimatedSavings = 0;
  metrics.requestHistory = [];
}

export default slimclawPlugin;

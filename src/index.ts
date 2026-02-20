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
import type { ComplexityTier } from './classifier/signals.js';

// Shadow routing imports
import { makeRoutingDecision, formatShadowLog } from './routing/index.js';

// Phase 3a imports
import { LatencyTracker, DEFAULT_LATENCY_TRACKER_CONFIG } from './routing/latency-tracker.js';

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
  routingTier?: ComplexityTier | undefined;
  routingConfidence?: number | undefined;
  routingModel?: string | undefined;
  routingSignals?: string[] | undefined;
  /** Shadow routing recommendation (Phase 2a) */
  shadowRecommendation?: {
    recommendedModel: string;
    recommendedProvider: string;
    savingsPercent: number;
    wouldApply: boolean;
  };
  /** Request latency in milliseconds (Phase 3a) */
  latencyMs?: number;
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
    classificationTier: request.routingTier ?? 'complex',
    classificationConfidence: request.routingConfidence ?? 1,
    classificationScores: request.routingTier 
      ? { simple: 0, mid: 0, complex: 0, reasoning: 0, [request.routingTier]: request.routingConfidence ?? 1 }
      : { simple: 0, mid: 0, complex: 1, reasoning: 0 },
    classificationSignals: request.routingSignals || [],
    routingApplied: !!request.routingTier,
    ...(request.routingTier ? { routingTier: request.routingTier } : {}),
    ...(request.routingConfidence != null ? { routingConfidence: request.routingConfidence } : {}),
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

// Phase 3a: Global latency tracker instance  
let latencyTracker: LatencyTracker | null = null;

// Pending requests for correlation
const pendingRequests = new Map<string, { 
  inputTokens: number; 
  timestamp: number; 
  routing?: { tier: string; confidence: number; model: string; signals: string[] } | null;
  shadowRecommendation?: import('./routing/shadow-router.js').ShadowRecommendation | undefined;
}>();

// Plugin config (loaded at register)
let pluginConfig = {
  enabled: true,
  metrics: { enabled: true, logLevel: 'summary' },
  cacheBreakpoints: { enabled: true, minContentLength: 1000, provider: 'anthropic' },
  routing: { 
    enabled: false, 
    tiers: {} as Record<string, string>, 
    minConfidence: 0.4, 
    pinnedModels: [] as string[],
    tierProviders: {} as Record<string, string>,
    shadowLogging: true,
    reasoningBudget: 10000,
    openRouterHeaders: {} as Record<string, string> | undefined,
    pricing: {} as Record<string, { inputPer1k: number; outputPer1k: number }> | undefined,
    // Phase 3a features
    dynamicPricing: {
      enabled: false,
      ttlMs: 21600000, // 6 hours
      refreshIntervalMs: 21600000,
      timeoutMs: 10000,
      apiUrl: 'https://openrouter.ai/api/v1/models'
    },
    latencyTracking: {
      enabled: true,
      bufferSize: 100,
      outlierThresholdMs: 60000
    }
  },
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
        enabled: (rawConfig.routing as Record<string, unknown>)?.enabled === true,
        tiers: (typeof (rawConfig.routing as Record<string, unknown>)?.tiers === 'object' 
          ? (rawConfig.routing as Record<string, unknown>).tiers as Record<string, string> 
          : {}),
        minConfidence: Number((rawConfig.routing as Record<string, unknown>)?.minConfidence) || 0.4,
        pinnedModels: Array.isArray((rawConfig.routing as Record<string, unknown>)?.pinnedModels)
          ? (rawConfig.routing as Record<string, unknown>).pinnedModels as string[]
          : [],
        tierProviders: (typeof (rawConfig.routing as Record<string, unknown>)?.tierProviders === 'object'
          ? (rawConfig.routing as Record<string, unknown>).tierProviders as Record<string, string>
          : {}),
        shadowLogging: (rawConfig.routing as Record<string, unknown>)?.shadowLogging !== false,
        reasoningBudget: Number((rawConfig.routing as Record<string, unknown>)?.reasoningBudget) || 10000,
        openRouterHeaders: (typeof (rawConfig.routing as Record<string, unknown>)?.openRouterHeaders === 'object'
          ? (rawConfig.routing as Record<string, unknown>).openRouterHeaders as Record<string, string>
          : undefined),
        pricing: (typeof (rawConfig.routing as Record<string, unknown>)?.pricing === 'object'
          ? (rawConfig.routing as Record<string, unknown>).pricing as Record<string, { inputPer1k: number; outputPer1k: number }>
          : undefined),
        // Phase 3a: Dynamic pricing config
        dynamicPricing: {
          enabled: (rawConfig.routing as Record<string, unknown>)?.dynamicPricing
            ? ((rawConfig.routing as Record<string, unknown>).dynamicPricing as any)?.enabled === true
            : false,
          ttlMs: Number(((rawConfig.routing as Record<string, unknown>)?.dynamicPricing as any)?.ttlMs) || 21600000,
          refreshIntervalMs: Number(((rawConfig.routing as Record<string, unknown>)?.dynamicPricing as any)?.refreshIntervalMs) || 21600000,
          timeoutMs: Number(((rawConfig.routing as Record<string, unknown>)?.dynamicPricing as any)?.timeoutMs) || 10000,
          apiUrl: ((rawConfig.routing as Record<string, unknown>)?.dynamicPricing as any)?.apiUrl || 'https://openrouter.ai/api/v1/models',
        },
        // Phase 3a: Latency tracking config
        latencyTracking: {
          enabled: (rawConfig.routing as Record<string, unknown>)?.latencyTracking 
            ? ((rawConfig.routing as Record<string, unknown>).latencyTracking as any)?.enabled !== false
            : true,
          bufferSize: Number(((rawConfig.routing as Record<string, unknown>)?.latencyTracking as any)?.bufferSize) || 100,
          outlierThresholdMs: Number(((rawConfig.routing as Record<string, unknown>)?.latencyTracking as any)?.outlierThresholdMs) || 60000,
        },
      },
      dashboard: {
        enabled: (rawConfig.dashboard as any)?.enabled || false,
        port: (rawConfig.dashboard as any)?.port || 3333,
      },
    };

    if (pluginConfig.routing.enabled) {
      api.logger.info(`SlimClaw routing enabled (observation mode) - tiers: ${JSON.stringify(pluginConfig.routing.tiers)}`);
    }

    // Initialize Phase 3a: Latency Tracker
    if (pluginConfig.routing.latencyTracking?.enabled) {
      const latencyConfig = {
        ...DEFAULT_LATENCY_TRACKER_CONFIG,
        enabled: pluginConfig.routing.latencyTracking.enabled,
        windowSize: pluginConfig.routing.latencyTracking.bufferSize,
        outlierThresholdMs: pluginConfig.routing.latencyTracking.outlierThresholdMs
      };
      latencyTracker = new LatencyTracker(latencyConfig);
      api.logger.info('[SlimClaw] Latency tracker initialized');
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
            // Classify based on user intent only — exclude system prompt
            // (system prompt is static context, not indicative of request complexity)
            const classificationMessages: Message[] = [];
            
            // Last few messages for conversational context
            const history = (historyMessages as any[]) || [];
            const recentHistory = history.slice(-3);
            for (const msg of recentHistory) {
              classificationMessages.push({
                role: msg.role || 'user',
                content: typeof msg.content === 'string' 
                  ? msg.content 
                  : Array.isArray(msg.content) 
                    ? msg.content.map((block: { text?: string; content?: string }) => block.text || block.content || '').join(' ')
                    : String(msg.content || ''),
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

        // === SHADOW ROUTING DECISION (Phase 2a: Shadow Mode) ===
        let shadowRecommendation = null;
        if (pluginConfig.routing.enabled && pluginConfig.routing.shadowLogging && routingResult) {
          try {
            // Convert the routingResult to the expected classification format
            const classification = {
              tier: routingResult.tier as ComplexityTier,
              confidence: routingResult.confidence,
              reason: 'Classification based on request complexity',
              scores: { simple: 0, mid: 0, complex: 0, reasoning: 0, [routingResult.tier]: routingResult.confidence },
              signals: routingResult.signals
            };

            // Make the routing decision using the full config structure
            const fullConfig = {
              enabled: pluginConfig.enabled,
              mode: 'shadow' as const,
              windowing: { enabled: true, maxMessages: 10, maxTokens: 4000, summarizeThreshold: 8 },
              routing: {
                ...pluginConfig.routing,
                allowDowngrade: true // Add missing field
              },
              cacheBreakpoints: { enabled: true, minContentLength: 1000 },
              metrics: { enabled: true, logLevel: 'summary' as const, logPath: 'metrics', flushIntervalMs: 10000 },
              dashboard: { enabled: false, port: 3333 },
              logging: { level: 'info' as const, format: 'human' as const, fileOutput: true, logPath: 'logs', consoleOutput: true, includeStackTrace: true, colors: true },
              caching: { enabled: true, injectBreakpoints: true, minContentLength: 1000 }
            };

            const routingOutput = makeRoutingDecision(
              classification,
              fullConfig,
              {
                originalModel: (event as any).model || 'unknown',
                headers: (event as any).headers || {}
              },
              runId
            );
            
            shadowRecommendation = routingOutput.shadow;
            
            // Log shadow recommendation
            const logLevel = pluginConfig.metrics?.logLevel === 'verbose' ? 'debug' : 'info';
            const shadowLog = formatShadowLog(routingOutput.shadow, logLevel);
            api.logger.info(shadowLog);
            
          } catch (error) {
            api.logger.info(`[SlimClaw] Shadow routing failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        pendingRequests.set(runId, {
          inputTokens: estimatedTokens,
          timestamp: Date.now(),
          routing: routingResult,
          shadowRecommendation: shadowRecommendation ?? undefined,
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

      // Calculate latency for metrics
      const latencyMs = pending.timestamp ? Date.now() - pending.timestamp : undefined;

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
        routingTier: pending.routing?.tier as ComplexityTier | undefined,
        routingConfidence: pending.routing?.confidence,
        routingModel: pending.routing?.model,
        routingSignals: pending.routing?.signals,
        // Include shadow recommendation in metrics (only if exists)
        ...(pending.shadowRecommendation ? {
          shadowRecommendation: {
            recommendedModel: pending.shadowRecommendation.recommendedModel,
            recommendedProvider: pending.shadowRecommendation.recommendedProvider?.provider || 'unknown',
            savingsPercent: pending.shadowRecommendation.costDelta?.savingsPercent || 0,
            wouldApply: pending.shadowRecommendation.wouldApply || false
          }
        } : {}),
        // Phase 3a: Include latency in metrics
        ...(latencyMs !== undefined ? { latencyMs } : {}),
      });

      if (metrics.requestHistory.length > 100) {
        metrics.requestHistory.shift();
      }

      // === LATENCY TRACKING (Phase 3a) ===
      if (latencyTracker && latencyMs !== undefined) {
        latencyTracker.recordLatency(model, latencyMs, outputTokens);
        
        if (pluginConfig.metrics.logLevel === 'verbose') {
          const stats = latencyTracker.getLatencyStats(model);
          if (stats) {
            api.logger.info(
              `[SlimClaw] Latency: ${latencyMs}ms | Model avg: ${stats.avg}ms ` +
              `(p50: ${stats.p50}ms, p95: ${stats.p95}ms) | ${stats.tokensPerSecond.toFixed(1)} tokens/sec`
            );
          }
        }
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

        // Phase 3a: Latency tracking metrics
        if (latencyTracker) {
          const allLatencyStats = latencyTracker.getAllLatencyStats();
          lines.push('');
          lines.push('⚡ **Latency Tracking**');
          lines.push(`• Models tracked: ${allLatencyStats.size}`);
          
          // Show top 3 fastest models
          const sortedModels = Array.from(allLatencyStats.entries())
            .sort(([,a], [,b]) => a.p50 - b.p50)
            .slice(0, 3);
          
          if (sortedModels.length > 0) {
            lines.push('• Fastest models:');
            for (const [model, stats] of sortedModels) {
              const modelName = model.split('/').pop() || model;
              lines.push(`  - ${modelName}: ${stats.p50}ms (${stats.tokensPerSecond.toFixed(1)} tok/s)`);
            }
          }
        }

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

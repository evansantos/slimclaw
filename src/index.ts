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
import { DEFAULT_CONFIG, SlimClawConfigSchema, type SlimClawConfig } from './config.js';

// Shadow routing imports
import { makeRoutingDecision, formatShadowLog } from './routing/index.js';

// Phase 3a imports
import { LatencyTracker, DEFAULT_LATENCY_TRACKER_CONFIG } from './routing/latency-tracker.js';

// Phase 3b imports
import { BudgetTracker, DEFAULT_BUDGET_CONFIG } from './routing/budget-tracker.js';
import { ABTestManager } from './routing/ab-testing.js';

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

// Proxy provider imports
import {
  createSlimClawProvider,
  createSidecarRequestHandler,
  SidecarServer,
  type ProviderCredentials
} from './provider/index.js';

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
  /** Budget status (Phase 3b) */
  budgetStatus?: {
    tier: string;
    dailyRemaining: number;
    weeklyRemaining: number;
    alertTriggered: boolean;
  };
  /** A/B test assignment (Phase 3b) */
  abTestAssignment?: {
    experimentId: string;
    variantId: string;
    variantModel: string;
  };
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

// Phase 3b: Global instances
let budgetTracker: BudgetTracker | null = null;
let abTestManager: ABTestManager | null = null;

// Pending requests for correlation
const pendingRequests = new Map<string, { 
  inputTokens: number; 
  timestamp: number; 
  routing?: { tier: string; confidence: number; model: string; signals: string[] } | null;
  shadowRecommendation?: import('./routing/shadow-router.js').ShadowRecommendation | undefined;
  routingOutput?: import('./routing/routing-decision.js').RoutingOutput | undefined;
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
    },
    // Phase 3b additions
    budget: {
      enabled: false,
      daily: {} as Record<string, number>,
      weekly: {} as Record<string, number>,
      alertThresholdPercent: 80,
      enforcementAction: 'alert-only' as const
    },
    abTesting: {
      enabled: false,
      experiments: [] as any[]
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

/**
 * Estimate model cost for budget tracking
 */
/** Hardcoded fallback costs per 1k tokens (USD). Used only when no config pricing is available. */
const FALLBACK_COST_PER_1K: Record<string, number> = {
  'gpt-4': 0.03,
  'gpt-3.5': 0.002,
  'claude-3-haiku': 0.00025,
  'claude-sonnet': 0.003,
  'claude-3-sonnet': 0.003,
  'claude-opus': 0.015,
  'claude-3-opus': 0.015,
  'gemini': 0.001,
};
const DEFAULT_COST_PER_1K = 0.002;

function estimateModelCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  configPricing?: Record<string, { inputPer1k: number; outputPer1k: number }>
): number {
  // 1. Use config-provided pricing when available (dynamic or static)
  if (configPricing) {
    const exact = configPricing[model];
    if (exact) {
      return (inputTokens / 1000) * exact.inputPer1k + (outputTokens / 1000) * exact.outputPer1k;
    }
  }

  // 2. Hardcoded fallbacks — match by substring
  const costPer1k = Object.entries(FALLBACK_COST_PER_1K).find(([key]) => model.includes(key))?.[1] ?? DEFAULT_COST_PER_1K;
  return ((inputTokens + outputTokens) / 1000) * costPer1k;
}

/**
 * Extract provider credentials from OpenClaw config
 */
function extractProviderCredentials(config: any): Map<string, ProviderCredentials> {
  const credentials = new Map<string, ProviderCredentials>();
  if (config?.models?.providers) {
    for (const [id, providerConfig] of Object.entries(config.models.providers)) {
      const pc = providerConfig as any;
      if (pc.baseUrl) {
        credentials.set(id, {
          baseUrl: pc.baseUrl,
          apiKey: pc.apiKey || process.env[`${id.toUpperCase()}_API_KEY`] || ''
        });
      }
    }
  }
  return credentials;
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
    
    // Use SlimClawConfigSchema.parse() to get typed config directly
    const parseResult = SlimClawConfigSchema.safeParse(rawConfig);
    
    let typedConfig: SlimClawConfig;
    if (parseResult.success) {
      typedConfig = parseResult.data;
    } else {
      api.logger.info(`[SlimClaw] Config validation failed, using defaults: ${parseResult.error.message}`);
      typedConfig = DEFAULT_CONFIG;
    }
    
    // Map to pluginConfig format for backward compatibility
    pluginConfig = {
      enabled: typedConfig.enabled,
      metrics: {
        enabled: typedConfig.metrics.enabled,
        logLevel: typedConfig.logging.level === 'debug' ? 'verbose' : 'summary', // Map log levels
      },
      cacheBreakpoints: {
        enabled: typedConfig.caching.enabled,
        minContentLength: typedConfig.caching.minContentLength,
        provider: 'anthropic', // Fixed provider
      },
      routing: {
        ...typedConfig.routing,
        tierProviders: typedConfig.routing.tierProviders ?? {},
        openRouterHeaders: typedConfig.routing.openRouterHeaders ?? {},
        budget: typedConfig.routing.budget ?? { enabled: false, daily: {}, weekly: {} },
        abTesting: typedConfig.routing.abTesting ?? { enabled: false, experiments: [] },
      } as any,
      dashboard: {
        enabled: false, // Dashboard config not in new schema yet
        port: 3333,
      },
      proxy: rawConfig.proxy || { enabled: false }, // Add proxy config from raw config
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

    // Phase 3b: Budget Tracker
    if (pluginConfig.routing.budget?.enabled) {
      const budgetConfig = {
        ...DEFAULT_BUDGET_CONFIG,
        enabled: pluginConfig.routing.budget.enabled,
        daily: pluginConfig.routing.budget.daily,
        weekly: pluginConfig.routing.budget.weekly,
        alertThresholdPercent: pluginConfig.routing.budget.alertThresholdPercent,
        enforcementAction: pluginConfig.routing.budget.enforcementAction
      };
      budgetTracker = new BudgetTracker(budgetConfig);
      api.logger.info('[SlimClaw] Budget tracker initialized');
    }
    
    // Phase 3b: A/B Testing Manager
    if (pluginConfig.routing.abTesting?.enabled && pluginConfig.routing.abTesting.experiments.length > 0) {
      try {
        abTestManager = new ABTestManager(pluginConfig.routing.abTesting.experiments);
        api.logger.info(`[SlimClaw] A/B testing manager initialized with ${pluginConfig.routing.abTesting.experiments.length} experiments`);
      } catch (error) {
        api.logger.info(`[SlimClaw] A/B testing initialization failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    api.logger.info(`SlimClaw registered - metrics: ${pluginConfig.metrics.enabled}, cache: ${pluginConfig.cacheBreakpoints.enabled}`);

    if (!pluginConfig.enabled) {
      api.logger.info('SlimClaw is disabled');
      return;
    }

    // =========================================================================
    // PROXY PROVIDER REGISTRATION (Phase 1)
    // =========================================================================
    if (pluginConfig.proxy?.enabled) {
      try {
        const providerCredentials = extractProviderCredentials(api.config);
        
        if (providerCredentials.size === 0) {
          api.logger.info('[SlimClaw] Warning: No provider credentials found, proxy may not work');
        } else {
          const providerList = Array.from(providerCredentials.keys()).join(', ');
          api.logger.info(`[SlimClaw] Found credentials for providers: ${providerList}`);
        }

        const sidecarPort = pluginConfig.proxy.port || 3334;
        const requestHandler = createSidecarRequestHandler({
          port: sidecarPort,
          virtualModels: pluginConfig.proxy.virtualModels || { auto: { enabled: true } },
          providerCredentials,
          slimclawConfig: typedConfig,
          timeout: pluginConfig.proxy.requestTimeout || 120000,
          services: {
            ...(budgetTracker ? { budgetTracker } : {}),
            ...(abTestManager ? { abTestManager } : {}),
            ...(latencyTracker ? { latencyTracker } : {})
          }
        });

        const sidecarServer = new SidecarServer({
          port: sidecarPort,
          timeout: pluginConfig.proxy.requestTimeout || 120000,
          handler: requestHandler
        });

        const provider = createSlimClawProvider({
          port: sidecarPort,
          virtualModels: pluginConfig.proxy.virtualModels || { auto: { enabled: true } },
          providerCredentials,
          slimclawConfig: typedConfig,
          timeout: pluginConfig.proxy.requestTimeout || 120000,
          services: {
            ...(budgetTracker ? { budgetTracker } : {}),
            ...(abTestManager ? { abTestManager } : {}),
            ...(latencyTracker ? { latencyTracker } : {})
          }
        });

        if (api.registerProvider) {
          api.registerProvider(provider);
        }

        if (api.registerService) {
          api.registerService({
            id: 'slimclaw-sidecar',
            name: 'SlimClaw Proxy Sidecar',
            start: async () => {
              await sidecarServer.start();
              api.logger.info(`[SlimClaw] Sidecar server started on port ${sidecarServer.getPort()}`);
            },
            stop: async () => {
              if (sidecarServer.isRunning()) {
                await sidecarServer.stop();
                api.logger.info('[SlimClaw] Sidecar server stopped');
              }
            }
          });
        }

        api.logger.info(`[SlimClaw] Provider proxy registered on port ${sidecarPort}`);
        api.logger.info(`[SlimClaw] To use: set model "slimclaw/auto" in OpenClaw config`);
      } catch (error) {
        api.logger.info(`[SlimClaw] Failed to register proxy provider: ${error instanceof Error ? error.message : error}`);
      }
    }

    // =========================================================================
    // Hook: before_model_resolve - Active routing (Phase 2b)
    // =========================================================================
    if (pluginConfig.routing.enabled && pluginConfig.routing.mode === 'active') {
      api.on('before_model_resolve', (event: { prompt: string }, ctx: { agentId?: string; sessionKey?: string }) => {
        try {
          if (!event.prompt) return;

          // 1. Classify the prompt
          const classification = classifyWithRouter(
            [{ role: 'user', content: event.prompt }] as Message[],
            pluginConfig.routing.tiers as Record<string, unknown>
          );

          api.logger.info(
            `[SlimClaw] Active routing: tier=${classification.tier} confidence=${(classification.confidence * 100).toFixed(0)}%`
          );

          // 2. Build routing context
          const routingCtx = {
            headers: {},
            agentId: ctx.agentId,
            sessionKey: ctx.sessionKey,
          };

          // 3. Full routing pipeline
          const fullConfig: SlimClawConfig = {
            ...DEFAULT_CONFIG,
            ...pluginConfig,
            routing: {
              ...DEFAULT_CONFIG.routing,
              ...pluginConfig.routing,
            },
          };

          const routingOutput = makeRoutingDecision(
            classification,
            fullConfig,
            routingCtx,
            `active-${Date.now()}`,
            {
              ...(budgetTracker ? { budgetTracker } : {}),
              ...(abTestManager ? { abTestManager } : {}),
            }
          );

          // 4. Log decision
          const shadow = routingOutput.shadow;
          api.logger.info(
            `[SlimClaw] Active routing decision: → ${shadow?.recommendedModel || routingOutput.model} ` +
            `(${shadow?.recommendedProvider?.provider || 'unknown'}) applied=${routingOutput.applied}`
          );

          // 5. Return override if routing suggests a model
          if (routingOutput.applied && routingOutput.model) {
            // Extract provider from tierProviders or model prefix
            const modelId = routingOutput.model;
            const providerName = shadow?.recommendedProvider?.provider || 
              modelId.split('/')[0] || undefined;
            
            return {
              modelOverride: modelId,
              ...(providerName ? { providerOverride: providerName } : {}),
            };
          }

          return; // No override
        } catch (error) {
          api.logger.info(
            `[SlimClaw] before_model_resolve error: ${error instanceof Error ? error.message : String(error)}`
          );
          return; // Graceful fallback
        }
      });

      api.logger.info('[SlimClaw] ✅ Active routing enabled via before_model_resolve hook');
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
        let fullRoutingOutput;
        const shouldShadowLog = pluginConfig.routing.mode 
          ? (pluginConfig.routing.mode === 'shadow' || pluginConfig.routing.mode === 'active')
          : pluginConfig.routing.shadowLogging;

        if (pluginConfig.routing.enabled && shouldShadowLog && routingResult) {
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
            const fullConfig: SlimClawConfig = {
              ...DEFAULT_CONFIG,
              enabled: pluginConfig.enabled,
              mode: 'shadow' as const,
              routing: {
                ...DEFAULT_CONFIG.routing,
                ...pluginConfig.routing,
              },
            };

            const routingOutput = makeRoutingDecision(
              classification,
              fullConfig,
              {
                originalModel: (event as any).model || 'unknown',
                headers: (event as any).headers || {}
              },
              runId,
              {
                ...(budgetTracker ? { budgetTracker } : {}),
                ...(abTestManager ? { abTestManager } : {})
              }
            );
            
            shadowRecommendation = routingOutput.shadow;
            
            // Store full routing output for Phase 3b tracking
            fullRoutingOutput = routingOutput;
            
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
          routingOutput: typeof fullRoutingOutput !== 'undefined' ? fullRoutingOutput : undefined,
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

      // === BUDGET TRACKING (Phase 3b) ===
      if (budgetTracker && pending.routing?.tier && latencyMs !== undefined) {
        // Prefer shadow cost data when available, fall back to estimate
        const shadowCostPer1k = pending.routingOutput?.shadow?.costDelta?.actualCostPer1k;
        const estimatedCost = shadowCostPer1k
          ? ((inputTokens + outputTokens) / 1000) * shadowCostPer1k
          : estimateModelCost(model, inputTokens, outputTokens, pluginConfig.routing.pricing as Record<string, { inputPer1k: number; outputPer1k: number }> | undefined);
        if (estimatedCost > 0) {
          budgetTracker.record(pending.routing.tier, estimatedCost);
          
          if (pluginConfig.metrics.logLevel === 'verbose') {
            const budgetStatus = budgetTracker.check(pending.routing.tier);
            api.logger.info(
              `[SlimClaw] Budget: ${pending.routing.tier} tier spent $${estimatedCost.toFixed(4)} | ` +
              `Daily remaining: $${budgetStatus.dailyRemaining.toFixed(2)} | ` +
              `Alert: ${budgetStatus.alertTriggered ? 'YES' : 'NO'}`
            );
          }
        }
      }

      // === A/B TESTING RESULTS (Phase 3b) ===
      if (abTestManager && pending.routingOutput?.abAssignment && latencyMs !== undefined) {
        // Prefer shadow cost data when available, fall back to estimate
        const abShadowCostPer1k = pending.routingOutput?.shadow?.costDelta?.actualCostPer1k;
        const estimatedCost = abShadowCostPer1k
          ? ((inputTokens + outputTokens) / 1000) * abShadowCostPer1k
          : estimateModelCost(model, inputTokens, outputTokens, pluginConfig.routing.pricing as Record<string, { inputPer1k: number; outputPer1k: number }> | undefined);
        abTestManager.recordOutcome(runId, {
          latencyMs,
          cost: estimatedCost,
          outputTokens
        });
        
        if (pluginConfig.metrics.logLevel === 'verbose') {
          api.logger.info(
            `[SlimClaw] A/B result recorded: ${pending.routingOutput.abAssignment.experimentId} / ` +
            `${pending.routingOutput.abAssignment.variant.id} | ` +
            `${latencyMs}ms, $${estimatedCost.toFixed(4)}, ${outputTokens} tokens`
          );
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

        // Phase 3b metrics
        if (budgetTracker) {
          const budgetStatus = budgetTracker.getStatus();
          lines.push('');
          lines.push('💰 **Budget Enforcement**');
          lines.push(`• Tiers tracked: ${budgetStatus.size}`);
          
          for (const [tier, status] of budgetStatus.entries()) {
            const dailyPercent = status.daily.limit > 0 ? status.daily.percent : 0;
            const weeklyPercent = status.weekly.limit > 0 ? status.weekly.percent : 0;
            lines.push(
              `  - ${tier}: $${status.daily.spent}/$${status.daily.limit} daily (${dailyPercent}%), ` +
              `$${status.weekly.spent}/$${status.weekly.limit} weekly (${weeklyPercent}%)`
            );
          }
        }

        if (abTestManager) {
          const experiments = abTestManager.listExperiments();
          const activeExperiments = experiments.filter(exp => exp.status === 'active');
          
          lines.push('');
          lines.push('🧪 **A/B Testing**');
          lines.push(`• Total experiments: ${experiments.length}`);
          lines.push(`• Active experiments: ${activeExperiments.length}`);
          
          for (const exp of activeExperiments.slice(0, 3)) { // Show top 3
            const results = abTestManager.getResults(exp.id);
            const totalSamples = results?.variants.reduce((sum, v) => sum + v.count, 0) || 0;
            lines.push(`  - ${exp.name}: ${totalSamples} samples${results?.significant ? ' (significant)' : ''}`);
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

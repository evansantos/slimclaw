/**
 * SlimClaw - OpenClaw Plugin
 * 
 * Complementa o contextPruning built-in do OpenClaw com:
 * 1. Métricas e observabilidade de economia de tokens
 * 2. Cache breakpoint injection (Anthropic prompt caching)
 * 3. Dashboard para visualização em tempo real
 */

import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';

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
  totalInputTokens: number;
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
}

// Global metrics store
const metrics: SlimClawMetrics = {
  totalRequests: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCacheReadTokens: 0,
  totalCacheWriteTokens: 0,
  estimatedSavings: 0,
  requestHistory: [],
};

// Pending requests for correlation
const pendingRequests = new Map<string, { inputTokens: number; timestamp: number }>();

// Plugin config (loaded at register)
let pluginConfig = {
  enabled: true,
  metrics: { enabled: true, logLevel: 'summary' },
  cacheBreakpoints: { enabled: true, minContentLength: 1000, provider: 'anthropic' },
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
    // Load config
    const rawConfig = api.pluginConfig as Record<string, unknown> || {};
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
      dashboard: {
        enabled: (rawConfig.dashboard as any)?.enabled || false,
        port: (rawConfig.dashboard as any)?.port || 3333,
      },
    };

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
        
        pendingRequests.set(runId, {
          inputTokens: estimatedTokens,
          timestamp: Date.now(),
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
      const cacheSavings = cacheReadTokens * 0.9;
      const savingsPercent = inputTokens > 0 
        ? (cacheSavings / inputTokens * 100) 
        : 0;

      // Update global metrics
      metrics.totalRequests++;
      metrics.totalInputTokens += inputTokens;
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

    // Dashboard requires full MetricsCollector - TODO: integrate properly
    if (pluginConfig.dashboard.enabled) {
      api.logger.info(`SlimClaw dashboard requested on port ${pluginConfig.dashboard.port} - not yet integrated with new plugin architecture`);
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
  metrics.totalOutputTokens = 0;
  metrics.totalCacheReadTokens = 0;
  metrics.totalCacheWriteTokens = 0;
  metrics.estimatedSavings = 0;
  metrics.requestHistory = [];
}

export default slimclawPlugin;

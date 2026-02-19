/**
 * SlimClaw Inference Optimizer - Middleware Principal
 * Orquestra windowing + cache injection para otimização de inferência
 */

import { windowConversation, buildWindowedMessages } from '../windowing/windower.js';
import { injectCacheBreakpoints } from '../cache/breakpoints.js';
import { estimateTokens } from '../windowing/token-counter.js';
import type { SlimClawConfig } from '../config.js';
import type { OptimizerMetrics, MetricsCollector } from '../metrics/index.js';
import { createRequestLogger } from '../logging/index.js';

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<{ type: string; text?: string; [key: string]: unknown }>;
  tool_calls?: unknown[];
  tool_use?: unknown[];
  cache_control?: { type: 'ephemeral' };
  [key: string]: unknown;
}

export interface OptimizedResult {
  messages: Message[];
  metrics: OptimizerMetrics;
}

export interface OptimizationContext {
  requestId: string;
  agentId: string;
  sessionKey: string;
  bypassOptimization?: boolean;
  debugHeaders?: boolean;
  mode?: "shadow" | "active";
  originalModel?: string;
}

/**
 * Principal função de otimização - orquestra windowing + cache
 * 
 * @param messages Array de mensagens originais
 * @param config Configuração do SlimClaw
 * @param context Contexto da requisição (IDs, flags)
 * @param collector Optional metrics collector to record results
 * @returns Resultado otimizado com métricas completas
 */
export async function inferenceOptimizer(
  messages: Message[],
  config: SlimClawConfig,
  context: OptimizationContext,
  collector?: MetricsCollector
): Promise<OptimizedResult> {
  const startTime = Date.now();
  
  // Create request-scoped logger with SlimClaw config
  const logger = createRequestLogger(
    context.requestId,
    context.agentId,
    context.sessionKey
  ).updateConfig({
    level: config.logging?.level || 'info',
    format: config.logging?.format || 'human',
    consoleOutput: config.logging?.consoleOutput !== false,
    fileOutput: config.logging?.fileOutput !== false,
    colors: config.logging?.colors !== false,
  });
  
  // Graceful fallback - se disabled ou bypass, retorna original
  if (!config.enabled || context.bypassOptimization) {
    logger.debug('Optimization bypassed', { 
      enabled: config.enabled, 
      bypass: context.bypassOptimization 
    });
    return createPassthroughResult(messages, context, logger);
  }

  logger.debug('Starting optimization pipeline', {
    messageCount: messages.length,
    mode: context.mode,
  });

  try {
    // Calcular tokens originais
    const originalTokens = estimateTokens(messages);
    
    let optimizedMessages = messages;
    let windowingApplied = false;
    let trimmedMessages = 0;
    let summaryTokens = 0;
    let cacheBreakpointsInjected = 0;
    let summarizationMethod: "none" | "heuristic" | "llm" = "none";

    // Step 1: Windowing (se habilitado)
    if (config.windowing.enabled) {
      logger.debug('Starting windowing step', {
        maxMessages: config.windowing.maxMessages,
        maxTokens: config.windowing.maxTokens,
      });

      const windowResult = windowConversation(messages, {
        maxMessages: config.windowing.maxMessages,
        maxTokens: config.windowing.maxTokens,
        summarizeThreshold: config.windowing.summarizeThreshold,
      });

      if (windowResult.meta.originalTokenEstimate > windowResult.meta.windowedTokenEstimate) {
        optimizedMessages = buildWindowedMessages(windowResult);
        windowingApplied = true;
        trimmedMessages = windowResult.meta.trimmedMessageCount;
        summaryTokens = windowResult.meta.summaryTokenEstimate;
        summarizationMethod = windowResult.meta.summarizationMethod;

        logger.debug('Windowing applied', {
          originalMessages: windowResult.meta.originalMessageCount,
          windowedMessages: windowResult.meta.windowedMessageCount,
          trimmedMessages,
          originalTokens: windowResult.meta.originalTokenEstimate,
          windowedTokens: windowResult.meta.windowedTokenEstimate,
          summarizationMethod,
        });
      } else {
        logger.debug('Windowing skipped - no benefit', {
          originalTokens: windowResult.meta.originalTokenEstimate,
          windowedTokens: windowResult.meta.windowedTokenEstimate,
        });
      }
    } else {
      logger.debug('Windowing disabled');
    }

    // Step 2: Cache injection (se habilitado)
    if (config.caching.enabled) {
      logger.debug('Starting cache injection step', {
        injectBreakpoints: config.caching.injectBreakpoints,
        minContentLength: config.caching.minContentLength,
      });

      const cacheResult = injectCacheBreakpoints(
        optimizedMessages as any[], // Type assertion para compatibilidade
        {
          enabled: config.caching.injectBreakpoints,
          minContentLength: config.caching.minContentLength,
        }
      );

      if (cacheResult.stats.breakpointsInjected > 0) {
        optimizedMessages = cacheResult.messages as Message[];
        cacheBreakpointsInjected = cacheResult.stats.breakpointsInjected;

        logger.debug('Cache breakpoints injected', {
          breakpointsInjected: cacheBreakpointsInjected,
          eligibleMessages: cacheResult.stats.eligibleMessages,
        });
      } else {
        logger.debug('No cache breakpoints injected', {
          eligibleMessages: cacheResult.stats.eligibleMessages,
        });
      }
    } else {
      logger.debug('Caching disabled');
    }

    // Calcular tokens finais
    const optimizedTokens = estimateTokens(optimizedMessages);
    const tokensSaved = originalTokens - optimizedTokens;
    
    // Create complete metrics object
    const metrics: OptimizerMetrics = {
      requestId: context.requestId,
      timestamp: new Date().toISOString(),
      agentId: context.agentId,
      sessionKey: context.sessionKey,
      mode: context.mode ?? "active",
      
      // Input state
      originalModel: context.originalModel ?? "unknown",
      originalMessageCount: messages.length,
      originalTokenEstimate: originalTokens,
      
      // Windowing results
      windowingApplied,
      windowedMessageCount: optimizedMessages.length,
      windowedTokenEstimate: optimizedTokens,
      trimmedMessages,
      summaryTokens,
      summarizationMethod,
      
      // Classification (defaults - would be filled by classifier integration)
      // Note: Currently defaults to "complex" until classifier service is integrated
      classificationTier: "complex",
      classificationConfidence: 0,
      classificationScores: { simple: 0, mid: 0, complex: 1, reasoning: 0 },
      classificationSignals: [],
      
      // Routing (defaults - would be filled by router)
      routingApplied: false,
      targetModel: context.originalModel ?? "unknown",
      modelDowngraded: false,
      modelUpgraded: false,
      
      // Cache results
      cacheBreakpointsInjected,
      
      // API response (to be filled by llm_output hook)
      actualInputTokens: null,
      actualOutputTokens: null,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      latencyMs: Date.now() - startTime,
      
      // Savings
      tokensSaved,
      // Note: Cost calculation requires pricing model integration - set in API response hooks
      estimatedCostOriginal: null,
      estimatedCostOptimized: null,
      estimatedCostSaved: null,
    };

    // Record metrics if collector provided
    if (collector) {
      collector.record(metrics);
    }

    // Log optimization results
    logger.logOptimization({
      requestId: context.requestId,
      windowing: windowingApplied,
      trimmed: trimmedMessages,
      tokensSaved,
      cache_breakpoints: cacheBreakpointsInjected,
      original_tokens: originalTokens,
      optimized_tokens: optimizedTokens,
      summarization_method: summarizationMethod,
    });

    logger.info('Optimization completed', {
      windowingApplied,
      cacheBreakpointsInjected,
      tokensSaved,
      savingsPercent: originalTokens > 0 ? ((tokensSaved / originalTokens) * 100).toFixed(1) : '0',
      latencyMs: Date.now() - startTime,
    });

    return {
      messages: optimizedMessages,
      metrics,
    };

  } catch (error) {
    // Graceful fallback em caso de erro
    logger.error('SlimClaw optimization failed', error instanceof Error ? error : { error });
    return createPassthroughResult(messages, context, logger);
  }
}

/**
 * Cria resultado de passthrough (sem otimização)
 */
function createPassthroughResult(
  messages: Message[], 
  context: OptimizationContext, 
  logger?: ReturnType<typeof createRequestLogger>
): OptimizedResult {
  const tokens = estimateTokens(messages);

  if (logger) {
    logger.debug('Creating passthrough result', { 
      messageCount: messages.length, 
      tokens 
    });
  }
  
  const metrics: OptimizerMetrics = {
    requestId: context.requestId,
    timestamp: new Date().toISOString(),
    agentId: context.agentId,
    sessionKey: context.sessionKey,
    mode: context.mode ?? "active",
    
    originalModel: context.originalModel ?? "unknown",
    originalMessageCount: messages.length,
    originalTokenEstimate: tokens,
    
    windowingApplied: false,
    windowedMessageCount: messages.length,
    windowedTokenEstimate: tokens,
    trimmedMessages: 0,
    summaryTokens: 0,
    summarizationMethod: "none",
    
    classificationTier: "complex",
    classificationConfidence: 0,
    classificationScores: { simple: 0, mid: 0, complex: 1, reasoning: 0 },
    classificationSignals: [],
    
    routingApplied: false,
    targetModel: context.originalModel ?? "unknown",
    modelDowngraded: false,
    modelUpgraded: false,
    
    cacheBreakpointsInjected: 0,
    
    actualInputTokens: null,
    actualOutputTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    latencyMs: null,
    
    tokensSaved: 0,
    estimatedCostOriginal: null,
    estimatedCostOptimized: null,
    estimatedCostSaved: null,
  };
  
  return {
    messages,
    metrics,
  };
}

/**
 * Gera headers de debug baseados no resultado da otimização
 */
export function generateDebugHeaders(
  result: OptimizedResult,
  config: SlimClawConfig
): Record<string, string> {
  const headers: Record<string, string> = {
    'X-SlimClaw-Request-Id': result.metrics.requestId,
    'X-SlimClaw-Enabled': config.enabled ? 'true' : 'false',
    'X-SlimClaw-Mode': result.metrics.mode,
  };

  if (config.enabled) {
    headers['X-SlimClaw-Original-Tokens'] = result.metrics.originalTokenEstimate.toString();
    headers['X-SlimClaw-Optimized-Tokens'] = result.metrics.windowedTokenEstimate.toString();
    headers['X-SlimClaw-Tokens-Saved'] = (result.metrics.tokensSaved ?? 0).toString();
    
    const savingsPercent = result.metrics.originalTokenEstimate > 0 
      ? ((result.metrics.originalTokenEstimate - result.metrics.windowedTokenEstimate) / result.metrics.originalTokenEstimate) * 100
      : 0;
    headers['X-SlimClaw-Savings-Percent'] = savingsPercent.toFixed(1);
    
    headers['X-SlimClaw-Windowing'] = result.metrics.windowingApplied ? 'applied' : 'skipped';
    headers['X-SlimClaw-Caching'] = result.metrics.cacheBreakpointsInjected > 0 ? 'applied' : 'skipped';
    headers['X-SlimClaw-Classification'] = result.metrics.classificationTier;
    headers['X-SlimClaw-Routing'] = result.metrics.routingApplied ? 'applied' : 'skipped';
    
    if (result.metrics.trimmedMessages > 0) {
      headers['X-SlimClaw-Trimmed-Messages'] = result.metrics.trimmedMessages.toString();
    }
    
    if (result.metrics.trimmedMessages > 0) {
      headers['X-SlimClaw-Trimmed-Messages'] = result.metrics.trimmedMessages.toString();
    }
    
    if (result.metrics.cacheBreakpointsInjected > 0) {
      headers['X-SlimClaw-Cache-Breakpoints'] = result.metrics.cacheBreakpointsInjected.toString();
    }

    // Add verbose debug information if available
    if (result.metrics.latencyMs !== null) {
      headers['X-SlimClaw-Latency-Ms'] = result.metrics.latencyMs.toString();
    }

    headers['X-SlimClaw-Agent-Id'] = result.metrics.agentId;
    headers['X-SlimClaw-Session-Key'] = result.metrics.sessionKey;
  }

  return headers;
}

/**
 * Determina se deve aplicar otimização baseado no contexto
 */
export function shouldOptimize(
  context: OptimizationContext,
  headers?: Record<string, string>
): boolean {
  // Check bypass header
  if (headers?.['X-SlimClaw-Bypass'] === 'true') {
    return false;
  }

  // Check context bypass
  if (context.bypassOptimization) {
    return false;
  }

  return true;
}

/**
 * Cria contexto de otimização com defaults
 */
export function createOptimizationContext(
  requestId: string,
  agentId = 'unknown',
  sessionKey = 'unknown',
  options: {
    bypassOptimization?: boolean;
    debugHeaders?: boolean;
  } = {}
): OptimizationContext {
  return {
    requestId,
    agentId,
    sessionKey,
    bypassOptimization: options.bypassOptimization || false,
    debugHeaders: options.debugHeaders || false,
  };
}
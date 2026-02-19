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
import { classifyWithRouter } from '../classifier/clawrouter-classifier.js';
import { classifyComplexity } from '../classifier/index.js';
import type { ComplexityTier } from '../metrics/types.js';

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
    
    // Routing variables
    let routingApplied = false;
    let targetModel = context.originalModel ?? "unknown";
    let modelDowngraded = false;
    let modelUpgraded = false;
    let routingTier: ComplexityTier | undefined;
    let routingConfidence: number | undefined;
    let routingSavingsPercent: number | undefined;
    let routingCostEstimate: number | undefined;

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

    // Step 1.5: Routing (se habilitado)
    let classificationResult;
    try {
      if (config.routing.enabled) {
        logger.debug('Starting routing step');

        // Use ClawRouter for classification when routing is enabled
        classificationResult = classifyWithRouter(optimizedMessages);
        
        // Extract routing data from classification result
        routingTier = classificationResult.tier;
        routingConfidence = classificationResult.confidence;
        
        // Determine target model based on classification
        const tierModel = config.routing.tiers[classificationResult.tier];
        if (tierModel && tierModel !== (context.originalModel ?? "unknown")) {
          
          // Check if original model is pinned (should not be routed)
          const originalModel = context.originalModel ?? "unknown";
          const isPinned = config.routing.pinnedModels.includes(originalModel);
          
          // Only apply routing if confidence meets threshold and model isn't pinned
          if (classificationResult.confidence >= config.routing.minConfidence && !isPinned) {
            targetModel = tierModel;
            routingApplied = true;
            
            // Determine if it's an upgrade or downgrade
            // This is a simplified check - in production you'd want actual model tier mapping
            const originalTier = getModelTier(originalModel, config.routing.tiers);
            const newTier = classificationResult.tier;
            
            if (isModelDowngrade(originalTier, newTier)) {
              modelDowngraded = true;
            } else if (isModelUpgrade(originalTier, newTier)) {
              modelUpgraded = true;
            }
            
            // Calculate estimated savings (simplified - would use actual pricing in production)
            routingSavingsPercent = calculateRoutingSavings(originalModel, targetModel, classificationResult.tier);
            routingCostEstimate = estimateModelCost(targetModel, originalTokens);

            logger.info('Routing applied', {
              originalModel,
              targetModel,
              tier: classificationResult.tier,
              confidence: classificationResult.confidence,
              downgraded: modelDowngraded,
              upgraded: modelUpgraded,
              savingsPercent: routingSavingsPercent,
            });
          } else {
            logger.debug('Routing skipped', {
              reason: isPinned ? 'model_pinned' : 'low_confidence',
              confidence: classificationResult.confidence,
              threshold: config.routing.minConfidence,
            });
          }
        } else {
          logger.debug('Routing skipped - no tier model change needed', {
            currentModel: context.originalModel,
            suggestedTier: classificationResult.tier,
            tierModel,
          });
        }
      } else {
        // Routing disabled - use fallback heuristic classifier
        logger.debug('Routing disabled - using heuristic classification');
        classificationResult = classifyComplexity(optimizedMessages);
      }
    } catch (error) {
      // Graceful degradation - if routing fails, continue with windowing/cache only
      logger.warn('Routing failed, falling back to heuristic classification', { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      classificationResult = classifyComplexity(optimizedMessages);
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
    
    // Calculate windowing savings percentage
    const windowingSavings = originalTokens > 0 ? tokensSaved / originalTokens : 0;
    const routingSavings = (routingSavingsPercent ?? 0) / 100; // Convert to 0-1 fraction
    
    // Calculate combined savings using the specified formula
    const combinedSavingsPercent = 1 - (1 - windowingSavings) * (1 - routingSavings);
    
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
      
      // Classification (from classifier result)
      classificationTier: classificationResult?.tier ?? "complex",
      classificationConfidence: classificationResult?.confidence ?? 0,
      classificationScores: classificationResult?.scores ?? { simple: 0, mid: 0, complex: 1, reasoning: 0 },
      classificationSignals: classificationResult?.signals ?? [],
      
      // Routing results
      routingApplied,
      targetModel,
      modelDowngraded,
      modelUpgraded,
      combinedSavingsPercent,
      
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

    // Add optional routing properties if they exist
    if (routingTier !== undefined) {
      metrics.routingTier = routingTier;
    }
    if (routingConfidence !== undefined) {
      metrics.routingConfidence = routingConfidence;
    }
    if (routingSavingsPercent !== undefined) {
      metrics.routingSavingsPercent = routingSavingsPercent;
    }
    if (routingCostEstimate !== undefined) {
      metrics.routingCostEstimate = routingCostEstimate;
    }

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
      routing_applied: routingApplied,
      target_model: targetModel,
      routing_tier: routingTier,
      routing_confidence: routingConfidence,
      combined_savings_percent: combinedSavingsPercent,
    });

    logger.info('Optimization completed', {
      windowingApplied,
      routingApplied,
      cacheBreakpointsInjected,
      tokensSaved,
      windowingSavingsPercent: originalTokens > 0 ? ((tokensSaved / originalTokens) * 100).toFixed(1) : '0',
      combinedSavingsPercent: (combinedSavingsPercent * 100).toFixed(1),
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
 * Helper function to get model tier from routing tiers config
 */
function getModelTier(model: string, tiers: Record<string, string>): ComplexityTier | null {
  for (const [tier, tierModel] of Object.entries(tiers)) {
    if (tierModel === model) {
      return tier as ComplexityTier;
    }
  }
  return null;
}

/**
 * Helper function to check if routing represents a model downgrade
 */
function isModelDowngrade(originalTier: ComplexityTier | null, newTier: ComplexityTier): boolean {
  const tierOrder = { simple: 0, mid: 1, complex: 2, reasoning: 3 };
  if (!originalTier) return false;
  return tierOrder[newTier] < tierOrder[originalTier];
}

/**
 * Helper function to check if routing represents a model upgrade
 */
function isModelUpgrade(originalTier: ComplexityTier | null, newTier: ComplexityTier): boolean {
  const tierOrder = { simple: 0, mid: 1, complex: 2, reasoning: 3 };
  if (!originalTier) return false;
  return tierOrder[newTier] > tierOrder[originalTier];
}

/**
 * Helper function to calculate estimated routing savings
 * In production, this would use actual model pricing data
 */
function calculateRoutingSavings(_originalModel: string, _targetModel: string, tier: ComplexityTier): number {
  // Simplified savings calculation based on tier
  // In production, you'd use actual pricing data
  // Returns percentage (0-100, not 0-1)
  const savingsMap: Record<ComplexityTier, number> = {
    simple: 70,    // 70% savings for simple tasks
    mid: 30,       // 30% savings for mid-complexity
    complex: 10,   // 10% savings for complex tasks
    reasoning: -20  // 20% cost increase for reasoning tasks
  };
  
  return savingsMap[tier] || 0;
}

/**
 * Helper function to estimate model cost
 * Simplified implementation - in production would use actual pricing
 */
function estimateModelCost(model: string, tokens: number): number {
  // Simplified cost estimation ($ per 1000 tokens)
  const costPer1k: Record<string, number> = {
    'anthropic/claude-3-haiku-20240307': 0.0025,
    'anthropic/claude-sonnet-4-20250514': 0.015,
    'anthropic/claude-opus-4-20250514': 0.075,
  };
  
  const rate = costPer1k[model] || 0.015; // Default to sonnet pricing
  return (tokens / 1000) * rate;
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
    combinedSavingsPercent: 0,
    
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
import type { ProviderResolution } from './provider-resolver.js';
import type { ModelRoutingDecision } from './model-router.js';
import { resolveProvider } from './provider-resolver.js';
import { estimateModelCost, DEFAULT_MODEL_PRICING } from './pricing.js';
import { buildOpenRouterHeaders } from './routing-decision.js';

/**
 * A complete shadow routing recommendation — everything we WOULD do
 * if hook mutation were available.
 */
export interface ShadowRecommendation {
  /** Timestamp of the recommendation */
  timestamp: string;
  /** The request's run ID for correlation */
  runId: string;
  /** What model the request actually used */
  actualModel: string;
  /** What model we would have routed to */
  recommendedModel: string;
  /** Which provider endpoint we would have used */
  recommendedProvider: ProviderResolution;
  /** The routing decision details */
  decision: ModelRoutingDecision;
  /** Cost comparison */
  costDelta: {
    /** Estimated cost of actual model (per 1k tokens avg) */
    actualCostPer1k: number;
    /** Estimated cost of recommended model (per 1k tokens avg) */
    recommendedCostPer1k: number;
    /** Savings percentage (0-100) */
    savingsPercent: number;
    /** Monthly projection based on current usage rate (optional) */
    projectedMonthlySavings?: number;
  };
  /** Additional headers we would have injected */
  recommendedHeaders: Record<string, string>;
  /** Thinking config we would have set */
  recommendedThinking: { type: "enabled"; budget_tokens: number } | null;
  /** Whether this recommendation would have been applied (confidence met, not pinned, etc.) */
  wouldApply: boolean;
  /** Human-readable summary for logging */
  summary: string;
}

/**
 * Calculate cost comparison between two models.
 * Uses standard 1k input + 1k output tokens for comparison.
 */
function calculateCostDelta(
  actualModel: string,
  recommendedModel: string,
  pricing?: Record<string, { inputPer1k: number; outputPer1k: number }>
): {
  actualCostPer1k: number;
  recommendedCostPer1k: number;
  savingsPercent: number;
} {
  const allPricing = { ...DEFAULT_MODEL_PRICING, ...pricing };
  
  // Use 1k input + 1k output for standard comparison
  const actualCost = estimateModelCost(actualModel, 1000, 1000, allPricing);
  const recommendedCost = estimateModelCost(recommendedModel, 1000, 1000, allPricing);
  
  const savingsPercent = actualCost > 0 
    ? Math.max(0, ((actualCost - recommendedCost) / actualCost) * 100)
    : 0;

  return {
    actualCostPer1k: actualCost,
    recommendedCostPer1k: recommendedCost,
    savingsPercent: Math.round(savingsPercent * 100) / 100 // Round to 2 decimal places
  };
}

/**
 * Build a complete shadow routing recommendation.
 * 
 * This is the main entry point — it orchestrates:
 * 1. Model resolution (from resolveModel)
 * 2. Provider resolution (from resolveProvider)
 * 3. Cost delta calculation (from pricing)
 * 4. Header assembly (OpenRouter-specific)
 * 5. Summary formatting
 * 
 * @param runId - Request run ID
 * @param actualModel - The model the request is actually using
 * @param decision - The routing decision from resolveModel()
 * @param tierProviders - Provider mapping config
 * @param pricing - Pricing data for cost comparison
 * @returns Complete shadow recommendation
 */
export function buildShadowRecommendation(
  runId: string,
  actualModel: string,
  decision: ModelRoutingDecision,
  tierProviders?: Record<string, string>,
  pricing?: Record<string, { inputPer1k: number; outputPer1k: number }>
): ShadowRecommendation {
  const timestamp = new Date().toISOString();
  const recommendedModel = decision.targetModel;
  
  // Resolve provider for the recommended model
  const recommendedProvider = resolveProvider(recommendedModel, tierProviders);
  
  // Calculate cost delta
  const costDelta = calculateCostDelta(actualModel, recommendedModel, pricing);
  
  // Build headers (OpenRouter-specific for now)
  const recommendedHeaders = buildOpenRouterHeaders();
  
  // Extract thinking config
  const recommendedThinking = decision.thinking;
  
  // Determine if we would actually apply this
  const wouldApply = decision.applied && decision.reason === 'routed';
  
  // Build human-readable summary
  const actualShort = actualModel.split('/').pop() || actualModel;
  const recommendedShort = recommendedModel.split('/').pop() || recommendedModel;
  const summary = wouldApply
    ? `Would route ${actualShort} → ${recommendedShort} via ${recommendedProvider.provider} (${decision.tier}, ${costDelta.savingsPercent}% savings)`
    : `Would keep ${actualShort} (${decision.reason}, no routing)`;

  return {
    timestamp,
    runId,
    actualModel,
    recommendedModel,
    recommendedProvider,
    decision,
    costDelta,
    recommendedHeaders,
    recommendedThinking,
    wouldApply,
    summary
  };
}

/**
 * Format a shadow recommendation into a structured log line.
 * 
 * Output format (info level):
 *   [SlimClaw] 🔮 Shadow route: opus-4-6 → o4-mini (via openrouter)
 *              Tier: reasoning (0.92) | Savings: 78% | $0.045/1k → $0.003/1k
 * 
 * Output format (debug level, adds):
 *              Provider: openrouter (matched openai/*) 
 *              Headers: { HTTP-Referer: "slimclaw", X-Title: "SlimClaw" }
 *              Would apply: true
 * 
 * @param recommendation - The shadow recommendation to format
 * @param level - Log level ("info" for summary, "debug" for full details)
 * @returns Formatted log string
 */
export function formatShadowLog(
  recommendation: ShadowRecommendation,
  level: "info" | "debug"
): string {
  const actualShort = recommendation.actualModel.split('/').pop() || recommendation.actualModel;
  const recommendedShort = recommendation.recommendedModel.split('/').pop() || recommendation.recommendedModel;
  
  let log = `[SlimClaw] 🔮 Shadow route: ${actualShort} → ${recommendedShort}`;
  
  if (recommendation.wouldApply) {
    log += ` (via ${recommendation.recommendedProvider.provider})`;
    log += `\n           Tier: ${recommendation.decision.tier} (${recommendation.decision.confidence})`;
    log += ` | Savings: ${recommendation.costDelta.savingsPercent}%`;
    log += ` | $${recommendation.costDelta.actualCostPer1k}/1k → $${recommendation.costDelta.recommendedCostPer1k}/1k`;
  } else {
    log += ` (${recommendation.decision.reason})`;
    log += `\n           Tier: ${recommendation.decision.tier} (${recommendation.decision.confidence})`;
    log += ` | No routing applied`;
  }

  if (level === 'debug') {
    log += `\n           Provider: ${recommendation.recommendedProvider.provider}`;
    if (recommendation.recommendedProvider.matchedPattern) {
      log += ` (matched pattern: ${recommendation.recommendedProvider.matchedPattern})`;
    }
    log += `\n           Headers: ${JSON.stringify(recommendation.recommendedHeaders)}`;
    if (recommendation.recommendedThinking) {
      log += `\n           Thinking: { type: "${recommendation.recommendedThinking.type}", budget_tokens: ${recommendation.recommendedThinking.budget_tokens} }`;
    }
    log += `\n           Would apply: ${recommendation.wouldApply ? 'YES' : 'NO'}`;
  }

  return log;
}
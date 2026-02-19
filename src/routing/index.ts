/**
 * SlimClaw Model Routing - Main Exports
 * 
 * Entry point for the routing module that handles automatic model selection
 * based on complexity classification and configuration overrides.
 * 
 * @example
 * ```typescript
 * import { resolveModel } from './routing/index.js';
 * import { classifyComplexity } from './classifier/index.js';
 * 
 * const classification = classifyComplexity(messages);
 * const decision = resolveModel(classification, routingConfig, context);
 * 
 * console.log(`Routed to ${decision.targetModel} (${decision.reason})`);
 * ```
 */

// Main routing function
export { 
  resolveModel,
  type ModelRoutingDecision 
} from './model-router.js';

// Tier management
export { 
  getTierModel,
  isTierReasoning,
  getThinkingBudget,
  isDowngrade,
  isUpgrade,
  inferTierFromModel,
  DEFAULT_TIER_MODELS,
  type ComplexityTier 
} from './tiers.js';

// Override handling
export { 
  processOverrides,
  checkHeaderOverride,
  checkPinnedModelConfig,
  checkConfidenceThreshold,
  type RoutingContext,
  type OverrideResult 
} from './overrides.js';

/**
 * Version info for the routing module
 */
export const ROUTING_VERSION = '0.1.0';

/**
 * Default routing configuration for quick setup
 */
export const DEFAULT_ROUTING_CONFIG = {
  enabled: true,
  allowDowngrade: true,
  minConfidence: 0.4,
  pinnedModels: [],
  tiers: {
    simple: "anthropic/claude-3-haiku-20240307",
    mid: "anthropic/claude-sonnet-4-20250514",
    complex: "anthropic/claude-opus-4-20250514",
    reasoning: "anthropic/claude-opus-4-20250514",
  }
} as const;
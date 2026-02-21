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

// Phase 2a: Shadow Routing
export { 
  resolveProvider,
  matchTierProvider,
  inferProviderFromModelId,
  type ProviderResolution 
} from './provider-resolver.js';

export { 
  buildShadowRecommendation,
  formatShadowLog,
  type ShadowRecommendation 
} from './shadow-router.js';

export { 
  makeRoutingDecision,
  buildOpenRouterHeaders,
  type RoutingOutput 
} from './routing-decision.js';

// Phase 3a: Dynamic Pricing + Latency Tracking
export { 
  DynamicPricingCache,
  type DynamicPricingConfig,
  DEFAULT_DYNAMIC_PRICING_CONFIG
} from './dynamic-pricing.js';

export {
  LatencyTracker,
  type LatencyTrackerConfig,
  type LatencyStats,
  DEFAULT_LATENCY_TRACKER_CONFIG
} from './latency-tracker.js';

// Phase 3b: Budget Enforcement + A/B Testing
export { 
  BudgetTracker,
  type BudgetConfig,
  type BudgetCheckResult,
  DEFAULT_BUDGET_CONFIG
} from './budget-tracker.js';

export {
  ABTestManager,
  type ABExperiment,
  type ABVariant,
  type ABResult,
  type ABExperimentResults,
  type ABAssignment,
  type ABOutcome,
  DEFAULT_AB_CONFIG
} from './ab-testing.js';

/**
 * Version info for the routing module (update for Phase 3b)
 */
export const ROUTING_VERSION = '0.3.0';

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
  },
  // Phase 3a defaults
  dynamicPricing: {
    enabled: false,
    cacheTtlMs: 21600000,
    fetchTimeoutMs: 5000
  },
  latencyTracking: {
    enabled: true,
    windowSize: 50,
    outlierThresholdMs: 60000
  },
  // Phase 3b defaults
  budget: {
    enabled: false,
    daily: {},
    weekly: {},
    alertThresholdPercent: 80,
    enforcementAction: 'alert-only'
  },
  abTesting: {
    enabled: false,
    experiments: []
  }
} as const;
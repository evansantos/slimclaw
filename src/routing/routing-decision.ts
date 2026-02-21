import type { SlimClawConfig } from '../config.js';
import type { ClassificationResult } from '../classifier/index.js';
import type { RoutingContext } from './overrides.js';
import { resolveModel } from './model-router.js';
import { getDowngradeTier } from './tiers.js';

// Import dependencies with fallback handling for parallel development
import { resolveProvider } from './provider-resolver.js';
import { buildShadowRecommendation, type ShadowRecommendation } from './shadow-router.js';

// Phase 3b imports
import { BudgetTracker } from './budget-tracker.js';
import { ABTestManager, type ABAssignment } from './ab-testing.js';

/**
 * The complete output of a routing decision — what would be returned
 * to OpenClaw via a mutating beforeModelRequest hook.
 */
export interface RoutingOutput {
  /** Target model ID */
  model: string;
  /** Provider endpoint to use */
  provider: string;
  /** Headers to inject (e.g., OpenRouter HTTP-Referer, X-Title) */
  headers: Record<string, string>;
  /** Thinking configuration for reasoning models */
  thinking: { type: "enabled"; budget_tokens: number } | null;
  /** Whether routing was actually applied (vs. kept original) */
  applied: boolean;
  /** Shadow recommendation for logging */
  shadow: ShadowRecommendation;
  /** Budget check result (Phase 3b) */
  budget?: {
    allowed: boolean;
    dailyRemaining: number;
    weeklyRemaining: number;
    alertTriggered: boolean;
    enforcementAction: string;
  };
  /** A/B test assignment (Phase 3b) */
  abAssignment?: ABAssignment;
}

/**
 * Build OpenRouter-specific headers for a request.
 * 
 * OpenRouter recommends:
 * - HTTP-Referer: your app URL (for rankings)
 * - X-Title: your app name (shown in dashboard)
 * 
 * @param appName - Application name (default: "SlimClaw")
 * @param appUrl - Application URL (optional)
 * @returns Headers to inject
 */
export function buildOpenRouterHeaders(
  appName?: string,
  appUrl?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Title': appName || 'SlimClaw'
  };

  if (appUrl) {
    headers['HTTP-Referer'] = appUrl;
  } else {
    headers['HTTP-Referer'] = 'slimclaw';
  }

  return headers;
}

/**
 * Make a complete routing decision for a request.
 * 
 * This function:
 * 1. Classifies the request (or accepts pre-classified result)
 * 2. Resolves the target model via resolveModel()
 * 3. Checks budget constraints (Phase 3b)
 * 4. Applies A/B testing assignments (Phase 3b)
 * 5. Resolves the provider via resolveProvider()
 * 6. Assembles headers for the target provider
 * 7. Builds shadow recommendation for logging
 * 
 * @param classification - Pre-computed classification result
 * @param config - Full SlimClaw config
 * @param ctx - Request context (originalModel, headers, etc.)
 * @param runId - Request run ID for correlation
 * @param services - Optional Phase 3a/3b services (budgetTracker, abTestManager, etc.)
 * @returns Complete routing output
 */
export function makeRoutingDecision(
  classification: ClassificationResult,
  config: SlimClawConfig,
  ctx: RoutingContext,
  runId: string,
  services?: {
    budgetTracker?: BudgetTracker;
    abTestManager?: ABTestManager;
  }
): RoutingOutput {
  // Step 1: Resolve the target model
  let decision = resolveModel(classification, config.routing, ctx);
  
  // Step 2: Budget enforcement (Phase 3b)
  let budgetResult;
  if (services?.budgetTracker && config.routing.budget?.enabled) {
    budgetResult = services.budgetTracker.check(decision.tier);
    
    // Apply enforcement if budget exceeded
    if (!budgetResult.allowed) {
      const action = config.routing.budget.enforcementAction ?? 'alert-only';
      if (action === 'downgrade') {
        // Try to downgrade to a cheaper tier
        const downgradeTier = getDowngradeTier(decision.tier);
        
        // Re-resolve with downgraded tier
        const downgradeClassification = { ...classification, tier: downgradeTier as any };
        decision = resolveModel(downgradeClassification, config.routing, ctx);
        decision.reason = 'budget-downgrade';
      } else if (action === 'block') {
        // Keep original model but mark as blocked
        decision.reason = 'budget-blocked';
      }
      // 'alert-only': no mutation, just log
    }
  }
  
  // Step 3: A/B testing assignment (Phase 3b)
  let abAssignment;
  if (services?.abTestManager && config.routing.abTesting?.enabled) {
    abAssignment = services.abTestManager.assign(decision.tier, runId);
    
    // Override model if assigned to experiment
    if (abAssignment) {
      decision.targetModel = abAssignment.variant.model;
      // Preserve budget-enforced reason if already set
      if (!decision.reason.startsWith('budget-')) {
        decision.reason = 'routed';
      }
    }
  }
  
  // Step 4: Resolve the provider for the target model
  const providerResolution = resolveProvider(
    decision.targetModel,
    config.routing.tierProviders
  );
  
  // Step 5: Build headers based on provider
  let headers: Record<string, string> = {};
  
  if (providerResolution.provider === 'openrouter') {
    // Use OpenRouter-specific headers
    const openRouterConfig = config.routing.openRouterHeaders;
    if (openRouterConfig) {
      headers = buildOpenRouterHeaders(
        openRouterConfig['X-Title'],
        openRouterConfig['HTTP-Referer']
      );
    } else {
      headers = buildOpenRouterHeaders();
    }
  }
  // For other providers (anthropic, etc.), no special headers needed
  
  // Step 6: Build shadow recommendation for logging
  const shadow = buildShadowRecommendation(
    runId,
    ctx.originalModel || 'unknown',
    decision,
    config.routing.tierProviders,
    config.routing.pricing
  );
  
  // Step 7: Assemble final output
  return {
    model: decision.targetModel,
    provider: providerResolution.provider,
    headers,
    thinking: decision.thinking,
    applied: decision.reason === 'routed',
    shadow,
    // Phase 3b additions
    ...(budgetResult ? {
      budget: {
        allowed: budgetResult.allowed,
        dailyRemaining: budgetResult.dailyRemaining,
        weeklyRemaining: budgetResult.weeklyRemaining,
        alertTriggered: budgetResult.alertTriggered,
        enforcementAction: config.routing.budget?.enforcementAction || 'alert-only'
      }
    } : {}),
    ...(abAssignment ? { abAssignment } : {})
  };
}
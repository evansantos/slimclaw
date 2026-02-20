import type { SlimClawConfig } from '../config.js';
import type { ClassificationResult } from '../classifier/index.js';
import type { RoutingContext } from './overrides.js';
import { resolveModel } from './model-router.js';

// Import dependencies with fallback handling for parallel development
import { resolveProvider } from './provider-resolver.js';
import { buildShadowRecommendation, type ShadowRecommendation } from './shadow-router.js';

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
 * 3. Resolves the provider via resolveProvider()
 * 4. Assembles headers for the target provider
 * 5. Builds shadow recommendation for logging
 * 
 * In Phase 2a: called in shadow mode, output is logged only.
 * In Phase 2b: output.model/headers/thinking returned to OpenClaw.
 * 
 * @param classification - Pre-computed classification result
 * @param config - Full SlimClaw config
 * @param ctx - Request context (originalModel, headers, etc.)
 * @param runId - Request run ID for correlation
 * @returns Complete routing output
 */
export function makeRoutingDecision(
  classification: ClassificationResult,
  config: SlimClawConfig,
  ctx: RoutingContext,
  runId: string
): RoutingOutput {
  // Step 1: Resolve the target model
  const decision = resolveModel(classification, config.routing, ctx);
  
  // Step 2: Resolve the provider for the target model
  const providerResolution = resolveProvider(
    decision.targetModel,
    config.routing.tierProviders
  );
  
  // Step 3: Build headers based on provider
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
  
  // Step 4: Build shadow recommendation for logging
  const shadow = buildShadowRecommendation(
    runId,
    ctx.originalModel || 'unknown',
    decision,
    config.routing.tierProviders,
    config.routing.pricing
  );
  
  // Step 5: Assemble final output
  return {
    model: decision.targetModel,
    provider: providerResolution.provider,
    headers,
    thinking: decision.thinking,
    applied: decision.reason === 'routed',
    shadow
  };
}
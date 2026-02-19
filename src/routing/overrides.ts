/**
 * SlimClaw Model Routing - Override Handling
 * 
 * Handles routing overrides like X-Model-Pinned headers and pinned model configurations
 */

import type { SlimClawConfig } from '../config.js';
import type { ComplexityTier } from './tiers.js';

/**
 * Context that may contain routing override information
 */
export interface RoutingContext {
  /** HTTP headers or equivalent context */
  headers?: Record<string, string | string[] | undefined>;
  /** Original model that was requested */
  originalModel?: string;
  /** Session or request metadata */
  sessionKey?: string;
  agentId?: string;
  [key: string]: unknown;
}

/**
 * Result of override processing
 */
export interface OverrideResult {
  /** Whether an override should be applied */
  shouldOverride: boolean;
  /** The model to use if overriding */
  overrideModel?: string;
  /** Reason for the override */
  reason: "pinned-header" | "pinned-config" | "none";
  /** Additional context for logging */
  details?: string;
}

/**
 * Check for X-Model-Pinned header override
 */
export function checkHeaderOverride(ctx: RoutingContext): OverrideResult {
  const headers = ctx.headers;
  if (!headers) {
    return { shouldOverride: false, reason: "none" };
  }
  
  // Check for X-Model-Pinned header (case insensitive)
  const pinnedModel = getHeaderValue(headers, 'x-model-pinned') || 
                     getHeaderValue(headers, 'X-Model-Pinned');
  
  if (pinnedModel) {
    return {
      shouldOverride: true,
      overrideModel: pinnedModel,
      reason: "pinned-header",
      details: `X-Model-Pinned header specified: ${pinnedModel}`
    };
  }
  
  return { shouldOverride: false, reason: "none" };
}

/**
 * Check if the original model is in the pinned models list
 */
export function checkPinnedModelConfig(
  originalModel: string,
  config: SlimClawConfig['routing']
): OverrideResult {
  if (!config) {
    return { shouldOverride: false, reason: "none" };
  }
  
  const pinnedModels = config.pinnedModels || [];
  
  if (pinnedModels.includes(originalModel)) {
    return {
      shouldOverride: true,
      overrideModel: originalModel,
      reason: "pinned-config",
      details: `Model ${originalModel} is in pinnedModels configuration`
    };
  }
  
  return { shouldOverride: false, reason: "none" };
}

/**
 * Check confidence threshold override
 */
export function checkConfidenceThreshold(
  confidence: number,
  config: SlimClawConfig['routing']
): OverrideResult {
  if (!config) {
    return { shouldOverride: false, reason: "none" };
  }
  
  const minConfidence = config.minConfidence ?? 0.4;
  
  if (confidence < minConfidence) {
    return {
      shouldOverride: true,
      reason: "none", // Not really an override, just a blocking condition
      details: `Confidence ${confidence} below threshold ${minConfidence}`
    };
  }
  
  return { shouldOverride: false, reason: "none" };
}

/**
 * Process all overrides in order of priority
 * 
 * Priority order:
 * 1. X-Model-Pinned header (highest priority)
 * 2. Pinned models configuration
 * 3. Confidence threshold check
 * 
 * @param originalModel - The model that was originally requested
 * @param tier - The classified complexity tier  
 * @param confidence - Classification confidence
 * @param config - Routing configuration
 * @param ctx - Request context with headers, etc.
 * @returns Override result with the highest priority match
 */
export function processOverrides(
  originalModel: string,
  _tier: ComplexityTier,  // Reserved for future tier-based routing rules
  confidence: number,
  config: SlimClawConfig['routing'],
  ctx: RoutingContext
): OverrideResult {
  // Priority 1: Check header override first
  const headerResult = checkHeaderOverride(ctx);
  if (headerResult.shouldOverride) {
    return headerResult;
  }
  
  // Priority 2: Check pinned model configuration
  const pinnedResult = checkPinnedModelConfig(originalModel, config);
  if (pinnedResult.shouldOverride) {
    return pinnedResult;
  }
  
  // Priority 3: Check confidence threshold (this blocks routing)
  const confidenceResult = checkConfidenceThreshold(confidence, config);
  if (confidenceResult.shouldOverride) {
    // This is a special case - confidence too low means we don't route at all
    const result: OverrideResult = {
      shouldOverride: true,
      overrideModel: originalModel, // Keep original model
      reason: "none",
    };
    if (confidenceResult.details) {
      result.details = confidenceResult.details;
    }
    return result;
  }
  
  return { shouldOverride: false, reason: "none" };
}

/**
 * Helper function to get header value (handles both string and array cases)
 */
function getHeaderValue(
  headers: Record<string, string | string[] | undefined>, 
  key: string
): string | undefined {
  const value = headers[key];
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && value.length > 0) {
    return value[0];
  }
  return undefined;
}
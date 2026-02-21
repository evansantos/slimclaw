/**
 * SlimClaw Model Routing - Main Router Logic
 * 
 * Implements the resolveModel() function that determines which model to use
 * based on complexity classification, configuration, and overrides
 */

import type { ClassificationResult } from '../classifier/index.js';
import type { SlimClawConfig } from '../config.js';
import { 
  getTierModel, 
  isTierReasoning, 
  getThinkingBudget,
  inferTierFromModel,
  TIER_RANKS,
  type ComplexityTier 
} from './tiers.js';
import { 
  processOverrides, 
  type RoutingContext 
} from './overrides.js';

/**
 * Result of model routing decision
 */
export interface ModelRoutingDecision {
  /** The original model that was requested */
  originalModel: string;
  /** The target model to use after routing */
  targetModel: string;
  /** The complexity tier that was classified */
  tier: ComplexityTier;
  /** Classification confidence (0.0 - 1.0) */
  confidence: number;
  /** Reason for the routing decision */
  reason: "routed" | "pinned" | "low-confidence" | "routing-disabled" | "budget-downgrade" | "budget-blocked";
  /** Whether the routing decision was actually applied */
  applied: boolean;
  /** Thinking configuration for reasoning models */
  thinking: { type: "enabled"; budget_tokens: number } | null;
}

/**
 * Main model routing function
 * 
 * Takes a classification result and determines which model should be used
 * considering configuration overrides and routing rules.
 * 
 * @param classification - Result from complexity classifier
 * @param config - Routing configuration  
 * @param ctx - Request context with headers, original model, etc.
 * @returns Routing decision with target model and metadata
 */
export function resolveModel(
  classification: ClassificationResult,
  config: SlimClawConfig['routing'],
  ctx: RoutingContext
): ModelRoutingDecision {
  const originalModel = ctx.originalModel ?? "anthropic/claude-sonnet-4-20250514";
  
  try {
    // Check if routing is disabled or config is invalid
    if (!config || !config.enabled) {
      return createDecision({
        originalModel,
        targetModel: originalModel,
        tier: classification.tier,
        confidence: classification.confidence,
        reason: "routing-disabled",
        applied: false,
        thinking: null
      });
    }
    
    // Check for overrides (headers, pinned models, confidence threshold)
    const override = processOverrides(
      originalModel,
      classification.tier,
      classification.confidence,
      config,
      ctx
    );
    
    if (override.shouldOverride) {
      // Determine reason based on override type
      let reason: ModelRoutingDecision['reason'];
      if (override.reason === "pinned-header" || override.reason === "pinned-config") {
        reason = "pinned";
      } else if (override.details?.toLowerCase().includes('confidence')) {
        reason = "low-confidence";
      } else {
        reason = "routing-disabled";
      }
      
      return createDecision({
        originalModel,
        targetModel: override.overrideModel ?? originalModel,
        tier: classification.tier,
        confidence: classification.confidence,
        reason,
        applied: false,
        thinking: isTierReasoning(classification.tier) ? {
          type: "enabled",
          budget_tokens: getThinkingBudget(config)
        } : null
      });
    }
    
    // Normal routing: map tier to model
    const targetModel = getTierModel(classification.tier, config);
    
    // Check if downgrade is allowed (skip for virtual models — they have no inherent tier)
    const isVirtualModel = originalModel.startsWith('slimclaw/');
    if (!isVirtualModel && !config.allowDowngrade && isModelDowngrade(originalModel, targetModel)) {
      return createDecision({
        originalModel,
        targetModel: originalModel, // Keep original model
        tier: classification.tier,
        confidence: classification.confidence,
        reason: "pinned", // Downgrade blocked acts like pinning
        applied: false,
        thinking: isTierReasoning(classification.tier) ? {
          type: "enabled",
          budget_tokens: getThinkingBudget(config)
        } : null
      });
    }
    
    // Apply routing
    return createDecision({
      originalModel,
      targetModel,
      tier: classification.tier,
      confidence: classification.confidence,
      reason: "routed",
      applied: true,
      thinking: isTierReasoning(classification.tier) ? {
        type: "enabled",
        budget_tokens: getThinkingBudget(config)
      } : null
    });
    
  } catch (error) {
    // Fallback: return original model on any error
    console.error('SlimClaw routing error:', error);
    return createDecision({
      originalModel,
      targetModel: originalModel,
      tier: classification.tier,
      confidence: classification.confidence,
      reason: "routing-disabled",
      applied: false,
      thinking: null
    });
  }
}

/**
 * Helper function to create a consistent routing decision object
 */
function createDecision(params: {
  originalModel: string;
  targetModel: string;
  tier: ComplexityTier;
  confidence: number;
  reason: ModelRoutingDecision['reason'];
  applied: boolean;
  thinking: { type: "enabled"; budget_tokens: number } | null;
}): ModelRoutingDecision {
  return {
    originalModel: params.originalModel,
    targetModel: params.targetModel,
    tier: params.tier,
    confidence: Math.round(params.confidence * 100) / 100, // Round to 2 decimal places
    reason: params.reason,
    applied: params.applied,
    thinking: params.thinking
  };
}

/**
 * Tier-based model downgrade detection (Task 3)
 * Uses inferTierFromModel() to get tiers for both models and compares using tier ranks
 * Downgrade = target tier rank < source tier rank
 */
function isModelDowngrade(fromModel: string, toModel: string): boolean {
  // If models are the same, no downgrade
  if (fromModel === toModel) {
    return false;
  }
  
  // Get tiers for both models
  const fromTier = inferTierFromModel(fromModel);
  const toTier = inferTierFromModel(toModel);
  
  // Compare using tier ranks: simple=1, mid=2, complex=3, reasoning=4
  // Downgrade = target tier rank < source tier rank
  return TIER_RANKS[toTier] < TIER_RANKS[fromTier];
}
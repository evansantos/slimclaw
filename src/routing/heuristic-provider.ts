import { classifyComplexity, type Message } from '../classifier/classify.js';
import { getTierModel } from './tiers.js';
import { processOverrides, type RoutingContext } from './overrides.js';
import type { IRoutingProvider, RoutingDecision } from './types.js';
import { estimateCostPerToken } from './pricing.js';

/**
 * Heuristic provider that wraps existing SlimClaw routing logic
 * Uses keyword classification and override handling
 */
export class HeuristicProvider implements IRoutingProvider {
  public readonly name = 'heuristic';

  /**
   * Always available since it uses built-in heuristics
   */
  isAvailable(): boolean {
    return true;
  }

  /**
   * Route using existing SlimClaw classification logic
   */
  route(text: string, contextTokens: number, config?: Record<string, unknown>): RoutingDecision {
    // Convert text to message format expected by classifier
    const messages: Message[] = [
      { role: 'user', content: text }
    ];

    // Classify complexity using existing logic
    const classification = classifyComplexity(messages);

    // Get model for tier
    const routingConfig = config?.routing as any;
    let selectedModel = getTierModel(classification.tier, routingConfig);

    // Check for overrides
    const overrideContext: RoutingContext = {
      headers: config?.headers as Record<string, string | string[]>,
      originalModel: config?.originalModel as string ?? 'anthropic/claude-sonnet-4-20250514',
      sessionKey: config?.sessionKey as string,
      agentId: config?.agentId as string,
      ...config
    };

    const override = processOverrides(
      config?.originalModel as string ?? 'anthropic/claude-sonnet-4-20250514',
      classification.tier,
      classification.confidence,
      routingConfig,
      overrideContext
    );

    if (override.shouldOverride && override.overrideModel) {
      selectedModel = override.overrideModel;
    }

    // Calculate cost estimates (simplified heuristics)
    const { costEstimate, savings } = this.calculateCostEstimates(
      classification.tier,
      contextTokens,
      selectedModel,
      config?.originalModel as string ?? 'anthropic/claude-sonnet-4-20250514'
    );

    return {
      model: selectedModel,
      tier: classification.tier,
      confidence: classification.confidence,
      savings,
      costEstimate
    };
  }

  /**
   * Calculate simplified cost estimates based on tier and model
   * Uses shared pricing from pricing.ts for consistency
   */
  private calculateCostEstimates(
    _tier: string, // Underscore prefix to indicate intentionally unused
    contextTokens: number,
    selectedModel: string,
    originalModel?: string
  ): { costEstimate: number; savings: number } {
    // Estimate output tokens (rough heuristic)
    const estimatedOutputTokens = Math.min(contextTokens * 0.5, 2000);
    
    // Use shared pricing functions for consistent cost calculation
    const selectedModelCostPerToken = estimateCostPerToken(selectedModel, 0.5); // 50% output ratio
    const costEstimate = (contextTokens + estimatedOutputTokens) * selectedModelCostPerToken;

    // Calculate savings if we know the original model
    let savings = 0;
    if (originalModel && selectedModel !== originalModel) {
      const originalModelCostPerToken = estimateCostPerToken(originalModel, 0.5);
      const originalCostEstimate = (contextTokens + estimatedOutputTokens) * originalModelCostPerToken;
      savings = Math.max(0, originalCostEstimate - costEstimate);
    }

    return {
      // Use consistent precision: 6 decimal places for costs
      costEstimate: Math.round(costEstimate * 1000000) / 1000000,
      savings: Math.round(savings * 1000000) / 1000000
    };
  }

  // Cost calculation methods now use shared pricing from pricing.ts
}
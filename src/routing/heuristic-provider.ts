import { classifyComplexity, type Message } from '../classifier/classify.js';
import { getTierModel } from './tiers.js';
import { processOverrides, type RoutingContext } from './overrides.js';
import type { IRoutingProvider, RoutingDecision } from './types.js';

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
      originalModel: config?.originalModel as string,
      sessionKey: config?.sessionKey as string,
      agentId: config?.agentId as string,
      ...config
    };

    const override = processOverrides(
      config?.originalModel as string || 'anthropic/claude-sonnet-4-20250514',
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
      config?.originalModel as string
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
   */
  private calculateCostEstimates(
    tier: string,
    contextTokens: number,
    selectedModel: string,
    originalModel?: string
  ): { costEstimate: number; savings: number } {
    // Simplified cost model based on common pricing patterns
    const baseCostPerToken = {
      'simple': 0.00001,    // Haiku-like models
      'mid': 0.00003,       // Sonnet-like models  
      'complex': 0.0001,    // Opus-like models
      'reasoning': 0.0001   // Reasoning models
    };

    const tierCost = baseCostPerToken[tier as keyof typeof baseCostPerToken] || baseCostPerToken.mid;
    
    // Estimate output tokens (rough heuristic)
    const estimatedOutputTokens = Math.min(contextTokens * 0.5, 2000);
    const totalTokens = contextTokens + estimatedOutputTokens;
    
    const costEstimate = totalTokens * tierCost;

    // Calculate savings if we know the original model
    let savings = 0;
    if (originalModel && selectedModel !== originalModel) {
      // Simple heuristic: assume original model would be more expensive
      const originalTierCost = this.inferCostFromModel(originalModel);
      const originalCostEstimate = totalTokens * originalTierCost;
      savings = Math.max(0, originalCostEstimate - costEstimate);
    }

    return {
      costEstimate: Math.round(costEstimate * 10000) / 10000, // Round to 4 decimal places
      savings: Math.round(savings * 10000) / 10000
    };
  }

  /**
   * Infer cost per token from model name
   */
  private inferCostFromModel(modelName: string): number {
    const lowerModel = modelName.toLowerCase();
    
    if (lowerModel.includes('haiku')) return 0.00001;
    if (lowerModel.includes('sonnet')) return 0.00003;
    if (lowerModel.includes('opus')) return 0.0001;
    if (lowerModel.includes('gpt-3.5')) return 0.00002;
    if (lowerModel.includes('gpt-4')) return 0.00008;
    
    // Default to mid-tier cost
    return 0.00003;
  }
}
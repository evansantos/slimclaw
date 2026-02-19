import { route, DEFAULT_ROUTING_CONFIG } from '@blockrun/clawrouter';
import type { IRoutingProvider, RoutingDecision } from './types.js';

/**
 * Adapter that implements IRoutingProvider using @blockrun/clawrouter
 * 
 * ClawRouter API: route(prompt, systemPrompt, maxOutputTokens, { config, modelPricing })
 */
export class ClawRouterAdapter implements IRoutingProvider {
  public readonly name = 'clawrouter';

  constructor(
    private readonly modelPricing?: Map<string, { input: number; output: number; contextWindow?: number }>
  ) {}

  isAvailable(): boolean {
    try {
      return typeof route === 'function';
    } catch {
      return false;
    }
  }

  route(text: string, contextTokens: number, _config?: Record<string, unknown>): RoutingDecision {
    const result = route(
      text,                          // prompt
      undefined,                     // systemPrompt
      contextTokens,                 // maxOutputTokens
      {
        config: DEFAULT_ROUTING_CONFIG,
        modelPricing: this.modelPricing || new Map()
      }
    );

    return {
      model: result.model || 'anthropic/claude-sonnet-4',
      tier: result.tier || 'mid',
      confidence: result.confidence ?? 0.5,
      savings: result.savings ?? 0,
      costEstimate: result.costEstimate ?? 0
    };
  }
}

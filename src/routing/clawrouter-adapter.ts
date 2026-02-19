import { route, DEFAULT_ROUTING_CONFIG } from '@blockrun/clawrouter';
import type { IRoutingProvider, RoutingDecision } from './types.js';
import { createSlimClawLogger } from '../logging/index.js';

const logger = createSlimClawLogger('info', { component: 'ClawRouterAdapter' });

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

    // Check for incomplete results and log when defaults are used
    if (!result.model || !result.tier) {
      logger.warn('ClawRouter returned incomplete result, using defaults', {
        hasModel: !!result.model,
        hasTier: !!result.tier
      });
    }

    return {
      // Default model: anthropic/claude-sonnet-4 - balanced performance/cost for mid-tier tasks
      model: result.model || 'anthropic/claude-sonnet-4',
      // Default tier: mid - assumes moderate complexity when router is uncertain
      tier: result.tier || 'mid',
      confidence: result.confidence ?? 0.5,
      savings: result.savings ?? 0,
      costEstimate: result.costEstimate ?? 0
    };
  }
}

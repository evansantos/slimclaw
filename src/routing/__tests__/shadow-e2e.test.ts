import { describe, test, expect, vi, beforeEach } from 'vitest';
import { makeRoutingDecision } from '../routing-decision.js';
import { resolveModel } from '../model-router.js';
import { resolveProvider } from '../provider-resolver.js';
import { buildShadowRecommendation, formatShadowLog } from '../shadow-router.js';
import type { SlimClawConfig } from '../../config.js';
import type { ClassificationResult } from '../../classifier/index.js';
import type { RoutingContext } from '../overrides.js';

// Mock the pricing module with controlled values for testing
vi.mock('../pricing.js', () => ({
  estimateModelCost: vi.fn((modelId: string, inputTokens = 1000, outputTokens = 1000) => {
    const costs: Record<string, number> = {
      // High-cost models
      'anthropic/claude-opus-4-6': 0.045,
      'anthropic/claude-sonnet-4-20250514': 0.015,
      
      // Low-cost models via OpenRouter
      'openai/gpt-4.1-nano': 0.0005,
      'openai/o4-mini': 0.0055,
      'google/gemini-2.5-flash': 0.00275,
      
      // Anthropic family for all-Anthropic config
      'anthropic/claude-3-haiku-20240307': 0.0008,
    };
    return costs[modelId] || 0.01; // Default fallback cost
  }),
  
  DEFAULT_MODEL_PRICING: {
    'anthropic/claude-opus-4-6': { inputPer1k: 0.015, outputPer1k: 0.075 },
    'anthropic/claude-sonnet-4-20250514': { inputPer1k: 0.005, outputPer1k: 0.025 },
    'anthropic/claude-3-haiku-20240307': { inputPer1k: 0.0002, outputPer1k: 0.0012 },
    'openai/gpt-4.1-nano': { inputPer1k: 0.0001, outputPer1k: 0.0004 },
    'openai/o4-mini': { inputPer1k: 0.0011, outputPer1k: 0.0044 },
    'google/gemini-2.5-flash': { inputPer1k: 0.0003, outputPer1k: 0.0025 }
  }
}));

describe('end-to-end shadow routing pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseConfig: SlimClawConfig = {
    enabled: true,
    mode: 'shadow',
    routing: {
      enabled: true,
      allowDowngrade: true,
      minConfidence: 0.4,
      shadowLogging: true,
      pinnedModels: [],
      tiers: {
        simple: "openai/gpt-4.1-nano",
        mid: "google/gemini-2.5-flash", 
        complex: "anthropic/claude-opus-4-6",
        reasoning: "openai/o4-mini"
      },
      tierProviders: {
        "openai/*": "openrouter",
        "google/*": "openrouter",
        "deepseek/*": "openrouter",
        "meta-llama/*": "openrouter"
      },
      reasoningBudget: 10000
    },
    windowing: { enabled: true, maxMessages: 10, maxTokens: 4000, summarizeThreshold: 8 },
    caching: { enabled: true, injectBreakpoints: true, minContentLength: 1000 },
    metrics: { enabled: true, logPath: "metrics", flushIntervalMs: 10000 },
    logging: { level: "info", format: "human", fileOutput: true, logPath: "logs", consoleOutput: true, includeStackTrace: true, colors: true }
  };

  describe('scenario 1: full pipeline - simple tier → route to gpt-4.1-nano via openrouter', () => {
    test('should route simple tier to gpt-4.1-nano via openrouter with high savings', () => {
      const classification: ClassificationResult = {
        tier: 'simple',
        confidence: 0.85,
        reasoning: 'Simple question about weather',
        signals: ['basic-question']
      };

      const context: RoutingContext = {
        originalModel: 'anthropic/claude-sonnet-4-20250514',
        headers: {}
      };

      const result = makeRoutingDecision(classification, baseConfig, context, 'simple-test-123');

      // Verify routing decision
      expect(result.model).toBe('openai/gpt-4.1-nano');
      expect(result.provider).toBe('openrouter');
      expect(result.applied).toBe(true);
      expect(result.thinking).toBeNull(); // Simple tier doesn't need thinking

      // Verify OpenRouter headers are included
      expect(result.headers['X-Title']).toBe('SlimClaw');
      expect(result.headers['HTTP-Referer']).toBe('slimclaw');

      // Verify shadow recommendation
      expect(result.shadow.actualModel).toBe('anthropic/claude-sonnet-4-20250514');
      expect(result.shadow.recommendedModel).toBe('openai/gpt-4.1-nano');
      expect(result.shadow.recommendedProvider.provider).toBe('openrouter');
      expect(result.shadow.recommendedProvider.matchedPattern).toBe('openai/*');
      expect(result.shadow.wouldApply).toBe(true);
      
      // Verify significant cost savings (from $0.015 to $0.0005 per 1k tokens)
      expect(result.shadow.costDelta.savingsPercent).toBeGreaterThan(95); // Should be ~96.7%
      expect(result.shadow.costDelta.actualCostPer1k).toBe(0.015);
      expect(result.shadow.costDelta.recommendedCostPer1k).toBe(0.0005);
    });
  });

  describe('scenario 2: reasoning tier → route to o4-mini with thinking config', () => {
    test('should route reasoning tier to o4-mini via openrouter with thinking enabled', () => {
      const classification: ClassificationResult = {
        tier: 'reasoning',
        confidence: 0.92,
        reasoning: 'Complex reasoning task requiring step-by-step analysis',
        signals: ['multi-step', 'analysis-required']
      };

      const context: RoutingContext = {
        originalModel: 'anthropic/claude-opus-4-6',
        headers: {}
      };

      const result = makeRoutingDecision(classification, baseConfig, context, 'reasoning-test-456');

      // Verify reasoning model routing
      expect(result.model).toBe('openai/o4-mini');
      expect(result.provider).toBe('openrouter');
      expect(result.applied).toBe(true);

      // Verify thinking config is properly set
      expect(result.thinking).toEqual({
        type: "enabled",
        budget_tokens: 10000
      });

      // Verify OpenRouter headers
      expect(result.headers['X-Title']).toBe('SlimClaw');
      expect(result.headers['HTTP-Referer']).toBe('slimclaw');

      // Verify shadow recommendation has thinking config
      expect(result.shadow.recommendedThinking).toEqual({
        type: "enabled",
        budget_tokens: 10000
      });

      // Verify cost savings (from $0.045 to $0.0055 per 1k tokens)
      expect(result.shadow.costDelta.savingsPercent).toBeGreaterThan(85); // Should be ~87.8%
      expect(result.shadow.wouldApply).toBe(true);
    });
  });

  describe('scenario 3: anthropic models → stay on native provider (no OpenRouter headers)', () => {
    test('should route within Anthropic family without OpenRouter headers', () => {
      const classification: ClassificationResult = {
        tier: 'simple',
        confidence: 0.78,
        reasoning: 'Basic question',
        signals: ['simple-query']
      };

      const context: RoutingContext = {
        originalModel: 'anthropic/claude-sonnet-4-20250514',
        headers: {}
      };

      // Use config that keeps Anthropic models on native provider
      const anthropicConfig = {
        ...baseConfig,
        routing: {
          ...baseConfig.routing,
          tiers: {
            simple: "anthropic/claude-3-haiku-20240307",
            mid: "anthropic/claude-sonnet-4-20250514",
            complex: "anthropic/claude-opus-4-6",
            reasoning: "anthropic/claude-opus-4-6"
          }
        }
      };

      const result = makeRoutingDecision(classification, anthropicConfig, context, 'anthropic-test-789');

      // Verify Anthropic routing
      expect(result.model).toBe('anthropic/claude-3-haiku-20240307');
      expect(result.provider).toBe('anthropic'); // Native provider
      expect(result.applied).toBe(true);

      // Verify NO OpenRouter headers (empty object for native providers)
      expect(Object.keys(result.headers)).toHaveLength(0);

      // Verify shadow recommendation
      expect(result.shadow.recommendedProvider.provider).toBe('anthropic');
      expect(result.shadow.recommendedProvider.source).toBe('native');
      expect(result.shadow.wouldApply).toBe(true);
      
      // Still should show cost savings (Sonnet → Haiku)
      expect(result.shadow.costDelta.savingsPercent).toBeGreaterThan(90);
    });
  });

  describe('scenario 4: low confidence → no routing applied', () => {
    test('should not apply routing when confidence is below threshold', () => {
      const classification: ClassificationResult = {
        tier: 'simple',
        confidence: 0.35, // Below minConfidence of 0.4
        reasoning: 'Unclear request',
        signals: ['ambiguous']
      };

      const context: RoutingContext = {
        originalModel: 'anthropic/claude-sonnet-4-20250514',
        headers: {}
      };

      const result = makeRoutingDecision(classification, baseConfig, context, 'low-confidence-test');

      // Verify no routing applied
      expect(result.model).toBe('anthropic/claude-sonnet-4-20250514'); // Original model kept
      expect(result.provider).toBe('anthropic'); // Native provider
      expect(result.applied).toBe(false);
      expect(result.headers).toEqual({}); // No special headers

      // Verify shadow recommendation reflects no routing
      expect(result.shadow.wouldApply).toBe(false);
      expect(result.shadow.decision.reason).toBe('low-confidence');
      expect(result.shadow.costDelta.savingsPercent).toBe(0); // No savings when same model
    });
  });

  describe('scenario 5: pinned model → no routing applied', () => {
    test('should not apply routing for pinned models', () => {
      const classification: ClassificationResult = {
        tier: 'simple',
        confidence: 0.85,
        reasoning: 'Simple question',
        signals: ['basic-question']
      };

      const context: RoutingContext = {
        originalModel: 'anthropic/claude-sonnet-4-20250514',
        headers: {}
      };

      const pinnedConfig = {
        ...baseConfig,
        routing: {
          ...baseConfig.routing,
          pinnedModels: ['anthropic/claude-sonnet-4-20250514']
        }
      };

      const result = makeRoutingDecision(classification, pinnedConfig, context, 'pinned-test');

      // Verify no routing applied for pinned model
      expect(result.model).toBe('anthropic/claude-sonnet-4-20250514');
      expect(result.provider).toBe('anthropic');
      expect(result.applied).toBe(false);

      // Verify shadow recommendation reflects pinning
      expect(result.shadow.wouldApply).toBe(false);
      expect(result.shadow.decision.reason).toBe('pinned');
    });
  });

  describe('scenario 6: all-Anthropic config → route within Anthropic family', () => {
    test('should route within Anthropic models for all-Anthropic configuration', () => {
      const classification: ClassificationResult = {
        tier: 'complex',
        confidence: 0.88,
        reasoning: 'Complex multi-step task',
        signals: ['complex-analysis']
      };

      const context: RoutingContext = {
        originalModel: 'anthropic/claude-sonnet-4-20250514',
        headers: {}
      };

      const allAnthropicConfig = {
        ...baseConfig,
        routing: {
          ...baseConfig.routing,
          tiers: {
            simple: "anthropic/claude-3-haiku-20240307",
            mid: "anthropic/claude-sonnet-4-20250514",
            complex: "anthropic/claude-opus-4-6",
            reasoning: "anthropic/claude-opus-4-6"
          },
          tierProviders: {
            // No OpenRouter mapping, so all stay on native Anthropic
          }
        }
      };

      const result = makeRoutingDecision(classification, allAnthropicConfig, context, 'all-anthropic-test');

      // Verify routing within Anthropic family
      expect(result.model).toBe('anthropic/claude-opus-4-6');
      expect(result.provider).toBe('anthropic');
      expect(result.applied).toBe(true);
      expect(result.headers).toEqual({}); // No OpenRouter headers

      // Verify shadow recommendation
      expect(result.shadow.recommendedProvider.provider).toBe('anthropic');
      expect(result.shadow.recommendedProvider.source).toBe('native');
      expect(result.shadow.wouldApply).toBe(true);
    });
  });

  describe('scenario 7: shadow log formatting validation', () => {
    test('should format shadow logs correctly for info level', () => {
      const classification: ClassificationResult = {
        tier: 'mid',
        confidence: 0.72,
        reasoning: 'Medium complexity task',
        signals: ['moderate-complexity']
      };

      const context: RoutingContext = {
        originalModel: 'anthropic/claude-sonnet-4-20250514',
        headers: {}
      };

      const result = makeRoutingDecision(classification, baseConfig, context, 'log-format-test');

      // Test info level formatting
      const infoLog = formatShadowLog(result.shadow, 'info');
      
      expect(infoLog).toContain('[SlimClaw] 🔮 Shadow route:');
      expect(infoLog).toContain('sonnet-4'); // Short model name
      expect(infoLog).toContain('gemini-2.5-flash'); // Target model
      expect(infoLog).toContain('via openrouter');
      expect(infoLog).toContain('Tier: mid (0.72)');
      expect(infoLog).toContain('Savings:');
      expect(infoLog).toContain('$0.015/1k → $0.00275/1k');
    });

    test('should format shadow logs correctly for debug level', () => {
      const classification: ClassificationResult = {
        tier: 'reasoning',
        confidence: 0.94,
        reasoning: 'Complex reasoning task',
        signals: ['complex-reasoning']
      };

      const context: RoutingContext = {
        originalModel: 'anthropic/claude-opus-4-6',
        headers: {}
      };

      const result = makeRoutingDecision(classification, baseConfig, context, 'debug-format-test');

      // Test debug level formatting (includes extra details)
      const debugLog = formatShadowLog(result.shadow, 'debug');
      
      expect(debugLog).toContain('[SlimClaw] 🔮 Shadow route:');
      expect(debugLog).toContain('Provider: openrouter');
      expect(debugLog).toContain('matched pattern: openai/*');
      expect(debugLog).toContain('Headers: {"X-Title":"SlimClaw","HTTP-Referer":"slimclaw"}');
      expect(debugLog).toContain('Thinking: { type: "enabled", budget_tokens: 10000 }');
      expect(debugLog).toContain('Would apply: YES');
    });

    test('should format no-routing scenarios correctly', () => {
      const classification: ClassificationResult = {
        tier: 'simple',
        confidence: 0.3, // Below threshold
        reasoning: 'Ambiguous request',
        signals: ['unclear']
      };

      const context: RoutingContext = {
        originalModel: 'anthropic/claude-sonnet-4-20250514',
        headers: {}
      };

      const result = makeRoutingDecision(classification, baseConfig, context, 'no-routing-log-test');

      const infoLog = formatShadowLog(result.shadow, 'info');
      
      expect(infoLog).toContain('claude-sonnet-4-20250514 → claude-sonnet-4-20250514');
      expect(infoLog).toContain('(low-confidence)');
      expect(infoLog).toContain('No routing applied');

      const debugLog = formatShadowLog(result.shadow, 'debug');
      expect(debugLog).toContain('Would apply: NO');
    });
  });

  describe('integration tests: full pipeline validation', () => {
    test('should handle complete routing pipeline with all components', () => {
      const classification: ClassificationResult = {
        tier: 'reasoning',
        confidence: 0.89,
        reasoning: 'Multi-step reasoning with analysis',
        signals: ['reasoning-required', 'step-by-step']
      };

      const context: RoutingContext = {
        originalModel: 'anthropic/claude-opus-4-6',
        headers: {}
      };

      const result = makeRoutingDecision(classification, baseConfig, context, 'integration-test-full');

      // Verify complete pipeline
      expect(result.model).toBe('openai/o4-mini');
      expect(result.provider).toBe('openrouter');
      expect(result.applied).toBe(true);
      expect(result.thinking?.type).toBe('enabled');
      expect(result.thinking?.budget_tokens).toBe(10000);
      expect(result.headers['X-Title']).toBe('SlimClaw');
      
      // Verify shadow data integrity
      expect(result.shadow.runId).toBe('integration-test-full');
      expect(result.shadow.actualModel).toBe('anthropic/claude-opus-4-6');
      expect(result.shadow.recommendedModel).toBe('openai/o4-mini');
      expect(result.shadow.wouldApply).toBe(true);
      expect(result.shadow.decision.confidence).toBe(0.89);
      expect(result.shadow.costDelta.savingsPercent).toBeGreaterThan(80);
    });

    test('should handle custom OpenRouter headers configuration', () => {
      const customConfig = {
        ...baseConfig,
        routing: {
          ...baseConfig.routing,
          openRouterHeaders: {
            'X-Title': 'CustomApp',
            'HTTP-Referer': 'https://custom-app.com'
          }
        }
      };

      const classification: ClassificationResult = {
        tier: 'simple',
        confidence: 0.82,
        reasoning: 'Simple task',
        signals: ['basic']
      };

      const context: RoutingContext = {
        originalModel: 'anthropic/claude-sonnet-4-20250514',
        headers: {}
      };

      const result = makeRoutingDecision(classification, customConfig, context, 'custom-headers-test');

      expect(result.headers['X-Title']).toBe('CustomApp');
      expect(result.headers['HTTP-Referer']).toBe('https://custom-app.com');
    });

    test('should validate provider resolution with multiple patterns', () => {
      const multiProviderConfig = {
        ...baseConfig,
        routing: {
          ...baseConfig.routing,
          tiers: {
            simple: "deepseek/deepseek-r1-0528",
            mid: "meta-llama/llama-4-maverick", 
            complex: "google/gemini-2.5-flash",
            reasoning: "openai/o4-mini"
          },
          tierProviders: {
            "openai/*": "openrouter",
            "google/*": "openrouter",
            "deepseek/*": "openrouter",
            "meta-llama/*": "openrouter"
          }
        }
      };

      // Test each tier maps to openrouter correctly
      const testCases = [
        { tier: 'simple' as const, expectedModel: 'deepseek/deepseek-r1-0528' },
        { tier: 'mid' as const, expectedModel: 'meta-llama/llama-4-maverick' },
        { tier: 'complex' as const, expectedModel: 'google/gemini-2.5-flash' },
        { tier: 'reasoning' as const, expectedModel: 'openai/o4-mini' }
      ];

      testCases.forEach(({ tier, expectedModel }) => {
        const classification: ClassificationResult = {
          tier,
          confidence: 0.8,
          reasoning: `Test ${tier} tier`,
          signals: [tier]
        };

        const context: RoutingContext = {
          originalModel: 'anthropic/claude-sonnet-4-20250514',
          headers: {}
        };

        const result = makeRoutingDecision(classification, multiProviderConfig, context, `multi-provider-${tier}`);

        expect(result.model).toBe(expectedModel);
        expect(result.provider).toBe('openrouter');
        expect(result.shadow.recommendedProvider.provider).toBe('openrouter');
        expect(result.shadow.recommendedProvider.source).toBe('tierProviders');
      });
    });
  });
});
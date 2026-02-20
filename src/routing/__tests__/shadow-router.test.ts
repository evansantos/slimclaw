import { describe, test, expect, vi, beforeEach } from 'vitest';
import { 
  buildShadowRecommendation,
  formatShadowLog,
  type ShadowRecommendation
} from '../shadow-router.js';
import type { ModelRoutingDecision } from '../model-router.js';
import type { ProviderResolution } from '../provider-resolver.js';

// Mock the pricing module
vi.mock('../pricing.js', () => ({
  estimateModelCost: vi.fn((modelId: string, inputTokens = 1000, outputTokens = 1000) => {
    const costs: Record<string, number> = {
      'anthropic/claude-opus-4-6': 0.045,
      'openai/gpt-4.1-nano': 0.0005,
      'openai/o4-mini': 0.0055,
      'google/gemini-2.5-flash': 0.00275
    };
    return costs[modelId] || 0.01;
  }),
  DEFAULT_MODEL_PRICING: {
    'anthropic/claude-opus-4-6': { inputPer1k: 0.015, outputPer1k: 0.075 },
    'openai/gpt-4.1-nano': { inputPer1k: 0.0001, outputPer1k: 0.0004 },
    'openai/o4-mini': { inputPer1k: 0.0011, outputPer1k: 0.0044 },
    'google/gemini-2.5-flash': { inputPer1k: 0.0003, outputPer1k: 0.0025 }
  }
}));

describe('shadow-router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildShadowRecommendation', () => {
    test('should build complete shadow recommendation', () => {
      const decision: ModelRoutingDecision = {
        targetModel: 'openai/gpt-4.1-nano',
        originalModel: 'anthropic/claude-opus-4-6',
        tier: 'simple',
        confidence: 0.85,
        reason: 'routed',
        applied: true,
        thinking: null
      };

      const tierProviders = {
        'openai/*': 'openrouter'
      };

      const recommendation = buildShadowRecommendation(
        'test-run-123',
        'anthropic/claude-opus-4-6',
        decision,
        tierProviders
      );

      expect(recommendation.runId).toBe('test-run-123');
      expect(recommendation.actualModel).toBe('anthropic/claude-opus-4-6');
      expect(recommendation.recommendedModel).toBe('openai/gpt-4.1-nano');
      expect(recommendation.recommendedProvider.provider).toBe('openrouter');
      expect(recommendation.recommendedProvider.matchedPattern).toBe('openai/*');
      expect(recommendation.decision).toBe(decision);
      expect(recommendation.wouldApply).toBe(true);
      expect(recommendation.costDelta.savingsPercent).toBeGreaterThan(80);
      expect(recommendation.summary).toContain('gpt-4.1-nano');
      expect(recommendation.summary).toContain('openrouter');
    });

    test('should handle reasoning tier with thinking config', () => {
      const decision: ModelRoutingDecision = {
        targetModel: 'openai/o4-mini',
        originalModel: 'anthropic/claude-opus-4-6',
        tier: 'reasoning',
        confidence: 0.92,
        reason: 'routed',
        applied: true,
        thinking: { type: "enabled", budget_tokens: 10000 }
      };

      const recommendation = buildShadowRecommendation(
        'reasoning-run-456',
        'anthropic/claude-opus-4-6',
        decision,
        { 'openai/*': 'openrouter' }
      );

      expect(recommendation.recommendedThinking).toEqual({
        type: "enabled",
        budget_tokens: 10000
      });
      expect(recommendation.recommendedHeaders['X-Title']).toBe('SlimClaw');
      expect(recommendation.recommendedHeaders['HTTP-Referer']).toBe('slimclaw');
    });

    test('should handle same-model recommendation (no routing)', () => {
      const decision: ModelRoutingDecision = {
        targetModel: 'anthropic/claude-opus-4-6',
        originalModel: 'anthropic/claude-opus-4-6',
        tier: 'complex',
        confidence: 0.75,
        reason: 'pinned',
        applied: false,
        thinking: null
      };

      const recommendation = buildShadowRecommendation(
        'same-model-789',
        'anthropic/claude-opus-4-6',
        decision
      );

      expect(recommendation.costDelta.savingsPercent).toBe(0);
      expect(recommendation.wouldApply).toBe(false);
      expect(recommendation.recommendedProvider.source).toBe('native');
    });

    test('should calculate cost delta correctly', () => {
      const decision: ModelRoutingDecision = {
        targetModel: 'google/gemini-2.5-flash',
        originalModel: 'anthropic/claude-opus-4-6',
        tier: 'mid',
        confidence: 0.78,
        reason: 'routed',
        applied: true,
        thinking: null
      };

      const recommendation = buildShadowRecommendation(
        'cost-test',
        'anthropic/claude-opus-4-6',
        decision,
        { 'google/*': 'openrouter' }
      );

      expect(recommendation.costDelta.actualCostPer1k).toBe(0.045);
      expect(recommendation.costDelta.recommendedCostPer1k).toBe(0.00275);
      expect(recommendation.costDelta.savingsPercent).toBeCloseTo(93.89, 1);
    });
  });

  describe('formatShadowLog', () => {
    const sampleRecommendation: ShadowRecommendation = {
      timestamp: '2026-02-20T20:00:00.000Z',
      runId: 'test-123',
      actualModel: 'anthropic/claude-opus-4-6',
      recommendedModel: 'openai/o4-mini',
      recommendedProvider: {
        provider: 'openrouter',
        source: 'tierProviders',
        matchedPattern: 'openai/*'
      },
      decision: {
        targetModel: 'openai/o4-mini',
        originalModel: 'anthropic/claude-opus-4-6',
        tier: 'reasoning',
        confidence: 0.92,
        reason: 'routed',
        applied: true,
        thinking: { type: "enabled", budget_tokens: 10000 }
      },
      costDelta: {
        actualCostPer1k: 0.045,
        recommendedCostPer1k: 0.0055,
        savingsPercent: 87.8
      },
      recommendedHeaders: {
        'HTTP-Referer': 'slimclaw',
        'X-Title': 'SlimClaw'
      },
      recommendedThinking: { type: "enabled", budget_tokens: 10000 },
      wouldApply: true,
      summary: 'Would route opus-4-6 → o4-mini via openrouter (reasoning, 87.8% savings)'
    };

    test('should format info level log concisely', () => {
      const log = formatShadowLog(sampleRecommendation, 'info');
      
      expect(log).toContain('🔮 Shadow route:');
      expect(log).toContain('opus-4-6 → o4-mini');
      expect(log).toContain('via openrouter');
      expect(log).toContain('reasoning');
      expect(log).toContain('0.92');
      expect(log).toContain('87.8%');
      expect(log).toContain('$0.045/1k → $0.0055/1k');
    });

    test('should format debug level log with full details', () => {
      const log = formatShadowLog(sampleRecommendation, 'debug');
      
      expect(log).toContain('🔮 Shadow route:');
      expect(log).toContain('Provider: openrouter');
      expect(log).toContain('matched pattern: openai/*');
      expect(log).toContain('Headers:');
      expect(log).toContain('HTTP-Referer');
      expect(log).toContain('X-Title');
      expect(log).toContain('Thinking:');
      expect(log).toContain('budget_tokens: 10000');
      expect(log).toContain('Would apply: YES');
    });

    test('should handle would-not-apply scenario', () => {
      const noApplyRecommendation = {
        ...sampleRecommendation,
        wouldApply: false,
        decision: {
          ...sampleRecommendation.decision,
          reason: 'low-confidence' as const,
          applied: false
        }
      };

      const log = formatShadowLog(noApplyRecommendation, 'debug');
      expect(log).toContain('Would apply: NO');
    });
  });
});
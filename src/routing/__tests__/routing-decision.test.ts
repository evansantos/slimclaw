import { describe, test, expect, vi, beforeEach } from 'vitest';
import { 
  makeRoutingDecision,
  buildOpenRouterHeaders,
  type RoutingOutput
} from '../routing-decision.js';
import type { ClassificationResult } from '../../classifier/index.js';
import type { RoutingContext } from '../overrides.js';
import type { SlimClawConfig } from '../../config.js';

// Mock dependencies
vi.mock('../model-router.js', () => ({
  resolveModel: vi.fn()
}));

vi.mock('../shadow-router.js', () => ({
  buildShadowRecommendation: vi.fn()
}));

import { resolveModel } from '../model-router.js';
import { buildShadowRecommendation } from '../shadow-router.js';

describe('routing-decision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildOpenRouterHeaders', () => {
    test('should build default headers', () => {
      const headers = buildOpenRouterHeaders();
      expect(headers['X-Title']).toBe('SlimClaw');
      expect(headers['HTTP-Referer']).toBe('slimclaw');
    });

    test('should build custom headers', () => {
      const headers = buildOpenRouterHeaders('MyApp', 'https://myapp.com');
      expect(headers['X-Title']).toBe('MyApp');
      expect(headers['HTTP-Referer']).toBe('https://myapp.com');
    });

    test('should handle custom app name only', () => {
      const headers = buildOpenRouterHeaders('CustomApp');
      expect(headers['X-Title']).toBe('CustomApp');
      expect(headers['HTTP-Referer']).toBe('slimclaw');
    });
  });

  describe('makeRoutingDecision', () => {
    const mockConfig: SlimClawConfig = {
      enabled: true,
      mode: 'shadow',
      routing: {
        enabled: true,
        allowDowngrade: true,
        minConfidence: 0.4,
        pinnedModels: [],
        tiers: {
          simple: 'openai/gpt-4.1-nano',
          mid: 'google/gemini-2.5-flash',
          complex: 'anthropic/claude-opus-4-6',
          reasoning: 'openai/o4-mini'
        },
        tierProviders: {
          'openai/*': 'openrouter',
          'google/*': 'openrouter'
        },
        reasoningBudget: 10000
      },
      windowing: { enabled: true, maxMessages: 10, maxTokens: 4000, summarizeThreshold: 8 },
      caching: { enabled: true, injectBreakpoints: true, minContentLength: 1000 },
      metrics: { enabled: true, logPath: 'metrics', flushIntervalMs: 10000 },
      logging: { level: 'info', format: 'human', fileOutput: true, logPath: 'logs', consoleOutput: true, includeStackTrace: true, colors: true }
    };

    const mockClassification: ClassificationResult = {
      tier: 'simple',
      confidence: 0.85,
      reason: 'Simple question',
      scores: { simple: 0.85, mid: 0.10, complex: 0.03, reasoning: 0.02 },
      signals: ['basic-question']
    };

    const mockContext: RoutingContext = {
      originalModel: 'anthropic/claude-sonnet-4-20250514',
      headers: {}
    };

    const mockDecision = {
      targetModel: 'openai/gpt-4.1-nano',
      originalModel: 'anthropic/claude-sonnet-4-20250514',
      tier: 'simple' as const,
      confidence: 0.85,
      reason: 'routed' as const,
      thinking: null
    };

    const mockShadowRecommendation = {
      timestamp: '2026-02-20T20:00:00.000Z',
      runId: 'test-123',
      actualModel: 'anthropic/claude-sonnet-4-20250514',
      recommendedModel: 'openai/gpt-4.1-nano',
      recommendedProvider: { provider: 'openrouter', source: 'tierProviders' as const, matchedPattern: 'openai/*' },
      decision: mockDecision,
      costDelta: { actualCostPer1k: 0.015, recommendedCostPer1k: 0.0005, savingsPercent: 96.7 },
      recommendedHeaders: { 'HTTP-Referer': 'slimclaw', 'X-Title': 'SlimClaw' },
      recommendedThinking: null,
      wouldApply: true,
      summary: 'Would route sonnet-4 → gpt-4.1-nano via openrouter'
    };

    test('should make complete routing decision for simple tier', () => {
      vi.mocked(resolveModel).mockReturnValue(mockDecision);
      vi.mocked(buildShadowRecommendation).mockReturnValue(mockShadowRecommendation);

      const result = makeRoutingDecision(
        mockClassification,
        mockConfig,
        mockContext,
        'test-run-123'
      );

      expect(result.model).toBe('openai/gpt-4.1-nano');
      expect(result.provider).toBe('openrouter');
      expect(result.headers['X-Title']).toBe('SlimClaw');
      expect(result.headers['HTTP-Referer']).toBe('slimclaw');
      expect(result.thinking).toBeNull();
      expect(result.applied).toBe(true);
      expect(result.shadow).toBe(mockShadowRecommendation);

      expect(resolveModel).toHaveBeenCalledWith(mockClassification, mockConfig.routing, mockContext);
      expect(buildShadowRecommendation).toHaveBeenCalledWith(
        'test-run-123',
        'anthropic/claude-sonnet-4-20250514',
        mockDecision,
        mockConfig.routing.tierProviders,
        mockConfig.routing.pricing
      );
    });

    test('should handle reasoning tier with thinking config', () => {
      const reasoningDecision = {
        ...mockDecision,
        targetModel: 'openai/o4-mini',
        tier: 'reasoning' as const,
        thinking: { type: "enabled" as const, budget_tokens: 10000 }
      };

      const reasoningShadow = {
        ...mockShadowRecommendation,
        recommendedModel: 'openai/o4-mini',
        decision: reasoningDecision,
        recommendedThinking: { type: "enabled" as const, budget_tokens: 10000 }
      };

      vi.mocked(resolveModel).mockReturnValue(reasoningDecision);
      vi.mocked(buildShadowRecommendation).mockReturnValue(reasoningShadow);

      const result = makeRoutingDecision(
        { ...mockClassification, tier: 'reasoning' },
        mockConfig,
        mockContext,
        'reasoning-run-456'
      );

      expect(result.model).toBe('openai/o4-mini');
      expect(result.thinking).toEqual({ type: "enabled", budget_tokens: 10000 });
      expect(result.applied).toBe(true);
    });

    test('should handle no routing (pinned model)', () => {
      const pinnedDecision = {
        ...mockDecision,
        targetModel: 'anthropic/claude-sonnet-4-20250514',
        reason: 'pinned' as const,
        applied: false
      };

      const pinnedShadow = {
        ...mockShadowRecommendation,
        recommendedModel: 'anthropic/claude-sonnet-4-20250514',
        decision: pinnedDecision,
        wouldApply: false
      };

      vi.mocked(resolveModel).mockReturnValue(pinnedDecision);
      vi.mocked(buildShadowRecommendation).mockReturnValue(pinnedShadow);

      const result = makeRoutingDecision(
        mockClassification,
        mockConfig,
        { ...mockContext, originalModel: 'anthropic/claude-sonnet-4-20250514' },
        'pinned-run-789'
      );

      expect(result.model).toBe('anthropic/claude-sonnet-4-20250514');
      expect(result.applied).toBe(false);
    });

    test('should resolve provider for anthropic models to native', () => {
      const anthropicDecision = {
        ...mockDecision,
        targetModel: 'anthropic/claude-opus-4-6',
        originalModel: 'anthropic/claude-sonnet-4-20250514'
      };

      const anthropicShadow = {
        ...mockShadowRecommendation,
        recommendedModel: 'anthropic/claude-opus-4-6',
        recommendedProvider: { provider: 'anthropic', source: 'native' as const },
        decision: anthropicDecision
      };

      vi.mocked(resolveModel).mockReturnValue(anthropicDecision);
      vi.mocked(buildShadowRecommendation).mockReturnValue(anthropicShadow);

      const result = makeRoutingDecision(
        { ...mockClassification, tier: 'complex' },
        mockConfig,
        mockContext,
        'anthropic-run'
      );

      expect(result.provider).toBe('anthropic');
    });

    test('should use config openRouterHeaders when provided', () => {
      const configWithCustomHeaders = {
        ...mockConfig,
        routing: {
          ...mockConfig.routing,
          openRouterHeaders: {
            'HTTP-Referer': 'https://custom-app.com',
            'X-Title': 'CustomApp'
          }
        }
      };

      vi.mocked(resolveModel).mockReturnValue(mockDecision);
      vi.mocked(buildShadowRecommendation).mockReturnValue(mockShadowRecommendation);

      makeRoutingDecision(
        mockClassification,
        configWithCustomHeaders,
        mockContext,
        'custom-headers-run'
      );

      // Should be called via buildShadowRecommendation with custom headers
      expect(buildShadowRecommendation).toHaveBeenCalled();
    });
  });
});
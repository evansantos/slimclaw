/**
 * Integration tests for ClawRouter integration with optimizer middleware
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { inferenceOptimizer, createOptimizationContext, type Message, type OptimizationContext } from '../optimizer.js';
import type { SlimClawConfig } from '../../config.js';
import type { ClassificationResult } from '../../classifier/classify.js';
import { DEFAULT_CONFIG } from '../../config.js';

// Mock the classifier modules
vi.mock('../../classifier/clawrouter-classifier.js', () => ({
  classifyWithRouter: vi.fn(),
}));

vi.mock('../../classifier/index.js', () => ({
  classifyComplexity: vi.fn(),
}));

// Mock other dependencies
vi.mock('../../windowing/windower.js');
vi.mock('../../cache/breakpoints.js');
vi.mock('../../windowing/token-counter.js');
vi.mock('../../logging/index.js');

const mockClassifyWithRouter = vi.mocked(
  await import('../../classifier/clawrouter-classifier.js')
).classifyWithRouter;

const mockClassifyComplexity = vi.mocked(
  await import('../../classifier/index.js')
).classifyComplexity;

const mockEstimateTokens = vi.mocked(
  await import('../../windowing/token-counter.js')
).estimateTokens;

const mockWindowConversation = vi.mocked(
  await import('../../windowing/windower.js')
).windowConversation;

const mockBuildWindowedMessages = vi.mocked(
  await import('../../windowing/windower.js')
).buildWindowedMessages;

const mockInjectCacheBreakpoints = vi.mocked(
  await import('../../cache/breakpoints.js')
).injectCacheBreakpoints;

const mockCreateRequestLogger = vi.mocked(
  await import('../../logging/index.js')
).createRequestLogger;

describe('Optimizer with ClawRouter Integration', () => {
  const testMessages: Message[] = [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Help me debug this complex performance issue in my React application.' },
    { role: 'assistant', content: 'I can help you with that. Let me analyze the performance issue...' },
  ];

  const testContext: OptimizationContext = {
    requestId: 'test-request-id',
    agentId: 'test-agent',
    sessionKey: 'test-session',
    originalModel: 'anthropic/claude-sonnet-4-20250514',
  };

  // Mock logger
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    logOptimization: vi.fn(),
    updateConfig: vi.fn(() => mockLogger),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mocks
    mockCreateRequestLogger.mockReturnValue(mockLogger);
    mockEstimateTokens.mockReturnValue(1000);
    
    // Setup windowing mocks - no windowing applied by default
    mockWindowConversation.mockReturnValue({
      window: testMessages,
      summary: null,
      meta: {
        originalMessageCount: testMessages.length,
        windowedMessageCount: testMessages.length,
        originalTokenEstimate: 1000,
        windowedTokenEstimate: 1000,
        trimmedMessageCount: 0,
        summaryTokenEstimate: 0,
        summarizationMethod: 'none' as const,
      },
    });
    mockBuildWindowedMessages.mockReturnValue(testMessages);
    
    // Setup cache mocks - no cache breakpoints by default
    mockInjectCacheBreakpoints.mockReturnValue({
      messages: testMessages,
      stats: {
        eligibleMessages: 0,
        breakpointsInjected: 0,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Routing Enabled', () => {
    const routingEnabledConfig: SlimClawConfig = {
      ...DEFAULT_CONFIG,
      routing: {
        enabled: true,
        allowDowngrade: true,
        pinnedModels: [],
        minConfidence: 0.5,
        tiers: {
          simple: 'anthropic/claude-3-haiku-20240307',
          mid: 'anthropic/claude-sonnet-4-20250514',
          complex: 'anthropic/claude-opus-4-20250514',
          reasoning: 'anthropic/claude-opus-4-20250514',
        },
        reasoningBudget: 10000,
      },
    };

    it('should use ClawRouter when routing is enabled', async () => {
      const mockClassificationResult: ClassificationResult = {
        tier: 'simple',
        confidence: 0.8,
        reason: 'Simple classification from router',
        scores: { simple: 0.8, mid: 0.15, complex: 0.04, reasoning: 0.01 },
        signals: ['router:primary', 'model:haiku', 'tier:simple'],
      };

      mockClassifyWithRouter.mockReturnValue(mockClassificationResult);

      const result = await inferenceOptimizer(
        testMessages,
        routingEnabledConfig,
        testContext
      );

      expect(mockClassifyWithRouter).toHaveBeenCalledWith(testMessages);
      expect(mockClassifyComplexity).not.toHaveBeenCalled();
      
      // Check that routing was applied
      expect(result.metrics.routingApplied).toBe(true);
      expect(result.metrics.targetModel).toBe('anthropic/claude-3-haiku-20240307');
      expect(result.metrics.modelDowngraded).toBe(true);
      expect(result.metrics.routingTier).toBe('simple');
      expect(result.metrics.routingConfidence).toBe(0.8);
      expect(result.metrics.routingSavingsPercent).toBe(70); // From helper function
    });

    it('should calculate combined savings correctly', async () => {
      const mockClassificationResult: ClassificationResult = {
        tier: 'simple',
        confidence: 0.8,
        reason: 'Simple classification from router',
        scores: { simple: 0.8, mid: 0.15, complex: 0.04, reasoning: 0.01 },
        signals: ['router:primary'],
      };

      mockClassifyWithRouter.mockReturnValue(mockClassificationResult);

      // Mock windowing to save 20% tokens
      mockWindowConversation.mockReturnValue({
        window: testMessages.slice(0, 2), // Simulate trimming
        summary: null,
        meta: {
          originalMessageCount: testMessages.length,
          windowedMessageCount: 2,
          originalTokenEstimate: 1000,
          windowedTokenEstimate: 800, // 20% savings
          trimmedMessageCount: 1,
          summaryTokenEstimate: 0,
          summarizationMethod: 'none' as const,
        },
      });
      mockEstimateTokens.mockReturnValueOnce(1000).mockReturnValueOnce(800);

      const result = await inferenceOptimizer(
        testMessages,
        routingEnabledConfig,
        testContext
      );

      // Windowing savings: 20% (200/1000)
      // Routing savings: 70% (from helper function for simple tier)  
      // Combined: 1 - (1 - 0.2) * (1 - 0.7) = 1 - 0.8 * 0.3 = 1 - 0.24 = 0.76
      expect(result.metrics.combinedSavingsPercent).toBeCloseTo(0.76, 2);
    });

    it('should populate all routing metrics fields', async () => {
      const mockClassificationResult: ClassificationResult = {
        tier: 'mid',
        confidence: 0.7,
        reason: 'Mid-tier classification from router',
        scores: { simple: 0.1, mid: 0.7, complex: 0.15, reasoning: 0.05 },
        signals: ['router:primary', 'tier:mid'],
      };

      mockClassifyWithRouter.mockReturnValue(mockClassificationResult);

      const result = await inferenceOptimizer(
        testMessages,
        routingEnabledConfig,
        {
          ...testContext,
          originalModel: 'anthropic/claude-opus-4-20250514', // Start with complex model
        }
      );

      // Check all routing fields are populated
      expect(result.metrics.routingApplied).toBe(true);
      expect(result.metrics.targetModel).toBe('anthropic/claude-sonnet-4-20250514');
      expect(result.metrics.modelDowngraded).toBe(true);
      expect(result.metrics.modelUpgraded).toBe(false);
      expect(result.metrics.routingTier).toBe('mid');
      expect(result.metrics.routingConfidence).toBe(0.7);
      expect(result.metrics.routingSavingsPercent).toBe(30);
      expect(result.metrics.routingCostEstimate).toBeCloseTo(0.015, 3);
      expect(result.metrics.combinedSavingsPercent).toBeCloseTo(0.3, 2);
    });

    it('should skip routing when confidence is below threshold', async () => {
      const mockClassificationResult: ClassificationResult = {
        tier: 'simple',
        confidence: 0.3, // Below threshold (0.5)
        reason: 'Low confidence classification',
        scores: { simple: 0.3, mid: 0.3, complex: 0.3, reasoning: 0.1 },
        signals: ['router:primary', 'low-confidence'],
      };

      mockClassifyWithRouter.mockReturnValue(mockClassificationResult);

      const result = await inferenceOptimizer(
        testMessages,
        routingEnabledConfig,
        testContext
      );

      expect(result.metrics.routingApplied).toBe(false);
      expect(result.metrics.targetModel).toBe('anthropic/claude-sonnet-4-20250514'); // Original model
      expect(result.metrics.modelDowngraded).toBe(false);
      expect(result.metrics.routingTier).toBe('simple');
      expect(result.metrics.routingConfidence).toBe(0.3);
    });

    it('should skip routing when model is pinned', async () => {
      const configWithPinnedModel: SlimClawConfig = {
        ...routingEnabledConfig,
        routing: {
          ...routingEnabledConfig.routing,
          pinnedModels: ['anthropic/claude-sonnet-4-20250514'],
        },
      };

      const mockClassificationResult: ClassificationResult = {
        tier: 'simple',
        confidence: 0.8, // High confidence
        reason: 'Simple classification',
        scores: { simple: 0.8, mid: 0.15, complex: 0.04, reasoning: 0.01 },
        signals: ['router:primary'],
      };

      mockClassifyWithRouter.mockReturnValue(mockClassificationResult);

      const result = await inferenceOptimizer(
        testMessages,
        configWithPinnedModel,
        testContext
      );

      expect(result.metrics.routingApplied).toBe(false);
      expect(result.metrics.targetModel).toBe('anthropic/claude-sonnet-4-20250514'); // Original model
      expect(result.metrics.modelDowngraded).toBe(false);
    });
  });

  describe('Routing Disabled', () => {
    const routingDisabledConfig: SlimClawConfig = {
      ...DEFAULT_CONFIG,
      routing: {
        ...DEFAULT_CONFIG.routing,
        enabled: false,
      },
    };

    it('should use heuristic classifier when routing is disabled', async () => {
      const mockHeuristicResult: ClassificationResult = {
        tier: 'complex',
        confidence: 0.6,
        reason: 'Heuristic classification',
        scores: { simple: 0.1, mid: 0.2, complex: 0.6, reasoning: 0.1 },
        signals: ['heuristic:keyword', 'complexity:high'],
      };

      mockClassifyComplexity.mockReturnValue(mockHeuristicResult);

      const result = await inferenceOptimizer(
        testMessages,
        routingDisabledConfig,
        testContext
      );

      expect(mockClassifyComplexity).toHaveBeenCalledWith(testMessages);
      expect(mockClassifyWithRouter).not.toHaveBeenCalled();

      expect(result.metrics.routingApplied).toBe(false);
      expect(result.metrics.classificationTier).toBe('complex');
      expect(result.metrics.classificationConfidence).toBe(0.6);
    });
  });

  describe('Graceful Degradation', () => {
    const routingEnabledConfig: SlimClawConfig = {
      ...DEFAULT_CONFIG,
      routing: {
        enabled: true,
        allowDowngrade: true,
        pinnedModels: [],
        minConfidence: 0.5,
        tiers: {
          simple: 'anthropic/claude-3-haiku-20240307',
          mid: 'anthropic/claude-sonnet-4-20250514',
          complex: 'anthropic/claude-opus-4-20250514',
          reasoning: 'anthropic/claude-opus-4-20250514',
        },
        reasoningBudget: 10000,
      },
    };

    it('should fall back to heuristic classifier when router throws error', async () => {
      const mockHeuristicResult: ClassificationResult = {
        tier: 'mid',
        confidence: 0.5,
        reason: 'Fallback heuristic classification',
        scores: { simple: 0.2, mid: 0.5, complex: 0.2, reasoning: 0.1 },
        signals: ['heuristic:fallback'],
      };

      mockClassifyWithRouter.mockImplementation(() => {
        throw new Error('ClawRouter service unavailable');
      });
      mockClassifyComplexity.mockReturnValue(mockHeuristicResult);

      const result = await inferenceOptimizer(
        testMessages,
        routingEnabledConfig,
        testContext
      );

      // Should not crash and should use heuristic fallback
      expect(mockClassifyComplexity).toHaveBeenCalledWith(testMessages);
      expect(result.metrics.routingApplied).toBe(false);
      expect(result.metrics.classificationTier).toBe('mid');
      expect(result.metrics.classificationConfidence).toBe(0.5);
      
      // Should log warning about routing failure
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Routing failed, falling back to heuristic classification',
        expect.objectContaining({
          error: 'ClawRouter service unavailable'
        })
      );
    });

    it('should continue with windowing and cache even when routing fails', async () => {
      // Mock windowing to apply optimization
      mockWindowConversation.mockReturnValue({
        window: testMessages.slice(0, 2),
        summary: null,
        meta: {
          originalMessageCount: testMessages.length,
          windowedMessageCount: 2,
          originalTokenEstimate: 1000,
          windowedTokenEstimate: 600,
          trimmedMessageCount: 1,
          summaryTokenEstimate: 0,
          summarizationMethod: 'heuristic' as const,
        },
      });
      mockBuildWindowedMessages.mockReturnValue(testMessages.slice(0, 2));
      mockEstimateTokens.mockReturnValueOnce(1000).mockReturnValueOnce(600);

      // Mock cache to inject breakpoints
      mockInjectCacheBreakpoints.mockReturnValue({
        messages: testMessages.slice(0, 2),
        stats: {
          eligibleMessages: 1,
          breakpointsInjected: 1,
        },
      });

      const mockHeuristicResult: ClassificationResult = {
        tier: 'complex',
        confidence: 0.4,
        reason: 'Fallback classification',
        scores: { simple: 0.1, mid: 0.3, complex: 0.4, reasoning: 0.2 },
        signals: ['heuristic:fallback'],
      };

      mockClassifyWithRouter.mockImplementation(() => {
        throw new Error('Routing failed');
      });
      mockClassifyComplexity.mockReturnValue(mockHeuristicResult);

      const result = await inferenceOptimizer(
        testMessages,
        routingEnabledConfig,
        testContext
      );

      // Should still apply windowing and caching
      expect(result.metrics.windowingApplied).toBe(true);
      expect(result.metrics.tokensSaved).toBe(400);
      expect(result.metrics.cacheBreakpointsInjected).toBe(1);
      expect(result.metrics.routingApplied).toBe(false);
    });
  });

  describe('Model Upgrades', () => {
    const routingEnabledConfig: SlimClawConfig = {
      ...DEFAULT_CONFIG,
      routing: {
        enabled: true,
        allowDowngrade: true,
        pinnedModels: [],
        minConfidence: 0.5,
        tiers: {
          simple: 'anthropic/claude-3-haiku-20240307',
          mid: 'anthropic/claude-sonnet-4-20250514',
          complex: 'anthropic/claude-opus-4-20250514',
          reasoning: 'anthropic/claude-opus-4-20250514',
        },
        reasoningBudget: 10000,
      },
    };

    it('should detect model upgrades correctly', async () => {
      const mockClassificationResult: ClassificationResult = {
        tier: 'reasoning',
        confidence: 0.9,
        reason: 'Complex reasoning task detected',
        scores: { simple: 0.01, mid: 0.04, complex: 0.05, reasoning: 0.9 },
        signals: ['router:primary', 'tier:reasoning', 'high-confidence'],
      };

      mockClassifyWithRouter.mockReturnValue(mockClassificationResult);

      const result = await inferenceOptimizer(
        testMessages,
        routingEnabledConfig,
        {
          ...testContext,
          originalModel: 'anthropic/claude-3-haiku-20240307', // Start with simple model
        }
      );

      expect(result.metrics.routingApplied).toBe(true);
      expect(result.metrics.targetModel).toBe('anthropic/claude-opus-4-20250514');
      expect(result.metrics.modelUpgraded).toBe(true);
      expect(result.metrics.modelDowngraded).toBe(false);
      expect(result.metrics.routingSavingsPercent).toBe(-20); // Negative savings for reasoning tasks
    });
  });

  describe('Combined Savings Calculation', () => {
    const routingEnabledConfig: SlimClawConfig = {
      ...DEFAULT_CONFIG,
      routing: {
        enabled: true,
        allowDowngrade: true,
        pinnedModels: [],
        minConfidence: 0.5,
        tiers: {
          simple: 'anthropic/claude-3-haiku-20240307',
          mid: 'anthropic/claude-sonnet-4-20250514',
          complex: 'anthropic/claude-opus-4-20250514',
          reasoning: 'anthropic/claude-opus-4-20250514',
        },
        reasoningBudget: 10000,
      },
    };

    it('should calculate combined savings with both windowing and routing', async () => {
      const mockClassificationResult: ClassificationResult = {
        tier: 'simple',
        confidence: 0.8,
        reason: 'Simple classification',
        scores: { simple: 0.8, mid: 0.15, complex: 0.04, reasoning: 0.01 },
        signals: ['router:primary'],
      };

      mockClassifyWithRouter.mockReturnValue(mockClassificationResult);

      // Mock 30% windowing savings
      mockWindowConversation.mockReturnValue({
        window: testMessages.slice(0, 2),
        summary: null,
        meta: {
          originalMessageCount: testMessages.length,
          windowedMessageCount: 2,
          originalTokenEstimate: 1000,
          windowedTokenEstimate: 700, // 30% savings
          trimmedMessageCount: 1,
          summaryTokenEstimate: 0,
          summarizationMethod: 'heuristic' as const,
        },
      });
      mockEstimateTokens.mockReturnValueOnce(1000).mockReturnValueOnce(700);

      const result = await inferenceOptimizer(
        testMessages,
        routingEnabledConfig,
        testContext
      );

      // Windowing: 30% savings (300/1000 = 0.3)
      // Routing: 70% savings (simple tier = 0.7)
      // Combined: 1 - (1 - 0.3) * (1 - 0.7) = 1 - 0.7 * 0.3 = 1 - 0.21 = 0.79
      expect(result.metrics.combinedSavingsPercent).toBeCloseTo(0.79, 2);
    });

    it('should handle zero windowing savings correctly', async () => {
      const mockClassificationResult: ClassificationResult = {
        tier: 'mid',
        confidence: 0.8,
        reason: 'Mid-tier classification',
        scores: { simple: 0.1, mid: 0.8, complex: 0.08, reasoning: 0.02 },
        signals: ['router:primary'],
      };

      mockClassifyWithRouter.mockReturnValue(mockClassificationResult);

      // No windowing savings (same tokens)
      mockEstimateTokens.mockReturnValue(1000);

      const result = await inferenceOptimizer(
        testMessages,
        routingEnabledConfig,
        {
          ...testContext,
          originalModel: 'anthropic/claude-opus-4-20250514', // Downgrade to mid
        }
      );

      // Windowing: 0% savings
      // Routing: 30% savings (mid tier = 0.3)
      // Combined: 1 - (1 - 0) * (1 - 0.3) = 1 - 1 * 0.7 = 0.3
      expect(result.metrics.combinedSavingsPercent).toBeCloseTo(0.3, 2);
    });
  });
});
/**
 * SlimClaw Model Router Tests - Task 13
 * 
 * Comprehensive test suite for model routing functionality including:
 * - Dataset validation for classification accuracy
 * - Edge cases and fallback behavior
 * - Pinned model overrides
 * - Configuration validation
 * - Economic analysis (routing distribution)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveModel, type ModelRoutingDecision } from '../../src/routing/model-router.js';
import type { ClassificationResult } from '../../src/classifier/index.js';
import type { SlimClawConfig } from '../../src/config.js';
import type { RoutingContext } from '../../src/routing/overrides.js';
import { 
  ROUTING_TEST_DATASET, 
  EDGE_CASE_DATASET, 
  getAllTestCases, 
  getTestCasesByTier,
  validateDataset,
  type RoutingTestCase 
} from './routing-dataset.js';

describe('ModelRouter - Comprehensive Testing Suite', () => {
  let mockRoutingConfig: SlimClawConfig['routing'];
  let mockContext: RoutingContext;

  beforeEach(() => {
    mockRoutingConfig = {
      enabled: true,
      allowDowngrade: true,
      minConfidence: 0.4,
      pinnedModels: [],
      tiers: {
        simple: 'anthropic/claude-3-haiku-20240307',
        mid: 'anthropic/claude-sonnet-4-20250514', 
        complex: 'anthropic/claude-opus-4-20250514',
        reasoning: 'anthropic/claude-opus-4-20250514',
      }
    };

    mockContext = {
      originalModel: 'anthropic/claude-sonnet-4-20250514',
      sessionKey: 'test-session',
      agentId: 'test-agent'
    };
  });

  describe('Dataset Validation', () => {
    it('should validate dataset meets requirements', () => {
      const validation = validateDataset();
      
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should have at least 3 examples per tier', () => {
      const tiers = ['simple', 'mid', 'complex', 'reasoning'] as const;
      
      tiers.forEach(tier => {
        const examples = getTestCasesByTier(tier);
        expect(examples.length).toBeGreaterThanOrEqual(3);
        expect(examples.every(ex => ex.expectedTier === tier)).toBe(true);
      });
    });

    it('should have at least 12 total examples', () => {
      expect(ROUTING_TEST_DATASET.length).toBeGreaterThanOrEqual(12);
    });

    it('should have unique test case IDs', () => {
      const allCases = getAllTestCases();
      const ids = allCases.map(tc => tc.id);
      const uniqueIds = new Set(ids);
      
      expect(ids.length).toBe(uniqueIds.size);
    });
  });

  describe('Core Model Resolution', () => {
    it('should resolve model for each tier correctly', () => {
      const tiers = ['simple', 'mid', 'complex', 'reasoning'] as const;
      const expectedModels = [
        'anthropic/claude-3-haiku-20240307',
        'anthropic/claude-sonnet-4-20250514',
        'anthropic/claude-opus-4-20250514', 
        'anthropic/claude-opus-4-20250514'
      ];

      tiers.forEach((tier, index) => {
        const classification: ClassificationResult = {
          tier,
          confidence: 0.8,
          reason: `Classified as ${tier}`,
          scores: { simple: 0.1, mid: 0.1, complex: 0.1, reasoning: 0.1, [tier]: 0.8 },
          signals: ['test-signal']
        };

        const result = resolveModel(classification, mockRoutingConfig, mockContext);

        expect(result.originalModel).toBe('anthropic/claude-sonnet-4-20250514');
        expect(result.targetModel).toBe(expectedModels[index]);
        expect(result.tier).toBe(tier);
        expect(result.reason).toBe('routed');
        expect(result.confidence).toBe(0.8);

        // Check thinking configuration for reasoning tier
        if (tier === 'reasoning') {
          expect(result.thinking).toEqual({
            type: 'enabled',
            budget_tokens: 10000
          });
        } else {
          expect(result.thinking).toBeNull();
        }
      });
    });

    it('should handle missing configuration gracefully', () => {
      const classification: ClassificationResult = {
        tier: 'mid',
        confidence: 0.7,
        reason: 'Test classification',
        scores: { simple: 0.1, mid: 0.7, complex: 0.1, reasoning: 0.1 },
        signals: ['test']
      };

      // Test with null config
      const result = resolveModel(classification, null as any, mockContext);

      expect(result.originalModel).toBe('anthropic/claude-sonnet-4-20250514');
      expect(result.targetModel).toBe('anthropic/claude-sonnet-4-20250514'); 
      expect(result.reason).toBe('routing-disabled');
    });

    it('should handle routing disabled', () => {
      const disabledConfig: SlimClawConfig['routing'] = {
        ...mockRoutingConfig,
        enabled: false
      };

      const classification: ClassificationResult = {
        tier: 'simple',
        confidence: 0.9,
        reason: 'High confidence simple',
        scores: { simple: 0.9, mid: 0.05, complex: 0.03, reasoning: 0.02 },
        signals: ['simple-query']
      };

      const result = resolveModel(classification, disabledConfig, mockContext);

      expect(result.originalModel).toBe(mockContext.originalModel);
      expect(result.targetModel).toBe(mockContext.originalModel);
      expect(result.reason).toBe('routing-disabled');
    });
  });

  describe('Pinned Model Overrides', () => {
    it('should respect X-Model-Pinned header', () => {
      const pinnedModel = 'custom/pinned-model';
      const contextWithHeader: RoutingContext = {
        ...mockContext,
        headers: {
          'x-model-pinned': pinnedModel
        }
      };

      const classification: ClassificationResult = {
        tier: 'simple',
        confidence: 0.8,
        reason: 'Should be overridden',
        scores: { simple: 0.8, mid: 0.1, complex: 0.05, reasoning: 0.05 },
        signals: ['override-test']
      };

      const result = resolveModel(classification, mockRoutingConfig, contextWithHeader);

      expect(result.targetModel).toBe(pinnedModel);
      expect(result.reason).toBe('pinned');
      expect(result.originalModel).toBe(mockContext.originalModel);
    });

    it('should respect pinned models in configuration', () => {
      const pinnedConfig: SlimClawConfig['routing'] = {
        ...mockRoutingConfig,
        pinnedModels: ['anthropic/claude-sonnet-4-20250514']
      };

      const classification: ClassificationResult = {
        tier: 'simple', // Should route to haiku but will be pinned
        confidence: 0.9,
        reason: 'High confidence simple but pinned',
        scores: { simple: 0.9, mid: 0.05, complex: 0.03, reasoning: 0.02 },
        signals: ['pinned-test']
      };

      const result = resolveModel(classification, pinnedConfig, mockContext);

      expect(result.targetModel).toBe('anthropic/claude-sonnet-4-20250514');
      expect(result.reason).toBe('pinned');
    });

    it('should prioritize header over config pinning', () => {
      const headerModel = 'header/priority-model';
      const contextWithHeader: RoutingContext = {
        ...mockContext,
        originalModel: 'anthropic/claude-opus-4-20250514', // This would be pinned by config
        headers: {
          'x-model-pinned': headerModel
        }
      };

      const pinnedConfig: SlimClawConfig['routing'] = {
        ...mockRoutingConfig,
        pinnedModels: ['anthropic/claude-opus-4-20250514']
      };

      const classification: ClassificationResult = {
        tier: 'simple',
        confidence: 0.7,
        reason: 'Header should win',
        scores: { simple: 0.7, mid: 0.15, complex: 0.1, reasoning: 0.05 },
        signals: ['priority-test']
      };

      const result = resolveModel(classification, pinnedConfig, contextWithHeader);

      expect(result.targetModel).toBe(headerModel);
      expect(result.reason).toBe('pinned');
    });
  });

  describe('Confidence Threshold Handling', () => {
    it('should not route when confidence is below threshold', () => {
      const lowConfidenceClassification: ClassificationResult = {
        tier: 'simple',
        confidence: 0.3, // Below default threshold of 0.4
        reason: 'Low confidence classification',
        scores: { simple: 0.3, mid: 0.25, complex: 0.25, reasoning: 0.2 },
        signals: ['uncertain']
      };

      const result = resolveModel(lowConfidenceClassification, mockRoutingConfig, mockContext);

      expect(result.targetModel).toBe(mockContext.originalModel);
      expect(result.reason).toBe('low-confidence');
      expect(result.confidence).toBe(0.3);
    });

    it('should route when confidence meets threshold', () => {
      const goodConfidenceClassification: ClassificationResult = {
        tier: 'simple', 
        confidence: 0.4, // Exactly at threshold
        reason: 'Meets threshold',
        scores: { simple: 0.4, mid: 0.3, complex: 0.2, reasoning: 0.1 },
        signals: ['threshold-test']
      };

      const result = resolveModel(goodConfidenceClassification, mockRoutingConfig, mockContext);

      expect(result.targetModel).toBe('anthropic/claude-3-haiku-20240307'); // Simple tier
      expect(result.reason).toBe('routed');
    });

    it('should respect custom confidence threshold', () => {
      const highThresholdConfig: SlimClawConfig['routing'] = {
        ...mockRoutingConfig,
        minConfidence: 0.8 // Higher threshold
      };

      const mediumConfidenceClassification: ClassificationResult = {
        tier: 'complex',
        confidence: 0.6, // Good confidence but below custom threshold  
        reason: 'Medium confidence',
        scores: { simple: 0.1, mid: 0.2, complex: 0.6, reasoning: 0.1 },
        signals: ['medium-confidence']
      };

      const result = resolveModel(mediumConfidenceClassification, highThresholdConfig, mockContext);

      expect(result.targetModel).toBe(mockContext.originalModel);
      expect(result.reason).toBe('low-confidence');
    });
  });

  describe('Downgrade Prevention', () => {
    it('should prevent downgrade when allowDowngrade is false', () => {
      const noDowngradeConfig: SlimClawConfig['routing'] = {
        ...mockRoutingConfig,
        allowDowngrade: false
      };

      const simpleClassification: ClassificationResult = {
        tier: 'simple',
        confidence: 0.9,
        reason: 'High confidence simple but should not downgrade',
        scores: { simple: 0.9, mid: 0.05, complex: 0.03, reasoning: 0.02 },
        signals: ['downgrade-test']
      };

      // Original model is opus (higher tier), classification suggests haiku (lower tier)
      const contextWithOpus: RoutingContext = {
        ...mockContext,
        originalModel: 'anthropic/claude-opus-4-20250514'
      };

      const result = resolveModel(simpleClassification, noDowngradeConfig, contextWithOpus);

      expect(result.targetModel).toBe('anthropic/claude-opus-4-20250514'); // Keep original
      expect(result.reason).toBe('pinned'); // Blocked downgrade acts like pinning
      expect(result.originalModel).toBe('anthropic/claude-opus-4-20250514');
    });

    it('should allow upgrade even when allowDowngrade is false', () => {
      const noDowngradeConfig: SlimClawConfig['routing'] = {
        ...mockRoutingConfig,
        allowDowngrade: false
      };

      const complexClassification: ClassificationResult = {
        tier: 'complex',
        confidence: 0.8,
        reason: 'Should upgrade to opus',
        scores: { simple: 0.05, mid: 0.1, complex: 0.8, reasoning: 0.05 },
        signals: ['upgrade-test']
      };

      // Original model is haiku (lower tier), classification suggests opus (higher tier)
      const contextWithHaiku: RoutingContext = {
        ...mockContext,
        originalModel: 'anthropic/claude-3-haiku-20240307'
      };

      const result = resolveModel(complexClassification, noDowngradeConfig, contextWithHaiku);

      expect(result.targetModel).toBe('anthropic/claude-opus-4-20250514'); // Upgrade allowed
      expect(result.reason).toBe('routed');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle classification errors gracefully', () => {
      const classification: ClassificationResult = {
        tier: 'mid',
        confidence: 0.7,
        reason: 'Test with invalid config',
        scores: { simple: 0.1, mid: 0.7, complex: 0.1, reasoning: 0.1 },
        signals: ['error-test']
      };

      // Simulate error condition with invalid config
      const invalidConfig = {
        enabled: true,
        tiers: null // Invalid tiers
      } as any;

      const result = resolveModel(classification, invalidConfig, mockContext);

      expect(result.targetModel).toBe(mockContext.originalModel);
      expect(result.reason).toBe('routing-disabled');
      expect(result.originalModel).toBe(mockContext.originalModel);
    });

    it('should handle missing original model', () => {
      const contextWithoutModel: RoutingContext = {
        sessionKey: 'test-session'
        // originalModel missing
      };

      const classification: ClassificationResult = {
        tier: 'mid',
        confidence: 0.7,
        reason: 'Test without original model',
        scores: { simple: 0.1, mid: 0.7, complex: 0.1, reasoning: 0.1 },
        signals: ['missing-model-test']
      };

      const result = resolveModel(classification, mockRoutingConfig, contextWithoutModel);

      expect(result.originalModel).toBe('anthropic/claude-sonnet-4-20250514'); // Default
      expect(result.targetModel).toBe('anthropic/claude-sonnet-4-20250514'); // Mid tier default  
      expect(result.reason).toBe('routed');
    });

    it('should round confidence values properly', () => {
      const preciseClassification: ClassificationResult = {
        tier: 'complex',
        confidence: 0.123456789,
        reason: 'Precision test',
        scores: { simple: 0.05, mid: 0.1, complex: 0.123456789, reasoning: 0.05 },
        signals: ['precision-test']
      };

      const result = resolveModel(preciseClassification, mockRoutingConfig, mockContext);

      expect(result.confidence).toBe(0.12); // Rounded to 2 decimal places
    });

    it('should handle edge cases from dataset', () => {
      EDGE_CASE_DATASET.forEach(edgeCase => {
        const classification: ClassificationResult = {
          tier: edgeCase.expectedTier,
          confidence: edgeCase.expectedMinConfidence,
          reason: edgeCase.description,
          scores: {
            simple: edgeCase.expectedTier === 'simple' ? 0.7 : 0.1,
            mid: edgeCase.expectedTier === 'mid' ? 0.7 : 0.1,
            complex: edgeCase.expectedTier === 'complex' ? 0.7 : 0.1,
            reasoning: edgeCase.expectedTier === 'reasoning' ? 0.7 : 0.1
          },
          signals: edgeCase.expectedSignals || ['edge-case']
        };

        const result = resolveModel(classification, mockRoutingConfig, mockContext);

        // Edge cases should not cause errors
        expect(result).toBeDefined();
        expect(result.originalModel).toBeDefined();
        expect(result.targetModel).toBeDefined();
        expect(result.reason).toBeOneOf(['routed', 'pinned', 'low-confidence', 'routing-disabled']);
      });
    });
  });

  describe('Configuration Validation', () => {
    it('should handle missing tier configuration', () => {
      const incompleteTierConfig: SlimClawConfig['routing'] = {
        ...mockRoutingConfig,
        tiers: {
          simple: 'anthropic/claude-3-haiku-20240307',
          mid: 'anthropic/claude-sonnet-4-20250514'
          // complex and reasoning missing
        } as any
      };

      const classification: ClassificationResult = {
        tier: 'complex',
        confidence: 0.8,
        reason: 'Missing tier config test',
        scores: { simple: 0.1, mid: 0.05, complex: 0.8, reasoning: 0.05 },
        signals: ['config-test']
      };

      const result = resolveModel(classification, incompleteTierConfig, mockContext);

      // Should fallback gracefully
      expect(result.targetModel).toBe(mockContext.originalModel);
      expect(result.reason).toBe('routing-disabled');
    });

    it('should validate custom tier models', () => {
      const customConfig: SlimClawConfig['routing'] = {
        ...mockRoutingConfig,
        tiers: {
          simple: 'custom/simple-model',
          mid: 'custom/mid-model', 
          complex: 'custom/complex-model',
          reasoning: 'custom/reasoning-model'
        }
      };

      const classification: ClassificationResult = {
        tier: 'mid',
        confidence: 0.7,
        reason: 'Custom tier test',
        scores: { simple: 0.1, mid: 0.7, complex: 0.1, reasoning: 0.1 },
        signals: ['custom-test']
      };

      const result = resolveModel(classification, customConfig, mockContext);

      expect(result.targetModel).toBe('custom/mid-model');
      expect(result.reason).toBe('routed');
    });
  });

  describe('Economic Analysis - Routing Distribution', () => {
    it('should provide routing distribution metrics across dataset', () => {
      const routingStats = {
        simple: 0,
        mid: 0,
        complex: 0,
        reasoning: 0,
        pinned: 0,
        lowConfidence: 0
      };

      ROUTING_TEST_DATASET.forEach(testCase => {
        const classification: ClassificationResult = {
          tier: testCase.expectedTier,
          confidence: testCase.expectedMinConfidence + 0.1, // Add buffer to ensure routing
          reason: testCase.description,
          scores: {
            simple: testCase.expectedTier === 'simple' ? 0.8 : 0.1,
            mid: testCase.expectedTier === 'mid' ? 0.8 : 0.1, 
            complex: testCase.expectedTier === 'complex' ? 0.8 : 0.1,
            reasoning: testCase.expectedTier === 'reasoning' ? 0.8 : 0.1
          },
          signals: testCase.expectedSignals || []
        };

        const result = resolveModel(classification, mockRoutingConfig, mockContext);

        // Count routing decisions  
        if (result.reason === 'routed') {
          routingStats[result.tier]++;
        } else if (result.reason === 'pinned') {
          routingStats.pinned++;
        } else if (result.reason === 'low-confidence') {
          routingStats.lowConfidence++;
        }
      });

      // Verify distribution makes sense
      const totalRouted = routingStats.simple + routingStats.mid + routingStats.complex + routingStats.reasoning;
      expect(totalRouted).toBeGreaterThan(0);
      
      // Each tier should have some examples routed
      expect(routingStats.simple).toBeGreaterThan(0);
      expect(routingStats.mid).toBeGreaterThan(0);
      expect(routingStats.complex).toBeGreaterThan(0);
      expect(routingStats.reasoning).toBeGreaterThan(0);

      console.log('Routing Distribution Analysis:', {
        totalExamples: ROUTING_TEST_DATASET.length,
        routedToSimple: routingStats.simple,
        routedToMid: routingStats.mid,
        routedToComplex: routingStats.complex,
        routedToReasoning: routingStats.reasoning,
        pinnedOverrides: routingStats.pinned,
        lowConfidenceSkips: routingStats.lowConfidence,
        percentageRouted: Math.round((totalRouted / ROUTING_TEST_DATASET.length) * 100)
      });
    });

    it('should calculate potential cost savings', () => {
      // Mock model costs (tokens per dollar - higher is cheaper)
      const modelCosts = {
        'anthropic/claude-3-haiku-20240307': 1000,      // Cheapest
        'anthropic/claude-sonnet-4-20250514': 500,      // Mid-range
        'anthropic/claude-opus-4-20250514': 100         // Most expensive
      };

      let totalOriginalCost = 0;
      let totalRoutedCost = 0;
      const avgTokensPerRequest = 1000;

      ROUTING_TEST_DATASET.forEach(testCase => {
        const classification: ClassificationResult = {
          tier: testCase.expectedTier,
          confidence: testCase.expectedMinConfidence + 0.1,
          reason: testCase.description,
          scores: {
            simple: testCase.expectedTier === 'simple' ? 0.8 : 0.1,
            mid: testCase.expectedTier === 'mid' ? 0.8 : 0.1,
            complex: testCase.expectedTier === 'complex' ? 0.8 : 0.1,
            reasoning: testCase.expectedTier === 'reasoning' ? 0.8 : 0.1
          },
          signals: testCase.expectedSignals || []
        };

        const result = resolveModel(classification, mockRoutingConfig, mockContext);

        // Calculate costs
        const originalCost = avgTokensPerRequest / modelCosts[result.originalModel as keyof typeof modelCosts];
        const routedCost = avgTokensPerRequest / modelCosts[result.targetModel as keyof typeof modelCosts];

        totalOriginalCost += originalCost;
        totalRoutedCost += routedCost;
      });

      const savings = totalOriginalCost - totalRoutedCost;
      const savingsPercent = (savings / totalOriginalCost) * 100;

      console.log('Cost Analysis:', {
        totalRequests: ROUTING_TEST_DATASET.length,
        originalCost: totalOriginalCost.toFixed(4),
        routedCost: totalRoutedCost.toFixed(4),
        savings: savings.toFixed(4),
        savingsPercent: savingsPercent.toFixed(1) + '%'
      });

      // In most cases we should see some savings by routing simpler queries to cheaper models
      expect(totalRoutedCost).toBeLessThanOrEqual(totalOriginalCost);
    });
  });
});

// Type assertion helper for tests
declare global {
  namespace Vi {
    interface Assertion<T = any> {
      toBeOneOf(expected: any[]): T;
    }
  }
}

// Custom matcher
expect.extend({
  toBeOneOf(received: any, expected: any[]) {
    const pass = expected.includes(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be one of ${expected.join(', ')}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be one of ${expected.join(', ')}`,
        pass: false,
      };
    }
  },
});
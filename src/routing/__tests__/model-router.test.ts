/**
 * Tests for the main model router functionality
 * Enhanced for Task 13: Dataset validation, edge cases, and benchmarking
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resolveModel } from '../model-router.js';
import type { ClassificationResult } from '../../classifier/index.js';
import type { SlimClawConfig } from '../../config.js';
import type { RoutingContext } from '../overrides.js';
import { 
  ROUTING_TEST_DATASET, 
  EDGE_CASE_DATASET, 
  getAllTestCases, 
  getTestCasesByTier,
  validateDataset,
  type RoutingTestCase 
} from './routing-dataset.js';

describe('model-router', () => {
  let mockClassification: ClassificationResult;
  let mockRoutingConfig: SlimClawConfig['routing'];
  let mockContext: RoutingContext;

  beforeEach(() => {
    mockClassification = {
      tier: 'mid',
      confidence: 0.75,
      reason: 'classified as mid complexity',
      scores: { simple: 0.1, mid: 0.75, complex: 0.1, reasoning: 0.05 },
      signals: ['keyword-match', 'moderate-length']
    };

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

  describe('resolveModel', () => {
    it('should route to tier-appropriate model when routing is enabled', () => {
      const result = resolveModel(mockClassification, mockRoutingConfig, mockContext);

      expect(result.originalModel).toBe('anthropic/claude-sonnet-4-20250514');
      expect(result.targetModel).toBe('anthropic/claude-sonnet-4-20250514'); // mid tier
      expect(result.tier).toBe('mid');
      expect(result.confidence).toBe(0.75);
      expect(result.reason).toBe('routed');
      expect(result.thinking).toBeNull(); // Not reasoning tier
    });

    it('should enable thinking for reasoning tier', () => {
      const reasoningClassification: ClassificationResult = {
        ...mockClassification,
        tier: 'reasoning'
      };

      const result = resolveModel(reasoningClassification, mockRoutingConfig, mockContext);

      expect(result.tier).toBe('reasoning');
      expect(result.thinking).toEqual({
        type: 'enabled',
        budget_tokens: 10000
      });
    });

    it('should return original model when routing is disabled', () => {
      const disabledConfig: SlimClawConfig['routing'] = {
        ...mockRoutingConfig,
        enabled: false
      };

      const result = resolveModel(mockClassification, disabledConfig, mockContext);

      expect(result.originalModel).toBe('anthropic/claude-sonnet-4-20250514');
      expect(result.targetModel).toBe('anthropic/claude-sonnet-4-20250514');
      expect(result.reason).toBe('routing-disabled');
    });

    it('should respect X-Model-Pinned header', () => {
      const contextWithHeader: RoutingContext = {
        ...mockContext,
        headers: {
          'x-model-pinned': 'custom/pinned-model'
        }
      };

      const result = resolveModel(mockClassification, mockRoutingConfig, contextWithHeader);

      expect(result.targetModel).toBe('custom/pinned-model');
      expect(result.reason).toBe('pinned');
    });

    it('should respect pinned models configuration', () => {
      const pinnedConfig: SlimClawConfig['routing'] = {
        ...mockRoutingConfig,
        pinnedModels: ['anthropic/claude-sonnet-4-20250514']
      };

      const result = resolveModel(mockClassification, pinnedConfig, mockContext);

      expect(result.targetModel).toBe('anthropic/claude-sonnet-4-20250514');
      expect(result.reason).toBe('pinned');
    });

    it('should not route when confidence is below threshold', () => {
      const lowConfidenceClassification: ClassificationResult = {
        ...mockClassification,
        confidence: 0.3
      };

      const result = resolveModel(lowConfidenceClassification, mockRoutingConfig, mockContext);

      expect(result.targetModel).toBe('anthropic/claude-sonnet-4-20250514'); // Original model
      expect(result.reason).toBe('low-confidence');
    });

    it('should prevent downgrade when allowDowngrade is false', () => {
      const noDowngradeConfig: SlimClawConfig['routing'] = {
        ...mockRoutingConfig,
        allowDowngrade: false
      };

      const simpleClassification: ClassificationResult = {
        ...mockClassification,
        tier: 'simple'
      };

      // Original model is opus (high tier), classification suggests haiku (low tier)
      const contextWithOpus: RoutingContext = {
        ...mockContext,
        originalModel: 'anthropic/claude-opus-4-20250514'
      };

      const result = resolveModel(simpleClassification, noDowngradeConfig, contextWithOpus);

      expect(result.targetModel).toBe('anthropic/claude-opus-4-20250514'); // Keep original
      expect(result.reason).toBe('pinned'); // Downgrade blocked acts like pinning
    });

    it('should handle missing original model gracefully', () => {
      const contextWithoutModel: RoutingContext = {
        sessionKey: 'test-session'
        // originalModel missing
      };

      const result = resolveModel(mockClassification, mockRoutingConfig, contextWithoutModel);

      expect(result.originalModel).toBe('anthropic/claude-sonnet-4-20250514'); // Default
      expect(result.targetModel).toBe('anthropic/claude-sonnet-4-20250514'); // mid tier default
      expect(result.reason).toBe('routed');
    });

    it('should route to appropriate tier models', () => {
      const tiers = ['simple', 'mid', 'complex', 'reasoning'] as const;
      const expectedModels = [
        'anthropic/claude-3-haiku-20240307',
        'anthropic/claude-sonnet-4-20250514', 
        'anthropic/claude-opus-4-20250514',
        'anthropic/claude-opus-4-20250514'
      ];

      tiers.forEach((tier, index) => {
        const classification: ClassificationResult = {
          ...mockClassification,
          tier
        };

        const result = resolveModel(classification, mockRoutingConfig, mockContext);

        expect(result.targetModel).toBe(expectedModels[index]);
        expect(result.tier).toBe(tier);
        expect(result.reason).toBe('routed');
      });
    });

    it('should handle classification errors gracefully', () => {
      // Simulate error by providing invalid config
      const invalidConfig = null as any;

      const result = resolveModel(mockClassification, invalidConfig, mockContext);

      expect(result.originalModel).toBe('anthropic/claude-sonnet-4-20250514');
      expect(result.targetModel).toBe('anthropic/claude-sonnet-4-20250514'); // Fallback to original
      expect(result.reason).toBe('routing-disabled');
    });

    it('should round confidence to 2 decimal places', () => {
      const preciseClassification: ClassificationResult = {
        ...mockClassification,
        confidence: 0.123456789
      };

      const result = resolveModel(preciseClassification, mockRoutingConfig, mockContext);

      expect(result.confidence).toBe(0.12);
    });

    it('should handle custom tier models from config', () => {
      const customConfig: SlimClawConfig['routing'] = {
        ...mockRoutingConfig,
        tiers: {
          simple: 'custom/simple-model',
          mid: 'custom/mid-model',
          complex: 'custom/complex-model',
          reasoning: 'custom/reasoning-model',
        }
      };

      const result = resolveModel(mockClassification, customConfig, mockContext);

      expect(result.targetModel).toBe('custom/mid-model');
      expect(result.reason).toBe('routed');
    });

    it('should handle priority of overrides correctly', () => {
      // Setup context with header and config that would both apply
      const contextWithHeader: RoutingContext = {
        ...mockContext,
        originalModel: 'anthropic/claude-opus-4-20250514', // Would be pinned by config
        headers: {
          'x-model-pinned': 'header/wins'
        }
      };

      const configWithPinned: SlimClawConfig['routing'] = {
        ...mockRoutingConfig,
        pinnedModels: ['anthropic/claude-opus-4-20250514'],
        minConfidence: 0.8 // Low confidence classification
      };

      const lowConfidenceClassification: ClassificationResult = {
        ...mockClassification,
        confidence: 0.2
      };

      const result = resolveModel(lowConfidenceClassification, configWithPinned, contextWithHeader);

      // Header should win over both pinned config and low confidence
      expect(result.targetModel).toBe('header/wins');
      expect(result.reason).toBe('pinned');
    });
  });

  // TASK 13 REQUIREMENTS: Dataset validation, edge cases, and benchmarking
  describe('Task 13: Dataset Validation Tests', () => {
    it('should validate dataset meets Task 13 requirements', () => {
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

    it('should have at least 12 total examples in main dataset', () => {
      expect(ROUTING_TEST_DATASET.length).toBeGreaterThanOrEqual(12);
    });

    it('should have unique test case IDs across all datasets', () => {
      const allCases = getAllTestCases();
      const ids = allCases.map(tc => tc.id);
      const uniqueIds = new Set(ids);
      
      expect(ids.length).toBe(uniqueIds.size);
    });

    it('should validate routing decisions for all dataset examples', () => {
      let routedCorrectly = 0;
      let totalProcessed = 0;

      ROUTING_TEST_DATASET.forEach(testCase => {
        const classification: ClassificationResult = {
          tier: testCase.expectedTier,
          confidence: testCase.expectedMinConfidence + 0.1, // Add buffer for routing
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
        totalProcessed++;

        // Verify routing decision is reasonable
        expect(result).toBeDefined();
        expect(result.originalModel).toBeDefined();
        expect(result.targetModel).toBeDefined();
        expect(result.tier).toBe(testCase.expectedTier);
        expect(['routed', 'pinned', 'low-confidence', 'routing-disabled']).toContain(result.reason);

        if (result.reason === 'routed') {
          routedCorrectly++;
        }
      });

      console.log(`Dataset validation: ${routedCorrectly}/${totalProcessed} examples routed successfully`);
      expect(routedCorrectly).toBeGreaterThan(0);
    });
  });

  describe('Task 13: Edge Cases and Fallback Tests', () => {
    it('should handle classifier failures gracefully', () => {
      const invalidClassification = {
        tier: 'mid' as any,
        confidence: -1, // Invalid confidence (below threshold)
        reason: 'Simulated classifier failure',
        scores: { simple: 0.25, mid: 0.25, complex: 0.25, reasoning: 0.25 },
        signals: []
      };

      const result = resolveModel(invalidClassification, mockRoutingConfig, mockContext);

      expect(result.targetModel).toBe(mockContext.originalModel);
      expect(result.reason).toBe('low-confidence'); // Low confidence is the expected behavior
    });

    it('should handle corrupted config gracefully', () => {
      // Use null config to trigger actual error handling
      const corruptedConfig = null as any;

      const classification: ClassificationResult = {
        tier: 'mid',
        confidence: 0.8,
        reason: 'Test with corrupted config',
        scores: { simple: 0.1, mid: 0.8, complex: 0.05, reasoning: 0.05 },
        signals: ['test']
      };

      const result = resolveModel(classification, corruptedConfig, mockContext);

      expect(result.targetModel).toBe(mockContext.originalModel);
      expect(result.reason).toBe('routing-disabled');
    });

    it('should process all edge case examples without errors', () => {
      EDGE_CASE_DATASET.forEach(edgeCase => {
        const classification: ClassificationResult = {
          tier: edgeCase.expectedTier,
          confidence: Math.max(0.1, edgeCase.expectedMinConfidence), // Ensure minimum confidence
          reason: edgeCase.description,
          scores: {
            simple: edgeCase.expectedTier === 'simple' ? 0.6 : 0.1,
            mid: edgeCase.expectedTier === 'mid' ? 0.6 : 0.1,
            complex: edgeCase.expectedTier === 'complex' ? 0.6 : 0.1,
            reasoning: edgeCase.expectedTier === 'reasoning' ? 0.6 : 0.1
          },
          signals: edgeCase.expectedSignals || ['edge-case']
        };

        expect(() => {
          const result = resolveModel(classification, mockRoutingConfig, mockContext);
          expect(result).toBeDefined();
        }).not.toThrow();
      });
    });

    it('should handle various unknown tier scenarios', () => {
      // Test with a classification that has an unknown tier but valid structure
      const classification: ClassificationResult = {
        tier: 'unknown-tier' as any,
        confidence: 0.5,
        reason: 'Testing unknown tier',
        scores: { simple: 0.25, mid: 0.25, complex: 0.25, reasoning: 0.25 },
        signals: ['unknown-tier-test']
      };

      const result = resolveModel(classification, mockRoutingConfig, mockContext);
      
      // Should handle gracefully and fallback to original model
      expect(result).toBeDefined();
      expect(result.originalModel).toBe(mockContext.originalModel);
      expect(['routing-disabled', 'routed'].includes(result.reason)).toBe(true);
      
      // If routing failed, should fallback to original model
      if (result.reason === 'routing-disabled') {
        expect(result.targetModel).toBe(mockContext.originalModel);
      }
    });
  });

  describe('Task 13: Economic Benchmarking', () => {
    it('should calculate routing distribution across dataset', () => {
      const routingStats = {
        simple: 0,
        mid: 0,
        complex: 0,
        reasoning: 0,
        pinned: 0,
        lowConfidence: 0,
        disabled: 0
      };

      ROUTING_TEST_DATASET.forEach(testCase => {
        const classification: ClassificationResult = {
          tier: testCase.expectedTier,
          confidence: testCase.expectedMinConfidence + 0.2, // High confidence for routing
          reason: testCase.description,
          scores: {
            simple: testCase.expectedTier === 'simple' ? 0.8 : 0.05,
            mid: testCase.expectedTier === 'mid' ? 0.8 : 0.05,
            complex: testCase.expectedTier === 'complex' ? 0.8 : 0.05,
            reasoning: testCase.expectedTier === 'reasoning' ? 0.8 : 0.05
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
        } else {
          routingStats.disabled++;
        }
      });

      const totalRouted = routingStats.simple + routingStats.mid + routingStats.complex + routingStats.reasoning;
      const totalExamples = ROUTING_TEST_DATASET.length;

      console.log('Routing Distribution Analysis:', {
        totalExamples,
        simple: `${routingStats.simple} (${Math.round(routingStats.simple/totalExamples*100)}%)`,
        mid: `${routingStats.mid} (${Math.round(routingStats.mid/totalExamples*100)}%)`,
        complex: `${routingStats.complex} (${Math.round(routingStats.complex/totalExamples*100)}%)`,
        reasoning: `${routingStats.reasoning} (${Math.round(routingStats.reasoning/totalExamples*100)}%)`,
        pinned: `${routingStats.pinned} (${Math.round(routingStats.pinned/totalExamples*100)}%)`,
        lowConfidence: `${routingStats.lowConfidence} (${Math.round(routingStats.lowConfidence/totalExamples*100)}%)`,
        disabled: `${routingStats.disabled} (${Math.round(routingStats.disabled/totalExamples*100)}%)`,
        successfulRouting: `${Math.round((totalRouted / totalExamples) * 100)}%`
      });

      // Verify we have a reasonable distribution
      expect(totalRouted).toBeGreaterThan(0);
      expect(routingStats.simple).toBeGreaterThan(0);
      expect(routingStats.mid).toBeGreaterThan(0);
      expect(routingStats.complex).toBeGreaterThan(0);
      expect(routingStats.reasoning).toBeGreaterThan(0);
    });

    it('should estimate cost savings vs degradation', () => {
      // Mock cost model (cost per 1k tokens)
      const modelCosts = {
        'anthropic/claude-3-haiku-20240307': 0.25,      // Cheapest
        'anthropic/claude-sonnet-4-20250514': 3.00,     // Mid-range
        'anthropic/claude-opus-4-20250514': 15.00       // Most expensive
      };

      let totalOriginalCost = 0;
      let totalRoutedCost = 0;
      let simpleTaskCost = { original: 0, routed: 0 };
      let complexTaskCost = { original: 0, routed: 0 };
      const avgTokensPerRequest = 1000;

      ROUTING_TEST_DATASET.forEach(testCase => {
        const classification: ClassificationResult = {
          tier: testCase.expectedTier,
          confidence: testCase.expectedMinConfidence + 0.15,
          reason: testCase.description,
          scores: {
            simple: testCase.expectedTier === 'simple' ? 0.8 : 0.05,
            mid: testCase.expectedTier === 'mid' ? 0.8 : 0.05,
            complex: testCase.expectedTier === 'complex' ? 0.8 : 0.05,
            reasoning: testCase.expectedTier === 'reasoning' ? 0.8 : 0.05
          },
          signals: testCase.expectedSignals || []
        };

        const result = resolveModel(classification, mockRoutingConfig, mockContext);

        // Calculate costs
        const originalCost = (avgTokensPerRequest / 1000) * modelCosts[result.originalModel as keyof typeof modelCosts];
        const routedCost = (avgTokensPerRequest / 1000) * modelCosts[result.targetModel as keyof typeof modelCosts];

        totalOriginalCost += originalCost;
        totalRoutedCost += routedCost;

        // Track simple vs complex task costs separately
        if (testCase.expectedTier === 'simple') {
          simpleTaskCost.original += originalCost;
          simpleTaskCost.routed += routedCost;
        } else if (testCase.expectedTier === 'complex' || testCase.expectedTier === 'reasoning') {
          complexTaskCost.original += originalCost;
          complexTaskCost.routed += routedCost;
        }
      });

      const overallChange = totalRoutedCost - totalOriginalCost;
      const changePercent = (overallChange / totalOriginalCost) * 100;
      const simpleSavings = simpleTaskCost.original - simpleTaskCost.routed;
      const complexExtraCost = complexTaskCost.routed - complexTaskCost.original;

      console.log('Cost Analysis:', {
        totalRequests: ROUTING_TEST_DATASET.length,
        originalCost: `$${totalOriginalCost.toFixed(2)}`,
        routedCost: `$${totalRoutedCost.toFixed(2)}`,
        overallChange: `$${overallChange.toFixed(2)}`,
        changePercent: `${changePercent.toFixed(1)}%`,
        simpleTasks: {
          savings: `$${simpleSavings.toFixed(2)}`,
          savingsPercent: `${((simpleSavings / simpleTaskCost.original) * 100).toFixed(1)}%`
        },
        complexTasks: {
          extraCost: `$${complexExtraCost.toFixed(2)}`,
          extraPercent: `${((complexExtraCost / complexTaskCost.original) * 100).toFixed(1)}%`
        }
      });

      // Verify the routing makes economic sense:
      // - Simple tasks should be cheaper (routed to haiku)
      // - Complex tasks may cost more (routed to opus for better quality)
      // - Overall cost should be within reasonable bounds
      expect(simpleTaskCost.routed).toBeLessThan(simpleTaskCost.original);
      expect(totalOriginalCost).toBeGreaterThan(0);
      expect(totalRoutedCost).toBeGreaterThan(0);
    });

    it('should measure routing performance impact', () => {
      const startTime = performance.now();
      let routingDecisions = 0;

      // Process all test cases to measure performance
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
        routingDecisions++;
      });

      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgTimePerDecision = totalTime / routingDecisions;

      console.log('Performance Analysis:', {
        totalDecisions: routingDecisions,
        totalTime: `${totalTime.toFixed(2)}ms`,
        avgTimePerDecision: `${avgTimePerDecision.toFixed(3)}ms`,
        decisionsPerSecond: Math.round(1000 / avgTimePerDecision)
      });

      // Routing should be fast (< 5ms per decision on average)
      expect(avgTimePerDecision).toBeLessThan(5);
      expect(routingDecisions).toBe(ROUTING_TEST_DATASET.length);
    });
  });
});
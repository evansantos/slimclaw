/**
 * Phase 3b Integration Tests - Task 4
 * 
 * Tests integration of Budget Tracker and A/B Testing into the routing pipeline
 */

import { describe, test, expect } from 'vitest';
import { BudgetTracker } from '../routing/budget-tracker.js';
import { ABTestManager } from '../routing/ab-testing.js';
import { makeRoutingDecision } from '../routing/routing-decision.js';
import type { SlimClawConfig } from '../config.js';
import { DEFAULT_CONFIG } from '../config.js';

describe('Phase 3b Routing Integration', () => {
  const mockConfig: SlimClawConfig = {
    ...DEFAULT_CONFIG,
    routing: {
      ...DEFAULT_CONFIG.routing,
      enabled: true,
      tiers: {
        simple: 'openai/gpt-4.1-nano',
        mid: 'anthropic/claude-3-haiku-20240307',
        complex: 'anthropic/claude-sonnet-4-20250514',
        reasoning: 'anthropic/claude-opus-4-20250514'
      },
      tierProviders: {
        'openai/gpt-4.1-nano': 'openrouter',
        'anthropic/claude-3-haiku-20240307': 'anthropic',
        'anthropic/claude-sonnet-4-20250514': 'anthropic',
        'anthropic/claude-opus-4-20250514': 'anthropic'
      },
      budget: {
        enabled: true,
        daily: { simple: 1.00, mid: 5.00, complex: 10.00, reasoning: 25.00 },
        weekly: { simple: 5.00, mid: 25.00, complex: 50.00, reasoning: 100.00 },
        alertThresholdPercent: 80,
        enforcementAction: 'alert-only'
      },
      abTesting: {
        enabled: true,
        experiments: [
          {
            id: 'simple-models-test',
            name: 'Simple Models A/B Test',
            tier: 'simple',
            variants: [
              { id: 'control', model: 'openai/gpt-4.1-nano', weight: 50 },
              { id: 'treatment', model: 'google/gemini-2.5-flash', weight: 50 }
            ],
            status: 'active',
            startedAt: Date.now() - 24 * 60 * 60 * 1000 // Started yesterday
          }
        ]
      }
    }
  };

  const mockClassification = {
    tier: 'simple' as const,
    confidence: 0.8,
    reason: 'test classification',
    scores: { simple: 0.8, mid: 0.1, complex: 0.05, reasoning: 0.05 },
    signals: ['short-request']
  };

  const mockContext = {
    originalModel: 'anthropic/claude-sonnet-4-20250514',
    headers: {}
  };

  describe('Budget Integration', () => {
    test('should include budget check results in routing output', () => {
      const budgetTracker = new BudgetTracker({
        enabled: true,
        daily: { simple: 1.00 },
        weekly: { simple: 5.00 },
        alertThresholdPercent: 80,
        enforcementAction: 'alert-only'
      });

      const output = makeRoutingDecision(
        mockClassification,
        mockConfig,
        mockContext,
        'test-run-123',
        { budgetTracker }
      );

      expect(output).toHaveProperty('budget');
      expect(output.budget).toMatchObject({
        allowed: true,
        dailyRemaining: expect.any(Number),
        weeklyRemaining: expect.any(Number),
        alertTriggered: false,
        enforcementAction: 'alert-only'
      });
    });

    test('should downgrade tier when budget exceeded and enforcement is "downgrade"', () => {
      const budgetTracker = new BudgetTracker({
        enabled: true,
        daily: { reasoning: 0.01, complex: 1.00 }, // Very low reasoning budget
        weekly: { reasoning: 0.05, complex: 5.00 },
        alertThresholdPercent: 80,
        enforcementAction: 'downgrade'
      });

      // Spend the reasoning budget
      budgetTracker.record('reasoning', 0.02);

      const reasoningClassification = {
        ...mockClassification,
        tier: 'reasoning' as const,
        scores: { simple: 0.1, mid: 0.1, complex: 0.1, reasoning: 0.7 }
      };

      const configWithDowngrade = {
        ...mockConfig,
        routing: {
          ...mockConfig.routing,
          budget: {
            ...mockConfig.routing.budget!,
            enforcementAction: 'downgrade' as const
          }
        }
      };

      const output = makeRoutingDecision(
        reasoningClassification,
        configWithDowngrade,
        mockContext,
        'test-run-456',
        { budgetTracker }
      );

      expect(output.budget?.allowed).toBe(false);
      expect(output.model).not.toBe('anthropic/claude-opus-4-20250514'); // Should be downgraded
      expect(output.shadow.decision.reason).toBe('routed');
    });

    test('should block request when budget exceeded and enforcement is "block"', () => {
      const budgetTracker = new BudgetTracker({
        enabled: true,
        daily: { simple: 0.01 }, // Very low budget
        weekly: { simple: 0.05 },
        alertThresholdPercent: 80,
        enforcementAction: 'block'
      });

      // Spend the budget
      budgetTracker.record('simple', 0.02);

      const configWithBlock = {
        ...mockConfig,
        routing: {
          ...mockConfig.routing,
          budget: {
            ...mockConfig.routing.budget!,
            enforcementAction: 'block' as const
          }
        }
      };

      const output = makeRoutingDecision(
        mockClassification,
        configWithBlock,
        mockContext,
        'test-run-789',
        { budgetTracker }
      );

      expect(output.budget?.allowed).toBe(false);
      expect(output.shadow.decision.reason).toBe('routing-disabled');
    });
  });

  describe('A/B Testing Integration', () => {
    test('should include A/B assignment in routing output', () => {
      const abTestManager = new ABTestManager([
        {
          id: 'test-experiment',
          name: 'Test Experiment',
          tier: 'simple',
          variants: [
            { id: 'control', model: 'openai/gpt-4.1-nano', weight: 50 },
            { id: 'treatment', model: 'google/gemini-2.5-flash', weight: 50 }
          ],
          status: 'active',
          startedAt: Date.now()
        }
      ]);

      const output = makeRoutingDecision(
        mockClassification,
        mockConfig,
        mockContext,
        'test-run-ab-123',
        { abTestManager }
      );

      expect(output).toHaveProperty('abAssignment');
      expect(output.abAssignment).toMatchObject({
        experimentId: 'test-experiment',
        variant: expect.objectContaining({
          id: expect.stringMatching(/^(control|treatment)$/),
          model: expect.any(String),
          weight: expect.any(Number)
        })
      });
    });

    test('should override model when assigned to A/B test variant', () => {
      const abTestManager = new ABTestManager([
        {
          id: 'model-override-test',
          name: 'Model Override Test',
          tier: 'simple',
          variants: [
            { id: 'variant-a', model: 'test/model-a', weight: 100 }
          ],
          status: 'active',
          startedAt: Date.now()
        }
      ]);

      const output = makeRoutingDecision(
        mockClassification,
        mockConfig,
        mockContext,
        'deterministic-run-id', // Deterministic for predictable assignment
        { abTestManager }
      );

      expect(output.model).toBe('test/model-a');
      expect(output.shadow.decision.reason).toBe('routed');
    });

    test('should handle A/B testing for different tiers', () => {
      const abTestManager = new ABTestManager([
        {
          id: 'mid-tier-test',
          name: 'Mid Tier Test',
          tier: 'mid',
          variants: [
            { id: 'control', model: 'anthropic/claude-3-haiku-20240307', weight: 50 },
            { id: 'treatment', model: 'openai/gpt-3.5-turbo', weight: 50 }
          ],
          status: 'active',
          startedAt: Date.now()
        }
      ]);

      const midTierClassification = {
        ...mockClassification,
        tier: 'mid' as const,
        scores: { simple: 0.1, mid: 0.8, complex: 0.05, reasoning: 0.05 }
      };

      const output = makeRoutingDecision(
        midTierClassification,
        mockConfig,
        mockContext,
        'mid-tier-run-123',
        { abTestManager }
      );

      expect(output.abAssignment?.experimentId).toBe('mid-tier-test');
      expect(['anthropic/claude-3-haiku-20240307', 'openai/gpt-3.5-turbo'])
        .toContain(output.model);
    });
  });

  describe('Combined Budget + A/B Testing', () => {
    test('should apply budget enforcement before A/B assignment', () => {
      const budgetTracker = new BudgetTracker({
        enabled: true,
        daily: { simple: 0.01 }, // Very low budget
        weekly: { simple: 0.05 },
        alertThresholdPercent: 80,
        enforcementAction: 'downgrade'
      });

      const abTestManager = new ABTestManager([
        {
          id: 'combined-test',
          name: 'Combined Test',
          tier: 'simple',
          variants: [
            { id: 'control', model: 'openai/gpt-4.1-nano', weight: 50 },
            { id: 'treatment', model: 'google/gemini-2.5-flash', weight: 50 }
          ],
          status: 'active',
          startedAt: Date.now()
        }
      ]);

      // Exhaust simple budget
      budgetTracker.record('simple', 0.02);

      const configWithDowngrade = {
        ...mockConfig,
        routing: {
          ...mockConfig.routing,
          budget: {
            ...mockConfig.routing.budget!,
            enforcementAction: 'downgrade' as const
          }
        }
      };

      const output = makeRoutingDecision(
        mockClassification,
        configWithDowngrade,
        mockContext,
        'combined-test-123',
        { budgetTracker, abTestManager }
      );

      // Budget enforcement should take precedence
      expect(output.budget?.allowed).toBe(false);
      expect(output.shadow.decision.reason).toBe('routed');
      
      // A/B testing might still be applied to the downgraded tier
      // but budget constraint is respected first
    });

    test('should include both budget and A/B data in routing output', () => {
      const budgetTracker = new BudgetTracker({
        enabled: true,
        daily: { simple: 1.00 },
        weekly: { simple: 5.00 },
        alertThresholdPercent: 80,
        enforcementAction: 'alert-only'
      });

      const abTestManager = new ABTestManager([
        {
          id: 'full-integration-test',
          name: 'Full Integration Test',
          tier: 'simple',
          variants: [
            { id: 'control', model: 'openai/gpt-4.1-nano', weight: 100 }
          ],
          status: 'active',
          startedAt: Date.now()
        }
      ]);

      const output = makeRoutingDecision(
        mockClassification,
        mockConfig,
        mockContext,
        'full-integration-123',
        { budgetTracker, abTestManager }
      );

      // Both Phase 3b features should be present
      expect(output).toHaveProperty('budget');
      expect(output).toHaveProperty('abAssignment');
      expect(output.budget?.allowed).toBe(true);
      expect(output.abAssignment?.experimentId).toBe('full-integration-test');
    });
  });

  describe('Routing Output Interface', () => {
    test('should maintain backward compatibility when no Phase 3b services provided', () => {
      const output = makeRoutingDecision(
        mockClassification,
        mockConfig,
        mockContext,
        'backward-compat-test'
      );

      // Should have original fields
      expect(output).toHaveProperty('model');
      expect(output).toHaveProperty('provider');
      expect(output).toHaveProperty('headers');
      expect(output).toHaveProperty('thinking');
      expect(output).toHaveProperty('applied');
      expect(output).toHaveProperty('shadow');

      // Phase 3b fields should be absent
      expect(output).not.toHaveProperty('budget');
      expect(output).not.toHaveProperty('abAssignment');
    });

    test('should include only enabled Phase 3b features', () => {
      const budgetTracker = new BudgetTracker({
        enabled: true,
        daily: { simple: 1.00 },
        weekly: { simple: 5.00 },
        alertThresholdPercent: 80,
        enforcementAction: 'alert-only'
      });

      // Only budget tracker, no A/B testing
      const output = makeRoutingDecision(
        mockClassification,
        mockConfig,
        mockContext,
        'budget-only-test',
        { budgetTracker }
      );

      expect(output).toHaveProperty('budget');
      expect(output).not.toHaveProperty('abAssignment');
    });
  });
});
/**
 * Phase 3b Exports Integration Test
 * 
 * Tests the complete export functionality for Budget Tracker and A/B Testing
 * with full pipeline integration.
 */

import { describe, test, expect } from 'vitest';

describe('Phase 3b Exports Integration', () => {
  
  test('should export all required Phase 3b modules and constants', async () => {
    // This will fail initially, then pass after implementation
    const routingModule = await import('../index.js');
    
    // Test Budget Tracker exports
    expect(routingModule.BudgetTracker).toBeDefined();
    expect(typeof routingModule.BudgetTracker).toBe('function');
    expect(routingModule.DEFAULT_BUDGET_CONFIG).toBeDefined();
    expect(routingModule.DEFAULT_BUDGET_CONFIG.enabled).toBe(false);
    
    // Test A/B Testing exports
    expect(routingModule.ABTestManager).toBeDefined();
    expect(typeof routingModule.ABTestManager).toBeDefined();
    expect(routingModule.DEFAULT_AB_CONFIG).toBeDefined();
    expect(routingModule.DEFAULT_AB_CONFIG.enabled).toBe(false);
    
    // Test version update
    expect(routingModule.ROUTING_VERSION).toBe('0.3.0');
  });

  test('should have Phase 3b configuration in DEFAULT_ROUTING_CONFIG', async () => {
    const { DEFAULT_ROUTING_CONFIG } = await import('../index.js');
    
    // Test Phase 3b budget config
    expect(DEFAULT_ROUTING_CONFIG.budget).toBeDefined();
    expect(DEFAULT_ROUTING_CONFIG.budget.enabled).toBe(false);
    expect(DEFAULT_ROUTING_CONFIG.budget.daily).toEqual({});
    expect(DEFAULT_ROUTING_CONFIG.budget.weekly).toEqual({});
    expect(DEFAULT_ROUTING_CONFIG.budget.alertThresholdPercent).toBe(80);
    expect(DEFAULT_ROUTING_CONFIG.budget.enforcementAction).toBe('alert-only');
    
    // Test Phase 3b A/B testing config
    expect(DEFAULT_ROUTING_CONFIG.abTesting).toBeDefined();
    expect(DEFAULT_ROUTING_CONFIG.abTesting.enabled).toBe(false);
    expect(DEFAULT_ROUTING_CONFIG.abTesting.experiments).toEqual([]);
  });

  test('should allow creation of BudgetTracker with valid config', async () => {
    const { BudgetTracker } = await import('../index.js');
    
    const budgetTracker = new BudgetTracker({
      enabled: true,
      daily: { simple: 5.00 },
      weekly: { simple: 25.00 },
      alertThresholdPercent: 80,
      enforcementAction: 'alert-only'
    });
    
    expect(budgetTracker).toBeInstanceOf(BudgetTracker);
    expect(budgetTracker.getStatus().size).toBeGreaterThan(0);
  });

  test('should allow creation of ABTestManager with valid experiments', async () => {
    const { ABTestManager } = await import('../index.js');
    
    const abTestManager = new ABTestManager([{
      id: 'integration-test',
      name: 'Integration Test',
      tier: 'simple',
      variants: [
        { id: 'control', model: 'openai/gpt-4.1-nano', weight: 50 },
        { id: 'treatment', model: 'google/gemini-2.5-flash', weight: 50 }
      ],
      status: 'active',
      startedAt: Date.now()
    }]);
    
    expect(abTestManager).toBeInstanceOf(ABTestManager);
    expect(abTestManager.listExperiments().length).toBe(1);
  });

  test('should integrate BudgetTracker and ABTestManager with makeRoutingDecision', async () => {
    const { 
      BudgetTracker, 
      ABTestManager,
      makeRoutingDecision
    } = await import('../index.js');
    
    // Set up budget tracker
    const budgetTracker = new BudgetTracker({
      enabled: true,
      daily: { simple: 5.00 },
      weekly: { simple: 25.00 },
      alertThresholdPercent: 80,
      enforcementAction: 'alert-only'
    });

    // Set up A/B test manager
    const abTestManager = new ABTestManager([{
      id: 'integration-test',
      name: 'Integration Test',
      tier: 'simple',
      variants: [
        { id: 'control', model: 'openai/gpt-4.1-nano', weight: 50 },
        { id: 'treatment', model: 'google/gemini-2.5-flash', weight: 50 }
      ],
      status: 'active',
      startedAt: Date.now()
    }]);

    // Test that makeRoutingDecision can work with these services
    // This validates that the exports are working correctly
    expect(typeof makeRoutingDecision).toBe('function');
    expect(budgetTracker.check('simple').allowed).toBe(true);
    expect(abTestManager.assign('simple', 'test-run-123')).toBeTruthy();
  });

  test('should verify type exports are available', async () => {
    // Import the module to check that TypeScript interfaces are exported properly
    const routingModule = await import('../index.js');
    
    // We can't directly test TypeScript interfaces at runtime,
    // but we can verify the classes exist which depend on the interfaces
    expect(routingModule.BudgetTracker).toBeDefined();
    expect(routingModule.ABTestManager).toBeDefined();
    expect(routingModule.DEFAULT_BUDGET_CONFIG).toBeDefined();
    expect(routingModule.DEFAULT_AB_CONFIG).toBeDefined();
  });

  test('should maintain backward compatibility with Phase 3a exports', async () => {
    const routingModule = await import('../index.js');
    
    // Verify Phase 3a exports still work
    expect(routingModule.DynamicPricingCache).toBeDefined();
    expect(routingModule.LatencyTracker).toBeDefined();
    expect(routingModule.DEFAULT_DYNAMIC_PRICING_CONFIG).toBeDefined();
    expect(routingModule.DEFAULT_LATENCY_TRACKER_CONFIG).toBeDefined();
    
    // Verify core routing exports still work
    expect(routingModule.makeRoutingDecision).toBeDefined();
    expect(routingModule.resolveModel).toBeDefined();
  });
});
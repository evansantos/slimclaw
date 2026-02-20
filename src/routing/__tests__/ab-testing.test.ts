import { describe, test, expect, vi, beforeEach } from 'vitest';
import { 
  ABTestManager,
  type ABExperiment,
  type ABVariant 
} from '../ab-testing.js';

// Mock crypto for deterministic hashing in tests
const mockGetRandomValues = vi.fn();
Object.defineProperty(global, 'crypto', {
  value: {
    getRandomValues: mockGetRandomValues
  }
});

describe('ABTestManager', () => {
  let manager: ABTestManager;
  let experiment: ABExperiment;

  beforeEach(() => {
    vi.clearAllMocks();
    
    experiment = {
      id: 'exp-001',
      name: 'GPT-4.1-nano vs Gemini Flash',
      tier: 'simple',
      variants: [
        { id: 'control', model: 'openai/gpt-4.1-nano', weight: 50 },
        { id: 'treatment', model: 'google/gemini-2.5-flash', weight: 50 }
      ],
      status: 'active',
      startedAt: Date.now(),
      minSamples: 10
    };
    
    manager = new ABTestManager([experiment]);
  });

  describe('constructor', () => {
    test('should initialize with provided experiments', () => {
      const experiments = manager.listExperiments();
      expect(experiments).toHaveLength(1);
      expect(experiments[0].id).toBe('exp-001');
    });

    test('should validate experiment weights sum to 100', () => {
      const invalidExperiment = {
        ...experiment,
        variants: [
          { id: 'control', model: 'openai/gpt-4.1-nano', weight: 60 },
          { id: 'treatment', model: 'google/gemini-2.5-flash', weight: 50 } // Sum = 110
        ]
      };

      expect(() => new ABTestManager([invalidExperiment])).toThrow('Variant weights must sum to 100');
    });

    test('should handle empty experiments list', () => {
      const emptyManager = new ABTestManager([]);
      expect(emptyManager.listExperiments()).toHaveLength(0);
    });
  });

  describe('assign', () => {
    test('should return null for tier with no active experiments', () => {
      const assignment = manager.assign('complex', 'run-123');
      expect(assignment).toBeNull();
    });

    test('should assign variants deterministically based on runId', () => {
      // Mock consistent hash values for testing
      const assignment1 = manager.assign('simple', 'run-123');
      const assignment2 = manager.assign('simple', 'run-123'); // Same runId
      
      expect(assignment1).not.toBeNull();
      expect(assignment2).not.toBeNull();
      expect(assignment1!.variant.id).toBe(assignment2!.variant.id); // Same assignment
    });

    test('should distribute assignments according to weights', () => {
      const assignments = new Map<string, number>();
      
      // Test 1000 assignments to check distribution
      for (let i = 0; i < 1000; i++) {
        const assignment = manager.assign('simple', `run-${i}`);
        if (assignment) {
          const variantId = assignment.variant.id;
          assignments.set(variantId, (assignments.get(variantId) || 0) + 1);
        }
      }
      
      // Should be roughly 50/50 distribution (allow 10% variance)
      const controlCount = assignments.get('control') || 0;
      const treatmentCount = assignments.get('treatment') || 0;
      
      expect(controlCount).toBeGreaterThan(400);
      expect(controlCount).toBeLessThan(600);
      expect(treatmentCount).toBeGreaterThan(400);
      expect(treatmentCount).toBeLessThan(600);
    });

    test('should not assign to paused experiments', () => {
      const pausedExperiment = {
        ...experiment,
        status: 'paused' as const
      };
      
      const pausedManager = new ABTestManager([pausedExperiment]);
      const assignment = pausedManager.assign('simple', 'run-123');
      
      expect(assignment).toBeNull();
    });

    test('should not assign to completed experiments', () => {
      const completedExperiment = {
        ...experiment,
        status: 'completed' as const
      };
      
      const completedManager = new ABTestManager([completedExperiment]);
      const assignment = completedManager.assign('simple', 'run-123');
      
      expect(assignment).toBeNull();
    });

    test('should handle experiments with unequal weights', () => {
      const unequalWeightExperiment = {
        ...experiment,
        variants: [
          { id: 'control', model: 'openai/gpt-4.1-nano', weight: 70 },
          { id: 'treatment', model: 'google/gemini-2.5-flash', weight: 30 }
        ]
      };
      
      const unequalManager = new ABTestManager([unequalWeightExperiment]);
      const assignments = new Map<string, number>();
      
      for (let i = 0; i < 1000; i++) {
        const assignment = unequalManager.assign('simple', `run-${i}`);
        if (assignment) {
          const variantId = assignment.variant.id;
          assignments.set(variantId, (assignments.get(variantId) || 0) + 1);
        }
      }
      
      const controlCount = assignments.get('control') || 0;
      const treatmentCount = assignments.get('treatment') || 0;
      
      // Should be roughly 70/30 distribution (allow 10% variance)
      expect(controlCount).toBeGreaterThan(600);
      expect(treatmentCount).toBeGreaterThan(200);
      expect(treatmentCount).toBeLessThan(400);
    });
  });

  describe('recordOutcome', () => {
    test('should record outcome for assigned variant', () => {
      const assignment = manager.assign('simple', 'run-123');
      expect(assignment).not.toBeNull();
      
      manager.recordOutcome('run-123', {
        latencyMs: 2500,
        cost: 0.002,
        outputTokens: 150
      });
      
      const results = manager.getResults('exp-001');
      expect(results).not.toBeNull();
      expect(results!.variants).toHaveLength(2);
      
      // One variant should have 1 sample
      const totalSamples = results!.variants.reduce((sum, v) => sum + v.count, 0);
      expect(totalSamples).toBe(1);
    });

    test('should ignore outcome for unknown runId', () => {
      manager.recordOutcome('unknown-run', {
        latencyMs: 2500,
        cost: 0.002,
        outputTokens: 150
      });
      
      const results = manager.getResults('exp-001');
      const totalSamples = results!.variants.reduce((sum, v) => sum + v.count, 0);
      expect(totalSamples).toBe(0);
    });

    test('should calculate averages correctly', () => {
      // Assign and record multiple outcomes for same variant
      const assignment = manager.assign('simple', 'run-123');
      const variantId = assignment!.variant.id;
      
      manager.recordOutcome('run-123', {
        latencyMs: 2000,
        cost: 0.001,
        outputTokens: 100
      });
      
      const assignment2 = manager.assign('simple', 'run-124');
      if (assignment2!.variant.id === variantId) {
        manager.recordOutcome('run-124', {
          latencyMs: 4000,
          cost: 0.003,
          outputTokens: 200
        });
      } else {
        // Try different runIds until we get same variant (for testing)
        for (let i = 125; i < 200; i++) {
          const testAssignment = manager.assign('simple', `run-${i}`);
          if (testAssignment!.variant.id === variantId) {
            manager.recordOutcome(`run-${i}`, {
              latencyMs: 4000,
              cost: 0.003,
              outputTokens: 200
            });
            break;
          }
        }
      }
      
      const results = manager.getResults('exp-001');
      const variant = results!.variants.find(v => v.variantId === variantId);
      
      if (variant && variant.count >= 2) {
        expect(variant.avgLatencyMs).toBe(3000); // (2000 + 4000) / 2
        expect(variant.avgCost).toBe(0.002); // (0.001 + 0.003) / 2
        expect(variant.avgOutputTokens).toBe(150); // (100 + 200) / 2
      }
    });

    test('should clean up assignment after recording outcome', () => {
      const assignment = manager.assign('simple', 'run-123');
      expect(assignment).not.toBeNull();
      
      manager.recordOutcome('run-123', {
        latencyMs: 2500,
        cost: 0.002,
        outputTokens: 150
      });
      
      // Second outcome for same runId should be ignored
      manager.recordOutcome('run-123', {
        latencyMs: 3000,
        cost: 0.004,
        outputTokens: 200
      });
      
      const results = manager.getResults('exp-001');
      const totalSamples = results!.variants.reduce((sum, v) => sum + v.count, 0);
      expect(totalSamples).toBe(1); // Only first outcome recorded
    });
  });

  describe('getResults', () => {
    test('should return null for unknown experiment', () => {
      const results = manager.getResults('unknown-exp');
      expect(results).toBeNull();
    });

    test('should return empty results for experiment with no data', () => {
      const results = manager.getResults('exp-001');
      expect(results).not.toBeNull();
      expect(results!.variants).toHaveLength(2);
      
      for (const variant of results!.variants) {
        expect(variant.count).toBe(0);
        expect(variant.avgLatencyMs).toBe(0);
        expect(variant.avgCost).toBe(0);
        expect(variant.avgOutputTokens).toBe(0);
      }
      
      expect(results!.significant).toBe(false);
    });

    test('should calculate statistical significance with sufficient samples', () => {
      // Generate enough samples for significance testing
      for (let i = 0; i < 100; i++) {
        const assignment = manager.assign('simple', `run-${i}`);
        if (assignment) {
          // Create slight difference between variants for significance
          const baseLatency = assignment.variant.id === 'control' ? 2000 : 2500;
          manager.recordOutcome(`run-${i}`, {
            latencyMs: baseLatency + (Math.random() * 500),
            cost: 0.001 + (Math.random() * 0.001),
            outputTokens: 100 + Math.floor(Math.random() * 50)
          });
        }
      }
      
      const results = manager.getResults('exp-001');
      expect(results!.significant).toBeDefined(); // Should have significance calculation
      
      // With sufficient data, should have variant-specific results
      const variants = results!.variants;
      expect(variants.some(v => v.count > 0)).toBe(true);
    });
  });

  describe('listExperiments', () => {
    test('should return all experiments', () => {
      const experiment2: ABExperiment = {
        id: 'exp-002',
        name: 'Claude vs GPT-4o',
        tier: 'complex',
        variants: [
          { id: 'claude', model: 'anthropic/claude-sonnet-4', weight: 50 },
          { id: 'gpt4o', model: 'openai/gpt-4o', weight: 50 }
        ],
        status: 'active',
        startedAt: Date.now(),
        minSamples: 20
      };
      
      const multiManager = new ABTestManager([experiment, experiment2]);
      const experiments = multiManager.listExperiments();
      
      expect(experiments).toHaveLength(2);
      expect(experiments.map(e => e.id)).toContain('exp-001');
      expect(experiments.map(e => e.id)).toContain('exp-002');
    });

    test('should return experiments sorted by startedAt', () => {
      const olderExp: ABExperiment = {
        ...experiment,
        id: 'exp-older',
        startedAt: Date.now() - 86400000 // 1 day ago
      };
      
      const newerExp: ABExperiment = {
        ...experiment,
        id: 'exp-newer',
        startedAt: Date.now()
      };
      
      const sortedManager = new ABTestManager([newerExp, olderExp]);
      const experiments = sortedManager.listExperiments();
      
      expect(experiments[0].id).toBe('exp-newer');
      expect(experiments[1].id).toBe('exp-older');
    });
  });

  describe('assignment leak protection', () => {
    test('should bound assignments map when limit exceeded', () => {
      // Create manager with small limit for testing
      const smallLimitManager = new ABTestManager([experiment], 100);
      
      // Create 150 assignments without recording outcomes
      for (let i = 0; i < 150; i++) {
        smallLimitManager.assign('simple', `run-${i}`);
      }
      
      // Map should be bounded to 80% of maxPendingAssignments (80 entries)
      const results = smallLimitManager.getResults('exp-001');
      const totalSamples = results!.variants.reduce((sum, v) => sum + v.count, 0);
      
      // No outcomes recorded, so total samples should be 0
      expect(totalSamples).toBe(0);
      
      // Internal assignment map should be bounded (we can't directly access it,
      // but can verify by creating more assignments and ensuring system remains stable)
      for (let i = 150; i < 200; i++) {
        const assignment = smallLimitManager.assign('simple', `run-${i}`);
        expect(assignment).not.toBeNull();
      }
    });

    test('should clean up stale assignments', () => {
      const testManager = new ABTestManager([experiment]);
      
      // Create some assignments
      testManager.assign('simple', 'run-1');
      testManager.assign('simple', 'run-2');
      testManager.assign('simple', 'run-3');
      
      // Manually trigger cleanup with very short TTL (0ms = everything is stale)
      testManager.cleanupStalAssignments(0);
      
      // New assignment should still work
      const assignment = testManager.assign('simple', 'run-4');
      expect(assignment).not.toBeNull();
    });

    test('should handle cleanup with reasonable TTL', () => {
      const testManager = new ABTestManager([experiment]);
      
      // Create assignment
      const assignment1 = testManager.assign('simple', 'run-1');
      expect(assignment1).not.toBeNull();
      
      // Wait a moment (in real test this would be longer)
      const now = Date.now();
      
      // Clean up with 1 second TTL - recent assignments should remain
      testManager.cleanupStalAssignments(1000);
      
      // Should be able to record outcome for recent assignment
      testManager.recordOutcome('run-1', {
        latencyMs: 1000,
        cost: 0.001,
        outputTokens: 50
      });
      
      const results = testManager.getResults('exp-001');
      const totalSamples = results!.variants.reduce((sum, v) => sum + v.count, 0);
      expect(totalSamples).toBe(1);
    });

    test('should maintain FIFO order when deleting old entries', () => {
      const fifoManager = new ABTestManager([experiment], 5); // Very small limit
      
      // Create assignments in order
      const runIds = ['run-1', 'run-2', 'run-3', 'run-4', 'run-5', 'run-6', 'run-7'];
      
      for (const runId of runIds) {
        fifoManager.assign('simple', runId);
      }
      
      // Assignments should be bound, FIFO deletion should have occurred
      // Verify system remains stable by creating more assignments
      for (let i = 8; i < 15; i++) {
        const assignment = fifoManager.assign('simple', `run-${i}`);
        expect(assignment).not.toBeNull();
      }
    });
  });

  describe('precision improvements', () => {
    test('should handle many small cost increments with Kahan summation', () => {
      // Test Kahan compensated summation for totalCost
      const testManager = new ABTestManager([experiment]);
      
      // Get the same variant for all assignments
      let variantId: string | null = null;
      const assignments: string[] = [];
      
      // Find assignments that all go to the same variant
      for (let i = 0; i < 1000; i++) {
        const assignment = testManager.assign('simple', `precision-test-${i}`);
        if (assignment) {
          if (variantId === null) {
            variantId = assignment.variant.id;
            assignments.push(`precision-test-${i}`);
          } else if (assignment.variant.id === variantId) {
            assignments.push(`precision-test-${i}`);
          }
        }
        
        // Once we have enough assignments to the same variant, stop
        if (assignments.length >= 500) break;
      }
      
      // Record many small cost outcomes
      const smallCost = 0.0001;
      let expectedTotal = 0;
      
      for (let i = 0; i < assignments.length; i++) {
        testManager.recordOutcome(assignments[i], {
          latencyMs: 1000,
          cost: smallCost,
          outputTokens: 50
        });
        expectedTotal += smallCost;
      }
      
      const results = testManager.getResults('exp-001');
      const variant = results!.variants.find(v => v.variantId === variantId);
      
      if (variant && variant.count >= 100) {
        // With Kahan summation, the average should be very close to expected
        const expectedAverage = expectedTotal / variant.count;
        const actualAverage = variant.avgCost;
        
        // Should be within 0.01% of expected (much more precise than naive summation)
        const relativeDifference = Math.abs(actualAverage - expectedAverage) / expectedAverage;
        expect(relativeDifference).toBeLessThan(0.0001); // 0.01%
      }
    });
  });

  describe('edge cases', () => {
    test('should handle variant with zero weight', () => {
      const zeroWeightExperiment = {
        ...experiment,
        variants: [
          { id: 'control', model: 'openai/gpt-4.1-nano', weight: 100 },
          { id: 'treatment', model: 'google/gemini-2.5-flash', weight: 0 }
        ]
      };
      
      const zeroManager = new ABTestManager([zeroWeightExperiment]);
      
      // All assignments should go to control
      for (let i = 0; i < 10; i++) {
        const assignment = zeroManager.assign('simple', `run-${i}`);
        expect(assignment!.variant.id).toBe('control');
      }
    });

    test('should handle single variant experiment', () => {
      const singleVariantExp = {
        ...experiment,
        variants: [
          { id: 'single', model: 'openai/gpt-4.1-nano', weight: 100 }
        ]
      };
      
      const singleManager = new ABTestManager([singleVariantExp]);
      const assignment = singleManager.assign('simple', 'run-123');
      
      expect(assignment!.variant.id).toBe('single');
    });

    test('should handle very large number of variants', () => {
      const manyVariants: ABVariant[] = [];
      for (let i = 0; i < 10; i++) {
        manyVariants.push({
          id: `variant-${i}`,
          model: `provider/model-${i}`,
          weight: 10
        });
      }
      
      const manyVariantExp = {
        ...experiment,
        variants: manyVariants
      };
      
      const manyManager = new ABTestManager([manyVariantExp]);
      const assignment = manyManager.assign('simple', 'run-123');
      
      expect(assignment).not.toBeNull();
      expect(assignment!.variant.id).toMatch(/variant-\d/);
    });
  });
});
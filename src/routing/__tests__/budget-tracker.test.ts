import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  BudgetTracker,
  type BudgetConfig 
} from '../budget-tracker.js';

describe('BudgetTracker', () => {
  let tracker: BudgetTracker;
  let config: BudgetConfig;

  beforeEach(() => {
    vi.useFakeTimers();
    config = {
      enabled: true,
      daily: { 
        complex: 5.00,
        reasoning: 10.00 
      },
      weekly: { 
        complex: 25.00,
        reasoning: 50.00 
      },
      alertThresholdPercent: 80,
      enforcementAction: 'alert-only'
    };
    tracker = new BudgetTracker(config);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    test('should initialize with empty spending', () => {
      const status = tracker.getStatus();
      expect(status.size).toBe(2); // complex + reasoning tiers
      
      const complexStatus = status.get('complex');
      expect(complexStatus?.daily.spent).toBe(0);
      expect(complexStatus?.weekly.spent).toBe(0);
    });

    test('should handle disabled configuration', () => {
      const disabledTracker = new BudgetTracker({
        ...config,
        enabled: false
      });

      const result = disabledTracker.check('complex');
      expect(result.allowed).toBe(true);
      expect(result.alertTriggered).toBe(false);
    });

    test('should set up daily and weekly reset times correctly', () => {
      const now = new Date('2026-02-20T15:30:00Z'); // Thursday 3:30 PM
      vi.setSystemTime(now);

      const newTracker = new BudgetTracker(config);
      
      // Should set next day reset to tomorrow at midnight UTC
      // Should set next week reset to next Monday at midnight UTC
      const status = newTracker.getStatus();
      const complexStatus = status.get('complex');
      
      expect(complexStatus?.daily.resetAt).toBeGreaterThan(now.getTime());
      expect(complexStatus?.weekly.resetAt).toBeGreaterThan(now.getTime());
    });
  });

  describe('record', () => {
    test('should record spending for a tier', () => {
      tracker.record('complex', 2.50);
      
      const status = tracker.getStatus();
      const complexStatus = status.get('complex');
      
      expect(complexStatus?.daily.spent).toBe(2.50);
      expect(complexStatus?.weekly.spent).toBe(2.50);
    });

    test('should accumulate spending across multiple records', () => {
      tracker.record('complex', 1.25);
      tracker.record('complex', 1.75);
      tracker.record('reasoning', 3.00);
      
      const status = tracker.getStatus();
      
      expect(status.get('complex')?.daily.spent).toBe(3.00);
      expect(status.get('reasoning')?.daily.spent).toBe(3.00);
    });

    test('should ignore unknown tiers', () => {
      tracker.record('unknown-tier', 10.00);
      
      const status = tracker.getStatus();
      expect(status.has('unknown-tier')).toBe(false);
    });

    test('should handle negative amounts gracefully', () => {
      tracker.record('complex', -5.00);
      
      const status = tracker.getStatus();
      expect(status.get('complex')?.daily.spent).toBe(0);
    });

    test('should do nothing when disabled', () => {
      const disabledTracker = new BudgetTracker({
        ...config,
        enabled: false
      });

      disabledTracker.record('complex', 5.00);
      
      const status = disabledTracker.getStatus();
      expect(status.get('complex')?.daily.spent).toBe(0);
    });
  });

  describe('check', () => {
    test('should allow spending within budget', () => {
      tracker.record('complex', 2.00); // Well under $5 daily limit
      
      const result = tracker.check('complex');
      
      expect(result.allowed).toBe(true);
      expect(result.dailyRemaining).toBe(3.00);
      expect(result.weeklyRemaining).toBe(23.00);
      expect(result.alertTriggered).toBe(false);
    });

    test('should trigger alert at threshold percent', () => {
      tracker.record('complex', 4.00); // 80% of $5 daily limit
      
      const result = tracker.check('complex');
      
      expect(result.allowed).toBe(true);
      expect(result.alertTriggered).toBe(true);
    });

    test('should block when daily limit exceeded and enforcement is block', () => {
      const blockingTracker = new BudgetTracker({
        ...config,
        enforcementAction: 'block'
      });
      
      blockingTracker.record('complex', 6.00); // Over $5 daily limit
      
      const result = blockingTracker.check('complex');
      
      expect(result.allowed).toBe(false);
      expect(result.dailyRemaining).toBe(-1.00);
      expect(result.alertTriggered).toBe(true);
    });

    test('should allow when weekly limit exceeded but daily OK and enforcement is downgrade', () => {
      const downgradeTracker = new BudgetTracker({
        ...config,
        enforcementAction: 'downgrade'
      });
      
      // Test scenario: daily spending under limit, but weekly at limit
      downgradeTracker.record('complex', 4.00); // Under $5 daily limit
      
      // Manually set weekly spending to be at limit to simulate the scenario
      // This simulates accumulated weekly spending from previous days
      const spending = (downgradeTracker as any).tierSpending.get('complex');
      if (spending) {
        spending.weekly.spent = 25.00; // At weekly limit of $25
      }
      
      const result = downgradeTracker.check('complex');
      
      // In downgrade mode, if daily is OK but weekly exceeded, still allow
      // (the logic being that we can potentially downgrade the model)
      expect(result.allowed).toBe(true);
      expect(result.weeklyRemaining).toBe(0);
    });

    test('should return correct remaining amounts', () => {
      tracker.record('reasoning', 7.50); // $7.50 of $10 daily, $50 weekly
      
      const result = tracker.check('reasoning');
      
      expect(result.dailyRemaining).toBe(2.50);
      expect(result.weeklyRemaining).toBe(42.50);
    });

    test('should return true for unknown tiers', () => {
      const result = tracker.check('unknown-tier');
      
      expect(result.allowed).toBe(true);
      expect(result.dailyRemaining).toBe(Infinity);
      expect(result.weeklyRemaining).toBe(Infinity);
      expect(result.alertTriggered).toBe(false);
    });
  });

  describe('maybeReset', () => {
    test('should reset daily counters after midnight', () => {
      const startTime = new Date('2026-02-20T23:30:00Z');
      vi.setSystemTime(startTime);
      
      const resetTracker = new BudgetTracker(config);
      resetTracker.record('complex', 4.00);
      
      expect(resetTracker.getStatus().get('complex')?.daily.spent).toBe(4.00);
      
      // Advance past midnight
      vi.setSystemTime(new Date('2026-02-21T00:30:00Z'));
      resetTracker.maybeReset();
      
      expect(resetTracker.getStatus().get('complex')?.daily.spent).toBe(0);
      expect(resetTracker.getStatus().get('complex')?.weekly.spent).toBe(4.00); // Weekly unchanged
    });

    test('should reset weekly counters on Monday', () => {
      const friday = new Date('2026-02-20T10:00:00Z'); // Friday
      vi.setSystemTime(friday);
      
      const resetTracker = new BudgetTracker(config);
      resetTracker.record('complex', 15.00);
      
      expect(resetTracker.getStatus().get('complex')?.weekly.spent).toBe(15.00);
      
      // Advance to Monday
      vi.setSystemTime(new Date('2026-02-23T10:00:00Z')); // Monday
      resetTracker.maybeReset();
      
      expect(resetTracker.getStatus().get('complex')?.weekly.spent).toBe(0);
      expect(resetTracker.getStatus().get('complex')?.daily.spent).toBe(0); // Daily also resets
    });

    test('should not reset before time boundaries', () => {
      const startTime = new Date('2026-02-20T10:00:00Z');
      vi.setSystemTime(startTime);
      
      const testTracker = new BudgetTracker(config);
      testTracker.record('complex', 3.00);
      
      // Advance 1 hour (should not trigger reset)
      vi.setSystemTime(new Date('2026-02-20T11:00:00Z'));
      testTracker.maybeReset();
      
      const status = testTracker.getStatus();
      expect(status.get('complex')?.daily.spent).toBe(3.00); // Unchanged
    });
  });

  describe('getStatus', () => {
    test('should return status for all configured tiers', () => {
      tracker.record('complex', 2.00);
      tracker.record('reasoning', 5.00);
      
      const status = tracker.getStatus();
      
      expect(status.size).toBe(2);
      expect(status.has('complex')).toBe(true);
      expect(status.has('reasoning')).toBe(true);
      
      const complexStatus = status.get('complex');
      expect(complexStatus?.daily.spent).toBe(2.00);
      expect(complexStatus?.daily.limit).toBe(5.00);
      expect(complexStatus?.daily.percent).toBe(40);
      
      expect(complexStatus?.weekly.spent).toBe(2.00);
      expect(complexStatus?.weekly.limit).toBe(25.00);
      expect(complexStatus?.weekly.percent).toBe(8);
    });

    test('should calculate percentages correctly', () => {
      tracker.record('complex', 4.50); // 90% of daily, 18% of weekly
      
      const status = tracker.getStatus();
      const complexStatus = status.get('complex');
      
      expect(complexStatus?.daily.percent).toBe(90);
      expect(complexStatus?.weekly.percent).toBe(18);
    });

    test('should handle zero limits gracefully', () => {
      const zeroLimitConfig = {
        ...config,
        daily: { complex: 0 },
        weekly: { complex: 0 }
      };
      
      const zeroTracker = new BudgetTracker(zeroLimitConfig);
      const status = zeroTracker.getStatus();
      
      const complexStatus = status.get('complex');
      expect(complexStatus?.daily.percent).toBe(0);
      expect(complexStatus?.weekly.percent).toBe(0);
    });
  });

  describe('enforcement actions', () => {
    test('should respect alert-only mode', () => {
      tracker.record('complex', 10.00); // Way over limit
      
      const result = tracker.check('complex');
      
      expect(result.allowed).toBe(true); // Always allowed in alert-only
      expect(result.alertTriggered).toBe(true);
    });

    test('should block in block mode when over daily limit', () => {
      const blockTracker = new BudgetTracker({
        ...config,
        enforcementAction: 'block'
      });
      
      blockTracker.record('complex', 6.00);
      
      const result = blockTracker.check('complex');
      expect(result.allowed).toBe(false);
    });

    test('should suggest downgrade in downgrade mode', () => {
      const downgradeTracker = new BudgetTracker({
        ...config,
        enforcementAction: 'downgrade'
      });
      
      downgradeTracker.record('complex', 6.00);
      
      const result = downgradeTracker.check('complex');
      expect(result.allowed).toBe(false); // Not allowed at current tier
    });
  });

  describe('persistence', () => {
    test('should serialize current spending state', () => {
      tracker.record('complex', 2.50);
      tracker.record('reasoning', 7.00);
      
      const snapshot = tracker.serialize();
      
      expect(snapshot).toHaveProperty('complex');
      expect(snapshot).toHaveProperty('reasoning');
      expect(snapshot.complex.daily.spent).toBe(2.50);
      expect(snapshot.reasoning.daily.spent).toBe(7.00);
      expect(snapshot.complex.weekly.spent).toBe(2.50);
      expect(snapshot.reasoning.weekly.spent).toBe(7.00);
      
      // Should include reset times
      expect(typeof snapshot.complex.daily.resetAt).toBe('number');
      expect(typeof snapshot.complex.weekly.resetAt).toBe('number');
    });

    test('should restore state from snapshot', () => {
      // Create initial tracker with spending
      tracker.record('complex', 3.25);
      tracker.record('reasoning', 4.75);
      
      // Serialize state
      const snapshot = tracker.serialize();
      
      // Create new tracker from snapshot
      const restoredTracker = BudgetTracker.fromSnapshot(config, snapshot);
      
      // Should have same spending amounts
      const status = restoredTracker.getStatus();
      expect(status.get('complex')?.daily.spent).toBe(3.25);
      expect(status.get('complex')?.weekly.spent).toBe(3.25);
      expect(status.get('reasoning')?.daily.spent).toBe(4.75);
      expect(status.get('reasoning')?.weekly.spent).toBe(4.75);
    });

    test('should handle round-trip serialization/deserialization', () => {
      // Add spending to original tracker
      tracker.record('complex', 1.50);
      tracker.record('reasoning', 8.25);
      
      // Serialize and restore
      const snapshot = tracker.serialize();
      const restored = BudgetTracker.fromSnapshot(config, snapshot);
      
      // Add more spending to restored tracker
      restored.record('complex', 1.00);
      
      // Check final state
      const status = restored.getStatus();
      expect(status.get('complex')?.daily.spent).toBe(2.50); // 1.50 + 1.00
      expect(status.get('reasoning')?.daily.spent).toBe(8.25); // Unchanged
    });

    test('should initialize missing tiers in fromSnapshot', () => {
      // Create snapshot with only 'complex' tier
      const partialSnapshot = {
        complex: {
          daily: { spent: 2.00, resetAt: Date.now() + 86400000 },
          weekly: { spent: 2.00, resetAt: Date.now() + 604800000 }
        }
      };
      
      const restored = BudgetTracker.fromSnapshot(config, partialSnapshot);
      const status = restored.getStatus();
      
      // Should have both tiers (complex from snapshot, reasoning initialized)
      expect(status.size).toBe(2);
      expect(status.get('complex')?.daily.spent).toBe(2.00);
      expect(status.get('reasoning')?.daily.spent).toBe(0); // Initialized
    });

    test('should handle disabled config in fromSnapshot', () => {
      const snapshot = tracker.serialize();
      
      const disabledConfig = { ...config, enabled: false };
      const restoredTracker = BudgetTracker.fromSnapshot(disabledConfig, snapshot);
      
      // Should work but spending should be zero since disabled
      const status = restoredTracker.getStatus();
      expect(status.get('complex')?.daily.spent).toBe(0);
      expect(status.get('reasoning')?.daily.spent).toBe(0);
    });

    test('should preserve reset times in snapshot', () => {
      const now = new Date('2026-02-20T15:00:00Z');
      vi.setSystemTime(now);
      
      const timedTracker = new BudgetTracker(config);
      timedTracker.record('complex', 1.00);
      
      const snapshot = timedTracker.serialize();
      const restored = BudgetTracker.fromSnapshot(config, snapshot);
      
      const originalStatus = timedTracker.getStatus();
      const restoredStatus = restored.getStatus();
      
      // Reset times should be preserved
      expect(restoredStatus.get('complex')?.daily.resetAt)
        .toBe(originalStatus.get('complex')?.daily.resetAt);
      expect(restoredStatus.get('complex')?.weekly.resetAt)
        .toBe(originalStatus.get('complex')?.weekly.resetAt);
    });
  });
});
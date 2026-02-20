/**
 * Budget enforcement configuration
 */
export interface BudgetConfig {
  /** Enable budget enforcement */
  enabled: boolean;
  /** Daily spending limits per tier (USD) */
  daily: Record<string, number>;
  /** Weekly spending limits per tier (USD) */
  weekly: Record<string, number>;
  /** Alert threshold as percentage of limit (0-100) */
  alertThresholdPercent: number;
  /** Enforcement action when budget exceeded */
  enforcementAction: 'downgrade' | 'block' | 'alert-only';
}

/**
 * Budget status for a tier
 */
interface TierBudgetStatus {
  daily: {
    spent: number;
    limit: number;
    percent: number;
    resetAt: number;
  };
  weekly: {
    spent: number;
    limit: number;
    percent: number;
    resetAt: number;
  };
}

/**
 * Budget check result
 */
export interface BudgetCheckResult {
  /** Whether the tier is within budget limits */
  allowed: boolean;
  /** Daily budget remaining (negative if over) */
  dailyRemaining: number;
  /** Weekly budget remaining (negative if over) */
  weeklyRemaining: number;
  /** Whether alert threshold was triggered */
  alertTriggered: boolean;
}

/**
 * Internal spending tracker per tier
 */
interface SpendingTracker {
  daily: { spent: number; resetAt: number };
  weekly: { spent: number; resetAt: number };
}

/**
 * Budget tracker with daily/weekly spending limits and enforcement actions.
 * 
 * Tracks spending per tier and enforces budget limits with configurable actions.
 * Automatically resets counters at day/week boundaries.
 * 
 * TODO(phase-2b): Persist budget state to disk/Redis for active enforcement mode
 */
export class BudgetTracker {
  private readonly config: BudgetConfig;
  private readonly tierSpending = new Map<string, SpendingTracker>();

  constructor(config: BudgetConfig) {
    this.config = config;
    
    if (config.enabled) {
      this.initializeTiers();
    }
  }

  /**
   * Record spending against a tier's budget.
   * 
   * @param tier - Tier name (e.g., 'complex', 'reasoning')
   * @param cost - Cost in USD
   */
  record(tier: string, cost: number): void {
    if (!this.config.enabled || cost <= 0) {
      return;
    }

    // Check for time-based resets before recording
    this.maybeReset();

    const spending = this.tierSpending.get(tier);
    if (!spending) {
      return; // Unknown tier, ignore
    }

    spending.daily.spent += cost;
    spending.weekly.spent += cost;
  }

  /**
   * Check if a tier is within budget limits.
   * 
   * @param tier - Tier name
   * @returns Budget check result
   */
  check(tier: string): BudgetCheckResult {
    if (!this.config.enabled) {
      return {
        allowed: true,
        dailyRemaining: Infinity,
        weeklyRemaining: Infinity,
        alertTriggered: false
      };
    }

    // Check for resets before checking budget
    this.maybeReset();

    const spending = this.tierSpending.get(tier);
    const dailyLimit = this.config.daily[tier] || 0;
    const weeklyLimit = this.config.weekly[tier] || 0;

    if (!spending || (dailyLimit === 0 && weeklyLimit === 0)) {
      return {
        allowed: true,
        dailyRemaining: Infinity,
        weeklyRemaining: Infinity,
        alertTriggered: false
      };
    }

    const dailyRemaining = dailyLimit - spending.daily.spent;
    const weeklyRemaining = weeklyLimit - spending.weekly.spent;
    
    // Check if alert threshold triggered
    const dailyPercent = dailyLimit > 0 ? (spending.daily.spent / dailyLimit) * 100 : 0;
    const weeklyPercent = weeklyLimit > 0 ? (spending.weekly.spent / weeklyLimit) * 100 : 0;
    const alertTriggered = 
      dailyPercent >= this.config.alertThresholdPercent ||
      weeklyPercent >= this.config.alertThresholdPercent;

    // Determine if allowed based on enforcement action
    let allowed = true;
    
    if (this.config.enforcementAction === 'block') {
      // Block if over daily OR weekly limit
      if (dailyRemaining < 0 || weeklyRemaining < 0) {
        allowed = false;
      }
    } else if (this.config.enforcementAction === 'downgrade') {
      // In downgrade mode, only block if daily limit exceeded
      // Weekly limit exceeded can be handled by downgrading model
      if (dailyRemaining < 0) {
        allowed = false;
      }
    }
    // alert-only mode always allows

    return {
      allowed,
      dailyRemaining,
      weeklyRemaining,
      alertTriggered
    };
  }

  /**
   * Get current budget status for all tiers.
   * 
   * @returns Map of tier to budget status
   */
  getStatus(): Map<string, TierBudgetStatus> {
    const result = new Map<string, TierBudgetStatus>();
    
    if (!this.config.enabled) {
      // Still return status for configured tiers, but with zero spending
      const allTiers = new Set([
        ...Object.keys(this.config.daily),
        ...Object.keys(this.config.weekly)
      ]);
      
      for (const tier of allTiers) {
        const dailyLimit = this.config.daily[tier] || 0;
        const weeklyLimit = this.config.weekly[tier] || 0;
        
        result.set(tier, {
          daily: {
            spent: 0,
            limit: dailyLimit,
            percent: 0,
            resetAt: 0
          },
          weekly: {
            spent: 0,
            limit: weeklyLimit,
            percent: 0,
            resetAt: 0
          }
        });
      }
      
      return result;
    }

    this.maybeReset();

    for (const [tier, spending] of this.tierSpending) {
      const dailyLimit = this.config.daily[tier] || 0;
      const weeklyLimit = this.config.weekly[tier] || 0;
      
      const dailyPercent = dailyLimit > 0 
        ? Math.round((spending.daily.spent / dailyLimit) * 100)
        : 0;
      const weeklyPercent = weeklyLimit > 0
        ? Math.round((spending.weekly.spent / weeklyLimit) * 100) 
        : 0;

      result.set(tier, {
        daily: {
          spent: Math.round(spending.daily.spent * 100) / 100, // Round to cents
          limit: dailyLimit,
          percent: dailyPercent,
          resetAt: spending.daily.resetAt
        },
        weekly: {
          spent: Math.round(spending.weekly.spent * 100) / 100, // Round to cents
          limit: weeklyLimit,
          percent: weeklyPercent,
          resetAt: spending.weekly.resetAt
        }
      });
    }

    return result;
  }

  /**
   * Serialize current spending state for persistence.
   * 
   * @returns Current spending state snapshot
   */
  serialize(): Record<string, SpendingTracker> {
    const snapshot: Record<string, SpendingTracker> = {};
    
    for (const [tier, spending] of this.tierSpending) {
      snapshot[tier] = {
        daily: { ...spending.daily },
        weekly: { ...spending.weekly }
      };
    }
    
    return snapshot;
  }

  /**
   * Create BudgetTracker from previously serialized state.
   * 
   * @param config - Budget configuration
   * @param snapshot - Previously serialized spending state
   * @returns New BudgetTracker instance with restored state
   */
  static fromSnapshot(config: BudgetConfig, snapshot: Record<string, SpendingTracker>): BudgetTracker {
    const tracker = new BudgetTracker(config);
    
    if (config.enabled) {
      // Restore spending state from snapshot
      for (const [tier, spending] of Object.entries(snapshot)) {
        tracker.tierSpending.set(tier, {
          daily: { ...spending.daily },
          weekly: { ...spending.weekly }
        });
      }
      
      // Ensure all configured tiers exist (initialize missing ones)
      const allTiers = new Set([
        ...Object.keys(config.daily),
        ...Object.keys(config.weekly)
      ]);
      
      for (const tier of allTiers) {
        if (!tracker.tierSpending.has(tier)) {
          tracker.tierSpending.set(tier, {
            daily: {
              spent: 0,
              resetAt: BudgetTracker.getNextDayReset()
            },
            weekly: {
              spent: 0,
              resetAt: BudgetTracker.getNextWeekReset()
            }
          });
        }
      }
    }
    
    return tracker;
  }

  /**
   * Check for and perform time-based resets.
   * Called automatically by record() and check().
   * 
   * @internal This method is auto-called and not part of the public API.
   */
  maybeReset(): void {
    if (!this.config.enabled) {
      return;
    }

    const now = Date.now();

    for (const spending of this.tierSpending.values()) {
      // Check daily reset
      if (now >= spending.daily.resetAt) {
        spending.daily.spent = 0;
        spending.daily.resetAt = BudgetTracker.getNextDayReset();
      }

      // Check weekly reset
      if (now >= spending.weekly.resetAt) {
        spending.weekly.spent = 0;
        spending.weekly.resetAt = BudgetTracker.getNextWeekReset();
      }
    }
  }

  /**
   * Initialize tier spending trackers
   */
  private initializeTiers(): void {
    const allTiers = new Set([
      ...Object.keys(this.config.daily),
      ...Object.keys(this.config.weekly)
    ]);

    for (const tier of allTiers) {
      this.tierSpending.set(tier, {
        daily: {
          spent: 0,
          resetAt: BudgetTracker.getNextDayReset()
        },
        weekly: {
          spent: 0,
          resetAt: BudgetTracker.getNextWeekReset()
        }
      });
    }
  }

  /**
   * Calculate next day reset time (next midnight UTC)
   */
  private static getNextDayReset(): number {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    return tomorrow.getTime();
  }

  /**
   * Calculate next week reset time (next Monday midnight UTC)
   */
  private static getNextWeekReset(): number {
    const now = new Date();
    const nextMonday = new Date(now);
    
    // Get days until next Monday (1 = Monday, 0 = Sunday)
    const daysUntilMonday = (8 - nextMonday.getUTCDay()) % 7 || 7;
    
    nextMonday.setUTCDate(nextMonday.getUTCDate() + daysUntilMonday);
    nextMonday.setUTCHours(0, 0, 0, 0);
    
    return nextMonday.getTime();
  }
}

/**
 * Default budget configuration
 */
export const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  enabled: false,
  daily: {},
  weekly: {},
  alertThresholdPercent: 80,
  enforcementAction: 'alert-only'
};
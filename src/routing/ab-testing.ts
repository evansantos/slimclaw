/**
 * A/B test variant configuration
 */
export interface ABVariant {
  /** Unique variant identifier */
  id: string;
  /** Model to use for this variant */
  model: string;
  /** Weight for assignment (0-100, all variants must sum to 100) */
  weight: number;
}

/**
 * A/B test experiment configuration
 */
export interface ABExperiment {
  /** Unique experiment identifier */
  id: string;
  /** Human-readable experiment name */
  name: string;
  /** Tier this experiment applies to */
  tier: string;
  /** Experiment variants */
  variants: ABVariant[];
  /** Current experiment status */
  status: 'active' | 'paused' | 'completed';
  /** When experiment started (timestamp) */
  startedAt: number;
  /** When experiment should end (optional) */
  endAt?: number;
  /** Minimum samples before significance calculation */
  minSamples?: number;
}

/**
 * Results for a single variant
 */
export interface ABResult {
  /** Variant identifier */
  variantId: string;
  /** Number of samples collected */
  count: number;
  /** Average latency in milliseconds */
  avgLatencyMs: number;
  /** Average cost in USD */
  avgCost: number;
  /** Average output tokens */
  avgOutputTokens: number;
}

/**
 * Complete experiment results
 */
export interface ABExperimentResults {
  /** Results per variant */
  variants: ABResult[];
  /** Whether results are statistically significant */
  significant: boolean;
}

/**
 * Variant assignment for a request
 */
export interface ABAssignment {
  /** Experiment ID */
  experimentId: string;
  /** Assigned variant */
  variant: ABVariant;
}

/**
 * Outcome metrics for a request
 */
export interface ABOutcome {
  /** Request latency in milliseconds */
  latencyMs: number;
  /** Request cost in USD */
  cost: number;
  /** Number of output tokens */
  outputTokens: number;
}

/**
 * Internal result accumulator
 */
interface VariantAccumulator {
  count: number;
  totalLatencyMs: number;
  totalCost: number;
  totalOutputTokens: number;
  // Kahan summation compensation for totalCost precision
  compensation: number;
}

/**
 * Assignment with timestamp for leak protection
 */
interface AssignmentEntry {
  experimentId: string;
  variantId: string;
  assignedAt: number;
}

/**
 * A/B testing manager for empirical model comparison.
 * 
 * Handles variant assignment, outcome collection, and statistical analysis
 * for controlled experiments across model tiers.
 */
export class ABTestManager {
  private readonly experiments: Map<string, ABExperiment>;
  private readonly assignments = new Map<string, AssignmentEntry>();
  private readonly results = new Map<string, Map<string, VariantAccumulator>>();
  private readonly maxPendingAssignments: number;

  constructor(experiments: ABExperiment[], maxPendingAssignments = 1000) {
    this.experiments = new Map();
    this.maxPendingAssignments = maxPendingAssignments;
    
    // Validate and register experiments
    for (const exp of experiments) {
      this.validateExperiment(exp);
      this.experiments.set(exp.id, exp);
      
      // Initialize result accumulators
      const variantAccumulators = new Map<string, VariantAccumulator>();
      for (const variant of exp.variants) {
        variantAccumulators.set(variant.id, {
          count: 0,
          totalLatencyMs: 0,
          totalCost: 0,
          totalOutputTokens: 0,
          compensation: 0
        });
      }
      this.results.set(exp.id, variantAccumulators);
    }
  }

  /**
   * Assign a variant for a request. Returns null if no active experiment for tier.
   * 
   * @param tier - Request tier
   * @param runId - Unique request identifier
   * @returns Assignment or null if no active experiment
   */
  assign(tier: string, runId: string): ABAssignment | null {
    // Clean up stale assignments first (1 hour default TTL)
    this.cleanupStalAssignments(60 * 60 * 1000);
    
    // Find active experiment for this tier
    const experiment = this.findActiveExperiment(tier);
    if (!experiment) {
      return null;
    }

    // Check if we need to enforce assignment limit
    if (this.assignments.size >= this.maxPendingAssignments) {
      // Delete oldest entries to get back to 80% capacity
      const targetSize = Math.floor(this.maxPendingAssignments * 0.8);
      const entriesToDelete = this.assignments.size - targetSize;
      
      // FIFO deletion - iterate Map and delete first N entries
      const iterator = this.assignments.keys();
      for (let i = 0; i < entriesToDelete; i++) {
        const next = iterator.next();
        if (!next.done) {
          this.assignments.delete(next.value);
        }
      }
    }

    // Deterministic assignment based on runId hash
    const hash = this.hashRunId(runId);
    const variant = this.selectVariant(experiment, hash);
    
    // Store assignment for later outcome recording with timestamp
    this.assignments.set(runId, {
      experimentId: experiment.id,
      variantId: variant.id,
      assignedAt: Date.now()
    });

    return {
      experimentId: experiment.id,
      variant
    };
  }

  /**
   * Record outcome for a completed request.
   * 
   * @param runId - Request identifier
   * @param outcome - Outcome metrics
   */
  recordOutcome(runId: string, outcome: ABOutcome): void {
    const assignment = this.assignments.get(runId);
    if (!assignment) {
      return; // No assignment found
    }

    const experimentResults = this.results.get(assignment.experimentId);
    if (!experimentResults) {
      return; // Experiment not found
    }

    const variantAccumulator = experimentResults.get(assignment.variantId);
    if (!variantAccumulator) {
      return; // Variant not found
    }

    // Record outcome
    variantAccumulator.count++;
    variantAccumulator.totalLatencyMs += outcome.latencyMs; // integers are fine
    variantAccumulator.totalOutputTokens += outcome.outputTokens; // integers are fine
    
    // Use Kahan compensated summation for totalCost (precision-sensitive floating point)
    const y = outcome.cost - variantAccumulator.compensation;
    const t = variantAccumulator.totalCost + y;
    variantAccumulator.compensation = (t - variantAccumulator.totalCost) - y;
    variantAccumulator.totalCost = t;

    // Clean up assignment to prevent duplicate recordings
    this.assignments.delete(runId);
  }

  /**
   * Get results for an experiment.
   * 
   * @param experimentId - Experiment identifier
   * @returns Results or null if experiment not found
   */
  getResults(experimentId: string): ABExperimentResults | null {
    const experiment = this.experiments.get(experimentId);
    const experimentResults = this.results.get(experimentId);
    
    if (!experiment || !experimentResults) {
      return null;
    }

    const variants: ABResult[] = [];
    
    for (const variant of experiment.variants) {
      const accumulator = experimentResults.get(variant.id);
      if (!accumulator) continue;

      variants.push({
        variantId: variant.id,
        count: accumulator.count,
        avgLatencyMs: accumulator.count > 0 
          ? Math.round(accumulator.totalLatencyMs / accumulator.count)
          : 0,
        avgCost: accumulator.count > 0
          ? Math.round((accumulator.totalCost / accumulator.count) * 1000000) / 1000000
          : 0,
        avgOutputTokens: accumulator.count > 0
          ? Math.round(accumulator.totalOutputTokens / accumulator.count)
          : 0
      });
    }

    // Calculate statistical significance
    const significant = this.calculateSignificance(variants, experiment.minSamples || 30);

    return {
      variants,
      significant
    };
  }

  /**
   * List all experiments.
   * 
   * @returns Array of experiments sorted by start time (newest first)
   */
  listExperiments(): ABExperiment[] {
    return Array.from(this.experiments.values())
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  /**
   * Clean up assignments older than the specified threshold.
   * 
   * @param maxAgeMs - Maximum age in milliseconds (default: 1 hour)
   */
  cleanupStalAssignments(maxAgeMs: number): void {
    const now = Date.now();
    const cutoffTime = now - maxAgeMs;
    
    for (const [runId, assignment] of this.assignments.entries()) {
      if (assignment.assignedAt < cutoffTime) {
        this.assignments.delete(runId);
      }
    }
  }

  /**
   * Find active experiment for a tier
   */
  private findActiveExperiment(tier: string): ABExperiment | null {
    for (const experiment of this.experiments.values()) {
      if (experiment.tier === tier && experiment.status === 'active') {
        // Check if experiment has ended
        if (experiment.endAt && Date.now() > experiment.endAt) {
          continue;
        }
        return experiment;
      }
    }
    return null;
  }

  /**
   * Create deterministic hash from runId
   */
  private hashRunId(runId: string): number {
    let hash = 0;
    for (let i = 0; i < runId.length; i++) {
      const char = runId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Select variant based on weights and hash
   */
  private selectVariant(experiment: ABExperiment, hash: number): ABVariant {
    const percentage = hash % 100;
    let cumulativeWeight = 0;
    
    for (const variant of experiment.variants) {
      cumulativeWeight += variant.weight;
      if (percentage < cumulativeWeight) {
        return variant;
      }
    }
    
    // Fallback to last variant (should not happen with valid weights)
    return experiment.variants[experiment.variants.length - 1];
  }

  /**
   * Validate experiment configuration
   */
  private validateExperiment(experiment: ABExperiment): void {
    if (!experiment.variants || experiment.variants.length === 0) {
      throw new Error(`Experiment ${experiment.id} must have at least one variant`);
    }

    const totalWeight = experiment.variants.reduce((sum, v) => sum + v.weight, 0);
    if (totalWeight !== 100) {
      throw new Error(`Experiment ${experiment.id}: Variant weights must sum to 100, got ${totalWeight}`);
    }
  }

  /**
   * Calculate statistical significance using simple two-sample comparison
   */
  private calculateSignificance(variants: ABResult[], minSamples: number): boolean {
    if (variants.length !== 2) {
      return false; // Only support two-variant significance testing
    }

    const [variantA, variantB] = variants;
    
    // Need minimum samples for both variants
    if (variantA.count < minSamples || variantB.count < minSamples) {
      return false;
    }

    // Simple significance check: if means differ by more than 20% and both have >30 samples
    const meanA = variantA.avgLatencyMs;
    const meanB = variantB.avgLatencyMs;
    
    if (meanA === 0 && meanB === 0) {
      return false;
    }
    
    const maxMean = Math.max(meanA, meanB);
    const minMean = Math.min(meanA, meanB);
    const difference = (maxMean - minMean) / maxMean;
    
    // Consider significant if >20% difference with sufficient samples
    return difference > 0.2 && variantA.count >= 30 && variantB.count >= 30;
  }
}

/**
 * Default A/B testing configuration
 */
export const DEFAULT_AB_CONFIG = {
  enabled: false,
  experiments: []
};
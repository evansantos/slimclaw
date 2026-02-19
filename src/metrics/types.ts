/**
 * SlimClaw Metrics Types - Complete OptimizerMetrics Interface
 * Based on design document specifications
 */

export type ComplexityTier = "simple" | "mid" | "complex" | "reasoning";

export interface OptimizerMetrics {
  /** Unique request identifier (from runId) */
  requestId: string;
  /** ISO timestamp */
  timestamp: string;
  /** Agent that generated this request */
  agentId: string;
  /** Session key */
  sessionKey: string;

  // — Mode —
  mode: "shadow" | "active";

  // — Input state (before optimization) —
  originalModel: string;
  originalMessageCount: number;
  originalTokenEstimate: number;

  // — Windowing —
  windowingApplied: boolean;
  windowedMessageCount: number;
  windowedTokenEstimate: number;
  trimmedMessages: number;
  summaryTokens: number;
  summarizationMethod: "none" | "heuristic" | "llm";

  // — Classification —
  classificationTier: ComplexityTier;
  classificationConfidence: number;
  classificationScores: Record<ComplexityTier, number>;
  classificationSignals: string[];

  // — Routing —
  routingApplied: boolean;
  targetModel: string;
  modelDowngraded: boolean;
  modelUpgraded: boolean;

  // — Cache —
  cacheBreakpointsInjected: number;

  // — API response (from llm_output) —
  actualInputTokens: number | null;
  actualOutputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  latencyMs: number | null;

  // — Savings (computed post-response) —
  tokensSaved: number | null;
  estimatedCostOriginal: number | null;
  estimatedCostOptimized: number | null;
  estimatedCostSaved: number | null;
}

/**
 * Aggregated statistics for reporting
 */
export interface MetricsStats {
  totalRequests: number;
  averageOriginalTokens: number;
  averageOptimizedTokens: number;
  averageTokensSaved: number;
  averageSavingsPercent: number;
  windowingUsagePercent: number;
  cacheUsagePercent: number;
  classificationDistribution: Record<ComplexityTier, number>;
  routingUsagePercent: number;
  modelDowngradePercent: number;
  averageLatencyMs: number;
  totalCostSaved: number;
}

/**
 * Configuration for metrics collection
 */
export interface MetricsConfig {
  enabled: boolean;
  /** Flush metrics to disk every N requests */
  flushInterval: number;
  /** Keep in-memory ring buffer of this size */
  ringBufferSize: number;
  /** Directory for JSONL metric logs (relative to ~/.openclaw/data/slimclaw/) */
  logDir: string;
}
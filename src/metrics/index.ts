/**
 * SlimClaw Metrics - Complete metrics collection system
 * Exports for use throughout the SlimClaw plugin
 */

// Types
export type {
  OptimizerMetrics,
  MetricsStats,
  MetricsConfig,
  ComplexityTier,
} from './types.js';

// Collector (main class)
export { MetricsCollector } from './collector.js';

// Reporter (JSONL output)
export { MetricsReporter } from './reporter.js';

// Utility functions for creating metrics
export function createMetricsInstance(
  requestId: string,
  agentId: string,
  sessionKey: string,
  options: {
    mode?: "shadow" | "active";
    originalModel?: string;
    originalMessageCount?: number;
    originalTokenEstimate?: number;
  } = {}
): Partial<OptimizerMetrics> {
  return {
    requestId,
    timestamp: new Date().toISOString(),
    agentId,
    sessionKey,
    mode: options.mode ?? "shadow",
    originalModel: options.originalModel ?? "unknown",
    originalMessageCount: options.originalMessageCount ?? 0,
    originalTokenEstimate: options.originalTokenEstimate ?? 0,
    
    // Initialize with defaults (will be filled by pipeline)
    windowingApplied: false,
    windowedMessageCount: options.originalMessageCount ?? 0,
    windowedTokenEstimate: options.originalTokenEstimate ?? 0,
    trimmedMessages: 0,
    summaryTokens: 0,
    summarizationMethod: "none",
    
    classificationTier: "complex",
    classificationConfidence: 0,
    classificationScores: { simple: 0, mid: 0, complex: 0, reasoning: 0 },
    classificationSignals: [],
    
    routingApplied: false,
    targetModel: options.originalModel ?? "unknown",
    modelDowngraded: false,
    modelUpgraded: false,
    
    cacheBreakpointsInjected: 0,
    
    actualInputTokens: null,
    actualOutputTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    latencyMs: null,
    
    tokensSaved: null,
    estimatedCostOriginal: null,
    estimatedCostOptimized: null,
    estimatedCostSaved: null,
  };
}

// Re-import for convenience
import type { OptimizerMetrics } from './types.js';
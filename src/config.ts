import { z } from "zod";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ============================================================
// Zod Schema for SlimClaw Configuration
// ============================================================

export const SlimClawConfigSchema = z.object({
  enabled: z.boolean().default(true),
  mode: z.enum(["shadow", "active"]).default("shadow"),

  windowing: z.object({
    enabled: z.boolean().default(true),
    /** Max messages to keep in the recent window */
    maxMessages: z.number().int().min(2).max(100).default(10),
    /** Max tokens in the recent window (overrides maxMessages if hit first) */
    maxTokens: z.number().int().min(500).max(50000).default(4000),
    /** Start summarizing when message count exceeds this */
    summarizeThreshold: z.number().int().min(2).default(8),
  }).default({}),

  routing: z.object({
    enabled: z.boolean().default(false), // P1 - disabled for MVP
    /** Allow downgrading to cheaper models */
    allowDowngrade: z.boolean().default(true),
    /** Models that should never be routed away from */
    pinnedModels: z.array(z.string()).default([]),
    /** Minimum classification confidence to apply routing */
    minConfidence: z.number().min(0).max(1).default(0.4),
    /** Model tiers configuration */
    tiers: z.record(z.string()).default({
      simple: "anthropic/claude-3-haiku-20240307",
      mid: "anthropic/claude-sonnet-4-20250514", 
      complex: "anthropic/claude-opus-4-20250514",
      reasoning: "anthropic/claude-opus-4-20250514",
    }),
    /** Provider mapping for cross-provider routing. Maps model prefix patterns to provider names. */
    tierProviders: z.record(z.string().min(1), z.string()).optional(),
    /** OpenRouter-specific headers configuration */
    openRouterHeaders: z.record(z.string()).optional(),
    /** Enable shadow routing logging (Phase 2a) */
    shadowLogging: z.boolean().default(true),
    /** Thinking budget for reasoning tier models */
    reasoningBudget: z.number().int().default(10000),
    /** Custom model pricing overrides (per 1k tokens). Merges with built-in defaults.
     *  Example: { "anthropic/claude-sonnet-4-20250514": { "inputPer1k": 0.003, "outputPer1k": 0.015 } }
     */
    pricing: z.record(z.object({
      inputPer1k: z.number(),
      outputPer1k: z.number(),
    })).optional(),
    /** Dynamic pricing configuration (Phase 3a) */
    dynamicPricing: z.object({
      /** Enable dynamic pricing from OpenRouter API */
      enabled: z.boolean().default(false),
      /** Cache TTL in milliseconds (6 hours default) */
      ttlMs: z.number().min(60000).default(21600000), // Min 1 minute, default 6 hours
      /** Refresh interval in milliseconds (same as ttlMs by default) */
      refreshIntervalMs: z.number().min(60000).default(21600000), // Min 1 minute, default 6 hours
      /** Fetch timeout in milliseconds */
      timeoutMs: z.number().min(1000).default(10000), // Min 1 second, default 10 seconds
      /** OpenRouter API URL */
      apiUrl: z.string().min(1).default('https://openrouter.ai/api/v1/models'),
    }).default({}),
    /** Latency tracking configuration (Phase 3a) */
    latencyTracking: z.object({
      /** Enable latency tracking */
      enabled: z.boolean().default(true),
      /** Buffer size (number of samples to keep per model) */
      bufferSize: z.number().int().min(1).max(1000).default(100), // Min 1, max 1000, default 100
      /** Ignore latencies above this threshold (ms) */
      outlierThresholdMs: z.number().min(1000).default(60000), // Min 1 second, default 60 seconds
    }).default({}),
  }).default({}),

  caching: z.object({
    enabled: z.boolean().default(true),
    /** Inject cache_control breakpoints on system prompt */
    injectBreakpoints: z.boolean().default(true),
    /** Minimum content length (chars) to inject cache breakpoints */
    minContentLength: z.number().int().default(1000),
  }).default({}),

  metrics: z.object({
    enabled: z.boolean().default(true),
    /** Log file path relative to ~/.openclaw/data/slimclaw/ */
    logPath: z.string().default("metrics"),
    /** Flush metrics to disk every N milliseconds */
    flushIntervalMs: z.number().int().default(10000),
  }).default({}),

  logging: z.object({
    /** Minimum log level (debug, info, warn, error) */
    level: z.enum(["debug", "info", "warn", "error"]).default("info"),
    /** Output format (json for production, human for development) */
    format: z.enum(["json", "human"]).default("human"),
    /** Enable file output */
    fileOutput: z.boolean().default(true),
    /** Log file path relative to ~/.openclaw/data/slimclaw/ */
    logPath: z.string().default("logs"),
    /** Enable console output */
    consoleOutput: z.boolean().default(true),
    /** Include stack traces for errors */
    includeStackTrace: z.boolean().default(true),
    /** Enable colors in console output */
    colors: z.boolean().default(true),
  }).default({}),
});

export type SlimClawConfig = z.infer<typeof SlimClawConfigSchema>;

// ============================================================
// Default Configuration
// ============================================================

export const DEFAULT_CONFIG: SlimClawConfig = {
  enabled: true,
  mode: "shadow", // Safe for MVP
  windowing: {
    enabled: true,
    maxMessages: 10,
    maxTokens: 4000,
    summarizeThreshold: 8,
  },
  routing: {
    enabled: false, // P1 - start with shadow mode only
    allowDowngrade: true,
    pinnedModels: [],
    minConfidence: 0.4,
    tiers: {
      simple: "anthropic/claude-3-haiku-20240307",
      mid: "anthropic/claude-sonnet-4-20250514",
      complex: "anthropic/claude-opus-4-20250514",
      reasoning: "anthropic/claude-opus-4-20250514",
    },
    shadowLogging: true,
    reasoningBudget: 10000,
    // Phase 3a features with defaults
    dynamicPricing: {
      enabled: false,
      ttlMs: 21600000, // 6 hours
      refreshIntervalMs: 21600000, // 6 hours
      timeoutMs: 10000,
      apiUrl: 'https://openrouter.ai/api/v1/models',
    },
    latencyTracking: {
      enabled: true,
      bufferSize: 100,
      outlierThresholdMs: 60000, // 60 seconds
    },
  },
  caching: {
    enabled: true,
    injectBreakpoints: true,
    minContentLength: 1000,
  },
  metrics: {
    enabled: true,
    logPath: "metrics",
    flushIntervalMs: 10000,
  },
  logging: {
    level: "info",
    format: "human",
    fileOutput: true,
    logPath: "logs",
    consoleOutput: true,
    includeStackTrace: true,
    colors: true,
  },
};

// ============================================================
// Configuration Loading Functions
// ============================================================

/**
 * Loads SlimClaw configuration from openclaw.json or uses defaults.
 * 
 * @param configPath - Optional path to openclaw.json (defaults to ~/.openclaw/openclaw.json)
 * @returns Validated and typed SlimClawConfig
 */
export function loadConfig(configPath?: string): SlimClawConfig {
  const path = configPath || join(homedir(), ".openclaw", "openclaw.json");
  
  try {
    const content = readFileSync(path, "utf8");
    const parsed = JSON.parse(content);
    
    // Extract slimclaw config from plugins section
    const pluginConfig = parsed?.plugins?.slimclaw || {};
    
    // Parse and validate with Zod
    const result = SlimClawConfigSchema.safeParse(pluginConfig);
    
    if (result.success) {
      return result.data;
    } else {
      console.warn("SlimClaw config validation failed, using defaults:", result.error.issues);
      return DEFAULT_CONFIG;
    }
    
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      // File doesn't exist, use defaults
      console.info("openclaw.json not found, using SlimClaw defaults");
      return DEFAULT_CONFIG;
    }
    
    console.error("Failed to load openclaw.json:", error);
    return DEFAULT_CONFIG;
  }
}

/**
 * Validates a raw configuration object and returns typed SlimClawConfig.
 * 
 * @param config - Raw configuration object to validate
 * @returns Validation result with typed config or error details
 */
export function validateConfig(config: unknown): {
  success: true;
  data: SlimClawConfig;
} | {
  success: false;
  error: z.ZodError;
} {
  const result = SlimClawConfigSchema.safeParse(config);
  
  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  } else {
    return {
      success: false,
      error: result.error,
    };
  }
}

/**
 * Merges user configuration with defaults, ensuring all required fields are present.
 * 
 * @param userConfig - Partial user configuration
 * @returns Complete SlimClawConfig with defaults applied
 */
export function mergeWithDefaults(userConfig: Partial<SlimClawConfig>): SlimClawConfig {
  return SlimClawConfigSchema.parse(userConfig);
}

/**
 * Gets configuration for a specific agent, applying any agent-specific overrides.
 * Note: This is a placeholder for future agent-specific config support.
 * 
 * @param baseConfig - Base configuration
 * @param agentId - Agent identifier
 * @returns Configuration for the specific agent
 */
export function getAgentConfig(
  baseConfig: SlimClawConfig,
  _agentId?: string  // Reserved for future agent-specific overrides
): SlimClawConfig {
  // For now, just return base config
  // TODO: Implement agent-specific overrides from design doc
  return baseConfig;
}
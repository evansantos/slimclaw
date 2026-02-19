import { describe, test, expect, beforeEach, afterEach } from "@jest/globals";
import { writeFileSync, unlinkSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  SlimClawConfigSchema,
  DEFAULT_CONFIG,
  loadConfig,
  validateConfig,
  mergeWithDefaults,
  getAgentConfig,
  type SlimClawConfig,
} from "../config.js";

describe("SlimClawConfigSchema", () => {
  test("should parse valid minimal config", () => {
    const config = {};
    const result = SlimClawConfigSchema.safeParse(config);
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
      expect(result.data.mode).toBe("shadow");
      expect(result.data.windowing.enabled).toBe(true);
      expect(result.data.windowing.maxMessages).toBe(10);
      expect(result.data.routing.enabled).toBe(false);
    }
  });

  test("should parse valid complete config", () => {
    const config = {
      enabled: false,
      mode: "active" as const,
      windowing: {
        enabled: false,
        maxMessages: 20,
        maxTokens: 8000,
        summarizeThreshold: 15,
      },
      routing: {
        enabled: true,
        allowDowngrade: false,
        minConfidence: 0.7,
        tiers: {
          simple: "custom-haiku",
          mid: "custom-sonnet",
        },
      },
      caching: {
        enabled: false,
        injectBreakpoints: false,
        minContentLength: 500,
      },
      metrics: {
        enabled: false,
        logPath: "custom-metrics",
        flushIntervalMs: 5000,
      },
    };

    const result = SlimClawConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(config);
    }
  });

  test("should reject invalid mode", () => {
    const config = { mode: "invalid" };
    const result = SlimClawConfigSchema.safeParse(config);
    
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["mode"]);
    }
  });

  test("should reject invalid windowing config", () => {
    const config = {
      windowing: {
        maxMessages: 1, // Below minimum of 2
        maxTokens: 100, // Below minimum of 500
        summarizeThreshold: 1, // Below minimum of 2
      },
    };
    
    const result = SlimClawConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toHaveLength(3);
    }
  });

  test("should reject invalid routing config", () => {
    const config = {
      routing: {
        minConfidence: 1.5, // Above maximum of 1.0
      },
    };
    
    const result = SlimClawConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  test("should accept partial nested configs", () => {
    const config = {
      windowing: {
        maxMessages: 15, // Only override this field
      },
      routing: {
        enabled: true,
      },
    };
    
    const result = SlimClawConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.windowing.maxMessages).toBe(15);
      expect(result.data.windowing.enabled).toBe(true); // Default
      expect(result.data.routing.enabled).toBe(true);
      expect(result.data.routing.allowDowngrade).toBe(true); // Default
    }
  });
});

describe("loadConfig", () => {
  const testDir = join(tmpdir(), "slimclaw-config-test");
  const testConfigPath = join(testDir, "openclaw.json");

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  test("should load valid config from file", () => {
    const fileContent = {
      plugins: {
        slimclaw: {
          enabled: false,
          mode: "active",
          windowing: {
            maxMessages: 25,
          },
        },
      },
    };
    
    writeFileSync(testConfigPath, JSON.stringify(fileContent, null, 2));
    
    const config = loadConfig(testConfigPath);
    expect(config.enabled).toBe(false);
    expect(config.mode).toBe("active");
    expect(config.windowing.maxMessages).toBe(25);
    expect(config.windowing.enabled).toBe(true); // Default
  });

  test("should return defaults when file doesn't exist", () => {
    const config = loadConfig("/nonexistent/path/openclaw.json");
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  test("should return defaults when JSON is invalid", () => {
    writeFileSync(testConfigPath, "invalid json {");
    
    const config = loadConfig(testConfigPath);
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  test("should return defaults when plugins section is missing", () => {
    const fileContent = {
      someOtherField: "value",
    };
    
    writeFileSync(testConfigPath, JSON.stringify(fileContent));
    
    const config = loadConfig(testConfigPath);
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  test("should return defaults when slimclaw config is invalid", () => {
    const fileContent = {
      plugins: {
        slimclaw: {
          mode: "invalid-mode",
          windowing: {
            maxMessages: -1,
          },
        },
      },
    };
    
    writeFileSync(testConfigPath, JSON.stringify(fileContent));
    
    const config = loadConfig(testConfigPath);
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  test("should load empty slimclaw config with defaults", () => {
    const fileContent = {
      plugins: {
        slimclaw: {},
      },
    };
    
    writeFileSync(testConfigPath, JSON.stringify(fileContent));
    
    const config = loadConfig(testConfigPath);
    expect(config).toEqual(DEFAULT_CONFIG);
  });
});

describe("validateConfig", () => {
  test("should validate correct config", () => {
    const config = {
      enabled: true,
      mode: "shadow",
      windowing: { maxMessages: 15 },
    };
    
    const result = validateConfig(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
      expect(result.data.windowing.maxMessages).toBe(15);
    }
  });

  test("should reject invalid config", () => {
    const config = {
      mode: "invalid-mode",
      windowing: {
        maxMessages: 0,
      },
    };
    
    const result = validateConfig(config);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  test("should validate empty config with defaults", () => {
    const result = validateConfig({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(DEFAULT_CONFIG);
    }
  });

  test("should reject non-object config", () => {
    const result = validateConfig("not an object");
    expect(result.success).toBe(false);
  });

  test("should reject null config", () => {
    const result = validateConfig(null);
    expect(result.success).toBe(false);
  });
});

describe("mergeWithDefaults", () => {
  test("should merge partial config with defaults", () => {
    const userConfig = {
      enabled: false,
      windowing: {
        maxMessages: 20,
      },
    };
    
    const result = mergeWithDefaults(userConfig);
    expect(result.enabled).toBe(false);
    expect(result.windowing.maxMessages).toBe(20);
    expect(result.windowing.enabled).toBe(true); // Default
    expect(result.mode).toBe("shadow"); // Default
  });

  test("should handle empty config", () => {
    const result = mergeWithDefaults({});
    expect(result).toEqual(DEFAULT_CONFIG);
  });

  test("should handle deep partial config", () => {
    const userConfig = {
      routing: {
        enabled: true,
        tiers: {
          simple: "custom-model",
        },
      },
    };
    
    const result = mergeWithDefaults(userConfig);
    expect(result.routing.enabled).toBe(true);
    expect(result.routing.tiers.simple).toBe("custom-model");
    expect(result.routing.tiers.mid).toBe("anthropic/claude-sonnet-4-20250514"); // Default
    expect(result.routing.allowDowngrade).toBe(true); // Default
  });
});

describe("getAgentConfig", () => {
  test("should return base config when no agent specified", () => {
    const baseConfig = DEFAULT_CONFIG;
    const result = getAgentConfig(baseConfig);
    expect(result).toEqual(baseConfig);
  });

  test("should return base config for any agent (current implementation)", () => {
    const baseConfig: SlimClawConfig = {
      ...DEFAULT_CONFIG,
      enabled: false,
      mode: "active",
    };
    
    const result = getAgentConfig(baseConfig, "test-agent");
    expect(result).toEqual(baseConfig);
  });
});

describe("DEFAULT_CONFIG", () => {
  test("should have sensible production defaults", () => {
    expect(DEFAULT_CONFIG.enabled).toBe(true);
    expect(DEFAULT_CONFIG.mode).toBe("shadow"); // Safe for MVP
    expect(DEFAULT_CONFIG.windowing.enabled).toBe(true);
    expect(DEFAULT_CONFIG.windowing.maxMessages).toBe(10);
    expect(DEFAULT_CONFIG.windowing.summarizeThreshold).toBe(8);
    expect(DEFAULT_CONFIG.routing.enabled).toBe(false); // P1 - disabled for MVP
    expect(DEFAULT_CONFIG.caching.enabled).toBe(true);
    expect(DEFAULT_CONFIG.caching.minContentLength).toBe(1000);
    expect(DEFAULT_CONFIG.metrics.enabled).toBe(true);
  });

  test("should be valid according to schema", () => {
    const result = SlimClawConfigSchema.safeParse(DEFAULT_CONFIG);
    expect(result.success).toBe(true);
  });
});
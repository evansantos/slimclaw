import { describe, it, expect } from "vitest";
import { SlimClawConfigSchema } from "../config";

describe("SlimClaw Config - Proxy Schema", () => {
  it("should accept valid proxy config with all fields", () => {
    const config = {
      proxy: {
        enabled: true,
        port: 3334,
        defaultApi: "openai-completions" as const,
        virtualModels: {
          auto: { enabled: true }
        },
        providerOverrides: {
          anthropic: {
            baseUrl: "https://api.anthropic.com/v1",
            apiKeyEnv: "ANTHROPIC_API_KEY",
            apiKey: "sk-test-key"
          }
        },
        requestTimeout: 120000,
        retryOnError: true,
        fallbackModel: "gpt-3.5-turbo"
      }
    };

    const result = SlimClawConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.proxy.enabled).toBe(true);
      expect(result.data.proxy.port).toBe(3334);
      expect(result.data.proxy.defaultApi).toBe("openai-completions");
      expect(result.data.proxy.virtualModels.auto.enabled).toBe(true);
      expect(result.data.proxy.providerOverrides.anthropic.baseUrl).toBe("https://api.anthropic.com/v1");
      expect(result.data.proxy.requestTimeout).toBe(120000);
      expect(result.data.proxy.retryOnError).toBe(true);
      expect(result.data.proxy.fallbackModel).toBe("gpt-3.5-turbo");
    }
  });

  it("should use defaults when proxy config is minimal (just enabled: true)", () => {
    const config = {
      proxy: {
        enabled: true
      }
    };

    const result = SlimClawConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.proxy.enabled).toBe(true);
      expect(result.data.proxy.port).toBe(3334);
      expect(result.data.proxy.defaultApi).toBe("openai-completions");
      expect(result.data.proxy.virtualModels.auto.enabled).toBe(true);
      expect(result.data.proxy.providerOverrides).toEqual({});
      expect(result.data.proxy.requestTimeout).toBe(120000);
      expect(result.data.proxy.retryOnError).toBe(false);
      expect(result.data.proxy.fallbackModel).toBe(null);
    }
  });

  it("should validate port range (min 1024, max 65535)", () => {
    // Test below minimum
    const belowMin = { proxy: { enabled: true, port: 1023 } };
    const resultBelowMin = SlimClawConfigSchema.safeParse(belowMin);
    expect(resultBelowMin.success).toBe(false);

    // Test above maximum
    const aboveMax = { proxy: { enabled: true, port: 65536 } };
    const resultAboveMax = SlimClawConfigSchema.safeParse(aboveMax);
    expect(resultAboveMax.success).toBe(false);

    // Test valid range
    const validMin = { proxy: { enabled: true, port: 1024 } };
    const resultValidMin = SlimClawConfigSchema.safeParse(validMin);
    expect(resultValidMin.success).toBe(true);

    const validMax = { proxy: { enabled: true, port: 65535 } };
    const resultValidMax = SlimClawConfigSchema.safeParse(validMax);
    expect(resultValidMax.success).toBe(true);
  });

  it("should validate API enum (only 'openai-completions' and 'anthropic-messages')", () => {
    // Test valid values
    const openaiConfig = { proxy: { enabled: true, defaultApi: "openai-completions" as const } };
    const anthropicConfig = { proxy: { enabled: true, defaultApi: "anthropic-messages" as const } };

    expect(SlimClawConfigSchema.safeParse(openaiConfig).success).toBe(true);
    expect(SlimClawConfigSchema.safeParse(anthropicConfig).success).toBe(true);

    // Test invalid value
    const invalidConfig = { proxy: { enabled: true, defaultApi: "invalid-api" } };
    const result = SlimClawConfigSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });

  it("should default to disabled when proxy not specified", () => {
    const config = {};

    const result = SlimClawConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.proxy.enabled).toBe(false);
    }
  });

  it("should accept provider overrides with baseUrl, apiKeyEnv, apiKey fields", () => {
    const config = {
      proxy: {
        enabled: true,
        providerOverrides: {
          openai: {
            baseUrl: "https://api.openai.com/v1",
            apiKeyEnv: "OPENAI_API_KEY"
          },
          anthropic: {
            apiKey: "sk-ant-test-key"
          },
          custom: {
            baseUrl: "https://custom.ai/api",
            apiKeyEnv: "CUSTOM_API_KEY",
            apiKey: "custom-key"
          }
        }
      }
    };

    const result = SlimClawConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.proxy.providerOverrides.openai.baseUrl).toBe("https://api.openai.com/v1");
      expect(result.data.proxy.providerOverrides.openai.apiKeyEnv).toBe("OPENAI_API_KEY");
      expect(result.data.proxy.providerOverrides.anthropic.apiKey).toBe("sk-ant-test-key");
      expect(result.data.proxy.providerOverrides.custom.baseUrl).toBe("https://custom.ai/api");
    }
  });

  it("should accept empty provider overrides", () => {
    const config = {
      proxy: {
        enabled: true,
        providerOverrides: {}
      }
    };

    const result = SlimClawConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.proxy.providerOverrides).toEqual({});
    }
  });

  it("should allow disabling virtual models", () => {
    const config = {
      proxy: {
        enabled: true,
        virtualModels: {
          auto: { enabled: false }
        }
      }
    };

    const result = SlimClawConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.proxy.virtualModels.auto.enabled).toBe(false);
    }
  });

  it("should use defaults for undefined virtual models", () => {
    const config = {
      proxy: {
        enabled: true
        // virtualModels not specified
      }
    };

    const result = SlimClawConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.proxy.virtualModels.auto.enabled).toBe(true);
    }
  });
});
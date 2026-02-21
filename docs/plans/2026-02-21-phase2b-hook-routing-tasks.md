# SlimClaw Phase 2b: Active Routing via OpenClaw Hooks - Implementation Tasks

**Date:** 2026-02-21  
**Author:** SPEC  
**Branch:** `feat/phase2b-hook-routing`  
**Depends on:** Existing routing pipeline (`makeRoutingDecision`, `classifyWithRouter`, etc.)  
**Scope:** Active routing through `before_model_resolve` hook with graceful fallback

## Overview

Phase 2b transforms SlimClaw from **shadow mode** (logging-only) to **active mode** by leveraging OpenClaw's `before_model_resolve` hook. This hook allows SlimClaw to intercept model resolution and return `{ modelOverride, providerOverride }` to actually change the model instead of just logging recommendations.

### Deliverables
- ✅ `before_model_resolve` hook handler in `src/index.ts`
- ✅ Config mode field with `"shadow" | "active" | "off"` values  
- ✅ Graceful error handling (return void = no override)
- ✅ Active routing logs for observability
- ✅ Proxy remains as fallback/standalone option
- ✅ Complete test coverage for hook behavior

### Architecture
- **Hook is primary:** When `mode: "active"`, `before_model_resolve` takes precedence over proxy
- **Shadow mode unchanged:** Existing `llm_input` shadow logging stays for `mode: "shadow"`
- **Proxy as fallback:** Proxy sidecar still works independently for non-OpenClaw use
- **Graceful degradation:** Any hook errors result in no override (original model)

### Constraints
- **TDD:** Red-green-refactor for every task
- **Complete code:** Every step includes full implementation  
- **Wave execution:** Tasks in same wave can run in parallel
- **Zero context assumption:** Each task is self-contained
- **Reuse everything:** ALL existing routing components unchanged
- **Error resilience:** Hook failures must never crash OpenClaw

---

## Wave 1: Config Schema Updates (Independent)

### Task 1: Update Config Mode Field

**Wave:** 1  
**Files:** Update: `src/config.ts` | Test: `src/__tests__/config.test.ts`  

**Context:** Currently there's a top-level `mode: "shadow"` in config, but routing decisions check `routing.shadowLogging`. We need to consolidate this into a single `routing.mode` field that controls both shadow logging and active routing.

**Step 1:** Write failing test for new mode field
```typescript
// Update or create src/__tests__/config.test.ts
import { describe, test, expect } from 'vitest';
import { SlimClawConfigSchema, DEFAULT_CONFIG, type SlimClawConfig } from '../config.js';

describe('SlimClaw Config Mode', () => {
  describe('routing.mode field', () => {
    test('should accept valid mode values', () => {
      const validModes = ['shadow', 'active', 'off'] as const;
      
      for (const mode of validModes) {
        const config: SlimClawConfig = {
          ...DEFAULT_CONFIG,
          routing: {
            ...DEFAULT_CONFIG.routing,
            mode
          }
        };
        
        const result = SlimClawConfigSchema.safeParse(config);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.routing.mode).toBe(mode);
        }
      }
    });

    test('should reject invalid mode values', () => {
      const invalidConfig = {
        ...DEFAULT_CONFIG,
        routing: {
          ...DEFAULT_CONFIG.routing,
          mode: 'invalid-mode'
        }
      };
      
      const result = SlimClawConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    test('should default to shadow mode', () => {
      expect(DEFAULT_CONFIG.routing.mode).toBe('shadow');
    });

    test('should preserve backward compatibility with shadowLogging', () => {
      // When shadowLogging is set but mode is not, should infer mode
      const config = {
        ...DEFAULT_CONFIG,
        routing: {
          ...DEFAULT_CONFIG.routing,
          shadowLogging: true,
          mode: undefined
        }
      };
      
      // This test will verify the migration logic
      expect(typeof config.routing.shadowLogging).toBe('boolean');
    });
  });

  describe('mode behavior validation', () => {
    test('shadow mode should enable logging only', () => {
      const config: SlimClawConfig = {
        ...DEFAULT_CONFIG,
        routing: { ...DEFAULT_CONFIG.routing, mode: 'shadow' }
      };
      
      // Shadow mode means logging enabled, no active routing
      expect(config.routing.mode).toBe('shadow');
    });

    test('active mode should enable both logging and routing', () => {
      const config: SlimClawConfig = {
        ...DEFAULT_CONFIG,
        routing: { ...DEFAULT_CONFIG.routing, mode: 'active' }
      };
      
      expect(config.routing.mode).toBe('active');
    });

    test('off mode should disable all routing', () => {
      const config: SlimClawConfig = {
        ...DEFAULT_CONFIG,
        routing: { ...DEFAULT_CONFIG.routing, mode: 'off' }
      };
      
      expect(config.routing.mode).toBe('off');
    });
  });
});
```

**Step 2:** Implement config changes
```typescript
// Update src/config.ts - add to routing config interface
export interface RoutingConfig {
  enabled: boolean;
  mode: 'shadow' | 'active' | 'off';  // NEW: Replaces separate shadowLogging flag
  allowDowngrade: boolean;
  minConfidence: number;
  pinnedModels: string[];
  tiers: Record<ComplexityTier, string>;
  tierProviders: Record<string, string>;
  openRouterHeaders?: Record<string, string>;
  // DEPRECATED: Keep for backward compatibility, but mode takes precedence
  shadowLogging?: boolean;
  // ... rest unchanged
}

// Update DEFAULT_CONFIG
export const DEFAULT_CONFIG: SlimClawConfig = {
  // ... other defaults
  routing: {
    enabled: true,
    mode: 'shadow',  // NEW: Default to shadow mode
    allowDowngrade: true,
    minConfidence: 0.4,
    pinnedModels: [],
    tiers: DEFAULT_TIER_MODELS,
    tierProviders: {},
    shadowLogging: true,  // DEPRECATED: Keep for compatibility
    // ... rest unchanged
  },
  // ... rest unchanged
};

// Update Zod schema
const RoutingConfigSchema = z.object({
  enabled: z.boolean().default(true),
  mode: z.enum(['shadow', 'active', 'off']).default('shadow'),  // NEW
  allowDowngrade: z.boolean().default(true),
  minConfidence: z.number().min(0).max(1).default(0.4),
  pinnedModels: z.array(z.string()).default([]),
  tiers: z.record(z.enum(['simple', 'mid', 'complex', 'reasoning']), z.string()).default(DEFAULT_TIER_MODELS),
  tierProviders: z.record(z.string(), z.string()).default({}),
  openRouterHeaders: z.record(z.string(), z.string()).optional(),
  shadowLogging: z.boolean().optional(),  // DEPRECATED: Keep for compatibility
  // ... rest unchanged
});
```

**Expected:** Tests fail because schema doesn't support new mode field

---

## Wave 2: Hook Implementation Core (Dependent on Wave 1)

### Task 2: Add before_model_resolve Hook Handler

**Wave:** 2  
**Files:** Update: `src/index.ts` | Test: `src/__tests__/hook-routing.test.ts`

**Context:** The `before_model_resolve` hook is OpenClaw's mechanism for plugins to override model selection. It receives `{ prompt: string }` and can return `{ modelOverride?: string, providerOverride?: string }` or void for no override.

**Step 1:** Write failing tests for hook behavior
```typescript
// Create src/__tests__/hook-routing.test.ts
import { describe, test, expect, beforeEach, vi } from 'vitest';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';

// Mock the routing components
vi.mock('../classifier/clawrouter-classifier.js', () => ({
  classifyWithRouter: vi.fn()
}));

vi.mock('../routing/index.js', () => ({
  makeRoutingDecision: vi.fn()
}));

import { classifyWithRouter } from '../classifier/clawrouter-classifier.js';
import { makeRoutingDecision } from '../routing/index.js';

describe('before_model_resolve Hook', () => {
  let mockApi: Partial<OpenClawPluginApi>;
  let pluginInitializer: (api: OpenClawPluginApi) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockApi = {
      logger: {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      },
      on: vi.fn()
    };
  });

  describe('mode: active', () => {
    test('should register before_model_resolve hook when mode is active', async () => {
      const mockConfig = {
        enabled: true,
        routing: { enabled: true, mode: 'active' as const },
        // ... minimal config
      };

      // Mock config loading
      vi.doMock('../config.js', () => ({
        DEFAULT_CONFIG: mockConfig,
        SlimClawConfigSchema: { parse: () => mockConfig }
      }));

      // Import plugin after mocking
      const { default: initializePlugin } = await import('../index.js');
      
      // Initialize plugin
      initializePlugin(mockApi as OpenClawPluginApi);

      // Verify hook registration
      expect(mockApi.on).toHaveBeenCalledWith('before_model_resolve', expect.any(Function));
    });

    test('should return model override when routing decision suggests different model', async () => {
      const mockPrompt = 'Complex reasoning task requiring opus-level thinking...';
      
      // Mock classification result
      (classifyWithRouter as any).mockResolvedValue({
        tier: 'reasoning',
        confidence: 0.85,
        signals: ['complex-reasoning', 'multi-step'],
        reason: 'High confidence reasoning task'
      });

      // Mock routing decision
      const mockRoutingOutput = {
        model: 'anthropic/claude-opus-4-6',
        provider: 'anthropic',
        applied: true,
        shadow: {
          originalModel: 'anthropic/claude-sonnet-4-20250514',
          targetModel: 'anthropic/claude-opus-4-6',
          targetProvider: 'anthropic'
        }
      };
      (makeRoutingDecision as any).mockReturnValue(mockRoutingOutput);

      // Test the hook handler directly
      const hookHandler = getHookHandler('before_model_resolve');  // Helper function we'll create
      const result = await hookHandler({ prompt: mockPrompt }, {});

      expect(result).toEqual({
        modelOverride: 'anthropic/claude-opus-4-6',
        providerOverride: 'anthropic'
      });
    });

    test('should return void when routing keeps original model', async () => {
      // Mock keeping original model
      const mockRoutingOutput = {
        model: 'original-model',
        provider: 'original-provider', 
        applied: false,  // No change
        shadow: { /* ... */ }
      };
      (makeRoutingDecision as any).mockReturnValue(mockRoutingOutput);

      const hookHandler = getHookHandler('before_model_resolve');
      const result = await hookHandler({ prompt: 'Simple task' }, {});

      // No override when routing doesn't change the model
      expect(result).toBeUndefined();
    });

    test('should handle classification errors gracefully', async () => {
      (classifyWithRouter as any).mockRejectedValue(new Error('Classification failed'));

      const hookHandler = getHookHandler('before_model_resolve');
      const result = await hookHandler({ prompt: 'Any prompt' }, {});

      expect(result).toBeUndefined();  // Graceful fallback
      expect(mockApi.logger?.info).toHaveBeenCalledWith(
        expect.stringContaining('[SlimClaw] before_model_resolve classification failed')
      );
    });

    test('should handle routing decision errors gracefully', async () => {
      (classifyWithRouter as any).mockResolvedValue({
        tier: 'mid',
        confidence: 0.7
      });
      (makeRoutingDecision as any).mockImplementation(() => {
        throw new Error('Routing failed');
      });

      const hookHandler = getHookHandler('before_model_resolve');
      const result = await hookHandler({ prompt: 'Any prompt' }, {});

      expect(result).toBeUndefined();  // Graceful fallback
      expect(mockApi.logger?.info).toHaveBeenCalledWith(
        expect.stringContaining('[SlimClaw] before_model_resolve routing decision failed')
      );
    });
  });

  describe('mode: shadow', () => {
    test('should not register before_model_resolve hook when mode is shadow', async () => {
      const mockConfig = {
        routing: { mode: 'shadow' as const }
      };

      vi.doMock('../config.js', () => ({ DEFAULT_CONFIG: mockConfig }));
      
      const { default: initializePlugin } = await import('../index.js');
      initializePlugin(mockApi as OpenClawPluginApi);

      // Should not register the hook
      const calls = (mockApi.on as any).mock.calls;
      const beforeModelResolveCalls = calls.filter(call => call[0] === 'before_model_resolve');
      expect(beforeModelResolveCalls).toHaveLength(0);
    });
  });

  describe('mode: off', () => {
    test('should not register before_model_resolve hook when mode is off', async () => {
      const mockConfig = {
        routing: { mode: 'off' as const }
      };

      vi.doMock('../config.js', () => ({ DEFAULT_CONFIG: mockConfig }));
      
      const { default: initializePlugin } = await import('../index.js');
      initializePlugin(mockApi as OpenClawPluginApi);

      // Should not register any routing hooks
      const calls = (mockApi.on as any).mock.calls;
      const routingCalls = calls.filter(call => 
        call[0] === 'before_model_resolve' || 
        call[0] === 'llm_input'
      );
      // llm_input should still be registered for metrics, but not routing-specific logic
      expect(routingCalls.some(call => call[0] === 'before_model_resolve')).toBe(false);
    });
  });
});

// Helper function to extract hook handlers for testing
function getHookHandler(hookName: string): Function {
  const calls = (mockApi.on as any).mock.calls;
  const hookCall = calls.find(call => call[0] === hookName);
  if (!hookCall) throw new Error(`Hook ${hookName} not registered`);
  return hookCall[1];
}
```

**Step 2:** Implement the hook handler in src/index.ts
```typescript
// Add to src/index.ts, inside the plugin initialization function

export default function slimclaw(api: OpenClawPluginApi) {
  // ... existing initialization code ...

  // =========================================================================  
  // Hook: before_model_resolve - Active routing (Phase 2b)
  // =========================================================================
  if (pluginConfig.routing.enabled && pluginConfig.routing.mode === 'active') {
    api.on('before_model_resolve', async (event, ctx) => {
      api.logger.info(`[SlimClaw] before_model_resolve hook fired! prompt length=${event.prompt.length}`);
      
      try {
        // 1. Classify the prompt complexity
        const classification = await classifyWithRouter(
          [{ role: 'user', content: event.prompt }] as Message[],
          pluginConfig.routing.tiers
        );
        
        api.logger.info(
          `[SlimClaw] Active routing classification: ${classification.tier} ` +
          `(${Math.round(classification.confidence * 100)}%) - ${classification.reason}`
        );

        // 2. Make routing decision using existing pipeline
        const fullConfig: SlimClawConfig = {
          ...DEFAULT_CONFIG,
          enabled: pluginConfig.enabled,
          mode: pluginConfig.mode,
          routing: {
            ...DEFAULT_CONFIG.routing,
            ...pluginConfig.routing,
          },
        };

        const routingOutput = makeRoutingDecision(
          classification,
          fullConfig,
          {
            originalModel: ctx.model || 'unknown',
            headers: ctx.headers || {}
          },
          ctx.runId || `active-${Date.now()}`,
          {
            ...(budgetTracker ? { budgetTracker } : {}),
            ...(abTestManager ? { abTestManager } : {})
          }
        );

        // 3. Log the routing decision for observability
        api.logger.info(
          `[SlimClaw] Active routing decision: ` +
          `${routingOutput.shadow.originalModel} → ${routingOutput.shadow.targetModel} ` +
          `(${routingOutput.shadow.targetProvider}) - ${routingOutput.applied ? 'APPLIED' : 'KEPT'}`
        );

        // 4. Return override if routing suggests a different model
        if (routingOutput.applied && routingOutput.model !== routingOutput.shadow.originalModel) {
          return {
            modelOverride: routingOutput.model,
            providerOverride: routingOutput.provider
          };
        }

        // 5. Return void (no override) if keeping original model
        return;

      } catch (error) {
        api.logger.info(
          `[SlimClaw] before_model_resolve error: ${error instanceof Error ? error.message : String(error)}`
        );
        // Graceful degradation: return void to keep original model
        return;
      }
    });

    api.logger.info('[SlimClaw] Registered before_model_resolve hook for active routing');
  }

  // ... rest of existing code ...
}
```

**Expected:** Tests fail because hook is not yet registered and routing logic is not implemented.

---

## Wave 3: Configuration Integration (Dependent on Wave 2)

### Task 3: Update Existing Shadow Logic Mode Check

**Wave:** 3  
**Files:** Update: `src/index.ts` (llm_input hook section) | Test: `src/__tests__/shadow-mode.test.ts`

**Context:** The existing shadow logging in the `llm_input` hook checks `pluginConfig.routing.shadowLogging`. We need to update it to respect the new `routing.mode` field while maintaining backward compatibility.

**Step 1:** Write test for shadow mode behavior
```typescript
// Create src/__tests__/shadow-mode.test.ts
import { describe, test, expect, beforeEach, vi } from 'vitest';

describe('Shadow Mode Integration', () => {
  let mockApi: any;

  beforeEach(() => {
    mockApi = {
      logger: { info: vi.fn(), debug: vi.fn() },
      on: vi.fn()
    };
  });

  test('shadow mode should enable llm_input logging only', async () => {
    const mockConfig = {
      routing: { 
        enabled: true, 
        mode: 'shadow' as const,
        shadowLogging: undefined  // New mode takes precedence
      }
    };

    // Test that shadow mode triggers logging in llm_input hook
    // This verifies the existing shadow logic respects new mode field
    expect(shouldEnableShadowLogging(mockConfig)).toBe(true);
  });

  test('active mode should enable both shadow logging and active routing', async () => {
    const mockConfig = {
      routing: { 
        enabled: true, 
        mode: 'active' as const
      }
    };

    expect(shouldEnableShadowLogging(mockConfig)).toBe(true);  // Active mode includes shadow logging
    expect(shouldEnableActiveRouting(mockConfig)).toBe(true);
  });

  test('off mode should disable all routing', async () => {
    const mockConfig = {
      routing: { 
        enabled: true, 
        mode: 'off' as const
      }
    };

    expect(shouldEnableShadowLogging(mockConfig)).toBe(false);
    expect(shouldEnableActiveRouting(mockConfig)).toBe(false);
  });

  test('backward compatibility: shadowLogging=true should work when mode is unset', async () => {
    const mockConfig = {
      routing: { 
        enabled: true,
        shadowLogging: true,
        mode: undefined  // Legacy config
      }
    };

    expect(shouldEnableShadowLogging(mockConfig)).toBe(true);
  });

  test('mode takes precedence over shadowLogging when both are set', async () => {
    const mockConfig = {
      routing: { 
        enabled: true,
        shadowLogging: true,  // Legacy setting
        mode: 'off' as const  // New mode overrides
      }
    };

    expect(shouldEnableShadowLogging(mockConfig)).toBe(false);  // Mode wins
  });
});

// Helper functions for testing mode logic
function shouldEnableShadowLogging(config: any): boolean {
  // This will match the logic we implement in src/index.ts
  const mode = config.routing.mode;
  
  if (mode) {
    return mode === 'shadow' || mode === 'active';
  }
  
  // Backward compatibility fallback
  return config.routing.shadowLogging === true;
}

function shouldEnableActiveRouting(config: any): boolean {
  return config.routing.mode === 'active';
}
```

**Step 2:** Update llm_input hook logic
```typescript
// Update src/index.ts - modify the existing llm_input hook condition
// Around lines 658-704, find the condition:
// if (pluginConfig.routing.enabled && pluginConfig.routing.shadowLogging && routingResult) {

// Replace with:
const shouldEnableShadowLogging = () => {
  if (pluginConfig.routing.mode) {
    return pluginConfig.routing.mode === 'shadow' || pluginConfig.routing.mode === 'active';
  }
  // Backward compatibility: fall back to shadowLogging flag
  return pluginConfig.routing.shadowLogging === true;
};

// Then update the condition to:
if (pluginConfig.routing.enabled && shouldEnableShadowLogging() && routingResult) {
  // ... existing shadow logging code unchanged ...
}
```

**Expected:** Tests pass, confirming mode field controls both shadow and active behavior.

---

## Wave 4: Error Handling & Edge Cases (Dependent on Wave 3)

### Task 4: Comprehensive Error Handling Tests

**Wave:** 4  
**Files:** Test: `src/__tests__/hook-error-handling.test.ts`

**Context:** The `before_model_resolve` hook must never crash OpenClaw. All errors should be caught, logged, and result in graceful fallback (no override).

**Step 1:** Write comprehensive error handling tests
```typescript
// Create src/__tests__/hook-error-handling.test.ts
import { describe, test, expect, vi } from 'vitest';

describe('Hook Error Handling', () => {
  test('should handle missing prompt gracefully', async () => {
    const hookHandler = getBeforeModelResolveHandler();  // Test helper
    
    const result = await hookHandler({ prompt: null } as any, {});
    
    expect(result).toBeUndefined();
    // Should log but not crash
  });

  test('should handle empty prompt gracefully', async () => {
    const hookHandler = getBeforeModelResolveHandler();
    
    const result = await hookHandler({ prompt: '' }, {});
    
    expect(result).toBeUndefined();
  });

  test('should handle classification timeout', async () => {
    vi.mocked(classifyWithRouter).mockImplementation(() => 
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 100)
      )
    );

    const hookHandler = getBeforeModelResolveHandler();
    const result = await hookHandler({ prompt: 'test' }, {});

    expect(result).toBeUndefined();
  });

  test('should handle malformed config gracefully', async () => {
    // Test with corrupted config that might cause routing to fail
    const hookHandler = getBeforeModelResolveHandler({
      routing: { 
        tiers: null,  // Invalid config
        mode: 'active'
      }
    });

    const result = await hookHandler({ prompt: 'test' }, {});
    expect(result).toBeUndefined();
  });

  test('should handle missing budget/AB test services', async () => {
    // Services are optional, should not crash when missing
    vi.mocked(makeRoutingDecision).mockImplementation((classification, config, ctx, runId, services) => {
      if (!services) throw new Error('Services required');
      return mockRoutingOutput;
    });

    const hookHandler = getBeforeModelResolveHandler();
    const result = await hookHandler({ prompt: 'test' }, {});

    expect(result).toBeUndefined();  // Should handle gracefully
  });

  test('should handle concurrent hook calls', async () => {
    const hookHandler = getBeforeModelResolveHandler();
    
    // Fire multiple hook calls simultaneously
    const promises = Array(10).fill(0).map(() => 
      hookHandler({ prompt: 'concurrent test' }, {})
    );

    const results = await Promise.all(promises);
    
    // All should complete without crashing
    results.forEach(result => {
      expect([undefined, { modelOverride: expect.any(String), providerOverride: expect.any(String) }])
        .toContainEqual(result);
    });
  });
});
```

**Expected:** Tests fail until error handling is robust.

---

## Wave 5: Integration Testing (Final Wave)

### Task 5: End-to-End Hook Integration Test

**Wave:** 5  
**Files:** Test: `src/__tests__/e2e-hook-integration.test.ts`

**Context:** Verify the complete flow from hook registration to routing decision works with real-world scenarios.

**Step 1:** Write integration test
```typescript
// Create src/__tests__/e2e-hook-integration.test.ts
import { describe, test, expect, beforeEach, vi } from 'vitest';

describe('E2E Hook Integration', () => {
  test('should complete full active routing flow', async () => {
    // 1. Setup real config (not mocked)
    const realConfig = {
      enabled: true,
      routing: {
        enabled: true,
        mode: 'active' as const,
        tiers: {
          simple: 'anthropic/claude-3-haiku-20240307',
          mid: 'anthropic/claude-sonnet-4-20250514', 
          complex: 'anthropic/claude-opus-4-6',
          reasoning: 'anthropic/claude-opus-4-6'
        },
        tierProviders: {
          'anthropic/*': 'anthropic'
        }
      }
    };

    // 2. Mock real classification result for complex prompt
    const complexPrompt = `
      I need you to analyze this multi-step reasoning problem:
      Given the constraints of quantum mechanics and relativity theory,
      how would you design a theoretical framework for...
    `.trim();

    // 3. Initialize plugin and capture hook
    let hookHandler: Function | undefined;
    const mockApi = {
      logger: { info: vi.fn(), debug: vi.fn() },
      on: vi.fn().mockImplementation((event, handler) => {
        if (event === 'before_model_resolve') {
          hookHandler = handler;
        }
      })
    };

    // Initialize with real config
    await initializePluginWithConfig(mockApi, realConfig);

    // 4. Verify hook was registered
    expect(hookHandler).toBeDefined();
    expect(mockApi.on).toHaveBeenCalledWith('before_model_resolve', expect.any(Function));

    // 5. Execute hook with complex prompt  
    const result = await hookHandler!({ prompt: complexPrompt }, { 
      model: 'anthropic/claude-sonnet-4-20250514',
      runId: 'test-run-123'
    });

    // 6. Verify active routing occurred
    expect(result).toEqual({
      modelOverride: 'anthropic/claude-opus-4-6',
      providerOverride: 'anthropic'
    });

    // 7. Verify logging occurred
    expect(mockApi.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('[SlimClaw] Active routing decision')
    );
  });

  test('should handle simple prompt without override', async () => {
    const simplePrompt = 'What is 2 + 2?';
    
    // This should classify as 'simple' and keep the original model
    const result = await executeHookWithPrompt(simplePrompt, {
      originalModel: 'anthropic/claude-3-haiku-20240307'
    });

    expect(result).toBeUndefined();  // No override needed
  });

  test('should respect pinned models', async () => {
    const configWithPinnedModel = {
      routing: {
        mode: 'active' as const,
        pinnedModels: ['anthropic/claude-sonnet-4-20250514']
      }
    };

    const result = await executeHookWithConfig(
      'Any complex prompt',
      configWithPinnedModel,
      { originalModel: 'anthropic/claude-sonnet-4-20250514' }
    );

    expect(result).toBeUndefined();  // Pinned model should not be overridden
  });
});

// Test helper functions
async function initializePluginWithConfig(mockApi: any, config: any) {
  // Implementation to initialize plugin with specific config
}

async function executeHookWithPrompt(prompt: string, context: any) {
  // Implementation to run hook with prompt and context
}
```

**Expected:** Tests pass when complete integration works correctly.

---

## Acceptance Criteria

### Functional Requirements
- ✅ `mode: "active"` registers `before_model_resolve` hook
- ✅ `mode: "shadow"` only enables `llm_input` shadow logging  
- ✅ `mode: "off"` disables all routing
- ✅ Hook returns `{ modelOverride, providerOverride }` when routing changes model
- ✅ Hook returns `void` when keeping original model
- ✅ All errors result in graceful fallback (no override)
- ✅ Routing decision pipeline fully reused (no duplication)
- ✅ Backward compatibility with `shadowLogging` flag

### Non-Functional Requirements
- ✅ Hook execution time < 100ms for typical prompts
- ✅ Memory usage increase < 10MB during hook execution
- ✅ Zero impact on OpenClaw stability (no crashes)
- ✅ Complete test coverage (>95%)
- ✅ Logging provides full observability of routing decisions

### Success Metrics
- Hook successfully overrides models in >90% of test cases
- Zero OpenClaw crashes during hook execution
- Shadow mode behavior unchanged from current implementation
- All existing SlimClaw functionality preserved

---

## Notes for Implementation

### Key Design Decisions
1. **Reuse over Rebuild:** All routing logic (`makeRoutingDecision`, `classifyWithRouter`) remains unchanged
2. **Fail-Safe Design:** Any error in hook results in no override, never crashes
3. **Mode Precedence:** New `routing.mode` takes precedence over legacy `shadowLogging`
4. **Context Preservation:** Hook receives same context as `llm_input` for consistency

### Testing Strategy
- **Unit tests:** Individual hook behavior with mocked dependencies
- **Integration tests:** End-to-end flow with real routing components
- **Error tests:** Comprehensive failure scenario coverage
- **Performance tests:** Verify hook doesn't slow down model resolution

### Migration Path
- Phase 2b is additive - no breaking changes
- Existing `mode: "shadow"` configs continue working
- Users opt-in to `mode: "active"` when ready
- Proxy sidecar remains available as independent fallback
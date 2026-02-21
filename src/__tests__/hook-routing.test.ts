import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import slimclawPlugin from '../index.js';
import { classifyWithRouter } from '../classifier/clawrouter-classifier.js';
import { makeRoutingDecision } from '../routing/index.js';
import type { Message } from '../classifier/classify.js';

// Mock the dependencies
vi.mock('../classifier/clawrouter-classifier.js');
vi.mock('../routing/index.js');

const mockClassifyWithRouter = vi.mocked(classifyWithRouter);
const mockMakeRoutingDecision = vi.mocked(makeRoutingDecision);

describe('Hook: before_model_resolve', () => {
  let mockApi: any;
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create mock API
    mockApi = {
      on: vi.fn(),
      logger: {
        info: vi.fn(),
        error: vi.fn(),
      },
      pluginConfig: {},
      registerProvider: vi.fn(),
      registerService: vi.fn(),
      registerCommand: vi.fn(),
      middleware: vi.fn(),
      optimizer: vi.fn(),
    };
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  test('active mode registers before_model_resolve hook', async () => {
    // Mock config with active routing mode
    mockApi.pluginConfig = {
      enabled: true,
      routing: {
        enabled: true,
        mode: 'active',
        tiers: {
          simple: 'haiku',
          complex: 'sonnet'
        }
      },
      proxy: {
        enabled: false // Disable proxy to focus on hooks
      }
    };

    // Initialize plugin
    await slimclawPlugin.register(mockApi);

    // Verify that api.on was called with before_model_resolve
    const beforeModelResolveCalls = mockApi.on.mock.calls.filter(
      call => call[0] === 'before_model_resolve'
    );
    
    expect(beforeModelResolveCalls).toHaveLength(1);
    expect(mockApi.logger.info).toHaveBeenCalledWith(
      '[SlimClaw] ✅ Active routing enabled via before_model_resolve hook'
    );
  });

  test('shadow mode does NOT register before_model_resolve hook', async () => {
    // Mock config with shadow routing mode
    mockApi.pluginConfig = {
      enabled: true,
      routing: {
        enabled: true,
        mode: 'shadow',
        tiers: {
          simple: 'haiku',
          complex: 'sonnet'
        }
      },
      proxy: {
        enabled: false
      }
    };

    // Initialize plugin
    await slimclawPlugin.register(mockApi);

    // Verify that api.on was NOT called with before_model_resolve
    const beforeModelResolveCalls = mockApi.on.mock.calls.filter(
      call => call[0] === 'before_model_resolve'
    );
    
    expect(beforeModelResolveCalls).toHaveLength(0);
  });

  test('disabled routing does NOT register before_model_resolve hook', async () => {
    // Mock config with disabled routing
    mockApi.pluginConfig = {
      enabled: true,
      routing: {
        enabled: false,
        mode: 'active'
      },
      proxy: {
        enabled: false
      }
    };

    // Initialize plugin
    await slimclawPlugin.register(mockApi);

    // Verify that api.on was NOT called with before_model_resolve
    const beforeModelResolveCalls = mockApi.on.mock.calls.filter(
      call => call[0] === 'before_model_resolve'
    );
    
    expect(beforeModelResolveCalls).toHaveLength(0);
  });

  test('hook returns override for different tier', async () => {
    // Mock config with active routing mode
    mockApi.pluginConfig = {
      enabled: true,
      routing: {
        enabled: true,
        mode: 'active',
        tiers: {
          simple: 'anthropic/haiku',
          complex: 'anthropic/sonnet'
        }
      },
      proxy: {
        enabled: false
      }
    };

    // Mock classifier to return complex tier
    mockClassifyWithRouter.mockReturnValue({
      tier: 'complex',
      confidence: 0.9,
      signals: ['length', 'technical']
    });

    // Mock routing decision
    mockMakeRoutingDecision.mockReturnValue({
      model: 'anthropic/sonnet',
      applied: true,
      shadow: {
        recommendedModel: 'anthropic/sonnet',
        recommendedProvider: {
          provider: 'anthropic',
          model: 'sonnet'
        }
      }
    });

    // Initialize plugin
    await slimclawPlugin.register(mockApi);

    // Extract the hook handler
    const beforeModelResolveCalls = mockApi.on.mock.calls.filter(
      call => call[0] === 'before_model_resolve'
    );
    expect(beforeModelResolveCalls).toHaveLength(1);
    
    const hookHandler = beforeModelResolveCalls[0][1];

    // Test the hook handler
    const event = { prompt: 'This is a complex technical question about machine learning algorithms' };
    const ctx = { agentId: 'test-agent', sessionKey: 'test-session' };

    const result = hookHandler(event, ctx);

    // Verify the result
    expect(result).toEqual({
      modelOverride: 'anthropic/sonnet',
      providerOverride: 'anthropic'
    });

    // Verify mocks were called correctly
    expect(mockClassifyWithRouter).toHaveBeenCalledWith(
      [{ role: 'user', content: event.prompt }],
      {
        simple: 'anthropic/haiku',
        complex: 'anthropic/sonnet'
      }
    );

    expect(mockMakeRoutingDecision).toHaveBeenCalledWith(
      { tier: 'complex', confidence: 0.9, signals: ['length', 'technical'] },
      expect.any(Object), // fullConfig
      {
        headers: {},
        agentId: ctx.agentId,
        sessionKey: ctx.sessionKey,
      },
      expect.stringMatching(/^active-\d+$/),
      expect.any(Object) // services
    );
  });

  test('hook returns void on error', async () => {
    // Mock config with active routing mode
    mockApi.pluginConfig = {
      enabled: true,
      routing: {
        enabled: true,
        mode: 'active',
        tiers: {
          simple: 'haiku'
        }
      },
      proxy: {
        enabled: false
      }
    };

    // Mock classifier to throw error
    mockClassifyWithRouter.mockImplementation(() => {
      throw new Error('Classification failed');
    });

    // Initialize plugin
    await slimclawPlugin.register(mockApi);

    // Extract the hook handler
    const beforeModelResolveCalls = mockApi.on.mock.calls.filter(
      call => call[0] === 'before_model_resolve'
    );
    const hookHandler = beforeModelResolveCalls[0][1];

    // Test the hook handler
    const event = { prompt: 'Test prompt' };
    const ctx = { agentId: 'test-agent', sessionKey: 'test-session' };

    const result = hookHandler(event, ctx);

    // Verify error handling
    expect(result).toBeUndefined();
    expect(mockApi.logger.info).toHaveBeenCalledWith(
      '[SlimClaw] before_model_resolve error: Classification failed'
    );
  });

  test('hook returns void for empty prompt', async () => {
    // Mock config with active routing mode
    mockApi.pluginConfig = {
      enabled: true,
      routing: {
        enabled: true,
        mode: 'active',
        tiers: {
          simple: 'haiku'
        }
      },
      proxy: {
        enabled: false
      }
    };

    // Initialize plugin
    await slimclawPlugin.register(mockApi);

    // Extract the hook handler
    const beforeModelResolveCalls = mockApi.on.mock.calls.filter(
      call => call[0] === 'before_model_resolve'
    );
    const hookHandler = beforeModelResolveCalls[0][1];

    // Test with empty prompt
    const event = { prompt: '' };
    const ctx = { agentId: 'test-agent', sessionKey: 'test-session' };

    const result = hookHandler(event, ctx);

    // Verify no processing happens
    expect(result).toBeUndefined();
    expect(mockClassifyWithRouter).not.toHaveBeenCalled();
    expect(mockMakeRoutingDecision).not.toHaveBeenCalled();
  });

  test('hook returns void when routing not applied', async () => {
    // Mock config with active routing mode
    mockApi.pluginConfig = {
      enabled: true,
      routing: {
        enabled: true,
        mode: 'active',
        tiers: {
          simple: 'haiku'
        }
      },
      proxy: {
        enabled: false
      }
    };

    // Mock classifier
    mockClassifyWithRouter.mockReturnValue({
      tier: 'simple',
      confidence: 0.5,
      signals: []
    });

    // Mock routing decision with applied: false
    mockMakeRoutingDecision.mockReturnValue({
      model: 'haiku',
      applied: false,
      shadow: null
    });

    // Initialize plugin
    await slimclawPlugin.register(mockApi);

    // Extract the hook handler
    const beforeModelResolveCalls = mockApi.on.mock.calls.filter(
      call => call[0] === 'before_model_resolve'
    );
    const hookHandler = beforeModelResolveCalls[0][1];

    // Test the hook handler
    const event = { prompt: 'Simple question' };
    const ctx = { agentId: 'test-agent', sessionKey: 'test-session' };

    const result = hookHandler(event, ctx);

    // Verify no override is returned
    expect(result).toBeUndefined();
  });

  test('hook extracts provider from model prefix when shadow provider missing', async () => {
    // Mock config with active routing mode
    mockApi.pluginConfig = {
      enabled: true,
      routing: {
        enabled: true,
        mode: 'active',
        tiers: {
          complex: 'openrouter/anthropic/sonnet'
        }
      },
      proxy: {
        enabled: false
      }
    };

    // Mock classifier
    mockClassifyWithRouter.mockReturnValue({
      tier: 'complex',
      confidence: 0.9,
      signals: ['technical']
    });

    // Mock routing decision with shadow but no provider info
    mockMakeRoutingDecision.mockReturnValue({
      model: 'openrouter/anthropic/sonnet',
      applied: true,
      shadow: {
        recommendedModel: 'openrouter/anthropic/sonnet',
        recommendedProvider: null // No provider info
      }
    });

    // Initialize plugin
    await slimclawPlugin.register(mockApi);

    // Extract the hook handler
    const beforeModelResolveCalls = mockApi.on.mock.calls.filter(
      call => call[0] === 'before_model_resolve'
    );
    const hookHandler = beforeModelResolveCalls[0][1];

    // Test the hook handler
    const event = { prompt: 'Complex technical question' };
    const ctx = { agentId: 'test-agent', sessionKey: 'test-session' };

    const result = hookHandler(event, ctx);

    // Verify provider is extracted from model prefix
    expect(result).toEqual({
      modelOverride: 'openrouter/anthropic/sonnet',
      providerOverride: 'openrouter'
    });
  });

  test('hook works without provider override when extraction fails', async () => {
    // Mock config with active routing mode
    mockApi.pluginConfig = {
      enabled: true,
      routing: {
        enabled: true,
        mode: 'active',
        tiers: {
          simple: 'haiku' // No slash, can't extract provider
        }
      },
      proxy: {
        enabled: false
      }
    };

    // Mock classifier
    mockClassifyWithRouter.mockReturnValue({
      tier: 'simple',
      confidence: 0.8,
      signals: []
    });

    // Mock routing decision
    mockMakeRoutingDecision.mockReturnValue({
      model: 'haiku',
      applied: true,
      shadow: {
        recommendedModel: 'haiku',
        recommendedProvider: null
      }
    });

    // Initialize plugin
    await slimclawPlugin.register(mockApi);

    // Extract the hook handler
    const beforeModelResolveCalls = mockApi.on.mock.calls.filter(
      call => call[0] === 'before_model_resolve'
    );
    const hookHandler = beforeModelResolveCalls[0][1];

    // Test the hook handler
    const event = { prompt: 'Simple question' };
    const ctx = { agentId: 'test-agent', sessionKey: 'test-session' };

    const result = hookHandler(event, ctx);

    // Verify model override is returned (provider extraction still works even without slash)
    expect(result).toEqual({
      modelOverride: 'haiku',
      providerOverride: 'haiku'
    });
  });
});
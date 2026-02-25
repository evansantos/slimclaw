// Create src/provider/__tests__/slimclaw-provider.test.ts
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { 
  createSlimClawProvider,
  createSidecarRequestHandler,
  type SlimClawProviderConfig,
  type SidecarRequestHandler 
} from '../slimclaw-provider.js';
import type { ClassificationResult } from '../../classifier/index.js';
import type { SlimClawConfig } from '../../config.js';
import { classifyWithRouter } from '../../classifier/index.js';

// Mock dependencies
vi.mock('../virtual-models.js', () => ({
  getVirtualModelDefinitions: vi.fn((config) => {
    if (config?.auto?.enabled === false) {
      return [];
    }
    return [{
      id: 'slimclaw/auto',
      name: 'SlimClaw Auto Router',
      api: 'openai-completions',
      reasoning: true,
      input: ['text', 'image'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200000,
      maxTokens: 16384
    }];
  }),
  parseVirtualModelId: vi.fn((modelId) => {
    if (modelId === 'slimclaw/auto') {
      return { 
        provider: 'slimclaw', 
        modelName: 'auto', 
        isVirtual: true 
      };
    }
    return {
      provider: 'anthropic',
      modelName: 'claude-sonnet-4-20250514',
      isVirtual: false
    };
  })
}));

vi.mock('../request-forwarder.js', () => {
  const mockForwardRequest = vi.fn().mockResolvedValue(
    new Response('{"id":"test"}', { status: 200 })
  );
  
  return {
    RequestForwarder: vi.fn(function() {
      return {
        forwardRequest: mockForwardRequest
      };
    })
  };
});

vi.mock('../../classifier/index.js', () => ({
  classifyWithRouter: vi.fn(() => ({
    tier: 'simple',
    confidence: 0.8,
    reason: 'Simple request',
    scores: { simple: 0.8, mid: 0.1, complex: 0.1, reasoning: 0 },
    signals: ['short-prompt']
  }))
}));

vi.mock('../../routing/index.js', () => ({
  makeRoutingDecision: vi.fn(() => ({
    model: 'anthropic/claude-3-haiku-20240307',
    provider: 'openrouter',
    headers: { 'X-Title': 'SlimClaw' },
    thinking: null,
    applied: true,
    shadow: {
      recommendedModel: 'anthropic/claude-3-haiku-20240307',
      recommendedProvider: { provider: 'openrouter' },
      wouldApply: true
    }
  }))
}));

describe('SlimClaw Provider Plugin', () => {
  let config: SlimClawProviderConfig;

  beforeEach(() => {
    config = {
      port: 3334,
      virtualModels: {
        auto: { enabled: true }
      },
      providerCredentials: new Map([
        ['openrouter', {
          baseUrl: 'https://openrouter.ai/api',
          apiKey: 'test-key'
        }]
      ]),
      slimclawConfig: {
        enabled: true,
        mode: 'active',
        routing: {
          enabled: true,
          tiers: {
            simple: 'anthropic/claude-3-haiku-20240307'
          }
        }
      } as SlimClawConfig,
      timeout: 30000,
      services: {}
    };
  });

  describe('createSlimClawProvider', () => {
    test('should create valid provider plugin definition', () => {
      const provider = createSlimClawProvider(config);

      expect(provider.id).toBe('slimclaw');
      expect(provider.label).toBe('SlimClaw Router');
      expect(provider.aliases).toEqual(['sc']);
      expect(provider.envVars).toEqual([]);
      expect(provider.models).toBeDefined();
      expect(provider.models.baseUrl).toBe('http://localhost:3334/v1');
      expect(provider.models.api).toBe('openai-completions');
      expect(provider.models.models).toHaveLength(1);
      expect(provider.models.models[0].id).toBe('slimclaw/auto');
    });

    test('should have auth configuration for proxy mode', () => {
      const provider = createSlimClawProvider(config);

      expect(provider.auth).toHaveLength(1);
      expect(provider.auth[0].id).toBe('none');
      expect(provider.auth[0].label).toBe('No authentication needed (proxy)');
      expect(provider.auth[0].kind).toBe('custom');
    });

    test('should filter models based on config', () => {
      const configWithDisabledModels = {
        ...config,
        virtualModels: {
          auto: { enabled: false }
        }
      };

      const provider = createSlimClawProvider(configWithDisabledModels);
      expect(provider.models.models).toHaveLength(0);
    });
  });

  describe('createSidecarRequestHandler', () => {
    test('should create handler that processes routing pipeline', async () => {
      const handler = createSidecarRequestHandler(config);

      const request = {
        method: 'POST',
        url: '/v1/chat/completions',
        headers: { 'content-type': 'application/json' },
        body: {
          model: 'slimclaw/auto',
          messages: [{ role: 'user', content: 'Hello world' }]
        }
      };

      const response = await handler(request);
      
      expect(response.status).toBe(200);
      // Verify routing pipeline was called (mocks should have been invoked)
    });

    test('should handle non-virtual models gracefully', async () => {
      const handler = createSidecarRequestHandler(config);

      const request = {
        method: 'POST',
        url: '/v1/chat/completions',
        headers: { 'content-type': 'application/json' },
        body: {
          model: 'anthropic/claude-sonnet-4-20250514', // Non-virtual model
          messages: [{ role: 'user', content: 'Hello world' }]
        }
      };

      const response = await handler(request);
      expect(response.status).toBe(500);
      
      const errorBody = await response.json();
      expect(errorBody.error).toMatch(/virtual model/i);
    });

    test('should handle classification errors gracefully', async () => {
      // Temporarily override the mock for this test
      const mockClassifyWithRouter = vi.mocked(classifyWithRouter);
      mockClassifyWithRouter.mockImplementationOnce(() => { throw new Error('Classification failed'); });

      const handler = createSidecarRequestHandler(config);

      const request = {
        method: 'POST',
        url: '/v1/chat/completions',
        headers: { 'content-type': 'application/json' },
        body: {
          model: 'slimclaw/auto',
          messages: [{ role: 'user', content: 'Hello world' }]
        }
      };

      const response = await handler(request);
      expect(response.status).toBe(500);
      
      const errorBody = await response.json();
      expect(errorBody.error).toMatch(/Classification failed/);
    });
  });
});
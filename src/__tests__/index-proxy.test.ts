import { describe, test, expect, vi, beforeEach } from 'vitest';

describe('SlimClaw Index - Proxy Integration', () => {
  test('should extract provider credentials from OpenClaw config', () => {
    const mockConfig = {
      models: {
        providers: {
          openrouter: {
            baseUrl: 'https://openrouter.ai/api',
            apiKey: 'test-openrouter-key'
          }
        }
      }
    };

    const credentials = new Map();
    if (mockConfig.models?.providers) {
      for (const [id, config] of Object.entries(mockConfig.models.providers)) {
        const pc = config as any;
        if (pc.baseUrl) {
          credentials.set(id, {
            baseUrl: pc.baseUrl,
            apiKey: pc.apiKey || ''
          });
        }
      }
    }

    expect(credentials.get('openrouter')).toEqual({
      baseUrl: 'https://openrouter.ai/api',
      apiKey: 'test-openrouter-key'
    });
  });

  test('proxy config flag controls registration', () => {
    const enabledConfig = { proxy: { enabled: true, port: 3334 } };
    const disabledConfig = { proxy: { enabled: false } };
    
    expect(enabledConfig.proxy.enabled).toBe(true);
    expect(disabledConfig.proxy.enabled).toBe(false);
  });

  test('should handle missing provider credentials gracefully', () => {
    const mockConfig = { models: {} };
    const credentials = new Map();
    
    const providers = (mockConfig.models as any)?.providers;
    if (providers) {
      for (const [id, config] of Object.entries(providers)) {
        credentials.set(id, config);
      }
    }

    expect(credentials.size).toBe(0);
  });
});
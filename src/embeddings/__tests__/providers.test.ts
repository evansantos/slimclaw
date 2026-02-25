import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnthropicProvider } from '../providers/anthropic-provider.js';
import { OpenRouterProvider } from '../providers/openrouter-provider.js';

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    provider = new AnthropicProvider('test-api-key');
  });

  it('should create embeddings request with correct format', async () => {
    // Mock fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        embedding: [0.1, 0.2, 0.3],
      }),
    });

    const result = await provider.embed('Hello world', 'claude-3-5-sonnet-20241022');

    expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
    expect(result.model).toBe('claude-3-5-sonnet-20241022');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'test-api-key',
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
        }),
        body: expect.stringContaining('"input":"Hello world"'),
      }),
    );
  });

  it('should handle API errors', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
    });

    await expect(provider.embed('Test', 'claude-3-5-sonnet-20241022')).rejects.toThrow(
      'Anthropic API error: 400 Bad Request',
    );
  });

  it('should calculate cost based on model pricing', () => {
    const cost = provider.calculateCost(1000, 'claude-3-5-sonnet-20241022');
    expect(cost).toBeGreaterThan(0);
  });
});

describe('OpenRouterProvider', () => {
  let provider: OpenRouterProvider;

  beforeEach(() => {
    provider = new OpenRouterProvider('test-api-key');
  });

  it('should create embeddings request with correct format for OpenAI models', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            embedding: [0.1, 0.2, 0.3],
          },
        ],
      }),
    });

    const result = await provider.embed('Hello world', 'openai/text-embedding-3-small');

    expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
    expect(result.model).toBe('openai/text-embedding-3-small');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-api-key',
          'Content-Type': 'application/json',
        }),
        body: expect.stringContaining('"input":"Hello world"'),
      }),
    );
  });

  it('should handle Cohere models with search_document input type', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            embedding: [0.1, 0.2, 0.3],
          },
        ],
      }),
    });

    await provider.embed('Hello world', 'cohere/cohere-embed-english-v3.0');

    const callArgs = (global.fetch as any).mock.calls[0][1];
    const body = JSON.parse(callArgs.body);

    expect(body.input_type).toBe('search_document');
  });

  it('should handle API errors', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    await expect(provider.embed('Test', 'openai/text-embedding-3-small')).rejects.toThrow(
      'OpenRouter API error: 401 Unauthorized',
    );
  });

  it('should calculate cost based on model pricing', () => {
    const smallCost = provider.calculateCost(1000000, 'openai/text-embedding-3-small');
    const largeCost = provider.calculateCost(1000000, 'openai/text-embedding-3-large');

    expect(smallCost).toBeCloseTo(0.02, 5);
    expect(largeCost).toBeCloseTo(0.13, 5);
  });

  it('should return 0 cost for unknown models', () => {
    const cost = provider.calculateCost(1000000, 'unknown/model');
    expect(cost).toBe(0);
  });
});

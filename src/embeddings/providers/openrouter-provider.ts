import type { EmbeddingProvider, EmbeddingResult } from './index.js';

/**
 * OpenRouter embeddings provider (supports OpenAI, Cohere, etc.)
 */
export class OpenRouterProvider implements EmbeddingProvider {
  private apiKey: string;
  private baseUrl = 'https://openrouter.ai/api/v1/embeddings';

  // Pricing per 1M tokens
  private readonly PRICING: Record<string, number> = {
    'openai/text-embedding-3-small': 0.02,
    'openai/text-embedding-3-large': 0.13,
    'cohere/cohere-embed-english-v3.0': 0.1, // Approximate
  };

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Generate embedding using OpenRouter API
   *
   * @param text - Input text
   * @param model - Model identifier
   * @returns Embedding result
   */
  async embed(text: string, model: string): Promise<EmbeddingResult> {
    const body: Record<string, unknown> = {
      input: text,
      model,
    };

    // Cohere models require input_type parameter
    if (model.startsWith('cohere/')) {
      body.input_type = 'search_document';
    }

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { data: Array<{ embedding: number[] }> };

    return {
      embedding: data.data[0].embedding,
      model,
    };
  }

  /**
   * Calculate cost for OpenRouter embeddings
   *
   * @param tokens - Number of tokens
   * @param model - Model identifier
   * @returns Cost in dollars
   */
  calculateCost(tokens: number, model: string): number {
    const pricePerMillion = this.PRICING[model];
    if (!pricePerMillion) {
      return 0; // Unknown model
    }
    return (tokens / 1_000_000) * pricePerMillion;
  }
}

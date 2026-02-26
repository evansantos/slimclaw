import type { EmbeddingProvider, EmbeddingResult } from './index.js';

/**
 * Anthropic embeddings provider (beta API)
 */
export class AnthropicProvider implements EmbeddingProvider {
  private apiKey: string;
  private baseUrl = 'https://api.anthropic.com/v1/embeddings';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Generate embedding using Anthropic API
   *
   * Note: Anthropic embeddings API is in beta. The request format (input + model)
   * follows standard embeddings API conventions. If the API evolves, this may need updates.
   *
   * @param text - Input text
   * @param model - Model identifier
   * @returns Embedding result
   */
  async embed(text: string, model: string): Promise<EmbeddingResult> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        input: text,
        model, // Model parameter follows standard embeddings API pattern
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { embedding: number[] };

    return {
      embedding: data.embedding,
      model,
    };
  }

  /**
   * Calculate cost for Anthropic embeddings
   *
   * PLACEHOLDER: Anthropic embeddings pricing
   * TODO: Update with official pricing from https://www.anthropic.com/pricing once available
   * Current approximation: ~$0.10 per 1M tokens (assuming similar to OpenAI)
   * Users can override via configuration if actual pricing differs
   *
   * @param tokens - Number of tokens
   * @param model - Model identifier
   * @returns Cost in dollars
   */
  calculateCost(tokens: number): number {
    // PLACEHOLDER pricing - update when official rates are published
    return (tokens / 1_000_000) * 0.1;
  }
}

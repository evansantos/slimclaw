/**
 * Result from an embedding provider
 */
export interface EmbeddingResult {
  embedding: number[];
  model: string;
}

/**
 * Base interface for embedding providers
 */
export interface EmbeddingProvider {
  /**
   * Generate an embedding for the given text
   *
   * @param text - Input text
   * @param model - Model identifier
   * @returns Embedding result
   */
  embed(text: string, model: string): Promise<EmbeddingResult>;

  /**
   * Calculate cost for embedding generation
   *
   * @param tokens - Number of tokens
   * @param model - Model identifier
   * @returns Cost in dollars
   */
  calculateCost(tokens: number, model: string): number;
}

export { AnthropicProvider } from './anthropic-provider.js';
export { OpenRouterProvider } from './openrouter-provider.js';

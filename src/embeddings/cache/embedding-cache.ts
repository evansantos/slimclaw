import type { CachedEmbedding, CacheConfig } from '../config/types.js';
import { createHash } from 'crypto';

/**
 * In-memory cache for embeddings with TTL and size limits
 */
export class EmbeddingCache {
  private cache: Map<string, CachedEmbedding> = new Map();
  private config: CacheConfig;

  constructor(config: CacheConfig) {
    this.config = config;
  }

  /**
   * Generate a deterministic cache key from text and model
   *
   * @param text - Input text
   * @param model - Model identifier
   * @returns Cache key (hash)
   */
  static generateKey(text: string, model: string): string {
    const hash = createHash('sha256');
    hash.update(`${text}::${model}`);
    return hash.digest('hex');
  }

  /**
   * Store an embedding in the cache
   *
   * @param key - Cache key
   * @param embedding - Cached embedding data
   */
  set(key: string, embedding: CachedEmbedding): void {
    if (!this.config.enabled) {
      return;
    }

    // Evict oldest entry if at max size
    if (this.cache.size >= this.config.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, embedding);
  }

  /**
   * Retrieve an embedding from the cache
   *
   * @param key - Cache key
   * @returns Cached embedding or undefined if not found/expired
   */
  get(key: string): CachedEmbedding | undefined {
    if (!this.config.enabled) {
      return undefined;
    }

    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    // Check TTL
    const age = Date.now() - entry.timestamp;
    if (age > this.config.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }

    return entry;
  }

  /**
   * Clear all cached embeddings
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get current cache size
   *
   * @returns Number of cached entries
   */
  size(): number {
    return this.cache.size;
  }
}

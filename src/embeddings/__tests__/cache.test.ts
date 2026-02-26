import { describe, it, expect, beforeEach } from 'vitest';
import { EmbeddingCache } from '../cache/embedding-cache.js';
import type { CachedEmbedding } from '../config/types.js';

describe('EmbeddingCache', () => {
  let cache: EmbeddingCache;

  beforeEach(() => {
    cache = new EmbeddingCache({ enabled: true, ttlMs: 1000, maxSize: 3 });
  });

  it('should store and retrieve embeddings', () => {
    const embedding: CachedEmbedding = {
      embedding: [0.1, 0.2, 0.3],
      model: 'test-model',
      timestamp: Date.now(),
      tier: 'simple',
    };

    cache.set('test-key', embedding);
    const retrieved = cache.get('test-key');

    expect(retrieved).toEqual(embedding);
  });

  it('should return undefined for missing keys', () => {
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('should respect TTL and expire old entries', async () => {
    const embedding: CachedEmbedding = {
      embedding: [0.1, 0.2],
      model: 'test-model',
      timestamp: Date.now() - 2000, // 2 seconds ago
      tier: 'simple',
    };

    cache.set('old-key', embedding);

    // Should be expired (TTL is 1000ms, entry is 2000ms old)
    expect(cache.get('old-key')).toBeUndefined();
  });

  it('should not expire entries within TTL', () => {
    const embedding: CachedEmbedding = {
      embedding: [0.1, 0.2],
      model: 'test-model',
      timestamp: Date.now() - 500, // 500ms ago
      tier: 'simple',
    };

    cache.set('recent-key', embedding);

    // Should still be valid (TTL is 1000ms, entry is 500ms old)
    expect(cache.get('recent-key')).toEqual(embedding);
  });

  it('should respect maxSize and evict oldest entries', () => {
    const emb1: CachedEmbedding = {
      embedding: [1],
      model: 'm1',
      timestamp: Date.now(),
      tier: 'simple',
    };
    const emb2: CachedEmbedding = {
      embedding: [2],
      model: 'm2',
      timestamp: Date.now(),
      tier: 'simple',
    };
    const emb3: CachedEmbedding = {
      embedding: [3],
      model: 'm3',
      timestamp: Date.now(),
      tier: 'simple',
    };
    const emb4: CachedEmbedding = {
      embedding: [4],
      model: 'm4',
      timestamp: Date.now(),
      tier: 'simple',
    };

    cache.set('key1', emb1);
    cache.set('key2', emb2);
    cache.set('key3', emb3);

    // maxSize is 3, so all should be present
    expect(cache.get('key1')).toEqual(emb1);
    expect(cache.get('key2')).toEqual(emb2);
    expect(cache.get('key3')).toEqual(emb3);

    // Adding 4th should evict oldest (key1)
    cache.set('key4', emb4);
    expect(cache.get('key1')).toBeUndefined();
    expect(cache.get('key2')).toEqual(emb2);
    expect(cache.get('key3')).toEqual(emb3);
    expect(cache.get('key4')).toEqual(emb4);
  });

  it('should generate cache keys from text and model', () => {
    const key1 = EmbeddingCache.generateKey('hello', 'model-a');
    const key2 = EmbeddingCache.generateKey('hello', 'model-b');
    const key3 = EmbeddingCache.generateKey('world', 'model-a');

    expect(key1).not.toBe(key2); // Different models
    expect(key1).not.toBe(key3); // Different text
    expect(typeof key1).toBe('string');
    expect(key1.length).toBeGreaterThan(0);
  });

  it('should generate consistent keys for same input', () => {
    const key1 = EmbeddingCache.generateKey('test', 'model');
    const key2 = EmbeddingCache.generateKey('test', 'model');
    expect(key1).toBe(key2);
  });

  it('should clear all entries', () => {
    cache.set('key1', { embedding: [1], model: 'm', timestamp: Date.now(), tier: 'simple' });
    cache.set('key2', { embedding: [2], model: 'm', timestamp: Date.now(), tier: 'simple' });

    expect(cache.size()).toBe(2);

    cache.clear();

    expect(cache.size()).toBe(0);
    expect(cache.get('key1')).toBeUndefined();
    expect(cache.get('key2')).toBeUndefined();
  });

  it('should return correct size', () => {
    expect(cache.size()).toBe(0);

    cache.set('key1', { embedding: [1], model: 'm', timestamp: Date.now(), tier: 'simple' });
    expect(cache.size()).toBe(1);

    cache.set('key2', { embedding: [2], model: 'm', timestamp: Date.now(), tier: 'simple' });
    expect(cache.size()).toBe(2);
  });

  it('should handle disabled cache', () => {
    const disabledCache = new EmbeddingCache({ enabled: false, ttlMs: 1000, maxSize: 100 });

    disabledCache.set('key', { embedding: [1], model: 'm', timestamp: Date.now(), tier: 'simple' });

    // Should not store when disabled
    expect(disabledCache.get('key')).toBeUndefined();
    expect(disabledCache.size()).toBe(0);
  });
});

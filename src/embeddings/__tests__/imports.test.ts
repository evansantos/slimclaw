import { describe, it, expect } from 'vitest';

describe('Module Imports', () => {
  it('should export EmbeddingRouter with correct .js extensions', async () => {
    const mod = await import('../index.js');
    expect(mod.EmbeddingRouter).toBeDefined();
    expect(mod.EmbeddingCache).toBeDefined();
    expect(mod.EmbeddingMetricsTracker).toBeDefined();
  });
});

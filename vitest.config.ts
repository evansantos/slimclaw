import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: [
        'node_modules',
        'dist',
        '**/__tests__/**',
        '**/*.test.ts',
        '**/*.config.*',
      ],
    },
    // Test timeout for potential LLM calls (not used in MVP but good to have)
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});
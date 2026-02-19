import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/**/__tests__/*.test.ts',
    ],
    exclude: [
      '**/node_modules/**',
      'src/__tests__/performance/**',
      'src/__tests__/integration/**',
      'src/__tests__/config.test.ts',
      'src/windowing/__tests__/**',
      'src/middleware/__tests__/**',
      'tests/**',
    ],
    testTimeout: 10000,
  },
});

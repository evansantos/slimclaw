import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/classifier/__tests__/*.test.ts',
      'src/dashboard/__tests__/*.test.ts',
      'src/logging/__tests__/*.test.ts',
      'src/routing/__tests__/*.test.ts',
    ],
    testTimeout: 10000,
  },
});

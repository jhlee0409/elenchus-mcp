import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Only run unit tests by default, integration tests require build first
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/integration/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts']
    },
    testTimeout: 10000
  }
});

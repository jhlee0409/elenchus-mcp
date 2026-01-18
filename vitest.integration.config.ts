import { defineConfig } from 'vitest/config';

/**
 * Integration test configuration
 * These tests import from compiled dist/ and test the full MCP tool flow
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 60000, // Integration tests may take longer
    sequence: {
      shuffle: false // Run in order for session lifecycle tests
    }
  }
});

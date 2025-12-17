import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 60000, // 1 minute for tests
    hookTimeout: 60000, // 1 minute for hooks
    teardownTimeout: 30000, // 30 seconds for teardown
    isolation: true,
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true, // Run tests sequentially to share testcontainer
        isolate: false, // Share testcontainer across tests
      },
    },
    // Global setup runs ONCE before all tests to start testcontainer
    globalSetup: './src/__tests__/globalSetup.ts',
    globalTeardown: './src/__tests__/globalTeardown.ts',
    deps: {
      optimizer: {
        ssr: {
          exclude: ['testcontainers', '@testcontainers/postgresql'],
        },
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov', 'text-summary'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/__tests__/**',
        '**/tests/**',
        'src/__tests__/**',
      ],
      lines: 80,
      functions: 80,
      branches: 75,
      statements: 80,
      all: true,
      checkCoverage: true,
      skipFull: false,
    },
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.{test,spec}.ts', 'src/__tests__/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    // Retry flaky tests once
    retry: 1,
    // Fail fast on first error in CI
    bail: process.env.CI ? 1 : 0,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tests': path.resolve(__dirname, './src/__tests__'),
      '@fixtures': path.resolve(__dirname, './src/__tests__/fixtures'),
      '@utils': path.resolve(__dirname, './src/__tests__/utils'),
    },
  },
});

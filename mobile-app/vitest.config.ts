import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx', '**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules', 'ios', 'android', 'dist', 'api/generated'],
    coverage: { provider: 'v8', reporter: ['text', 'lcov'] },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});

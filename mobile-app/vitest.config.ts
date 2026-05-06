import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx', '**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules', 'ios', 'android', 'dist', 'api/generated', '__tests__/setup-rn.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'lcov'] },
    setupFiles: ['./__tests__/setup-rn.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});

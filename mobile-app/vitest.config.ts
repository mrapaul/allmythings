import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environmentMatchGlobs: [['**/*.test.tsx', 'jsdom']],
    environment: 'node',
    globals: false,
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx', '**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules', 'ios', 'android', 'dist', 'api/generated', '__tests__/setup-rn.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'lcov'] },
    setupFiles: ['./__tests__/setup-rn.ts'],
    server: {
      deps: {
        inline: [/@testing-library\/react-native/, /react-test-renderer/],
      },
    },
    deps: {
      optimizer: {
        web: {
          include: ['@testing-library/react-native', 'react-test-renderer', 'pretty-format'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'react-native': path.resolve(__dirname, './__tests__/stubs/react-native.ts'),
    },
  },
});

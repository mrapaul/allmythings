module.exports = {
  displayName: 'E2E Tests',
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  collectCoverageFrom: [
    '**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/__tests__/**',
  ],
  moduleFileExtensions: ['ts', 'js', 'json'],
  globals: {
    'ts-jest': {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
    },
  },
  testTimeout: 60000, // 60 seconds for E2E tests
  verbose: true,
  bail: false, // Continue running tests even if one fails
};

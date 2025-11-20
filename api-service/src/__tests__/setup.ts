/**
 * Test setup file - runs before all tests
 * Configures global test environment and mocks
 */

import { beforeAll, afterAll, afterEach, vi } from 'vitest';
import { closeDatabase, getDatabase } from '../db/database';

/**
 * Global test setup
 */
beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';

  // Suppress logging during tests
  vi.stubGlobal('console', {
    log: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  });
});

/**
 * Global cleanup after all tests
 */
afterAll(async () => {
  // Close database connections
  try {
    await closeDatabase();
  } catch (error) {
    // Ignore errors during cleanup
  }

  // Restore console
  vi.unstubAllGlobals();
});

/**
 * Cleanup after each test
 */
afterEach(() => {
  vi.clearAllMocks();
});

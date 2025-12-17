/**
 * Global test teardown - runs ONCE after all test files
 * Stops the testcontainer
 */

// Use eval('require') to bypass Vitest's module graph for testcontainers,
// which has issues with SSR transformations.
const { Pool } = eval('require')('pg');
import type { StartedPostgreSqlContainer } from 'testcontainers'; // Import only for type

export default async function globalTeardown(): Promise<void> {
  console.log('\n🐳 Stopping PostgreSQL testcontainer...\n');

  try {
    const container: StartedPostgreSqlContainer | undefined = globalThis.__TEST_DB_CONTAINER__;
    const pool: Pool | undefined = globalThis.__TEST_DB_POOL__;

    if (pool) {
      await pool.end();
      console.log('✅ PostgreSQL test pool ended.');
    }

    if (container) {
      await container.stop();
      console.log('✅ PostgreSQL testcontainer stopped.');
    } else {
      console.log('⚠️ PostgreSQL testcontainer was not started or container reference not found.\n');
    }
  } catch (error) {
    console.error('❌ Failed to stop PostgreSQL testcontainer:', error);
  }

  // Clean up globals
  globalThis.__TEST_DB_CONTAINER__ = undefined;
  globalThis.__TEST_DB_POOL__ = undefined;
}

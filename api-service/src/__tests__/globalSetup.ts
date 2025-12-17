/**
 * Global test setup - runs ONCE before all test files
 * Starts testcontainer for PostgreSQL
 */

// Use eval('require') to bypass Vitest's module graph for testcontainers,
// which has issues with SSR transformations.
const { PostgreSqlContainer, Wait } = eval('require')('testcontainers');
const { Pool } = eval('require')('pg');

import { applySchema, ContainerConfig } from './utils/testcontainers-setup';
import type { StartedPostgreSqlContainer } from 'testcontainers'; // Import only for type

// Extend global namespace to include our test container services
declare global {
  // eslint-disable-next-line no-var
  var __TEST_DB_CONTAINER__: StartedPostgreSqlContainer | undefined;
  // eslint-disable-next-line no-var
  var __TEST_DB_POOL__: Pool | undefined;
  // eslint-disable-next-line no-var
  var __INTEGRATION_TESTS_ENABLED__: boolean;
}

export default async function globalSetup(): Promise<void> {
  console.log('\n🐳 Starting PostgreSQL testcontainer for integration tests...\n');

  try {
    // Start PostgreSQL container
    const container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('test_db')
      .withUsername('test_user')
      .withPassword('test_password')
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/i))
      .start();

    const config: ContainerConfig = {
      host: container.getHost(),
      port: container.getPort(),
      database: container.getDatabase(),
      user: container.getUsername(),
      password: container.getPassword(),
    };

    console.log(`✅ PostgreSQL testcontainer started at ${config.host}:${config.port}`);

    // Create pool for schema setup
    const pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      max: 5,
    });

    // Apply schema
    await applySchema(pool);
    console.log('✅ Initial schema applied to test database.\n');

    // Store container and pool globally for tests and teardown to access
    globalThis.__TEST_DB_CONTAINER__ = container;
    globalThis.__TEST_DB_POOL__ = pool;
    globalThis.__INTEGRATION_TESTS_ENABLED__ = true;

    // Set environment variables so the app uses the testcontainer
    process.env.DB_HOST = config.host;
    process.env.DB_PORT = String(config.port);
    process.env.DB_NAME = config.database;
    process.env.DB_USER = config.user;
    process.env.DB_PASSWORD = config.password;
    process.env.DB_SSL = 'false';

  } catch (error) {
    console.error('❌ Failed to start PostgreSQL testcontainer:', error);
    globalThis.__TEST_DB_CONTAINER__ = undefined;
    globalThis.__TEST_DB_POOL__ = undefined;
    globalThis.__INTEGRATION_TESTS_ENABLED__ = false;
    // Don't rethrow, just log and let tests skip if DB is unavailable
  }
}

/**
 * Test database utilities with Testcontainers support
 * Provides database seeding, cleanup, and transaction management for tests
 */

import { Database, getDatabase, initDatabase, closeDatabase } from '../../db/database';
import {
  getTestPool,
  clearTestData,
  createTestUser,
  isContainerRunning,
  type ContainerConfig,
} from './testcontainers-setup';

// Declare global types for testcontainer config
declare global {
  // eslint-disable-next-line no-var
  var __INTEGRATION_TESTS_ENABLED__: boolean | undefined;
}

/**
 * Check if database is available for tests
 * Uses the global flag set by globalSetup.ts
 */
export async function isDatabaseAvailable(): Promise<boolean> {
  // Check if testcontainer was started by globalSetup
  if (globalThis.__INTEGRATION_TESTS_ENABLED__) {
    return true;
  }

  // Fallback: try to connect to external database (e.g., if testcontainers failed)
  try {
    await initDatabase();
    const db = getDatabase();
    const healthy = await db.healthCheck();
    return healthy;
  } catch (error) {
    return false;
  }
}

/**
 * Check if using testcontainer
 */
export function isUsingTestcontainer(): boolean {
  return globalThis.__INTEGRATION_TESTS_ENABLED__ === true && globalThis.__TEST_DB_POOL__ !== undefined;
}

/**
 * Clear all tables in test database
 */
export async function clearDatabase(): Promise<void> {
  if (isUsingTestcontainer()) {
    // If using testcontainer, use the testcontainers-setup clearTestData which uses the pooled connection
    // directly, bypassing the app's database connection
    await clearTestData(globalThis.__TEST_DB_POOL__!);
    return;
  }

  try {
    const db = getDatabase();
    // Disable foreign key constraints temporarily
    await db.query('SET session_replication_role = replica');

    // Delete from all tables in order
    await db.query('DELETE FROM labels');
    await db.query('DELETE FROM inventory_items');
    await db.query('DELETE FROM sync_metadata');
    await db.query('DELETE FROM users');

    // Re-enable foreign key constraints
    await db.query('SET session_replication_role = default');
  } catch (error) {
    // Table may not exist in test environment
    console.error('Error clearing database:', error);
  }
}

/**
 * Seed test data into database
 */
export async function seedTestData(): Promise<{
  userIds: string[];
  itemIds: string[];
  labelIds: string[];
}> {
  const userIds: string[] = [];
  const itemIds: string[] = [];
  const labelIds: string[] = [];

  try {
    if (isUsingTestcontainer()) {
      const pool = globalThis.__TEST_DB_POOL__!;
      const userId = await createTestUser(pool, 'seed-test@example.com');
      userIds.push(userId);

      // Create test inventory item
      const itemResult = await pool.query(
        `INSERT INTO inventory_items (user_id, photo_s3_key, thumbnail_s3_key, detection_data)
         VALUES ($1, 'test/photo.jpg', 'test/thumb.jpg', $2)
         RETURNING id`,
        [
          userId,
          JSON.stringify({
            success: true,
            ensembleMode: 'single',
            processingTimeMs: 100,
            detections: [],
            providerResults: [],
            ensembleMetrics: { providersUsed: 1, averageConfidence: 0.85, consensusRate: 1.0 },
          }),
        ]
      );
      itemIds.push(itemResult.rows[0].id);

      // Create test labels
      const labelResult = await pool.query(
        `INSERT INTO labels (item_id, key, value)
         VALUES ($1, 'type', 'test-item')
         RETURNING id`,
        [itemResult.rows[0].id]
      );
      labelIds.push(labelResult.rows[0].id);
    } else {
      const db = getDatabase();

      // Create user
      const userResult = await db.query(
        `INSERT INTO users (email, password_hash)
         VALUES ('seed-test@example.com', 'test_hash')
         ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
         RETURNING id`
      );
      userIds.push(userResult.rows[0].id);

      // Create inventory item
      const itemResult = await db.query(
        `INSERT INTO inventory_items (user_id, photo_s3_key, thumbnail_s3_key, detection_data)
         VALUES ($1, 'test/photo.jpg', 'test/thumb.jpg', $2)
         RETURNING id`,
        [
          userResult.rows[0].id,
          JSON.stringify({
            success: true,
            ensembleMode: 'single',
            processingTimeMs: 100,
            detections: [],
            providerResults: [],
            ensembleMetrics: { providersUsed: 1, averageConfidence: 0.85, consensusRate: 1.0 },
          }),
        ]
      );
      itemIds.push(itemResult.rows[0].id);

      // Create labels
      const labelResult = await db.query(
        `INSERT INTO labels (item_id, key, value)
         VALUES ($1, 'type', 'test-item')
         RETURNING id`,
        [itemResult.rows[0].id]
      );
      labelIds.push(labelResult.rows[0].id);
    }

    return { userIds, itemIds, labelIds };
  } catch (error) {
    console.error('Error seeding test data:', error);
    return { userIds, itemIds, labelIds };
  }
}

/**
 * Create a test database transaction
 */
export async function withTransaction<T>(callback: (db: Database) => Promise<T>): Promise<T> {
  const db = getDatabase();

  return db.transaction(async () => {
    return callback(db);
  });
}

/**
 * Reset database to clean state
 */
export async function resetDatabase(): Promise<void> {
  await clearDatabase();
}

/**
 * Get database health status
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  if (isUsingTestcontainer()) {
    try {
      const pool = getTestPool();
      await pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  try {
    const db = getDatabase();
    return db.healthCheck();
  } catch {
    return false;
  }
}

/**
 * Get test user ID
 * Creates a user if one doesn't exist
 */
export async function getOrCreateTestUser(email: string = 'test@example.com'): Promise<string> {
  if (isUsingTestcontainer()) {
    return createTestUser(globalThis.__TEST_DB_POOL__!, email);
  }

  const db = getDatabase();
  const result = await db.query(
    `INSERT INTO users (email, password_hash)
     VALUES ($1, 'test_hash')
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING id`,
    [email]
  );
  return result.rows[0].id;
}


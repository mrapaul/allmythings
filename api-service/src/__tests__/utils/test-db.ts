/**
 * Test database utilities
 * Provides database seeding, cleanup, and transaction management for tests
 */

import { Database, getDatabase, closeDatabase } from '../../db/database';

/**
 * Clear all tables in test database
 */
export async function clearDatabase(): Promise<void> {
  const db = getDatabase();

  try {
    // Disable foreign key constraints temporarily
    await db.query('SET session_replication_role = replica');

    // Delete from all tables
    await db.query('DELETE FROM item_labels');
    await db.query('DELETE FROM inventory_items');
    await db.query('DELETE FROM sync_metadata');

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
  itemIds: string[];
  labelIds: string[];
}> {
  const db = getDatabase();
  const itemIds: string[] = [];
  const labelIds: string[] = [];

  try {
    // This would be implemented based on actual schema
    // For now, returning empty arrays
    return { itemIds, labelIds };
  } catch (error) {
    console.error('Error seeding test data:', error);
    return { itemIds, labelIds };
  }
}

/**
 * Create a test database transaction
 */
export async function withTransaction<T>(
  callback: (db: Database) => Promise<T>
): Promise<T> {
  const db = getDatabase();

  return db.transaction(async (client) => {
    // Transaction is already started by db.transaction
    return callback(db);
  });
}

/**
 * Reset database to clean state
 */
export async function resetDatabase(): Promise<void> {
  await clearDatabase();
  // Optional: Seed initial data
  // await seedTestData();
}

/**
 * Get database health status
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  const db = getDatabase();
  return db.healthCheck();
}

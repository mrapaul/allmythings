import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

/**
 * Container configuration interface
 */
export interface ContainerConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

/**
 * Apply database schema from schema.sql using the provided PostgreSQL pool.
 */
export async function applySchema(pool: Pool): Promise<void> {
  const schemaPath = path.join(__dirname, '../../../database/schema.sql');

  if (!fs.existsSync(schemaPath)) {
    console.warn(`Schema file not found at ${schemaPath}, creating minimal schema`);
    await applyMinimalSchema(pool);
    return;
  }

  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
  const statements = splitSqlStatements(schemaSql);

  console.log(`Applying ${statements.length} schema statements...`);

  for (const statement of statements) {
    try {
      await pool.query(statement);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (
        !errorMessage.includes('already exists') &&
        !errorMessage.includes('does not exist') &&
        !statement.trim().toLowerCase().startsWith('select')
      ) {
        console.error(`Error executing statement: ${statement.substring(0, 100)}...`);
        console.error(errorMessage);
      }
    }
  }

  console.log('Schema applied successfully');
}

/**
 * Apply minimal schema for tests when schema.sql is not available.
 */
export async function applyMinimalSchema(pool: Pool): Promise<void> {
  const minimalSchema = `
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP WITH TIME ZONE
    );

    CREATE TABLE IF NOT EXISTS inventory_items (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      photo_s3_key VARCHAR(500) NOT NULL,
      thumbnail_s3_key VARCHAR(500) NOT NULL,
      detection_data JSONB NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP WITH TIME ZONE
    );

    CREATE TABLE IF NOT EXISTS labels (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
      key VARCHAR(50),
      value VARCHAR(100) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (item_id, key, value)
    );

    CREATE TABLE IF NOT EXISTS sync_metadata (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      last_sync_timestamp TIMESTAMP WITH TIME ZONE,
      sync_token VARCHAR(255),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await pool.query(minimalSchema);
  console.log('Minimal schema applied');
}

/**
 * Split SQL into individual statements, handling comments and dollar-quoted strings.
 */
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let currentStatement = '';
  let inDollarQuote = false;
  let inSingleQuote = false;
  let dollarTag = '';

  const lines = sql.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith('--')) {
      continue;
    }

    if (!inSingleQuote) {
      const dollarMatch = trimmedLine.match(/\$([a-zA-Z_]*)\$/);
      if (dollarMatch) {
        if (!inDollarQuote) {
          inDollarQuote = true;
          dollarTag = dollarMatch[0];
        } else if (trimmedLine.includes(dollarTag)) {
          inDollarQuote = false;
          dollarTag = '';
        }
      }
    }

    for (let i = 0; i < line.length; i++) {
      if (line[i] === "'" && !inDollarQuote) {
        inSingleQuote = !inSingleQuote;
      }
    }

    currentStatement += line + '\n';

    if (trimmedLine.endsWith(';') && !inDollarQuote && !inSingleQuote) {
      const statement = currentStatement.trim();
      if (statement && !statement.startsWith('--')) {
        statements.push(statement);
      }
      currentStatement = '';
    }
  }

  if (currentStatement.trim()) {
    statements.push(currentStatement.trim());
  }

  return statements;
}

/**
 * Get the test pool from the global scope.
 */
export function getTestPool(): Pool {
  if (!globalThis.__TEST_DB_POOL__) {
    throw new Error('Test pool not initialized. Call globalSetup first.');
  }
  return globalThis.__TEST_DB_POOL__;
}

/**
 * Clear all data from tables for test isolation.
 */
export async function clearTestData(pool: Pool): Promise<void> {
  try {
    await pool.query('SET session_replication_role = replica');
    await pool.query('TRUNCATE TABLE labels CASCADE');
    await pool.query('TRUNCATE TABLE inventory_items CASCADE');
    await pool.query('TRUNCATE TABLE sync_metadata CASCADE');
    await pool.query('TRUNCATE TABLE users CASCADE');
    await pool.query('SET session_replication_role = default');
  } catch (error) {
    console.warn('Error clearing test data:', error instanceof Error ? error.message : error);
  }
}

/**
 * Create a test user and return its ID.
 */
export async function createTestUser(pool: Pool, email: string = 'test@example.com'): Promise<string> {
  const result = await pool.query(
    `INSERT INTO users (email, password_hash)
     VALUES ($1, 'test_hash')
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING id`,
    [email]
  );
  return result.rows[0].id;
}

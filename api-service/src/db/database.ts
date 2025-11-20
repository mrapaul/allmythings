/**
 * PostgreSQL database client using pg Pool
 * Provides connection pooling and transaction support
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { logger } from '../utils/logger';
import { envConfig } from '../config/env.config';
import { DatabaseError } from '../utils/errors';

/**
 * Database configuration
 */
interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  max?: number; // Maximum pool size
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

/**
 * Database client with connection pooling
 */
export class Database {
  private pool: Pool | null = null;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  /**
   * Initialize database connection pool
   */
  async connect(): Promise<void> {
    try {
      this.pool = new Pool({
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
        max: this.config.max || 20,
        idleTimeoutMillis: this.config.idleTimeoutMillis || 30000,
        connectionTimeoutMillis: this.config.connectionTimeoutMillis || 2000,
      });

      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      logger.info(
        { database: this.config.database, host: this.config.host },
        'Database connected successfully'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to connect to database');
      throw new DatabaseError('Database connection failed');
    }
  }

  /**
   * Close database connection pool
   */
  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      logger.info('Database disconnected');
    }
  }

  /**
   * Get pool instance
   */
  getPool(): Pool {
    if (!this.pool) {
      throw new DatabaseError('Database not connected');
    }
    return this.pool;
  }

  /**
   * Execute a query
   */
  async query<T extends QueryResultRow = any>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    const pool = this.getPool();
    const start = Date.now();

    try {
      const result = await pool.query<T>(text, params);
      const duration = Date.now() - start;

      logger.debug(
        { text, duration, rows: result.rowCount },
        'Query executed'
      );

      return result;
    } catch (error) {
      logger.error({ error, text, params }, 'Query failed');
      throw new DatabaseError(
        error instanceof Error ? error.message : 'Query execution failed'
      );
    }
  }

  /**
   * Execute query and return first row or null
   */
  async queryOne<T extends QueryResultRow = any>(
    text: string,
    params?: any[]
  ): Promise<T | null> {
    const result = await this.query<T>(text, params);
    return result.rows[0] || null;
  }

  /**
   * Execute query and return all rows
   */
  async queryMany<T extends QueryResultRow = any>(
    text: string,
    params?: any[]
  ): Promise<T[]> {
    const result = await this.query<T>(text, params);
    return result.rows;
  }

  /**
   * Execute a transaction
   */
  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const pool = this.getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ error }, 'Transaction failed');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Singleton database instance
 */
let dbInstance: Database | null = null;

/**
 * Get database instance
 */
export function getDatabase(): Database {
  if (!dbInstance) {
    dbInstance = new Database({
      host: envConfig.dbHost,
      port: envConfig.dbPort,
      database: envConfig.dbName,
      user: envConfig.dbUser,
      password: envConfig.dbPassword,
      ssl: envConfig.dbSsl,
      max: envConfig.dbPoolSize,
    });
  }
  return dbInstance;
}

/**
 * Initialize database connection
 */
export async function initDatabase(): Promise<Database> {
  const db = getDatabase();
  await db.connect();
  return db;
}

/**
 * Close database connection
 */
export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.disconnect();
    dbInstance = null;
  }
}

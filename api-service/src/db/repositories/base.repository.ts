/**
 * Base repository with common CRUD operations
 * Provides generic database access patterns for all repositories
 */

import { PoolClient } from 'pg';
import { Database } from '../database';
import { NotFoundError, DatabaseError } from '../../utils/errors';
import { logger } from '../../utils/logger';

/**
 * Base repository interface
 */
export interface IRepository<T> {
  findById(id: string, userId: string): Promise<T | null>;
  findAll(userId: string, limit?: number, offset?: number): Promise<T[]>;
  create(data: Partial<T>, userId: string): Promise<T>;
  update(id: string, data: Partial<T>, userId: string): Promise<T>;
  delete(id: string, userId: string): Promise<void>;
}

/**
 * Base repository implementation
 */
export abstract class BaseRepository<T> implements IRepository<T> {
  protected db: Database;
  protected tableName: string;

  constructor(db: Database, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  /**
   * Map database row to domain model
   * Override in child classes for custom mapping
   */
  protected abstract mapRow(row: any): T;

  /**
   * Find entity by ID
   */
  async findById(id: string, userId: string): Promise<T | null> {
    try {
      const query = `
        SELECT * FROM ${this.tableName}
        WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
      `;
      const row = await this.db.queryOne(query, [id, userId]);
      return row ? this.mapRow(row) : null;
    } catch (error) {
      logger.error({ error, id, userId }, 'Failed to find by ID');
      throw new DatabaseError('Failed to retrieve record');
    }
  }

  /**
   * Find all entities for user
   */
  async findAll(
    userId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<T[]> {
    try {
      const query = `
        SELECT * FROM ${this.tableName}
        WHERE user_id = $1 AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `;
      const rows = await this.db.queryMany(query, [userId, limit, offset]);
      return rows.map((row) => this.mapRow(row));
    } catch (error) {
      logger.error({ error, userId }, 'Failed to find all');
      throw new DatabaseError('Failed to retrieve records');
    }
  }

  /**
   * Count entities for user
   */
  async count(userId: string): Promise<number> {
    try {
      const query = `
        SELECT COUNT(*) as count FROM ${this.tableName}
        WHERE user_id = $1 AND deleted_at IS NULL
      `;
      const result = await this.db.queryOne<{ count: string }>(query, [
        userId,
      ]);
      return parseInt(result?.count || '0', 10);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to count');
      throw new DatabaseError('Failed to count records');
    }
  }

  /**
   * Create new entity
   * Override in child classes for custom creation logic
   */
  abstract create(data: Partial<T>, userId: string): Promise<T>;

  /**
   * Update existing entity
   * Override in child classes for custom update logic
   */
  abstract update(id: string, data: Partial<T>, userId: string): Promise<T>;

  /**
   * Soft delete entity
   */
  async delete(id: string, userId: string): Promise<void> {
    try {
      const query = `
        UPDATE ${this.tableName}
        SET deleted_at = NOW()
        WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
        RETURNING id
      `;
      const result = await this.db.queryOne(query, [id, userId]);

      if (!result) {
        throw new NotFoundError(
          `${this.tableName} with ID ${id} not found`
        );
      }

      logger.info({ id, userId, table: this.tableName }, 'Entity soft deleted');
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error({ error, id, userId }, 'Failed to delete');
      throw new DatabaseError('Failed to delete record');
    }
  }

  /**
   * Hard delete entity (use with caution)
   */
  async hardDelete(id: string, userId: string): Promise<void> {
    try {
      const query = `
        DELETE FROM ${this.tableName}
        WHERE id = $1 AND user_id = $2
        RETURNING id
      `;
      const result = await this.db.queryOne(query, [id, userId]);

      if (!result) {
        throw new NotFoundError(
          `${this.tableName} with ID ${id} not found`
        );
      }

      logger.info({ id, userId, table: this.tableName }, 'Entity hard deleted');
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error({ error, id, userId }, 'Failed to hard delete');
      throw new DatabaseError('Failed to delete record');
    }
  }

  /**
   * Execute within transaction
   */
  protected async executeInTransaction<R>(
    callback: (client: PoolClient) => Promise<R>
  ): Promise<R> {
    return this.db.transaction(callback);
  }

  /**
   * Check if entity exists
   */
  async exists(id: string, userId: string): Promise<boolean> {
    try {
      const query = `
        SELECT EXISTS(
          SELECT 1 FROM ${this.tableName}
          WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
        ) as exists
      `;
      const result = await this.db.queryOne<{ exists: boolean }>(query, [
        id,
        userId,
      ]);
      return result?.exists || false;
    } catch (error) {
      logger.error({ error, id, userId }, 'Failed to check existence');
      return false;
    }
  }
}

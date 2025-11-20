/**
 * Label repository for managing item labels
 */

import { Database } from '../database';
import {
  Label,
  CreateLabelDto,
  UpdateLabelDto,
} from '../../schemas/inventory.schema';
import { NotFoundError, DatabaseError } from '../../utils/errors';
import { logger } from '../../utils/logger';

interface LabelRow {
  id: string;
  item_id: string;
  key: string | null;
  value: string;
  created_at: Date;
}

/**
 * Label repository
 */
export class LabelRepository {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Map database row to domain model
   */
  private mapRow(row: LabelRow): Label {
    return {
      id: row.id,
      itemId: row.item_id,
      key: row.key,
      value: row.value,
      createdAt: row.created_at,
    };
  }

  /**
   * Find label by ID
   */
  async findById(id: string, userId: string): Promise<Label | null> {
    try {
      const query = `
        SELECT l.*
        FROM labels l
        INNER JOIN inventory_items i ON l.item_id = i.id
        WHERE l.id = $1 AND i.user_id = $2 AND i.deleted_at IS NULL
      `;
      const row = await this.db.queryOne<LabelRow>(query, [id, userId]);
      return row ? this.mapRow(row) : null;
    } catch (error) {
      logger.error({ error, id, userId }, 'Failed to find label by ID');
      throw new DatabaseError('Failed to retrieve label');
    }
  }

  /**
   * Find all labels for an item
   */
  async findByItemId(itemId: string, userId: string): Promise<Label[]> {
    try {
      const query = `
        SELECT l.*
        FROM labels l
        INNER JOIN inventory_items i ON l.item_id = i.id
        WHERE l.item_id = $1 AND i.user_id = $2 AND i.deleted_at IS NULL
        ORDER BY l.created_at ASC
      `;
      const rows = await this.db.queryMany<LabelRow>(query, [
        itemId,
        userId,
      ]);
      return rows.map((row) => this.mapRow(row));
    } catch (error) {
      logger.error({ error, itemId, userId }, 'Failed to find labels');
      throw new DatabaseError('Failed to retrieve labels');
    }
  }

  /**
   * Create new label
   */
  async create(data: CreateLabelDto, userId: string): Promise<Label> {
    try {
      // Verify item exists and belongs to user
      const itemQuery = `
        SELECT id FROM inventory_items
        WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
      `;
      const item = await this.db.queryOne(itemQuery, [data.itemId, userId]);
      if (!item) {
        throw new NotFoundError(
          `Item with ID ${data.itemId} not found`
        );
      }

      // Insert label
      const query = `
        INSERT INTO labels (item_id, key, value)
        VALUES ($1, $2, $3)
        RETURNING *
      `;
      const row = await this.db.queryOne<LabelRow>(query, [
        data.itemId,
        data.key || null,
        data.value,
      ]);

      if (!row) {
        throw new DatabaseError('Failed to create label');
      }

      logger.info({ labelId: row.id, itemId: data.itemId, userId }, 'Label created');
      return this.mapRow(row);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error({ error, data, userId }, 'Failed to create label');
      throw new DatabaseError('Failed to create label');
    }
  }

  /**
   * Update label
   */
  async update(
    id: string,
    data: UpdateLabelDto,
    userId: string
  ): Promise<Label> {
    try {
      const query = `
        UPDATE labels l
        SET value = $1
        FROM inventory_items i
        WHERE l.id = $2 AND l.item_id = i.id AND i.user_id = $3 AND i.deleted_at IS NULL
        RETURNING l.*
      `;
      const row = await this.db.queryOne<LabelRow>(query, [
        data.value,
        id,
        userId,
      ]);

      if (!row) {
        throw new NotFoundError(`Label with ID ${id} not found`);
      }

      logger.info({ labelId: id, userId }, 'Label updated');
      return this.mapRow(row);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error({ error, id, userId }, 'Failed to update label');
      throw new DatabaseError('Failed to update label');
    }
  }

  /**
   * Delete label
   */
  async delete(id: string, userId: string): Promise<void> {
    try {
      const query = `
        DELETE FROM labels l
        USING inventory_items i
        WHERE l.id = $1 AND l.item_id = i.id AND i.user_id = $2
        RETURNING l.id
      `;
      const result = await this.db.queryOne(query, [id, userId]);

      if (!result) {
        throw new NotFoundError(`Label with ID ${id} not found`);
      }

      logger.info({ labelId: id, userId }, 'Label deleted');
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error({ error, id, userId }, 'Failed to delete label');
      throw new DatabaseError('Failed to delete label');
    }
  }

  /**
   * Find labels created/updated since timestamp (for sync)
   */
  async findUpdatedSince(
    userId: string,
    since: Date
  ): Promise<Label[]> {
    try {
      const query = `
        SELECT l.*
        FROM labels l
        INNER JOIN inventory_items i ON l.item_id = i.id
        WHERE i.user_id = $1 AND l.created_at > $2
        ORDER BY l.created_at ASC
      `;
      const rows = await this.db.queryMany<LabelRow>(query, [userId, since]);
      return rows.map((row) => this.mapRow(row));
    } catch (error) {
      logger.error({ error, userId, since }, 'Failed to find updated labels');
      throw new DatabaseError('Failed to find updated labels');
    }
  }
}

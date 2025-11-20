/**
 * Inventory repository for CRUD operations on inventory items
 */

import { BaseRepository } from './base.repository';
import { Database } from '../database';
import {
  InventoryItem,
  CreateItemRequest,
  UpdateItemRequest,
  ListItemsQuery,
  PaginatedItemsResponse,
  PaginationMeta,
  Label,
  SortOption,
} from '../../schemas/inventory.schema';
import { DetectionResponse } from '../../schemas/detection.schema';
import { NotFoundError, DatabaseError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { envConfig } from '../../config/env.config';

/**
 * Database row interface
 */
interface InventoryItemRow {
  id: string;
  user_id: string;
  photo_s3_key: string;
  thumbnail_s3_key: string;
  detection_data: any;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

interface LabelRow {
  id: string;
  item_id: string;
  key: string | null;
  value: string;
  created_at: Date;
}

/**
 * Inventory repository
 */
export class InventoryRepository extends BaseRepository<InventoryItem> {
  constructor(db: Database) {
    super(db, 'inventory_items');
  }

  /**
   * Map database row to domain model
   */
  protected mapRow(row: InventoryItemRow): InventoryItem {
    // Generate presigned URLs (in production, use S3 SDK)
    const photoUrl = this.generatePhotoUrl(row.photo_s3_key);
    const thumbnailUrl = this.generatePhotoUrl(row.thumbnail_s3_key);

    return {
      id: row.id,
      userId: row.user_id,
      photoUrl,
      thumbnailUrl,
      detectionData: row.detection_data as DetectionResponse,
      labels: [], // Populated separately
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  }

  /**
   * Generate presigned URL for photo
   * TODO: Replace with actual S3 presigned URL generation
   */
  private generatePhotoUrl(s3Key: string): string {
    // In production, use AWS SDK to generate presigned URLs
    // For now, return a placeholder URL
    const baseUrl = envConfig.s3BaseUrl || 'https://storage.example.com';
    return `${baseUrl}/${s3Key}`;
  }

  /**
   * Find item by ID with labels
   */
  async findById(id: string, userId: string): Promise<InventoryItem | null> {
    try {
      const itemQuery = `
        SELECT * FROM inventory_items
        WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
      `;
      const itemRow = await this.db.queryOne<InventoryItemRow>(itemQuery, [
        id,
        userId,
      ]);

      if (!itemRow) {
        return null;
      }

      const item = this.mapRow(itemRow);
      item.labels = await this.findLabelsForItem(id);

      return item;
    } catch (error) {
      logger.error({ error, id, userId }, 'Failed to find item by ID');
      throw new DatabaseError('Failed to retrieve item');
    }
  }

  /**
   * Find labels for an item
   */
  private async findLabelsForItem(itemId: string): Promise<Label[]> {
    const query = `
      SELECT id, item_id, key, value, created_at
      FROM labels
      WHERE item_id = $1
      ORDER BY created_at ASC
    `;
    const rows = await this.db.queryMany<LabelRow>(query, [itemId]);
    return rows.map((row) => ({
      id: row.id,
      itemId: row.item_id,
      key: row.key,
      value: row.value,
      createdAt: row.created_at,
    }));
  }

  /**
   * List items with pagination and filtering
   */
  async list(
    userId: string,
    query: ListItemsQuery
  ): Promise<PaginatedItemsResponse> {
    try {
      const { page, limit, sort, minConfidence } = query;
      const offset = (page - 1) * limit;

      // Build WHERE clause
      const conditions = ['user_id = $1', 'deleted_at IS NULL'];
      const params: any[] = [userId];
      let paramIndex = 2;

      if (minConfidence !== undefined) {
        conditions.push(
          `(detection_data -> 'ensembleMetrics' ->> 'averageConfidence')::numeric >= $${paramIndex}`
        );
        params.push(minConfidence);
        paramIndex++;
      }

      // Build ORDER BY clause
      const orderByMap: Record<SortOption, string> = {
        createdAt_desc: 'created_at DESC',
        createdAt_asc: 'created_at ASC',
        updatedAt_desc: 'updated_at DESC',
        confidence_desc:
          "(detection_data -> 'ensembleMetrics' ->> 'averageConfidence')::numeric DESC",
      };
      const orderBy = orderByMap[sort];

      // Count total
      const countQuery = `
        SELECT COUNT(*) as count
        FROM inventory_items
        WHERE ${conditions.join(' AND ')}
      `;
      const countResult = await this.db.queryOne<{ count: string }>(
        countQuery,
        params
      );
      const total = parseInt(countResult?.count || '0', 10);

      // Fetch items
      const itemsQuery = `
        SELECT * FROM inventory_items
        WHERE ${conditions.join(' AND ')}
        ORDER BY ${orderBy}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      params.push(limit, offset);

      const rows = await this.db.queryMany<InventoryItemRow>(
        itemsQuery,
        params
      );
      const items = rows.map((row) => this.mapRow(row));

      // Fetch labels for all items
      if (items.length > 0) {
        const itemIds = items.map((item) => item.id);
        const labelsQuery = `
          SELECT id, item_id, key, value, created_at
          FROM labels
          WHERE item_id = ANY($1)
          ORDER BY created_at ASC
        `;
        const labelRows = await this.db.queryMany<LabelRow>(labelsQuery, [
          itemIds,
        ]);

        // Group labels by item ID
        const labelsByItemId = new Map<string, Label[]>();
        for (const row of labelRows) {
          if (!labelsByItemId.has(row.item_id)) {
            labelsByItemId.set(row.item_id, []);
          }
          labelsByItemId.get(row.item_id)!.push({
            id: row.id,
            itemId: row.item_id,
            key: row.key,
            value: row.value,
            createdAt: row.created_at,
          });
        }

        // Attach labels to items
        for (const item of items) {
          item.labels = labelsByItemId.get(item.id) || [];
        }
      }

      // Build pagination metadata
      const totalPages = Math.ceil(total / limit);
      const pagination: PaginationMeta = {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      };

      return { items, pagination };
    } catch (error) {
      logger.error({ error, userId, query }, 'Failed to list items');
      throw new DatabaseError('Failed to list items');
    }
  }

  /**
   * Create new inventory item
   */
  async create(
    data: CreateItemRequest,
    userId: string
  ): Promise<InventoryItem> {
    try {
      return await this.db.transaction(async (client) => {
        // Insert item
        const itemQuery = `
          INSERT INTO inventory_items (
            user_id, photo_s3_key, thumbnail_s3_key, detection_data
          ) VALUES ($1, $2, $3, $4)
          RETURNING *
        `;
        const itemResult = await client.query<InventoryItemRow>(itemQuery, [
          userId,
          data.photoS3Key,
          data.thumbnailS3Key,
          JSON.stringify(data.detectionData),
        ]);
        const itemRow = itemResult.rows[0];

        // Insert initial labels
        const labels: Label[] = [];
        if (data.initialLabels && data.initialLabels.length > 0) {
          const labelQuery = `
            INSERT INTO labels (item_id, key, value)
            VALUES ($1, $2, $3)
            RETURNING *
          `;
          for (const labelData of data.initialLabels) {
            const labelResult = await client.query<LabelRow>(labelQuery, [
              itemRow.id,
              labelData.key || null,
              labelData.value,
            ]);
            const labelRow = labelResult.rows[0];
            labels.push({
              id: labelRow.id,
              itemId: labelRow.item_id,
              key: labelRow.key,
              value: labelRow.value,
              createdAt: labelRow.created_at,
            });
          }
        }

        const item = this.mapRow(itemRow);
        item.labels = labels;

        logger.info({ itemId: item.id, userId }, 'Item created');
        return item;
      });
    } catch (error) {
      logger.error({ error, userId, data }, 'Failed to create item');
      throw new DatabaseError('Failed to create item');
    }
  }

  /**
   * Update inventory item
   */
  async update(
    id: string,
    data: UpdateItemRequest,
    userId: string
  ): Promise<InventoryItem> {
    try {
      // Check if item exists
      const exists = await this.exists(id, userId);
      if (!exists) {
        throw new NotFoundError(`Item with ID ${id} not found`);
      }

      const updates: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (data.photoUrl !== undefined) {
        updates.push(`photo_s3_key = $${paramIndex}`);
        params.push(this.extractS3KeyFromUrl(data.photoUrl));
        paramIndex++;
      }

      if (data.thumbnailUrl !== undefined) {
        updates.push(`thumbnail_s3_key = $${paramIndex}`);
        params.push(this.extractS3KeyFromUrl(data.thumbnailUrl));
        paramIndex++;
      }

      if (updates.length === 0) {
        // No updates, just fetch and return
        const item = await this.findById(id, userId);
        if (!item) {
          throw new NotFoundError(`Item with ID ${id} not found`);
        }
        return item;
      }

      params.push(id, userId);
      const query = `
        UPDATE inventory_items
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1} AND deleted_at IS NULL
        RETURNING *
      `;

      const row = await this.db.queryOne<InventoryItemRow>(query, params);
      if (!row) {
        throw new NotFoundError(`Item with ID ${id} not found`);
      }

      const item = this.mapRow(row);
      item.labels = await this.findLabelsForItem(id);

      logger.info({ itemId: id, userId }, 'Item updated');
      return item;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error({ error, id, userId }, 'Failed to update item');
      throw new DatabaseError('Failed to update item');
    }
  }

  /**
   * Extract S3 key from URL
   * TODO: Implement proper S3 URL parsing
   */
  private extractS3KeyFromUrl(url: string): string {
    // Simple implementation - extract path from URL
    const urlObj = new URL(url);
    return urlObj.pathname.substring(1); // Remove leading slash
  }

  /**
   * Find items updated since timestamp (for sync)
   */
  async findUpdatedSince(
    userId: string,
    since: Date,
    limit: number = 100,
    offset: number = 0
  ): Promise<InventoryItem[]> {
    try {
      const query = `
        SELECT * FROM inventory_items
        WHERE user_id = $1 AND updated_at > $2 AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT $3 OFFSET $4
      `;
      const rows = await this.db.queryMany<InventoryItemRow>(query, [
        userId,
        since,
        limit,
        offset,
      ]);
      const items = rows.map((row) => this.mapRow(row));

      // Fetch labels
      if (items.length > 0) {
        const itemIds = items.map((item) => item.id);
        const labelsQuery = `
          SELECT id, item_id, key, value, created_at
          FROM labels
          WHERE item_id = ANY($1)
        `;
        const labelRows = await this.db.queryMany<LabelRow>(labelsQuery, [
          itemIds,
        ]);

        const labelsByItemId = new Map<string, Label[]>();
        for (const row of labelRows) {
          if (!labelsByItemId.has(row.item_id)) {
            labelsByItemId.set(row.item_id, []);
          }
          labelsByItemId.get(row.item_id)!.push({
            id: row.id,
            itemId: row.item_id,
            key: row.key,
            value: row.value,
            createdAt: row.created_at,
          });
        }

        for (const item of items) {
          item.labels = labelsByItemId.get(item.id) || [];
        }
      }

      return items;
    } catch (error) {
      logger.error({ error, userId, since }, 'Failed to find updated items');
      throw new DatabaseError('Failed to find updated items');
    }
  }

  /**
   * Find deleted item IDs since timestamp
   */
  async findDeletedSince(
    userId: string,
    since: Date
  ): Promise<string[]> {
    try {
      const query = `
        SELECT id FROM inventory_items
        WHERE user_id = $1 AND deleted_at > $2 AND deleted_at IS NOT NULL
      `;
      const rows = await this.db.queryMany<{ id: string }>(query, [
        userId,
        since,
      ]);
      return rows.map((row) => row.id);
    } catch (error) {
      logger.error({ error, userId, since }, 'Failed to find deleted items');
      throw new DatabaseError('Failed to find deleted items');
    }
  }
}

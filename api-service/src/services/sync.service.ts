/**
 * Sync service - handles offline-first synchronization
 * Implements last-write-wins conflict resolution
 */

import { InventoryRepository } from '../db/repositories/inventory.repository';
import { LabelRepository } from '../db/repositories/label.repository';
import {
  SyncQuery,
  SyncResponse,
  PushChangesRequest,
  PushChangesResponse,
  Conflict,
} from '../schemas/sync.schema';
import { PaginationMeta } from '../schemas/inventory.schema';
import { logger } from '../utils/logger';
import { DatabaseError } from '../utils/errors';

/**
 * Sync service
 */
export class SyncService {
  constructor(
    private inventoryRepo: InventoryRepository,
    private labelRepo: LabelRepository
  ) {}

  /**
   * Pull changes from server since timestamp
   */
  async pullChanges(
    userId: string,
    query: SyncQuery
  ): Promise<SyncResponse> {
    try {
      const { since, page, limit } = query;
      const offset = (page - 1) * limit;

      logger.info({ userId, since, page, limit }, 'Pulling changes');

      // Get updated items
      const items = await this.inventoryRepo.findUpdatedSince(
        userId,
        since,
        limit,
        offset
      );

      // Get updated labels
      const labels = await this.labelRepo.findUpdatedSince(userId, since);

      // Get deleted item IDs
      const deletedItemIds = await this.inventoryRepo.findDeletedSince(
        userId,
        since
      );

      // Count total updated items for pagination
      const total = items.length; // Simplified - should count total available
      const totalPages = Math.ceil(total / limit);

      const pagination: PaginationMeta = {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      };

      const timestamp = new Date();

      logger.info(
        {
          userId,
          itemsCount: items.length,
          labelsCount: labels.length,
          deletedCount: deletedItemIds.length,
        },
        'Changes pulled successfully'
      );

      return {
        items,
        labels,
        deletedItemIds,
        timestamp,
        pagination,
      };
    } catch (error) {
      logger.error({ error, userId, query }, 'Failed to pull changes');
      throw new DatabaseError('Failed to pull changes');
    }
  }

  /**
   * Push changes from client to server
   * Implements last-write-wins conflict resolution
   */
  async pushChanges(
    userId: string,
    request: PushChangesRequest
  ): Promise<PushChangesResponse> {
    try {
      logger.info(
        {
          userId,
          itemsCount: request.items.length,
          labelsCount: request.labels.length,
          deletedCount: request.deletedItemIds.length,
        },
        'Pushing changes'
      );

      const syncedItemIds: string[] = [];
      const conflicts: Conflict[] = [];

      // Process items
      for (const item of request.items) {
        try {
          // Check if item exists on server
          const existingItem = await this.inventoryRepo.findById(
            item.id,
            userId
          );

          if (!existingItem) {
            // Item doesn't exist, create it
            // Note: This is simplified - in production, validate S3 keys exist
            await this.inventoryRepo.create(
              {
                photoS3Key: item.photoUrl.split('/').pop() || '',
                thumbnailS3Key: item.thumbnailUrl.split('/').pop() || '',
                detectionData: item.detectionData,
                initialLabels: item.labels.map((l) => ({
                  key: l.key || undefined,
                  value: l.value,
                })),
              },
              userId
            );
            syncedItemIds.push(item.id);
          } else {
            // Item exists - check for conflicts
            const clientUpdated = new Date(item.updatedAt);
            const serverUpdated = new Date(existingItem.updatedAt);

            if (serverUpdated > clientUpdated) {
              // Server has newer version - conflict
              conflicts.push({
                itemId: item.id,
                field: 'updatedAt',
                clientValue: clientUpdated.toISOString(),
                serverValue: serverUpdated.toISOString(),
                resolution: 'server_wins', // Last-write-wins: server is newer
              });
            } else {
              // Client has newer version - update server
              await this.inventoryRepo.update(
                item.id,
                {
                  photoUrl: item.photoUrl,
                  thumbnailUrl: item.thumbnailUrl,
                },
                userId
              );
              syncedItemIds.push(item.id);
            }
          }
        } catch (error) {
          logger.error({ error, itemId: item.id }, 'Failed to sync item');
          // Continue with other items
        }
      }

      // Process labels
      for (const label of request.labels) {
        try {
          const existingLabel = await this.labelRepo.findById(
            label.id,
            userId
          );

          if (!existingLabel) {
            // Create new label
            await this.labelRepo.create(
              {
                itemId: label.itemId,
                key: label.key || undefined,
                value: label.value,
              },
              userId
            );
          } else {
            // Update existing label
            await this.labelRepo.update(
              label.id,
              { value: label.value },
              userId
            );
          }
        } catch (error) {
          logger.error({ error, labelId: label.id }, 'Failed to sync label');
        }
      }

      // Process deletions
      for (const itemId of request.deletedItemIds) {
        try {
          await this.inventoryRepo.delete(itemId, userId);
        } catch (error) {
          logger.error({ error, itemId }, 'Failed to delete item');
        }
      }

      const timestamp = new Date();

      logger.info(
        {
          userId,
          syncedCount: syncedItemIds.length,
          conflictsCount: conflicts.length,
        },
        'Changes pushed successfully'
      );

      return {
        syncedItemIds,
        conflicts,
        timestamp,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to push changes');
      throw new DatabaseError('Failed to push changes');
    }
  }
}

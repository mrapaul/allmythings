/**
 * Inventory service - business logic for inventory item management
 */

import { InventoryRepository } from '../db/repositories/inventory.repository';
import { LabelRepository } from '../db/repositories/label.repository';
import {
  InventoryItem,
  CreateItemRequest,
  UpdateItemRequest,
  ListItemsQuery,
  PaginatedItemsResponse,
  CreateLabelDto,
  UpdateLabelDto,
  Label,
} from '../schemas/inventory.schema';
import { NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * Inventory service
 */
export class InventoryService {
  constructor(
    private inventoryRepo: InventoryRepository,
    private labelRepo: LabelRepository
  ) {}

  /**
   * Get item by ID
   */
  async getItem(id: string, userId: string): Promise<InventoryItem> {
    const item = await this.inventoryRepo.findById(id, userId);
    if (!item) {
      throw new NotFoundError(`Item with ID ${id} not found`);
    }
    return item;
  }

  /**
   * List items with pagination
   */
  async listItems(
    userId: string,
    query: ListItemsQuery
  ): Promise<PaginatedItemsResponse> {
    return this.inventoryRepo.list(userId, query);
  }

  /**
   * Create new item
   */
  async createItem(
    data: CreateItemRequest,
    userId: string
  ): Promise<InventoryItem> {
    logger.info({ userId, photoS3Key: data.photoS3Key }, 'Creating inventory item');
    return this.inventoryRepo.create(data, userId);
  }

  /**
   * Update item
   */
  async updateItem(
    id: string,
    data: UpdateItemRequest,
    userId: string
  ): Promise<InventoryItem> {
    logger.info({ id, userId }, 'Updating inventory item');
    return this.inventoryRepo.update(id, data, userId);
  }

  /**
   * Delete item (soft delete)
   */
  async deleteItem(id: string, userId: string): Promise<void> {
    logger.info({ id, userId }, 'Deleting inventory item');
    await this.inventoryRepo.delete(id, userId);
  }

  /**
   * Get labels for item
   */
  async getItemLabels(itemId: string, userId: string): Promise<Label[]> {
    // Verify item exists
    await this.getItem(itemId, userId);
    return this.labelRepo.findByItemId(itemId, userId);
  }

  /**
   * Add label to item
   */
  async addLabel(
    data: CreateLabelDto,
    userId: string
  ): Promise<Label> {
    logger.info({ itemId: data.itemId, userId }, 'Adding label to item');
    return this.labelRepo.create(data, userId);
  }

  /**
   * Update label
   */
  async updateLabel(
    id: string,
    data: UpdateLabelDto,
    userId: string
  ): Promise<Label> {
    logger.info({ id, userId }, 'Updating label');
    return this.labelRepo.update(id, data, userId);
  }

  /**
   * Delete label
   */
  async deleteLabel(id: string, userId: string): Promise<void> {
    logger.info({ id, userId }, 'Deleting label');
    await this.labelRepo.delete(id, userId);
  }
}

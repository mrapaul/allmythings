/**
 * Unit tests for InventoryService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InventoryService } from '../inventory.service';
import { InventoryRepository } from '../../db/repositories/inventory.repository';
import { LabelRepository } from '../../db/repositories/label.repository';
import { NotFoundError } from '../../utils/errors';
import {
  InventoryItem,
  CreateItemRequest,
  Label,
} from '../../schemas/inventory.schema';

// Mock repositories
vi.mock('../../db/repositories/inventory.repository');
vi.mock('../../db/repositories/label.repository');

describe('InventoryService', () => {
  let inventoryService: InventoryService;
  let mockInventoryRepo: InventoryRepository;
  let mockLabelRepo: LabelRepository;

  const mockUserId = 'user-123';
  const mockItemId = 'item-456';

  const mockItem: InventoryItem = {
    id: mockItemId,
    userId: mockUserId,
    photoUrl: 'https://storage.example.com/photo.jpg',
    thumbnailUrl: 'https://storage.example.com/thumb.jpg',
    detectionData: {
      success: true,
      ensembleMode: 'partial',
      processingTimeMs: 1000,
      detections: [],
      providerResults: [],
      ensembleMetrics: {
        providersUsed: 2,
        averageConfidence: 0.9,
        consensusRate: 1.0,
      },
    },
    labels: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockLabel: Label = {
    id: 'label-789',
    itemId: mockItemId,
    key: 'type',
    value: 'laptop',
    createdAt: new Date(),
  };

  beforeEach(() => {
    mockInventoryRepo = new InventoryRepository(null as any);
    mockLabelRepo = new LabelRepository(null as any);
    inventoryService = new InventoryService(mockInventoryRepo, mockLabelRepo);
  });

  describe('getItem', () => {
    it('should return item when it exists', async () => {
      vi.spyOn(mockInventoryRepo, 'findById').mockResolvedValue(mockItem);

      const result = await inventoryService.getItem(mockItemId, mockUserId);

      expect(result).toEqual(mockItem);
      expect(mockInventoryRepo.findById).toHaveBeenCalledWith(
        mockItemId,
        mockUserId
      );
    });

    it('should throw NotFoundError when item does not exist', async () => {
      vi.spyOn(mockInventoryRepo, 'findById').mockResolvedValue(null);

      await expect(
        inventoryService.getItem(mockItemId, mockUserId)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('createItem', () => {
    it('should create new item', async () => {
      const createData: CreateItemRequest = {
        photoS3Key: 'photos/photo.jpg',
        thumbnailS3Key: 'thumbnails/thumb.jpg',
        detectionData: mockItem.detectionData,
        initialLabels: [{ value: 'laptop' }],
      };

      vi.spyOn(mockInventoryRepo, 'create').mockResolvedValue(mockItem);

      const result = await inventoryService.createItem(createData, mockUserId);

      expect(result).toEqual(mockItem);
      expect(mockInventoryRepo.create).toHaveBeenCalledWith(
        createData,
        mockUserId
      );
    });
  });

  describe('updateItem', () => {
    it('should update existing item', async () => {
      const updateData = {
        photoUrl: 'https://storage.example.com/new-photo.jpg',
      };

      const updatedItem = { ...mockItem, ...updateData };
      vi.spyOn(mockInventoryRepo, 'update').mockResolvedValue(updatedItem);

      const result = await inventoryService.updateItem(
        mockItemId,
        updateData,
        mockUserId
      );

      expect(result.photoUrl).toBe(updateData.photoUrl);
      expect(mockInventoryRepo.update).toHaveBeenCalledWith(
        mockItemId,
        updateData,
        mockUserId
      );
    });
  });

  describe('deleteItem', () => {
    it('should delete item', async () => {
      vi.spyOn(mockInventoryRepo, 'delete').mockResolvedValue();

      await inventoryService.deleteItem(mockItemId, mockUserId);

      expect(mockInventoryRepo.delete).toHaveBeenCalledWith(
        mockItemId,
        mockUserId
      );
    });
  });

  describe('label operations', () => {
    it('should add label to item', async () => {
      const labelData = {
        itemId: mockItemId,
        key: 'type',
        value: 'laptop',
      };

      vi.spyOn(mockLabelRepo, 'create').mockResolvedValue(mockLabel);

      const result = await inventoryService.addLabel(labelData, mockUserId);

      expect(result).toEqual(mockLabel);
      expect(mockLabelRepo.create).toHaveBeenCalledWith(labelData, mockUserId);
    });

    it('should update label', async () => {
      const updateData = { value: 'desktop' };
      const updatedLabel = { ...mockLabel, value: 'desktop' };

      vi.spyOn(mockLabelRepo, 'update').mockResolvedValue(updatedLabel);

      const result = await inventoryService.updateLabel(
        mockLabel.id,
        updateData,
        mockUserId
      );

      expect(result.value).toBe('desktop');
    });

    it('should delete label', async () => {
      vi.spyOn(mockLabelRepo, 'delete').mockResolvedValue();

      await inventoryService.deleteLabel(mockLabel.id, mockUserId);

      expect(mockLabelRepo.delete).toHaveBeenCalledWith(
        mockLabel.id,
        mockUserId
      );
    });
  });
});

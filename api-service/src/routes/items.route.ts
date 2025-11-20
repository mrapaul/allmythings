/**
 * Inventory items routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { InventoryService } from '../services/inventory.service';
import { InventoryRepository } from '../db/repositories/inventory.repository';
import { LabelRepository } from '../db/repositories/label.repository';
import { getDatabase } from '../db/database';
import {
  CreateItemRequestSchema,
  UpdateItemRequestSchema,
  ListItemsQuerySchema,
} from '../schemas/inventory.schema';
import { authMiddleware } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';

export async function itemsRoute(app: FastifyInstance): Promise<void> {
  const db = getDatabase();
  const inventoryRepo = new InventoryRepository(db);
  const labelRepo = new LabelRepository(db);
  const inventoryService = new InventoryService(inventoryRepo, labelRepo);

  /**
   * GET /v1/items
   * List inventory items with pagination
   */
  app.get(
    '/v1/items',
    {
      preHandler: authMiddleware,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.userId;
      const query = ListItemsQuerySchema.parse(request.query);

      logger.info({ userId, query }, 'Listing inventory items');

      const response = await inventoryService.listItems(userId, query);
      return reply.code(200).send(response);
    }
  );

  /**
   * GET /v1/items/:id
   * Get single inventory item
   */
  app.get(
    '/v1/items/:id',
    {
      preHandler: authMiddleware,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.userId;
      const { id } = request.params as { id: string };

      logger.info({ userId, itemId: id }, 'Getting inventory item');

      const item = await inventoryService.getItem(id, userId);
      return reply.code(200).send(item);
    }
  );

  /**
   * POST /v1/items
   * Create new inventory item
   */
  app.post(
    '/v1/items',
    {
      preHandler: authMiddleware,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.userId;
      const data = CreateItemRequestSchema.parse(request.body);

      logger.info({ userId, data }, 'Creating inventory item');

      const item = await inventoryService.createItem(data, userId);
      return reply.code(201).send(item);
    }
  );

  /**
   * PATCH /v1/items/:id
   * Update inventory item
   */
  app.patch(
    '/v1/items/:id',
    {
      preHandler: authMiddleware,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.userId;
      const { id } = request.params as { id: string };
      const data = UpdateItemRequestSchema.parse(request.body);

      logger.info({ userId, itemId: id, data }, 'Updating inventory item');

      const item = await inventoryService.updateItem(id, data, userId);
      return reply.code(200).send(item);
    }
  );

  /**
   * DELETE /v1/items/:id
   * Delete inventory item (soft delete)
   */
  app.delete(
    '/v1/items/:id',
    {
      preHandler: authMiddleware,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.userId;
      const { id } = request.params as { id: string };

      logger.info({ userId, itemId: id }, 'Deleting inventory item');

      await inventoryService.deleteItem(id, userId);
      return reply.code(204).send();
    }
  );
}

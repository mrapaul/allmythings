/**
 * Labels routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { InventoryService } from '../services/inventory.service';
import { InventoryRepository } from '../db/repositories/inventory.repository';
import { LabelRepository } from '../db/repositories/label.repository';
import { getDatabase } from '../db/database';
import {
  CreateLabelSchema,
  UpdateLabelSchema,
} from '../schemas/inventory.schema';
import { authMiddleware } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';

export async function labelsRoute(app: FastifyInstance): Promise<void> {
  const db = getDatabase();
  const inventoryRepo = new InventoryRepository(db);
  const labelRepo = new LabelRepository(db);
  const inventoryService = new InventoryService(inventoryRepo, labelRepo);

  /**
   * POST /v1/labels
   * Create new label
   */
  app.post(
    '/v1/labels',
    {
      preHandler: authMiddleware,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.userId;
      const data = CreateLabelSchema.parse(request.body);

      logger.info({ userId, data }, 'Creating label');

      const label = await inventoryService.addLabel(data, userId);
      return reply.code(201).send(label);
    }
  );

  /**
   * PATCH /v1/labels/:id
   * Update label
   */
  app.patch(
    '/v1/labels/:id',
    {
      preHandler: authMiddleware,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.userId;
      const { id } = request.params as { id: string };
      const data = UpdateLabelSchema.parse(request.body);

      logger.info({ userId, labelId: id, data }, 'Updating label');

      const label = await inventoryService.updateLabel(id, data, userId);
      return reply.code(200).send(label);
    }
  );

  /**
   * DELETE /v1/labels/:id
   * Delete label
   */
  app.delete(
    '/v1/labels/:id',
    {
      preHandler: authMiddleware,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.userId;
      const { id } = request.params as { id: string };

      logger.info({ userId, labelId: id }, 'Deleting label');

      await inventoryService.deleteLabel(id, userId);
      return reply.code(204).send();
    }
  );
}

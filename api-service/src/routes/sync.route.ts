/**
 * Sync routes for offline-first synchronization
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SyncService } from '../services/sync.service';
import { InventoryRepository } from '../db/repositories/inventory.repository';
import { LabelRepository } from '../db/repositories/label.repository';
import { getDatabase } from '../db/database';
import {
  SyncQuerySchema,
  PushChangesRequestSchema,
} from '../schemas/sync.schema';
import { authMiddleware } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';

export async function syncRoute(app: FastifyInstance): Promise<void> {
  const db = getDatabase();
  const inventoryRepo = new InventoryRepository(db);
  const labelRepo = new LabelRepository(db);
  const syncService = new SyncService(inventoryRepo, labelRepo);

  /**
   * GET /v1/sync
   * Pull changes from server since timestamp
   */
  app.get(
    '/v1/sync',
    {
      preHandler: authMiddleware,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.userId;
      const query = SyncQuerySchema.parse(request.query);

      logger.info({ userId, since: query.since }, 'Pulling sync changes');

      const response = await syncService.pullChanges(userId, query);
      return reply.code(200).send(response);
    }
  );

  /**
   * POST /v1/sync
   * Push changes from client to server
   */
  app.post(
    '/v1/sync',
    {
      preHandler: authMiddleware,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.userId;
      const data = PushChangesRequestSchema.parse(request.body);

      logger.info(
        {
          userId,
          itemsCount: data.items.length,
          labelsCount: data.labels.length,
        },
        'Pushing sync changes'
      );

      const response = await syncService.pushChanges(userId, data);
      return reply.code(200).send(response);
    }
  );
}

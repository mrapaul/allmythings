/**
 * Search routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SearchService } from '../services/search.service';
import { getDatabase } from '../db/database';
import { SearchQuerySchema } from '../schemas/search.schema';
import { authMiddleware } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';

export async function searchRoute(app: FastifyInstance): Promise<void> {
  const db = getDatabase();
  const searchService = new SearchService(db);

  /**
   * GET /v1/search
   * Full-text search across inventory items and labels
   */
  app.get(
    '/v1/search',
    {
      preHandler: authMiddleware,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.userId;
      const query = SearchQuerySchema.parse(request.query);

      logger.info({ userId, query: query.q }, 'Searching inventory');

      const response = await searchService.search(userId, query);
      return reply.code(200).send(response);
    }
  );
}

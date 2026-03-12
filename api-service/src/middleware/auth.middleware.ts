import { FastifyRequest, FastifyReply } from 'fastify';
import { envConfig } from '../config/env.config';
import { logger } from '../utils/logger';

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (envConfig.nodeEnv === 'development') {
    return;
  }

  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    logger.warn({ url: request.url }, 'Missing or invalid authorization header');
    reply.status(401).send({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  if (!envConfig.apiKey || token !== envConfig.apiKey) {
    logger.warn({ url: request.url }, 'Invalid API key');
    reply.status(401).send({ error: 'Invalid API key' });
    return;
  }
}

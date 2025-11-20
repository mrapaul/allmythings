/**
 * Detection route - handles object detection endpoint
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { DetectionService } from '../services/detection.service';
import { VisionOrchestratorService } from '../services/vision-orchestrator.service';
import { DetectionRequestSchema } from '../schemas/detection.schema';
import { authMiddleware } from '../middleware/auth.middleware';
import { BadRequestError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * Detection route plugin
 */
export async function detectRoute(app: FastifyInstance): Promise<void> {
  const orchestrator = new VisionOrchestratorService();
  const detectionService = new DetectionService(orchestrator);

  /**
   * POST /v1/detect
   * Upload image and detect objects
   */
  app.post(
    '/v1/detect',
    {
      preHandler: authMiddleware,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Parse multipart form data
        const data = await request.file();

        if (!data) {
          throw new BadRequestError('No file uploaded');
        }

        // Get image buffer
        const imageBuffer = await data.toBuffer();

        // Parse query parameters
        const query = DetectionRequestSchema.parse({
          minConfidence: (request.query as Record<string, any>)?.minConfidence,
        });

        logger.info(
          {
            userId: request.user?.userId,
            filename: data.filename,
            mimetype: data.mimetype,
            size: imageBuffer.length,
          },
          'Processing detection request'
        );

        // Run detection
        const response = await detectionService.detectObjects(imageBuffer, {
          minConfidence: query.minConfidence,
          userId: request.user?.userId,
        });

        return reply.code(200).send(response);
      } catch (error) {
        logger.error({ error }, 'Detection request failed');
        throw error;
      }
    }
  );
}
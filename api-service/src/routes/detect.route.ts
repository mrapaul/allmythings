import { FastifyInstance } from 'fastify';
import { VisionOrchestratorService } from '../services/vision-orchestrator.service';
import { DetectionRequestSchema } from '../schemas/detection.schema';
import { logger } from '../utils/logger';

/**
 * POST /v1/detect - Object detection endpoint
 */
export async function detectRoute(fastify: FastifyInstance): Promise<void> {
  const orchestrator = new VisionOrchestratorService();

  fastify.post('/v1/detect', async (request, reply) => {
    try {
      // Get uploaded image
      const data = await request.file();
      if (!data) {
        return reply.code(400).send({ error: 'No image provided' });
      }

      const imageBuffer = await data.toBuffer();

      // Validate request body
      const body = DetectionRequestSchema.parse(request.body || {});

      logger.info(
        { minConfidence: body.minConfidence, imageSize: imageBuffer.length },
        'Processing detection request'
      );

      // Detect objects using ensemble
      const result = await orchestrator.detectObjects(imageBuffer);

      return reply.code(200).send(result);
    } catch (error) {
      logger.error({ error }, 'Detection failed');

      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Detection failed',
      });
    }
  });
}

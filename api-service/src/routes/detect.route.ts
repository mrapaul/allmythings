import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { FlorencePipelineService } from '../services/florence-pipeline.service';
import { ImageQualityService } from '../services/image-quality.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { BadRequestError, PayloadTooLargeError } from '../utils/errors';
import { logger } from '../utils/logger';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function detectRoute(app: FastifyInstance): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipeline = (app as any).pipeline as FlorencePipelineService;
  const qualityService = new ImageQualityService();

  app.post('/v1/detect', { preHandler: authMiddleware }, async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await request.file();
    if (!data) throw new BadRequestError('No image file uploaded');

    const imageBuffer = await data.toBuffer();
    if (imageBuffer.length > MAX_IMAGE_SIZE) {
      throw new PayloadTooLargeError(`Image exceeds ${MAX_IMAGE_SIZE / 1024 / 1024}MB limit`);
    }
    if (data.mimetype && !SUPPORTED_TYPES.includes(data.mimetype)) {
      throw new BadRequestError(`Unsupported image type: ${data.mimetype}`);
    }

    logger.info({ filename: data.filename, size: imageBuffer.length }, 'Processing detection request');

    const [result, quality] = await Promise.all([
      pipeline.detect(imageBuffer),
      qualityService.analyzeQuality(imageBuffer),
    ]);

    return reply.code(200).send({
      ...result,
      imageQuality: { blur: quality.blurScore, brightness: quality.brightness, contrast: quality.contrast },
    });
  });
}

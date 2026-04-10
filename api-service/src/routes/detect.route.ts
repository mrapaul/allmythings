import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { DetectionPipelineService } from '../services/detection-pipeline.service';
import { ImageQualityService } from '../services/image-quality.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { BadRequestError, PayloadTooLargeError } from '../utils/errors';
import { logger } from '../utils/logger';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function detectRoute(app: FastifyInstance): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipeline = (app as any).pipeline as DetectionPipelineService;
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

    const quality = await qualityService.analyzeQuality(imageBuffer);
    const mode = (request.query as { mode?: string }).mode;

    // Blocking mode: single JSON response
    if (mode === 'full') {
      const result = await pipeline.detectFull(imageBuffer);
      return reply.code(200).send({
        ...result,
        imageQuality: { blur: quality.blurScore, brightness: quality.brightness, contrast: quality.contrast },
      });
    }

    // SSE streaming mode (default)
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const sendSSE = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const fullResult = await pipeline.detectFull(imageBuffer);

    if (fullResult.fastPass) {
      sendSSE('fast_pass', {
        phase: 'fast',
        detections: fullResult.fastPass.detections,
        count: fullResult.fastPass.detections.length,
        processing_ms: fullResult.fastPass.processingTimeMs,
      });
    }

    if (fullResult.deepPass) {
      sendSSE('deep_pass', {
        phase: 'deep',
        detections: fullResult.fused,
        count: fullResult.fused.length,
        processing_ms: fullResult.deepPass.processingTimeMs,
      });
    }

    const matchedCount = fullResult.fused.filter((d) => d.source === 'matched').length;
    const fastOnlyCount = fullResult.fused.filter((d) => d.source === 'fast_only').length;
    const deepOnlyCount = fullResult.fused.filter((d) => d.source === 'deep_only').length;

    sendSSE('done', {
      total: fullResult.fused.length,
      fast_only: fastOnlyCount,
      deep_only: deepOnlyCount,
      matched: matchedCount,
      imageQuality: { blur: quality.blurScore, brightness: quality.brightness, contrast: quality.contrast },
    });

    reply.raw.end();
  });
}

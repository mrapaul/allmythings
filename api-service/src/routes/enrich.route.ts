import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../middleware/auth.middleware';
import type { EnrichService } from '../services/enrich.service';

const MAX_CROP_SIZE = 10 * 1024 * 1024;
const MAX_LABEL_LENGTH = 200;

/**
 * POST /v1/enrich — resale-grade close-look pass on a single saved item's crop.
 *
 * The app sends each saved item's thumbnail crop (plus its current label) in
 * the background after a save; the detection model reads brand marks, model
 * hints, era/style and material off the close-up. The service is fail-open and
 * internally serialized (concurrency 1), so this route answers 200 even when
 * the model is down and a 50-item burst simply queues — only a missing or
 * oversized upload is an error.
 */
export async function enrichRoute(app: FastifyInstance): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enrich = (app as any).enrichService as EnrichService | undefined;

  app.post(
    '/v1/enrich',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Enrich a single saved item crop with resale-grade attributes',
        tags: ['vision'],
        consumes: ['multipart/form-data'],
        response: {
          200: {
            type: 'object',
            required: ['label', 'attributes', 'confidence', 'description'],
            properties: {
              label: { type: 'string' },
              attributes: {
                type: 'object',
                properties: {
                  color: { type: 'string' },
                  material: { type: 'string' },
                  style: { type: 'string' },
                  era: { type: 'string' },
                  brand: { type: 'string' },
                  model: { type: 'string' },
                },
              },
              confidence: { type: 'number', nullable: true },
              description: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!enrich) {
        return reply.code(503).send({ error: 'enrich_unavailable' });
      }

      let crop: Buffer | null = null;
      let existingLabel: string | undefined;
      for await (const part of request.parts()) {
        if (part.type === 'file') {
          // Always drain the stream — an unconsumed file part stalls iteration.
          const buf = await part.toBuffer();
          if (crop) continue; // first file wins
          if (buf.length > MAX_CROP_SIZE) {
            return reply.code(413).send({ error: 'payload_too_large' });
          }
          crop = buf;
        } else if (part.fieldname === 'label' && typeof part.value === 'string') {
          const trimmed = part.value.trim().slice(0, MAX_LABEL_LENGTH);
          if (trimmed.length > 0) existingLabel = trimmed;
        }
      }
      if (!crop) {
        return reply.code(400).send({ error: 'no_crop_uploaded' });
      }

      const result = await enrich.enrich(crop, existingLabel);
      return reply.code(200).send(result);
    },
  );
}

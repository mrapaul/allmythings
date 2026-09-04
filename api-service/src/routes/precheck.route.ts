import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../middleware/auth.middleware';
import type { PrecheckService } from '../services/precheck.service';

const MAX_PREVIEW_SIZE = 10 * 1024 * 1024;

/**
 * POST /v1/precheck — fast capture-time verdict on a small preview frame.
 *
 * The app calls this while the user is framing a shot; the response drives
 * real-time guidance (interior? bright enough? close enough?). The service is
 * fail-open, so this route answers 200 even when the model is down — only a
 * missing/oversized upload is an error.
 */
export async function precheckRoute(app: FastifyInstance): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const precheck = (app as any).precheckService as PrecheckService | undefined;

  app.post(
    '/v1/precheck',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Fast capture precheck on a small preview frame',
        tags: ['vision'],
        consumes: ['multipart/form-data'],
        response: {
          200: {
            type: 'object',
            required: [
              'scene',
              'quality',
              'objectDensity',
              'visibleObjectCount',
              'peoplePresent',
              'processable',
              'advice',
            ],
            properties: {
              scene: {
                type: 'string',
                enum: ['interior', 'exterior', 'person_focus', 'document', 'other'],
              },
              quality: {
                type: 'string',
                enum: ['ok', 'too_dark', 'too_blurry', 'too_far'],
              },
              objectDensity: {
                type: 'string',
                enum: ['none', 'few', 'moderate', 'many', 'too_many'],
              },
              visibleObjectCount: { type: 'integer', nullable: true },
              peoplePresent: { type: 'boolean' },
              processable: { type: 'boolean' },
              advice: { type: 'string', nullable: true },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!precheck) {
        return reply.code(503).send({ error: 'precheck_unavailable' });
      }

      let preview: Buffer | null = null;
      for await (const part of request.parts()) {
        if (part.type !== 'file') continue;
        const buf = await part.toBuffer();
        if (buf.length > MAX_PREVIEW_SIZE) {
          return reply.code(413).send({ error: 'payload_too_large' });
        }
        preview = buf;
        break;
      }
      if (!preview) {
        return reply.code(400).send({ error: 'no_image_uploaded' });
      }

      const result = await precheck.precheck(preview);
      return reply.code(200).send(result);
    },
  );
}

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { envConfig } from '../config/env.config';
import { authMiddleware } from '../middleware/auth.middleware';
import type { FlywheelService } from '../services/flywheel.service';
import { logger } from '../utils/logger';

const normBoxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
});

const detectedItemSchema = z.object({
  label: z.string().min(1),
  description: z.string(),
  category: z.string(),
  tags: z.array(z.string()),
  box: normBoxSchema,
});

const sceneSchema = z.object({
  type: z.enum(['shelf', 'drawer', 'room', 'closeup', 'unknown']),
  estimatedTotalItems: z.number().nullable(),
  verdict: z.enum(['ok', 'too_dark', 'too_blurry', 'too_far', 'not_a_scene']),
  verdictReason: z.string().nullable(),
});

const eventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('accept'), item: detectedItemSchema }),
  z.object({ type: z.literal('discard'), item: detectedItemSchema }),
  z.object({
    type: z.literal('relabel'),
    item: detectedItemSchema,
    newLabel: z.string().min(1),
    newTags: z.array(z.string()),
  }),
  z.object({ type: z.literal('add_box'), item: detectedItemSchema }),
  z.object({
    type: z.literal('photo_verdict'),
    verdict: sceneSchema.shape.verdict,
    userOverride: z.boolean(),
  }),
]);

const correctionsSchema = z.object({
  photoSha256: z.string().regex(/^[0-9a-f]{64}$/),
  model: z.string().min(1),
  capturedAt: z.string(),
  scene: sceneSchema.nullable(),
  events: z.array(eventSchema).max(500),
});

export type CorrectionsBody = z.infer<typeof correctionsSchema>;

/**
 * POST /v1/corrections — flywheel intake for user-verified detection outcomes.
 */
export async function correctionsRoute(app: FastifyInstance): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flywheel = (app as any).flywheel as FlywheelService | undefined;

  app.post(
    '/v1/corrections',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Record user corrections as training-data flywheel samples',
        tags: ['flywheel'],
        response: { 204: { type: 'null', description: 'Recorded' } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!flywheel) {
        return reply.code(503).send({ error: 'flywheel_unavailable' });
      }
      const parsed = correctionsSchema.safeParse(request.body);
      if (!parsed.success) {
        logger.warn({ issues: parsed.error.issues.slice(0, 3) }, 'corrections_invalid_body');
        return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
      }
      // The app doesn't know which backend served the run; stamp the active
      // chain head so exported datasets carry model provenance.
      const serverModel =
        envConfig.geminiApiKey && envConfig.detectorPrimary === 'gemini'
          ? envConfig.geminiModel
          : envConfig.ollamaModel;
      await flywheel.append({ ...parsed.data, serverModel });
      return reply.code(204).send();
    },
  );
}

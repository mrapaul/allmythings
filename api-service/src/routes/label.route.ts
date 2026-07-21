import sharp from 'sharp';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../middleware/auth.middleware';
import { DetectorUnavailableError, type VlmClient } from '../clients/vlm-client';
import { buildLabelPrompt, rawItemToDetectedItem, stripAndParseJson } from '../services/vlm-detector.parse';
import { logger } from '../utils/logger';

const MAX_CROP_SIZE = 10 * 1024 * 1024;
const CROP_MAX_DIMENSION = 512;

/**
 * POST /v1/label — auto-label a user-drawn crop (draw-to-teach).
 *
 * The app sends the cropped region of a missed object; the active VLM names
 * it so the user only has to confirm. One model call, no boxes involved.
 */
export async function labelRoute(app: FastifyInstance): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const labelClient = (app as any).labelClient as VlmClient | undefined;

  app.post(
    '/v1/label',
    {
      preHandler: authMiddleware,
      schema: {
        summary: 'Suggest a label for a single-object crop',
        tags: ['vision'],
        consumes: ['multipart/form-data'],
        response: {
          200: {
            type: 'object',
            required: ['label', 'category', 'description', 'tags'],
            properties: {
              label: { type: 'string' },
              category: { type: 'string' },
              description: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!labelClient) {
        return reply.code(503).send({ error: 'detector_unavailable' });
      }
      let crop: Buffer | null = null;
      for await (const part of request.parts()) {
        if (part.type !== 'file') continue;
        const buf = await part.toBuffer();
        if (buf.length > MAX_CROP_SIZE) {
          return reply.code(413).send({ error: 'payload_too_large' });
        }
        crop = buf;
        break;
      }
      if (!crop) {
        return reply.code(400).send({ error: 'no_crop_uploaded' });
      }

      let base64: string;
      try {
        const jpeg = await sharp(crop)
          .rotate()
          .resize(CROP_MAX_DIMENSION, CROP_MAX_DIMENSION, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: 85 })
          .toBuffer();
        base64 = jpeg.toString('base64');
      } catch {
        // Tiny/odd test payloads that sharp cannot decode still go to the
        // model as-is; the VLM either answers or we return 422 below.
        base64 = crop.toString('base64');
      }

      try {
        const raw = await labelClient.generateJson(buildLabelPrompt(), base64);
        const item = parseLabelResponse(raw);
        if (!item) {
          logger.warn({ raw: raw.slice(0, 120) }, 'label_unparseable');
          return reply.code(422).send({ error: 'label_unparseable' });
        }
        logger.info({ label: item.label, category: item.category }, 'label_suggested');
        return reply.code(200).send(item);
      } catch (err) {
        if (err instanceof DetectorUnavailableError) {
          return reply.code(503).send({ error: 'detector_unavailable', message: err.message });
        }
        throw err;
      }
    },
  );
}

function parseLabelResponse(
  raw: string,
): { label: string; category: string; description: string; tags: string[] } | null {
  let parsed: unknown;
  try {
    parsed = stripAndParseJson(raw);
  } catch {
    return null;
  }
  // Reuse the detector's item mapping with a synthetic full-crop box.
  const item = rawItemToDetectedItem(parsed, { x: 0, y: 0, width: 1, height: 1 });
  if (!item) return null;
  const topLevelDescription =
    parsed !== null &&
    typeof parsed === 'object' &&
    typeof (parsed as Record<string, unknown>).description === 'string'
      ? ((parsed as Record<string, unknown>).description as string).trim()
      : '';
  return {
    label: item.label,
    category: item.category,
    description: topLevelDescription || item.description,
    tags: item.tags,
  };
}

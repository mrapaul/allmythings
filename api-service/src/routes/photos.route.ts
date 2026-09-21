import path from 'node:path';
import fs from 'node:fs/promises';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { envConfig } from '../config/env.config';
import { annotatedPhotoPath } from '../services/photo-annotator';

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

/**
 * Photo serving. Raw files under `<photoDir>/photos/` are served by the
 * @fastify/static wildcard registered in app.ts; this parametric route takes
 * precedence for single-segment paths so it can answer the annotated variant.
 *
 * Mobile contract: the annotated render of a detection photo — every
 * returned DetectedItem's box burned into the frame — is derivable as
 * `${base}/photos/<photoSha256>.jpg?annotated=1`. `photoSha256` is already
 * returned by POST /v1/detect?async=1 (202 body) and the SSE `meta` event,
 * so no response schema changes. The annotated file is rendered
 * fire-and-forget after a successful VLM detection; until it exists this
 * route 404s and the client falls back to the raw photo. Requests without
 * `annotated` pass straight through to the raw static file.
 */
export async function photosRoute(app: FastifyInstance): Promise<void> {
  const photosDir = path.join(envConfig.photoDir, 'photos');

  app.get(
    '/photos/:filename',
    {
      schema: {
        summary: 'Serve a persisted detection photo',
        description:
          'Returns the raw photo by default. With `annotated=1`, returns the annotated render of a detection photo (every returned DetectedItem box + label burned in). The annotated URL is derived from photoSha256 — returned by POST /v1/detect?async=1 and the SSE meta event — as `${base}/photos/<photoSha256>.jpg?annotated=1`; it is rendered asynchronously after a successful detection and 404s until ready (fall back to the raw photo).',
        tags: ['vision'],
        params: {
          type: 'object',
          required: ['filename'],
          properties: { filename: { type: 'string' } },
        },
        querystring: {
          type: 'object',
          properties: {
            annotated: {
              type: 'string',
              description: "Pass '1' for the annotated render; absent serves the raw photo.",
            },
          },
        },
        response: {
          200: { description: 'image bytes', type: 'string' },
          404: {
            type: 'object',
            properties: { statusCode: { type: 'number' }, error: { type: 'string' } },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { filename } = request.params as { filename: string };
      const annotated = (request.query as Record<string, unknown> | undefined)?.annotated;
      if (annotated !== '1' && annotated !== 'true') {
        // No annotated variant requested: serve the raw file exactly as the
        // static wildcard would (etag/cache headers, 404 via notFound).
        return reply.sendFile(filename);
      }
      // `<sha>.jpg?annotated=1` → `<sha>.annotated.jpg` on disk.
      const sha = IMAGE_EXT.test(filename) ? filename.replace(IMAGE_EXT, '') : filename;
      try {
        const data = await fs.readFile(annotatedPhotoPath(photosDir, sha));
        return reply.type('image/jpeg').send(data);
      } catch {
        // Not rendered yet (or unknown photo): fall back to the raw photo.
        return reply.callNotFound();
      }
    },
  );
}

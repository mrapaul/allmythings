process.env.NODE_ENV = 'development';

import { describe, it, expect, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import FormData from 'form-data';
import { enrichRoute } from '../../../routes/enrich.route';
import type { EnrichResult, EnrichService } from '../../../services/enrich.service';

const TINY_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

const OK_RESULT: EnrichResult = {
  label: 'walnut mid-century sideboard',
  attributes: { color: 'walnut brown', material: 'wood', era: '1960s' },
  confidence: 0.85,
  description: 'A walnut mid-century sideboard with tapered legs.',
};

function stubService(result: EnrichResult = OK_RESULT) {
  return {
    enrich: vi.fn(
      async (_image: Buffer, _label?: string): Promise<EnrichResult> => result,
    ),
  };
}

async function makeApp(service?: ReturnType<typeof stubService>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 3 } });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (app as any).enrichService = service as unknown as EnrichService | undefined;
  await app.register(enrichRoute);
  return app;
}

function postCrop(
  app: FastifyInstance,
  opts: { image?: Buffer | null; label?: string } = {},
) {
  const form = new FormData();
  if (opts.image !== null) {
    form.append('crop', opts.image ?? TINY_JPEG, {
      filename: 'crop.jpg',
      contentType: 'image/jpeg',
    });
  }
  if (opts.label !== undefined) {
    form.append('label', opts.label);
  }
  return app.inject({
    method: 'POST',
    url: '/v1/enrich',
    payload: form.getBuffer(),
    headers: form.getHeaders(),
  });
}

describe('POST /v1/enrich', () => {
  let app: FastifyInstance;
  afterEach(async () => {
    await app.close();
  });

  it('returns the enriched verdict for an uploaded crop', async () => {
    // Arrange
    const service = stubService();
    app = await makeApp(service);

    // Act
    const res = await postCrop(app);

    // Assert
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(OK_RESULT);
    expect(service.enrich).toHaveBeenCalledTimes(1);
    expect(Buffer.isBuffer(service.enrich.mock.calls[0]?.[0])).toBe(true);
    expect(service.enrich.mock.calls[0]?.[1]).toBeUndefined();
  });

  it('passes the optional label field through to the service', async () => {
    // Arrange
    const service = stubService();
    app = await makeApp(service);

    // Act
    const res = await postCrop(app, { label: 'sideboard' });

    // Assert
    expect(res.statusCode).toBe(200);
    expect(service.enrich.mock.calls[0]?.[1]).toBe('sideboard');
  });

  it('ignores a blank label field', async () => {
    // Arrange
    const service = stubService();
    app = await makeApp(service);

    // Act
    await postCrop(app, { label: '   ' });

    // Assert
    expect(service.enrich.mock.calls[0]?.[1]).toBeUndefined();
  });

  it('passes through a fail-open result unchanged', async () => {
    // Arrange
    const failOpen: EnrichResult = {
      label: 'blue armchair',
      attributes: {},
      confidence: null,
      description: '',
    };
    app = await makeApp(stubService(failOpen));

    // Act
    const res = await postCrop(app, { label: 'blue armchair' });

    // Assert
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(failOpen);
  });

  it('returns 400 when no file is uploaded', async () => {
    // Arrange
    app = await makeApp(stubService());

    // Act
    const res = await postCrop(app, { image: null, label: 'no crop here' });

    // Assert
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('no_crop_uploaded');
  });

  it('returns 503 when the service is not wired', async () => {
    // Arrange
    app = await makeApp(undefined);

    // Act
    const res = await postCrop(app);

    // Assert
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe('enrich_unavailable');
  });
});

process.env.NODE_ENV = 'development';

import { describe, it, expect, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import FormData from 'form-data';
import { precheckRoute } from '../../../routes/precheck.route';
import type { PrecheckResult, PrecheckService } from '../../../services/precheck.service';

const TINY_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

const OK_RESULT: PrecheckResult = {
  scene: 'interior',
  quality: 'ok',
  objectDensity: 'moderate',
  visibleObjectCount: 12,
  peoplePresent: false,
  processable: true,
  advice: null,
};

function stubService(result: PrecheckResult = OK_RESULT) {
  return { precheck: vi.fn(async (_image: Buffer): Promise<PrecheckResult> => result) };
}

async function makeApp(service?: ReturnType<typeof stubService>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (app as any).precheckService = service as unknown as PrecheckService | undefined;
  await app.register(precheckRoute);
  return app;
}

function postPreview(app: FastifyInstance, image: Buffer = TINY_JPEG) {
  const form = new FormData();
  form.append('preview', image, { filename: 'preview.jpg', contentType: 'image/jpeg' });
  return app.inject({
    method: 'POST',
    url: '/v1/precheck',
    payload: form.getBuffer(),
    headers: form.getHeaders(),
  });
}

describe('POST /v1/precheck', () => {
  let app: FastifyInstance;
  afterEach(async () => {
    await app.close();
  });

  it('returns the service verdict for an uploaded preview', async () => {
    // Arrange
    const service = stubService();
    app = await makeApp(service);

    // Act
    const res = await postPreview(app);

    // Assert
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(OK_RESULT);
    expect(service.precheck).toHaveBeenCalledTimes(1);
    expect(Buffer.isBuffer(service.precheck.mock.calls[0]?.[0])).toBe(true);
  });

  it('passes through a non-processable verdict with advice', async () => {
    // Arrange
    const rejected: PrecheckResult = {
      scene: 'exterior',
      quality: 'ok',
      objectDensity: 'few',
      visibleObjectCount: 3,
      peoplePresent: false,
      processable: false,
      advice: 'This looks like the outdoors — inventory needs interior photos',
    };
    app = await makeApp(stubService(rejected));

    // Act
    const res = await postPreview(app);

    // Assert
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(rejected);
  });

  it('returns 400 when no file is uploaded', async () => {
    // Arrange
    app = await makeApp(stubService());
    const form = new FormData();
    form.append('note', 'no file here');

    // Act
    const res = await app.inject({
      method: 'POST',
      url: '/v1/precheck',
      payload: form.getBuffer(),
      headers: form.getHeaders(),
    });

    // Assert
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('no_image_uploaded');
  });

  it('returns 503 when the service is not wired', async () => {
    // Arrange
    app = await makeApp(undefined);

    // Act
    const res = await postPreview(app);

    // Assert
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe('precheck_unavailable');
  });
});

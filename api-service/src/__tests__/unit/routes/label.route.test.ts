process.env.NODE_ENV = 'development';

import { describe, it, expect, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import FormData from 'form-data';
import { labelRoute } from '../../../routes/label.route';
import { DetectorUnavailableError, type VlmClient } from '../../../clients/vlm-client';

const TINY_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

function client(response: string | Error): VlmClient {
  return {
    modelName: 'stub',
    generateJson: async (): Promise<string> => {
      if (response instanceof Error) throw response;
      return response;
    },
  };
}

async function makeApp(vlm: VlmClient): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (app as any).labelClient = vlm;
  await app.register(labelRoute);
  return app;
}

function postCrop(app: FastifyInstance) {
  const form = new FormData();
  form.append('crop', TINY_JPEG, { filename: 'crop.jpg', contentType: 'image/jpeg' });
  return app.inject({
    method: 'POST',
    url: '/v1/label',
    payload: form.getBuffer(),
    headers: { ...form.getHeaders(), 'x-api-key': 'test-key' },
  });
}

describe('POST /v1/label', () => {
  let app: FastifyInstance;
  afterEach(async () => {
    await app.close();
  });

  it('labels a crop with the model suggestion', async () => {
    app = await makeApp(
      client(
        JSON.stringify({
          object: 'ceramic vase',
          category: 'Decor',
          description: 'small white ceramic vase',
          tags: { color: 'white', material: 'ceramic', condition: 'good' },
        }),
      ),
    );
    const res = await postCrop(app);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      label: 'ceramic vase',
      category: 'Decor',
      description: 'small white ceramic vase',
      tags: ['white', 'ceramic', 'good'],
    });
  });

  it('returns 503 when the model is unavailable', async () => {
    app = await makeApp(client(new DetectorUnavailableError('down')));
    const res = await postCrop(app);
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe('detector_unavailable');
  });

  it('returns 422 when the model output has no usable label', async () => {
    app = await makeApp(client('not json'));
    const res = await postCrop(app);
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('label_unparseable');
  });

  it('returns 400 without a file', async () => {
    app = await makeApp(client('{}'));
    const form = new FormData();
    form.append('note', 'no file here');
    const res = await app.inject({
      method: 'POST',
      url: '/v1/label',
      payload: form.getBuffer(),
      headers: form.getHeaders(),
    });
    expect(res.statusCode).toBe(400);
  });
});

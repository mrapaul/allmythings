process.env.NODE_ENV = 'development';

import { describe, it, expect, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { correctionsRoute } from '../../../routes/corrections.route';
import type { FlywheelService } from '../../../services/flywheel.service';

function makeFlywheel() {
  return { append: vi.fn(async () => undefined) } as unknown as FlywheelService & {
    append: ReturnType<typeof vi.fn>;
  };
}

async function makeApp(flywheel: FlywheelService): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (app as any).flywheel = flywheel;
  await app.register(correctionsRoute);
  return app;
}

const VALID_BODY = {
  photoSha256: 'ab'.repeat(32),
  model: 'gemma4:31b-cloud',
  capturedAt: '2026-07-21T12:00:00.000Z',
  scene: { type: 'room', estimatedTotalItems: 9, verdict: 'ok', verdictReason: null },
  events: [
    {
      type: 'accept',
      item: {
        label: 'sofa',
        description: 'red sofa',
        category: 'Furniture',
        tags: ['red'],
        box: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
      },
    },
    {
      type: 'relabel',
      item: {
        label: 'lamp',
        description: '',
        category: 'Lighting',
        tags: [],
        box: { x: 0.7, y: 0.1, width: 0.2, height: 0.4 },
      },
      newLabel: 'brass floor lamp',
      newTags: ['brass'],
    },
    { type: 'photo_verdict', verdict: 'ok', userOverride: false },
  ],
};

describe('POST /v1/corrections', () => {
  let app: FastifyInstance;
  afterEach(async () => {
    await app.close();
  });

  it('accepts a valid correction batch and appends it to the flywheel', async () => {
    const flywheel = makeFlywheel();
    app = await makeApp(flywheel);
    const res = await app.inject({ method: 'POST', url: '/v1/corrections', payload: VALID_BODY });
    expect(res.statusCode).toBe(204);
    expect(flywheel.append).toHaveBeenCalledTimes(1);
    expect(flywheel.append.mock.calls[0]![0]).toMatchObject({
      photoSha256: VALID_BODY.photoSha256,
      model: VALID_BODY.model,
    });
  });

  it('rejects an invalid body with 400', async () => {
    const flywheel = makeFlywheel();
    app = await makeApp(flywheel);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/corrections',
      payload: { photoSha256: 'short', events: 'nope' },
    });
    expect(res.statusCode).toBe(400);
    expect(flywheel.append).not.toHaveBeenCalled();
  });

  it('503s when the flywheel is not wired', async () => {
    app = await makeApp(undefined as unknown as FlywheelService);
    const res = await app.inject({ method: 'POST', url: '/v1/corrections', payload: VALID_BODY });
    expect(res.statusCode).toBe(503);
  });
});

// Set required env BEFORE importing the route module — envConfig reads
// process.env at module-load time and the auth middleware bypasses only
// when NODE_ENV === 'development'.
process.env.NODE_ENV = 'development';
process.env.PHOTO_DIR = '/tmp/api-test-photos-sse';
process.env.SSE_ITEM_DRIBBLE_MS = '0';

import { describe, expect, it, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { detectStreamRoute } from '../../../routes/detect-stream.route';
import type { PipelineClient, LaunchRunResult } from '../../../clients/pipeline.client';
import type { RunStatus, SceneObservation } from '../../../types/pipeline';
import { envConfig } from '../../../config/env.config';

const sceneFixture: SceneObservation = {
  sceneId: 's',
  runId: 'r1',
  frameIds: ['f1'],
  detections: [
    {
      id: 'd1',
      bbox: { x: 0, y: 0, width: 0.5, height: 0.5 },
      primaryLabel: 'Sofa',
      alternateLabels: [],
      vlmStructuredAttributes: { category: 'Furniture', description: 'Brown' },
      agreementScore: 1,
      contributingSignals: [],
      confidence: 0.9,
    },
    {
      id: 'd2',
      bbox: { x: 0.5, y: 0, width: 0.4, height: 0.4 },
      primaryLabel: 'Lamp',
      alternateLabels: [],
      vlmStructuredAttributes: { category: 'Lighting' },
      agreementScore: 1,
      contributingSignals: [],
      confidence: 0.8,
    },
  ],
  agreementCoverage: 1,
  agreementPrecision: 1,
  selfDiagnosisTriggered: false,
  rerunDepth: 0,
  flagged: false,
  processingMs: 5,
  errors: [],
  tileErrors: [],
};

class FakePipeline implements PipelineClient {
  async launchRun(): Promise<LaunchRunResult> {
    return { runId: 'r1', startedAt: new Date().toISOString(), idempotentHit: false };
  }
  async waitForCompletion(): Promise<RunStatus> {
    return {
      runId: 'r1',
      status: 'succeeded',
      startedAt: new Date().toISOString(),
      result: sceneFixture,
    };
  }
  async getRun(): Promise<RunStatus> {
    throw new Error('unused');
  }
}

describe('detectStreamRoute', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    envConfig.detector = 'pipeline';
    app = Fastify();
    await app.register(multipart);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (app as any).pipeline = new FakePipeline();
    process.env.SSE_ITEM_DRIBBLE_MS = '0';
    await detectStreamRoute(app);
  });

  it('emits meta, item×N, done in order', async () => {
    // Build a minimal multipart payload by hand — keep test deps small.
    const boundary = '----formdata-vitest-001';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from('Content-Disposition: form-data; name="frame"; filename="a.jpg"\r\n'),
      Buffer.from('Content-Type: image/jpeg\r\n\r\n'),
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/detect/stream',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    const events = res.body.split('\n\n').filter(Boolean);
    expect(events[0]).toMatch(/^event: meta\ndata: \{/);
    expect(events[1]).toMatch(/^event: item\ndata: \{.*Sofa/);
    expect(events[2]).toMatch(/^event: item\ndata: \{.*Lamp/);
    expect(events[3]).toMatch(/^event: done\ndata: \{.*"totalItems":2/);
  });
});

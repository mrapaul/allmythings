import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { ChainedSlmPipelineService } from '../../services/chained-slm-pipeline.service';
import { TrainingFeedbackPairSchema } from '../../../../packages/contracts/src';

describe('Integration: Chained SLM Pipeline + pgvector Continuous Learning Flywheel', () => {
  let db: Pool;
  let app: FastifyInstance;
  let mockSlmServer: http.Server;
  let mockSlmPort = 0;
  let lastReceivedVlmSystemPrompt = '';

  const fixtureImageBuffer = fs.readFileSync(
    path.join(__dirname, '../fixtures/room_01.jpg')
  );

  beforeAll(async () => {
    db = new Pool({
      connectionString:
        process.env.DATABASE_URL ??
        'postgres://inventory:inventory_password@localhost:5432/allmythings?sslmode=disable',
    });

    await db.query(`DELETE FROM slm_training_samples;`);
    await db.query(`DELETE FROM slm_adapter_versions;`);
    await db.query(`
      INSERT INTO slm_adapter_versions (model_stage, adapter_name, adapter_path, training_samples_count, is_active)
      VALUES 
        ('vision_extractor', 'qwen2.5-vl-3b-inventory-lora-test', '/models/adapters/v1', 100, TRUE),
        ('taxonomy_icon', 'qwen2.5-1.5b-taxonomy-lora-test', '/models/adapters/tax-v1', 100, TRUE);
    `);

    mockSlmServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');

        if (req.url === '/localize') {
          res.end(
            JSON.stringify({
              regions: [
                { box2d: { ymin: 120, xmin: 150, ymax: 480, xmax: 520 }, score: 0.94 },
              ],
            })
          );
          return;
        }

        if (req.url === '/embed') {
          const vec = Array.from({ length: 768 }, (_, i) => (i === 0 ? 0.99 : 0.001));
          res.end(JSON.stringify({ embedding: vec }));
          return;
        }

        if (req.url === '/v1/chat/completions') {
          const payload = JSON.parse(body);
          const sysContent: string = payload.messages?.[0]?.content ?? '';

          if (sysContent.includes('UI Taxonomy & Iconography model')) {
            res.end(
              JSON.stringify({
                choices: [
                  {
                    message: {
                      content: JSON.stringify({
                        facetId: 'coffee',
                        glyphName: 'cafe-outline',
                        accentHex: '#18181B',
                      }),
                    },
                  },
                ],
              })
            );
          } else {
            lastReceivedVlmSystemPrompt = sysContent;
            res.end(
              JSON.stringify({
                choices: [
                  {
                    message: {
                      content: JSON.stringify({
                        isBackgroundFixture: false,
                        name: 'Espresso Machine',
                        properties: {
                          brand: 'La Marzocco',
                          model: 'Linea Micra',
                          color: 'matte black',
                          material: 'stainless steel',
                        },
                        labels: ['espresso', 'la-marzocco', 'matte-black', 'stainless-steel'],
                      }),
                    },
                  },
                ],
              })
            );
          }
          return;
        }

        res.statusCode = 404;
        res.end();
      });
    });

    await new Promise<void>((resolve) => {
      mockSlmServer.listen(0, '127.0.0.1', () => {
        const addr = mockSlmServer.address();
        if (addr && typeof addr === 'object') mockSlmPort = addr.port;
        resolve();
      });
    });

    const baseUrl = `http://127.0.0.1:${mockSlmPort}`;
    const pipeline = new ChainedSlmPipelineService(db, {
      vllmBaseUrl: `${baseUrl}/v1`,
      localizerEndpoint: `${baseUrl}/localize`,
      embeddingEndpoint: `${baseUrl}/embed`,
    });

    app = Fastify();
    app.post<{ Body: { imageBase64: string } }>('/v1/detect/stream', async (req, reply) => {
      reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const buf = Buffer.from(req.body.imageBase64, 'base64');
      const gen = pipeline.runChainedDetection(buf);
      let step = await gen.next();
      while (!step.done) {
        reply.raw.write(`data: ${JSON.stringify({ type: 'object', data: step.value })}\n\n`);
        step = await gen.next();
      }
      reply.raw.write(
        `data: ${JSON.stringify({ type: 'completed', runId: step.value.runId, latencyMs: step.value.latencyMs })}\n\n`
      );
      reply.raw.end();
    });

    app.post<{ Body: { pairs: unknown[] } }>('/v1/slm/feedback-batch', async (req, reply) => {
      for (const rawPair of req.body.pairs) {
        const parsed = TrainingFeedbackPairSchema.parse(rawPair);
        await pipeline.ingestUserPreSaveTrainingPair(parsed, '/tmp/crop.jpg');
      }
      return reply.status(202).send({ ok: true });
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    mockSlmServer.close();
    await db.end();
  });

  it('streams zero-enum detections, records user pre-save label edits, and injects learned priors on subsequent runs', async () => {
    const streamRes1 = await app.inject({
      method: 'POST',
      url: '/v1/detect/stream',
      payload: { imageBase64: fixtureImageBuffer.toString('base64') },
    });

    expect(streamRes1.statusCode).toBe(200);
    const events1 = streamRes1.body
      .trim()
      .split('\n\n')
      .map((line) => JSON.parse(line.replace(/^data:\s*/, '')));

    const objectEvent = events1.find((e) => e.type === 'object');
    const completedEvent = events1.find((e) => e.type === 'completed');

    expect(objectEvent).toBeDefined();
    expect(objectEvent.data.name).toBe('Espresso Machine');
    expect(objectEvent.data.facet.glyphName).toBe('cafe-outline');
    expect(objectEvent.data.labels).toContain('la-marzocco');

    const feedbackRes = await app.inject({
      method: 'POST',
      url: '/v1/slm/feedback-batch',
      payload: {
        pairs: [
          {
            runId: completedEvent.runId,
            objectId: objectEvent.data.id,
            cropBase64: fixtureImageBuffer.toString('base64'),
            modelPrediction: {
              name: objectEvent.data.name,
              properties: objectEvent.data.properties,
              labels: objectEvent.data.labels,
              facet: objectEvent.data.facet,
            },
            userVerified: {
              name: 'La Marzocco Linea Micra',
              properties: {
                ...objectEvent.data.properties,
                boiler_type: 'dual-boiler',
                pump: 'rotary',
              },
              labels: [...objectEvent.data.labels, 'dual-boiler', 'rotary-pump'],
              facet: objectEvent.data.facet,
            },
            wasRejectedFalsePositive: false,
          },
        ],
      },
    });
    expect(feedbackRes.statusCode).toBe(202);

    await app.inject({
      method: 'POST',
      url: '/v1/detect/stream',
      payload: { imageBase64: fixtureImageBuffer.toString('base64') },
    });

    expect(lastReceivedVlmSystemPrompt).toContain('USER-CALIBRATED EXAMPLES FROM THIS HOME:');
    expect(lastReceivedVlmSystemPrompt).toContain('La Marzocco Linea Micra');
    expect(lastReceivedVlmSystemPrompt).toContain('dual-boiler');
  });
});

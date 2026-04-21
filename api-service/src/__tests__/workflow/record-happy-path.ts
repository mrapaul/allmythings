// Utility to regenerate happy-path-qwen7b.json. Run from api-service dir:
//   npx tsx src/__tests__/workflow/record-happy-path.ts
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import fs from 'node:fs';
import path from 'node:path';
import { detectInventoryWorkflow } from '../../temporal/workflows/detect-inventory.workflow';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

async function main() {
  const env = await TestWorkflowEnvironment.createTimeSkipping();
  try {
    const taskQueue = 'record-happy-path';
    const worker = await Worker.create({
      connection: env.nativeConnection,
      taskQueue,
      workflowsPath: path.resolve(
        __dirname,
        '../../temporal/workflows/detect-inventory.workflow.ts',
      ),
      activities: {
        savePhoto: async () => ({
          photoId: 'recorded',
          photoPath: '/p.jpg',
          thumbnailPath: '/t.jpg',
          bytes: 100,
        }),
        florenceDetect: async () => ({
          regions: [
            { caption: 'chair', x: 0, y: 0, width: 0.5, height: 0.5, regionIndex: 0 },
          ],
          imageWidth: 640,
          imageHeight: 480,
        }),
        enrichItem: async ({ region, tier }: Any) => ({
          id: 'r',
          regionIndex: region.regionIndex,
          label: 'chair',
          confidence: 0.9,
          bbox: { x: 0, y: 0, width: 0.5, height: 0.5 },
          enrichmentTier: tier,
          attributes: {
            name: 'chair',
            category: 'furniture',
            color: null,
            material: null,
            condition: null,
            estimatedValue: null,
            description: 'chair',
            searchTags: ['chair'],
          },
        }),
        assembleResult: async ({ saved, items, errors, traceId, startedAtMs }: Any) => ({
          photoId: saved.photoId,
          photoUrl: `/photos/${saved.photoId}.jpg`,
          itemCount: items.length,
          items,
          errors,
          traceId,
          processingMs: Date.now() - startedAtMs,
        }),
      },
    });

    const workflowId = 'record-wf-' + Date.now();
    const p = env.client.workflow.execute(detectInventoryWorkflow, {
      args: [
        {
          imageBase64: 'aGVsbG8=',
          imageSha256: 'abc',
          mimeType: 'image/jpeg',
          traceId: 't',
          requestId: 'r',
        },
      ],
      workflowId,
      taskQueue,
    });
    await Promise.all([p, worker.runUntil(p)]);

    const handle = env.client.workflow.getHandle(workflowId);
    const history = await handle.fetchHistory();
    const outPath = path.resolve(__dirname, 'histories/happy-path-qwen7b.json');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    // Worker.runReplayHistory expects proto3 JSON where Timestamps are ISO
    // strings and bytes fields are base64. Raw fetchHistory output has
    // Timestamps as { seconds, nanos } objects and bytes as Buffers. We
    // can't use @temporalio/common's historyToJSON helper because it trips
    // over a known bug in proto3-json-serializer@2.0.2 (installed by
    // Temporal 1.16.1) that throws on Buffer fields. So we normalise
    // manually: timestamps -> ISO strings, Buffers/Uint8Arrays -> base64.
    const normalised = normaliseHistoryForReplay(history);
    fs.writeFileSync(outPath, JSON.stringify(normalised, null, 2));
    console.log('Wrote', outPath);
  } finally {
    await env.teardown();
  }
}

function normaliseHistoryForReplay(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Buffer) return value.toString('base64');
  if (value instanceof Uint8Array) return Buffer.from(value).toString('base64');
  if (Array.isArray(value)) return value.map(normaliseHistoryForReplay);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    // google.protobuf.Timestamp { seconds, nanos } -> RFC3339 ISO string.
    if (
      Object.keys(obj).length <= 2 &&
      ('seconds' in obj || 'nanos' in obj) &&
      (typeof obj.seconds === 'number' ||
        typeof obj.seconds === 'string' ||
        obj.seconds === undefined) &&
      (typeof obj.nanos === 'number' || obj.nanos === undefined)
    ) {
      const secs = Number(obj.seconds ?? 0);
      const nanos = Number(obj.nanos ?? 0);
      const ms = secs * 1000 + Math.floor(nanos / 1_000_000);
      return new Date(ms).toISOString();
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = normaliseHistoryForReplay(v);
    }
    return out;
  }
  return value;
}

void main();

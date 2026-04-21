import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { detectInventoryWorkflow } from '../../temporal/workflows/detect-inventory.workflow';
import { DetectInput } from '../../temporal/shared-types';

describe('detectInventoryWorkflow', () => {
  let testEnv: TestWorkflowEnvironment;

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  }, 120_000);

  afterAll(async () => {
    await testEnv?.teardown();
  });

  function makeInput(): DetectInput {
    return {
      imageBase64: Buffer.from('fake-image').toString('base64'),
      imageSha256: 'e' + randomUUID().replace(/-/g, ''),
      mimeType: 'image/jpeg',
      traceId: randomUUID().replace(/-/g, ''),
      requestId: randomUUID(),
    };
  }

  async function runWith(activities: Record<string, unknown>, input: DetectInput) {
    const taskQueue = 'test-inventory-' + randomUUID();
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue,
      workflowsPath: path.resolve(
        __dirname,
        '../../temporal/workflows/detect-inventory.workflow.ts',
      ),
      activities,
    });
    const resultPromise = testEnv.client.workflow.execute(detectInventoryWorkflow, {
      args: [input],
      workflowId: 'wf-' + input.imageSha256,
      taskQueue,
    });
    const [result] = await Promise.all([resultPromise, worker.runUntil(resultPromise)]);
    return result;
  }

  it('completes happy path: save -> florence -> enrich (tier1) -> assemble', async () => {
    const input = makeInput();
    const result = await runWith(
      {
        savePhoto: async () => ({
          photoId: 'p1',
          photoPath: '/p1.jpg',
          thumbnailPath: '/p1_thumb.jpg',
          bytes: 100,
        }),
        florenceDetect: async () => ({
          regions: [
            { caption: 'chair', x: 0, y: 0, width: 0.5, height: 0.5, regionIndex: 0 },
          ],
          imageWidth: 640,
          imageHeight: 480,
        }),
        enrichItem: async ({
          tier,
          region,
        }: {
          tier: string;
          region: {
            regionIndex: number;
            x: number;
            y: number;
            width: number;
            height: number;
          };
        }) => ({
          id: 'i1',
          regionIndex: region.regionIndex,
          label: 'chair',
          confidence: 0.9,
          bbox: {
            x: region.x,
            y: region.y,
            width: region.width,
            height: region.height,
          },
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
        assembleResult: async ({
          saved,
          items,
          errors,
          traceId,
          startedAtMs,
        }: {
          saved: { photoId: string };
          items: unknown[];
          errors: unknown[];
          traceId: string;
          startedAtMs: number;
        }) => ({
          photoId: saved.photoId,
          photoUrl: `/photos/${saved.photoId}.jpg`,
          itemCount: items.length,
          items,
          errors,
          traceId,
          processingMs: Date.now() - startedAtMs,
        }),
      },
      input,
    );

    expect(result.photoId).toBe('p1');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].enrichmentTier).toBe('qwen7b');
    expect(result.errors).toEqual([]);
  }, 60_000);

  it('downgrades to qwen3b when tier1 activity fails retryably', async () => {
    const input = makeInput();
    const result = await runWith(
      {
        savePhoto: async () => ({
          photoId: 'p2',
          photoPath: '/p2.jpg',
          thumbnailPath: '/p2_t.jpg',
          bytes: 100,
        }),
        florenceDetect: async () => ({
          regions: [
            { caption: 'lamp', x: 0, y: 0, width: 0.5, height: 0.5, regionIndex: 0 },
          ],
          imageWidth: 640,
          imageHeight: 480,
        }),
        enrichItem: async ({ tier }: { tier: string }) => {
          if (tier === 'qwen7b') throw new Error('qwen7b transient failure');
          return {
            id: 'i1',
            regionIndex: 0,
            label: 'lamp',
            confidence: 0.8,
            bbox: { x: 0, y: 0, width: 0.5, height: 0.5 },
            enrichmentTier: tier,
            attributes: {
              name: 'lamp',
              category: 'lighting',
              color: null,
              material: null,
              condition: null,
              estimatedValue: null,
              description: 'lamp',
              searchTags: ['lamp'],
            },
          };
        },
        assembleResult: async ({
          saved,
          items,
          errors,
          traceId,
          startedAtMs,
        }: {
          saved: { photoId: string };
          items: unknown[];
          errors: unknown[];
          traceId: string;
          startedAtMs: number;
        }) => ({
          photoId: saved.photoId,
          photoUrl: `/photos/${saved.photoId}.jpg`,
          itemCount: items.length,
          items,
          errors,
          traceId,
          processingMs: Date.now() - startedAtMs,
        }),
      },
      input,
    );

    expect(result.items[0].enrichmentTier).toBe('qwen3b');
  }, 60_000);

  it('falls all the way to florence-only when every tier throws', async () => {
    const input = makeInput();
    const result = await runWith(
      {
        savePhoto: async () => ({
          photoId: 'p3',
          photoPath: '/p3.jpg',
          thumbnailPath: '/p3_t.jpg',
          bytes: 100,
        }),
        florenceDetect: async () => ({
          regions: [
            { caption: 'mystery', x: 0, y: 0, width: 1, height: 1, regionIndex: 0 },
          ],
          imageWidth: 1,
          imageHeight: 1,
        }),
        enrichItem: async ({
          tier,
          region,
        }: {
          tier: string;
          region: {
            regionIndex: number;
            x: number;
            y: number;
            width: number;
            height: number;
            caption: string;
          };
        }) => {
          if (tier !== 'florence-only') throw new Error(`${tier} failed`);
          return {
            id: 'flo',
            regionIndex: region.regionIndex,
            label: region.caption,
            confidence: 0.5,
            bbox: {
              x: region.x,
              y: region.y,
              width: region.width,
              height: region.height,
            },
            enrichmentTier: 'florence-only',
            attributes: {
              name: region.caption,
              category: 'household item',
              color: null,
              material: null,
              condition: null,
              estimatedValue: null,
              description: 'x',
              searchTags: [],
            },
          };
        },
        assembleResult: async ({
          saved,
          items,
          errors,
          traceId,
          startedAtMs,
        }: {
          saved: { photoId: string };
          items: unknown[];
          errors: unknown[];
          traceId: string;
          startedAtMs: number;
        }) => ({
          photoId: saved.photoId,
          photoUrl: `/photos/${saved.photoId}.jpg`,
          itemCount: items.length,
          items,
          errors,
          traceId,
          processingMs: Date.now() - startedAtMs,
        }),
      },
      input,
    );

    expect(result.items[0].enrichmentTier).toBe('florence-only');
  }, 60_000);

  it('fails the workflow when savePhoto throws non-retryably', async () => {
    const input = makeInput();
    input.mimeType = 'text/plain';
    // Use an ApplicationFailure-style object so Temporal classifies it nonRetryable
    const { ApplicationFailure } = await import('@temporalio/common');
    await expect(
      runWith(
        {
          savePhoto: async () => {
            throw ApplicationFailure.create({
              message: 'bad mime',
              type: 'UnsupportedMediaType',
              nonRetryable: true,
            });
          },
          florenceDetect: async () => ({ regions: [], imageWidth: 1, imageHeight: 1 }),
          enrichItem: async () => {
            throw new Error('unreachable');
          },
          assembleResult: async () => {
            throw new Error('unreachable');
          },
        },
        input,
      ),
    ).rejects.toThrow();
  }, 60_000);
});

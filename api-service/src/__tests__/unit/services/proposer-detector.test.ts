import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import { ProposerDetector } from '../../../services/proposer-detector';
import type { ProposerClient, ProposerItem } from '../../../clients/proposer.client';
import { DEFAULT_SCENE } from '../../../services/vlm-detector.parse';
import type { DetectorEvent } from '../../../services/vlm-detector';

const ITEMS: ProposerItem[] = [
  {
    label: 'coffee mug',
    category: 'Kitchenware',
    box: { x: 0.31, y: 0.52, width: 0.12, height: 0.18 },
  },
  {
    label: 'floor lamp',
    category: 'Lighting',
    box: { x: 0.7, y: 0.2, width: 0.1, height: 0.4 },
  },
];

let pngImage: Buffer;

beforeAll(async () => {
  // A PNG input proves the detector transcodes to JPEG before calling the
  // proposer (the routes accept jpeg/png/webp; the contract is one JPEG).
  pngImage = await sharp({
    create: { width: 64, height: 48, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .png()
    .toBuffer();
});

function fakeClient(items: ProposerItem[]): { client: ProposerClient; received: Buffer[] } {
  const received: Buffer[] = [];
  const client = {
    detect: async (jpeg: Buffer): Promise<ProposerItem[]> => {
      received.push(jpeg);
      return items;
    },
  } as unknown as ProposerClient;
  return { client, received };
}

async function drain(stream: AsyncGenerator<DetectorEvent>): Promise<DetectorEvent[]> {
  const events: DetectorEvent[] = [];
  for await (const ev of stream) events.push(ev);
  return events;
}

describe('ProposerDetector', () => {
  it('transcodes the frame to jpeg and maps proposer items to DetectedItem events', async () => {
    const { client, received } = fakeClient(ITEMS);
    const detector = new ProposerDetector(client);

    const events = await drain(detector.detectStream(pngImage));

    expect(received).toHaveLength(1);
    expect(received[0]![0]).toBe(0xff); // JPEG SOI marker
    expect(received[0]![1]).toBe(0xd8);
    expect(events[0]).toEqual({ kind: 'scene', scene: DEFAULT_SCENE });
    expect(events.slice(1)).toEqual([
      {
        kind: 'item',
        item: {
          label: 'coffee mug',
          description: '',
          category: 'Kitchenware',
          tags: [],
          box: { x: 0.31, y: 0.52, width: 0.12, height: 0.18 },
        },
      },
      {
        kind: 'item',
        item: {
          label: 'floor lamp',
          description: '',
          category: 'Lighting',
          tags: [],
          box: { x: 0.7, y: 0.2, width: 0.1, height: 0.4 },
        },
      },
    ]);
  });

  it('detect() drains the stream into the batch DetectionResult shape', async () => {
    const { client } = fakeClient(ITEMS);
    const detector = new ProposerDetector(client);

    const result = await detector.detect(pngImage);

    expect(result.scene).toEqual(DEFAULT_SCENE);
    expect(result.items.map((i) => i.label)).toEqual(['coffee mug', 'floor lamp']);
    expect(result.mergeSuggestions).toEqual([]);
  });

  it('skips junk rows (missing label, non-numeric or degenerate box) without failing the frame', async () => {
    const junk = [
      { label: '  ', category: 'X', box: { x: 0, y: 0, width: 0.5, height: 0.5 } },
      { label: 'no box' },
      { label: 'bad box', category: 'X', box: { x: 'a', y: 0, width: 0.5, height: 0.5 } },
      { label: 'zero width', category: 'X', box: { x: 0, y: 0, width: 0, height: 0.5 } },
      { label: 'negative height', category: 'X', box: { x: 0, y: 0, width: 0.5, height: -1 } },
      ITEMS[0]!,
    ] as ProposerItem[];
    const { client } = fakeClient(junk);
    const detector = new ProposerDetector(client);

    const events = await drain(detector.detectStream(pngImage));

    const items = events.filter((e) => e.kind === 'item');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'item', item: { label: 'coffee mug' } });
  });

  it('yields only the default scene when the proposer finds nothing', async () => {
    const { client } = fakeClient([]);
    const detector = new ProposerDetector(client);

    const events = await drain(detector.detectStream(pngImage));

    expect(events).toEqual([{ kind: 'scene', scene: DEFAULT_SCENE }]);
  });
});

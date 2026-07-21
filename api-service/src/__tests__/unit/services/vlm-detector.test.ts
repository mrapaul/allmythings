import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import { VlmDetector } from '../../../services/vlm-detector';
import type { OllamaVlmClient } from '../../../clients/ollama-vlm.client';
import { OllamaUnavailableError } from '../../../clients/ollama-vlm.client';

/**
 * A scripted stand-in for OllamaVlmClient: returns canned JSON per pass without
 * any network. The detector only depends on { modelName, generateJson }.
 */
function makeClient(responses: string[]): OllamaVlmClient {
  let call = 0;
  return {
    modelName: 'qwen2.5vl:7b',
    generateJson: async (): Promise<string> => {
      const r = responses[call] ?? '{"items":[]}';
      call += 1;
      return r;
    },
  } as unknown as OllamaVlmClient;
}

function makeFailingClient(): OllamaVlmClient {
  return {
    modelName: 'qwen2.5vl:7b',
    generateJson: async (): Promise<string> => {
      throw new OllamaUnavailableError('connection refused');
    },
  } as unknown as OllamaVlmClient;
}

let image: Buffer;

beforeAll(async () => {
  image = await sharp({
    create: { width: 800, height: 600, channels: 3, background: { r: 30, g: 40, b: 50 } },
  })
    .jpeg()
    .toBuffer();
});

const PASS1 = JSON.stringify({
  room_type: 'living room',
  items: [
    {
      id: 1,
      object: 'sectional sofa',
      category: 'Furniture',
      confidence: 0.98,
      bounding_box: { x_min: 0.05, y_min: 0.5, x_max: 0.6, y_max: 0.9 },
      tags: { color: 'red', material: 'velvet', style: 'modern', condition: 'good', size_estimate: 'large' },
    },
    {
      id: 2,
      object: 'coffee table',
      category: 'Furniture',
      confidence: 0.95,
      bounding_box: { x_min: 0.3, y_min: 0.7, x_max: 0.55, y_max: 0.85 },
      tags: { color: 'brown', material: 'wood', style: 'rustic', condition: 'good', size_estimate: 'medium' },
    },
  ],
});

const PASS2 = JSON.stringify({
  new_items: [
    {
      id: 3,
      object: 'throw pillow',
      category: 'Textile',
      confidence: 0.8,
      bounding_box: { x_min: 0.1, y_min: 0.55, x_max: 0.2, y_max: 0.65 },
      tags: { color: 'gold', material: 'fabric', condition: 'good', size_estimate: 'small' },
      missed_reason: 'small item on the sofa',
    },
  ],
});

describe('VlmDetector', () => {
  it('runs two passes and merges items', async () => {
    const detector = new VlmDetector(makeClient([PASS1, PASS2]), {
      twoPass: true,
      maxImageSize: 1024,
      coordMode: 'auto',
    });
    const { items } = await detector.detect(image);
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.label)).toEqual(['sectional sofa', 'coffee table', 'throw pillow']);
    const sofa = items[0]!;
    expect(sofa.category).toBe('Furniture');
    expect(sofa.tags).toContain('velvet');
    expect(sofa.box.x).toBeCloseTo(0.05, 3);
    expect(sofa.box.width).toBeCloseTo(0.55, 3);
  });

  it('skips pass 2 when twoPass is false', async () => {
    const detector = new VlmDetector(makeClient([PASS1, PASS2]), {
      twoPass: false,
      maxImageSize: 1024,
      coordMode: 'auto',
    });
    const { items } = await detector.detect(image);
    expect(items).toHaveLength(2);
  });

  it('normalizes absolute pixel coordinates (Qwen2.5-VL convention)', async () => {
    const pixelPass = JSON.stringify({
      items: [
        {
          object: 'framed painting',
          category: 'Art',
          bounding_box: { x_min: 80, y_min: 60, x_max: 720, y_max: 480 },
          tags: { color: 'blue', material: 'canvas' },
        },
      ],
    });
    const detector = new VlmDetector(makeClient([pixelPass]), {
      twoPass: false,
      maxImageSize: 1024,
      coordMode: 'auto',
    });
    const { items } = await detector.detect(image);
    expect(items).toHaveLength(1);
    // 80/800=0.1, 60/600=0.1, width (720-80)/800=0.8, height (480-60)/600=0.7
    expect(items[0]!.box.x).toBeCloseTo(0.1, 2);
    expect(items[0]!.box.width).toBeCloseTo(0.8, 2);
    expect(items[0]!.box.height).toBeCloseTo(0.7, 2);
  });

  it('still returns pass-1 items when pass 2 fails', async () => {
    let call = 0;
    const client = {
      modelName: 'qwen2.5vl:7b',
      generateJson: async (): Promise<string> => {
        call += 1;
        if (call === 1) return PASS1;
        throw new OllamaUnavailableError('pass 2 boom');
      },
    } as unknown as OllamaVlmClient;
    const detector = new VlmDetector(client, { twoPass: true, maxImageSize: 1024, coordMode: 'auto' });
    const { items } = await detector.detect(image);
    expect(items).toHaveLength(2);
  });

  it('propagates a pass-1 transport failure', async () => {
    const detector = new VlmDetector(makeFailingClient(), {
      twoPass: true,
      maxImageSize: 1024,
      coordMode: 'auto',
    });
    await expect(detector.detect(image)).rejects.toBeInstanceOf(OllamaUnavailableError);
  });

  it('yields the scene assessment before any item', async () => {
    const pass1WithScene = JSON.stringify({
      scene: {
        type: 'room',
        estimated_total_items: 10,
        photo_quality: { verdict: 'ok', reason: null },
      },
      items: JSON.parse(PASS1).items,
    });
    const detector = new VlmDetector(makeClient([pass1WithScene]), {
      twoPass: false,
      maxImageSize: 1024,
      coordMode: 'auto',
    });
    const events = [];
    for await (const ev of detector.detectStream(image)) events.push(ev);
    expect(events[0]).toEqual({
      kind: 'scene',
      scene: { type: 'room', estimatedTotalItems: 10, verdict: 'ok', verdictReason: null },
    });
    expect(events.slice(1).every((e) => e.kind === 'item')).toBe(true);
    expect(events).toHaveLength(3);
  });

  it('returns scene in detect() and defaults it when absent', async () => {
    const detector = new VlmDetector(makeClient([PASS1]), {
      twoPass: false,
      maxImageSize: 1024,
      coordMode: 'auto',
    });
    const { scene, items } = await detector.detect(image);
    expect(items).toHaveLength(2);
    expect(scene).toEqual({
      type: 'unknown',
      estimatedTotalItems: null,
      verdict: 'ok',
      verdictReason: null,
    });
  });

  it('runs tile passes for a dense room scene and merges mapped items', async () => {
    // Room with 2 listed items but an estimate of 10 → tiling triggers.
    const pass1 = JSON.stringify({
      scene: {
        type: 'room',
        estimated_total_items: 10,
        photo_quality: { verdict: 'ok', reason: null },
      },
      items: JSON.parse(PASS1).items,
    });
    // One physical rug sitting in the overlap band between the two top tiles.
    // Prepared image is 800x600 → tiles are 460x345 at (0,0), (340,0), (0,255),
    // (340,255). Global rug box x:[350,450] y:[100,200] expressed tile-locally:
    const rugSeenFromTile0 = {
      object: 'white area rug',
      category: 'Textile',
      bounding_box: { x_min: 350 / 460, y_min: 100 / 345, x_max: 450 / 460, y_max: 200 / 345 },
      tags: { color: 'white' },
    };
    const rugSeenFromTile1 = {
      object: 'white area rug',
      category: 'Textile',
      bounding_box: { x_min: 10 / 460, y_min: 100 / 345, x_max: 110 / 460, y_max: 200 / 345 },
      tags: { color: 'white' },
    };
    const emptyTile = JSON.stringify({ items: [] });
    const prompts: string[] = [];
    let call = 0;
    const responses = [
      pass1,
      JSON.stringify({ items: [rugSeenFromTile0] }), // tile (0,0)
      JSON.stringify({ items: [rugSeenFromTile1] }), // tile (340,0) — overlap duplicate
      emptyTile, // tile (0,255)
      emptyTile, // tile (340,255)
      JSON.stringify({ new_items: [] }), // pass 2 audit
    ];
    const client = {
      modelName: 'stub',
      generateJson: async (prompt: string): Promise<string> => {
        prompts.push(prompt);
        const r = responses[call] ?? '{"items":[]}';
        call += 1;
        return r;
      },
    };
    const detector = new VlmDetector(client, { twoPass: true, maxImageSize: 1024, coordMode: 'auto' });
    const { items } = await detector.detect(image);
    // 1 full-frame pass + 4 tiles + 1 audit
    expect(prompts).toHaveLength(6);
    const rugs = items.filter((i) => i.label === 'white area rug');
    expect(rugs).toHaveLength(1);
    // Tile-local coords must have been mapped into full-image space (both
    // duplicates land on the same global box, which is why dedupe collapses
    // them). The rug came from an interior tile so its x cannot still be 0.5.
    expect(rugs[0]!.box.x).toBeGreaterThan(0);
    expect(rugs[0]!.box.x + rugs[0]!.box.width).toBeLessThanOrEqual(1);
    expect(items.map((i) => i.label)).toContain('sectional sofa');
  });

  it('does not tile compact scenes', async () => {
    const pass1 = JSON.stringify({
      scene: {
        type: 'shelf',
        estimated_total_items: 30,
        photo_quality: { verdict: 'ok', reason: null },
      },
      items: JSON.parse(PASS1).items,
    });
    let calls = 0;
    const client = {
      modelName: 'stub',
      generateJson: async (): Promise<string> => {
        calls += 1;
        return calls === 1 ? pass1 : '{"new_items":[]}';
      },
    };
    const detector = new VlmDetector(client, { twoPass: true, maxImageSize: 1024, coordMode: 'auto' });
    await detector.detect(image);
    expect(calls).toBe(2); // pass 1 + audit only, no tiles
  });

  it('tolerates malformed JSON by yielding no items', async () => {
    const detector = new VlmDetector(makeClient(['not json at all']), {
      twoPass: false,
      maxImageSize: 1024,
      coordMode: 'auto',
    });
    const { items } = await detector.detect(image);
    expect(items).toEqual([]);
  });
});

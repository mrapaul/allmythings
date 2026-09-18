import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import { VlmDetector } from '../../../services/vlm-detector';
import type { OllamaVlmClient } from '../../../clients/ollama-vlm.client';
import { OllamaUnavailableError } from '../../../clients/ollama-vlm.client';
import { DetectorUnavailableError } from '../../../clients/vlm-client';
import { normalizeText } from '../../../services/embeddings.service';
import type { PossessionJudge } from '../../../services/possession-judge.service';

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

/**
 * Fail-loud hardening: a backend outage must never be reported as a
 * successfully-empty scene. Empty is only a valid answer when model calls
 * actually succeeded.
 */
describe('VlmDetector — fail-loud on backend outage', () => {
  const opts = { twoPass: false, maxImageSize: 1024, coordMode: 'auto' as const };
  // Room scene that triggers tiling with zero pass-1 items found: the model
  // itself claims ~10 items exist, so an empty result after failed tiles is
  // definitely a backend outage, not an empty room.
  const denseRoomPass1 = JSON.stringify({
    scene: { type: 'room', estimated_total_items: 10, photo_quality: { verdict: 'ok', reason: null } },
    items: [],
  });

  it('pass-1 transport failure surfaces as DetectorUnavailableError', async () => {
    const client = {
      modelName: 'hosted-tier',
      generateJson: async (): Promise<string> => {
        throw new DetectorUnavailableError('hosted tier returned 503');
      },
    };
    const detector = new VlmDetector(client, { ...opts, twoPass: true });
    await expect(detector.detect(image)).rejects.toBeInstanceOf(DetectorUnavailableError);
  });

  it('throws DetectorUnavailableError when every tile pass fails', async () => {
    let call = 0;
    const client = {
      modelName: 'stub',
      generateJson: async (): Promise<string> => {
        call += 1;
        if (call === 1) return denseRoomPass1;
        throw new DetectorUnavailableError(`hosted tier 503 (call ${call})`);
      },
    };
    const detector = new VlmDetector(client, opts);
    await expect(detector.detect(image)).rejects.toMatchObject({
      name: 'DetectorUnavailableError',
      message: expect.stringContaining('tile'),
    });
    // pass 1 + all 4 tiles attempted before giving up
    expect(call).toBe(5);
  });

  it('returns partial results when only one tile fails', async () => {
    const lampFromTile = JSON.stringify({
      items: [
        {
          object: 'floor lamp',
          category: 'Lighting',
          bounding_box: { x_min: 0.1, y_min: 0.1, x_max: 0.3, y_max: 0.5 },
          tags: { color: 'black' },
        },
      ],
    });
    const responses = [
      denseRoomPass1,
      null, // tile (0,0) — fails
      lampFromTile, // tile (340,0)
      JSON.stringify({ items: [] }), // tile (0,255)
      JSON.stringify({ items: [] }), // tile (340,255)
    ];
    let call = 0;
    const client = {
      modelName: 'stub',
      generateJson: async (): Promise<string> => {
        call += 1;
        const r = responses[call - 1];
        if (r === null) throw new DetectorUnavailableError('tile backend hiccup');
        return r;
      },
    };
    const detector = new VlmDetector(client, opts);
    const { items } = await detector.detect(image);
    expect(items.map((i) => i.label)).toEqual(['floor lamp']);
  });

  it('returns 200-with-zero-items when calls succeed and the scene is genuinely empty', async () => {
    const client = {
      modelName: 'stub',
      generateJson: async (): Promise<string> => '{"items":[]}',
    };
    const detector = new VlmDetector(client, { ...opts, twoPass: true });
    const { items, scene } = await detector.detect(image);
    expect(items).toEqual([]);
    expect(scene.type).toBe('unknown');
  });

  it('fails loud when the pass-2 audit fails and nothing has been found yet', async () => {
    let call = 0;
    const client = {
      modelName: 'stub',
      generateJson: async (): Promise<string> => {
        call += 1;
        if (call === 1) return '{"items":[]}'; // pass 1: genuinely empty, no scene → no tiling
        throw new DetectorUnavailableError('hosted tier 503');
      },
    };
    const detector = new VlmDetector(client, { ...opts, twoPass: true });
    await expect(detector.detect(image)).rejects.toBeInstanceOf(DetectorUnavailableError);
  });

  it('keeps pass-2 failure soft when pass 1 already found items', async () => {
    let call = 0;
    const client = {
      modelName: 'stub',
      generateJson: async (): Promise<string> => {
        call += 1;
        if (call === 1) return PASS1;
        throw new DetectorUnavailableError('hosted tier 503');
      },
    };
    const detector = new VlmDetector(client, { ...opts, twoPass: true });
    const { items } = await detector.detect(image);
    expect(items).toHaveLength(2);
  });
});

/**
 * End-to-end wiring of the possession filter and merge tiers through the
 * detector, with the fallback judge replaced by a stub. Label equivalence is
 * deterministic, so there is no embedding stub to build.
 */
/** Records which labels it was asked about; answers false for wall-ish names. */
function stubJudge(): { judge: PossessionJudge; asked: string[][] } {
  const asked: string[][] = [];
  const judge = {
    modelName: 'stub-judge',
    available: true,
    stats: () => ({ hits: 0, misses: 0, calls: asked.length, failures: 0, cached: 0, muted: false }),
    judge: async (labels: readonly string[]) => {
      asked.push([...labels]);
      const out = new Map<string, boolean>();
      for (const l of labels) out.set(normalizeText(l), !/wall/i.test(l));
      return out;
    },
  } as unknown as PossessionJudge;
  return { judge, asked };
}

const deadJudge = (): PossessionJudge =>
  ({
    modelName: 'dead-judge',
    available: false,
    stats: () => ({ hits: 0, misses: 0, calls: 0, failures: 2, cached: 0, muted: true }),
    judge: async () => new Map<string, boolean>(),
  }) as unknown as PossessionJudge;

const item = (object: string, box: number[], extra: object = {}): object => ({
  object,
  category: 'Other',
  bbox_2d: box,
  tags: { color: 'white' },
  ...extra,
});

describe('VlmDetector — model-decided possessions and merge tiers', () => {
  const opts = { twoPass: false, maxImageSize: 1024, coordMode: 'auto' as const };

  it('drops items the model flags as non-possessions', async () => {
    const pass1 = JSON.stringify({
      items: [
        item('sectional sofa', [50, 500, 600, 900], { is_possession: true }),
        item('plaster wall', [0, 0, 1000, 400], { is_possession: false }),
      ],
    });
    const { judge, asked } = stubJudge();
    const detector = new VlmDetector(makeClient([pass1]), opts, judge);
    const { items } = await detector.detect(image);
    expect(items.map((i) => i.label)).toEqual(['sectional sofa']);
    // A `false` needs a second signal, so the judge is asked about the HEAD
    // NOUN of the flagged item — and here it agrees, so the drop stands.
    expect(asked).toEqual([['plaster wall']]);
  });

  it('keeps a belonging the model flagged false when the judge disagrees', async () => {
    // Measured production failure: the model names a possession relative to the
    // fixture holding it and then flags the whole phrase as building fabric.
    // "window blinds behind curtains" heads at "window blinds", which the judge
    // recognises as a belonging, so the owner keeps their blinds.
    const pass1 = JSON.stringify({
      items: [
        item('sectional sofa', [50, 500, 600, 900], { is_possession: true }),
        item('window blinds behind curtains', [570, 30, 840, 520], { is_possession: false }),
        item('plaster wall', [0, 0, 1000, 400], { is_possession: false }),
      ],
    });
    const { judge, asked } = stubJudge();
    const detector = new VlmDetector(makeClient([pass1]), opts, judge);
    const { items } = await detector.detect(image);
    expect(items.map((i) => i.label)).toEqual([
      'sectional sofa',
      'window blinds behind curtains',
    ]);
    // Judged on head nouns and clause heads, never the full phrases.
    expect(asked[0]).toEqual(['window blinds', 'curtains', 'plaster wall']);
  });

  it('asks the judge only about items missing the flag', async () => {
    const pass1 = JSON.stringify({
      items: [
        item('sectional sofa', [50, 500, 600, 900], { is_possession: true }),
        item('plaster wall', [0, 0, 1000, 400]),
      ],
    });
    const { judge, asked } = stubJudge();
    const detector = new VlmDetector(makeClient([pass1]), opts, judge);
    const { items } = await detector.detect(image);
    expect(items.map((i) => i.label)).toEqual(['sectional sofa']);
    expect(asked).toEqual([['plaster wall']]);
  });

  it('keeps unflagged items when the judge is unavailable (fail open)', async () => {
    const pass1 = JSON.stringify({
      items: [item('sectional sofa', [50, 500, 600, 900]), item('plaster wall', [0, 0, 1000, 400])],
    });
    const detector = new VlmDetector(makeClient([pass1]), opts, deadJudge());
    const { items } = await detector.detect(image);
    expect(items.map((i) => i.label)).toEqual(['sectional sofa', 'plaster wall']);
  });

  it('keeps unflagged items when no judge is wired at all', async () => {
    const pass1 = JSON.stringify({
      items: [item('sectional sofa', [50, 500, 600, 900]), item('plaster wall', [0, 0, 1000, 400])],
    });
    const detector = new VlmDetector(makeClient([pass1]), opts, null);
    const { items } = await detector.detect(image);
    expect(items.map((i) => i.label)).toEqual(['sectional sofa', 'plaster wall']);
  });

  it('auto-merges a subsuming label on one region', async () => {
    const pass1 = JSON.stringify({
      items: [
        item('sectional sofa', [50, 500, 600, 900], { is_possession: true }),
        // Contained in the sofa box: same spot by IoMin, strict IoU below the
        // cross-label floor, so the merge rests on head-phrase subsumption.
        item('sofa', [100, 550, 300, 700], { is_possession: true }),
      ],
    });
    const detector = new VlmDetector(makeClient([pass1]), opts, null);
    const { items, mergeSuggestions } = await detector.detect(image);
    expect(items).toHaveLength(1);
    expect(mergeSuggestions).toHaveLength(0);
  });

  it('emits a merge suggestion for a partial re-detection and keeps both items', async () => {
    // Production shape: one object emitted twice with an offset, IoU under the
    // exact-label floor. Both are kept and the user is asked.
    const pass1 = JSON.stringify({
      items: [
        item('green glass bottle', [300, 300, 500, 500], { is_possession: true }),
        item('green glass bottle', [400, 300, 600, 500], { is_possession: true }),
      ],
    });
    const detector = new VlmDetector(makeClient([pass1]), opts, null);
    const { items, mergeSuggestions } = await detector.detect(image);
    expect(items).toHaveLength(2);
    expect(mergeSuggestions).toEqual([
      expect.objectContaining({ itemIndexA: 0, itemIndexB: 1 }),
    ]);
  });

  it('streams suggestions as their own events, after the item they concern', async () => {
    const pass1 = JSON.stringify({
      items: [
        item('green glass bottle', [300, 300, 500, 500], { is_possession: true }),
        item('green glass bottle', [400, 300, 600, 500], { is_possession: true }),
      ],
    });
    const detector = new VlmDetector(makeClient([pass1]), opts, null);
    const kinds: string[] = [];
    for await (const ev of detector.detectStream(image)) kinds.push(ev.kind);
    expect(kinds).toEqual(['scene', 'item', 'item', 'merge-suggestion']);
  });

  it('needs no embedding backend at all to dedupe', async () => {
    // The detector takes no EmbeddingsService: merge decisions are structural,
    // so an embedding outage cannot affect detection.
    const pass1 = JSON.stringify({
      items: [
        item('area rug', [300, 800, 800, 1000], { is_possession: true }),
        item('white area rug', [300, 800, 800, 1000], { is_possession: true }),
      ],
    });
    const detector = new VlmDetector(makeClient([pass1]), opts, null);
    const { items } = await detector.detect(image);
    expect(items).toHaveLength(1);
  });
});

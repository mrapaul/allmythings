import { describe, it, expect } from 'vitest';
import {
  stripAndParseJson,
  salvageObjects,
  extractCorners,
  inferCoordMode,
  cornersToNormBox,
  rawItemToDetectedItem,
  dedupeItems,
  buildPass1Prompt,
  buildPass2Prompt,
  parseSceneInfo,
} from '../../../services/vlm-detector.parse';
import type { DetectedItem } from '../../../types/detected-item';

describe('stripAndParseJson', () => {
  it('parses plain JSON', () => {
    expect(stripAndParseJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('strips ```json fences', () => {
    const raw = '```json\n{"items":[{"object":"sofa"}]}\n```';
    expect(stripAndParseJson(raw)).toEqual({ items: [{ object: 'sofa' }] });
  });

  it('strips bare ``` fences', () => {
    expect(stripAndParseJson('```\n[1,2,3]\n```')).toEqual([1, 2, 3]);
  });

  it('isolates JSON embedded in prose', () => {
    const raw = 'Here is the result: {"room_type":"living room","items":[]} done.';
    expect(stripAndParseJson(raw)).toEqual({ room_type: 'living room', items: [] });
  });

  it('throws when no JSON is present', () => {
    expect(() => stripAndParseJson('no json here')).toThrow();
  });
});

describe('salvageObjects', () => {
  it('recovers complete items from truncated JSON', () => {
    // A response cut off mid-way through the third item.
    const truncated =
      '{"room_type":"living room","items":[' +
      '{"object":"sofa","bounding_box":{"x_min":0.1,"y_min":0.5,"x_max":0.6,"y_max":0.9},"tags":{"color":"red"}},' +
      '{"object":"lamp","bounding_box":{"x_min":0.7,"y_min":0.2,"x_max":0.8,"y_max":0.6},"tags":{"color":"brass"}},' +
      '{"object":"table","bounding_box":{"x_min":0.3,"y_';
    const recovered = salvageObjects(truncated);
    expect(recovered).toHaveLength(2);
    expect(recovered[0]!.object).toBe('sofa');
    expect(recovered[1]!.object).toBe('lamp');
  });

  it('ignores nested non-item objects like tags', () => {
    const recovered = salvageObjects('{"items":[{"object":"x","tags":{"color":"blue"}}]}');
    expect(recovered).toHaveLength(1);
    expect(recovered[0]!.object).toBe('x');
  });

  it('is not confused by braces inside strings', () => {
    const recovered = salvageObjects('{"object":"a {weird} name","bbox_2d":[1,2,3,4]}');
    expect(recovered).toHaveLength(1);
  });
});

describe('extractCorners', () => {
  it('reads x_min/y_min/x_max/y_max', () => {
    expect(extractCorners({ x_min: 0.1, y_min: 0.2, x_max: 0.3, y_max: 0.4 })).toEqual([
      0.1, 0.2, 0.3, 0.4,
    ]);
  });

  it('reads a bbox_2d-style array', () => {
    expect(extractCorners([10, 20, 30, 40])).toEqual([10, 20, 30, 40]);
  });

  it('reads left/top/right/bottom', () => {
    expect(extractCorners({ left: 1, top: 2, right: 3, bottom: 4 })).toEqual([1, 2, 3, 4]);
  });

  it('converts {x,y,width,height} to corners', () => {
    expect(extractCorners({ x: 10, y: 20, width: 5, height: 7 })).toEqual([10, 20, 15, 27]);
  });

  it('coerces numeric strings', () => {
    expect(extractCorners({ x_min: '0.1', y_min: '0.2', x_max: '0.3', y_max: '0.4' })).toEqual([
      0.1, 0.2, 0.3, 0.4,
    ]);
  });

  it('returns null for unusable input', () => {
    expect(extractCorners({ foo: 'bar' })).toBeNull();
    expect(extractCorners(null)).toBeNull();
  });
});

describe('inferCoordMode', () => {
  it('detects normalized 0-1 coords', () => {
    expect(inferCoordMode([[0.1, 0.2, 0.9, 0.95]], 800, 600)).toBe('norm');
  });

  it('detects 0-1000 coords that exceed the image (Qwen3-VL)', () => {
    expect(inferCoordMode([[100, 200, 900, 980]], 800, 600)).toBe('thousand');
  });

  it('detects absolute pixel coords within image bounds (Qwen2.5-VL)', () => {
    expect(inferCoordMode([[10, 20, 1010, 760]], 1280, 960)).toBe('pixel');
  });

  it('honors a forced mode', () => {
    expect(inferCoordMode([[10, 20, 30, 40]], 800, 600, 'norm')).toBe('norm');
  });
});

describe('cornersToNormBox', () => {
  it('passes normalized coords through', () => {
    expect(cornersToNormBox([0.1, 0.2, 0.3, 0.5], 'norm', 800, 600)).toEqual({
      x: 0.1,
      y: 0.2,
      width: expect.closeTo(0.2, 5),
      height: expect.closeTo(0.3, 5),
    });
  });

  it('divides 0-1000 coords by 1000', () => {
    expect(cornersToNormBox([100, 200, 300, 500], 'thousand', 800, 600)).toEqual({
      x: 0.1,
      y: 0.2,
      width: expect.closeTo(0.2, 5),
      height: expect.closeTo(0.3, 5),
    });
  });

  it('divides pixel coords by image dimensions', () => {
    expect(cornersToNormBox([80, 120, 240, 360], 'pixel', 800, 600)).toEqual({
      x: expect.closeTo(0.1, 5),
      y: expect.closeTo(0.2, 5),
      width: expect.closeTo(0.2, 5),
      height: expect.closeTo(0.4, 5),
    });
  });

  it('reorders swapped corners and clamps to [0,1]', () => {
    const box = cornersToNormBox([1.2, 0.9, -0.1, 0.1], 'norm', 800, 600);
    expect(box.x).toBe(0);
    expect(box.y).toBeCloseTo(0.1, 5);
    expect(box.x + box.width).toBeLessThanOrEqual(1);
  });
});

describe('rawItemToDetectedItem', () => {
  const box = { x: 0.1, y: 0.1, width: 0.2, height: 0.2 };

  it('maps object/category/tags into a DetectedItem', () => {
    const item = rawItemToDetectedItem(
      {
        object: 'sectional sofa',
        category: 'Furniture',
        tags: {
          color: 'red/burgundy',
          material: 'velvet',
          style: 'mid-century modern',
          condition: 'good',
          size_estimate: 'large',
          brand: null,
          notable_features: ['tufted'],
        },
      },
      box,
    );
    expect(item).not.toBeNull();
    expect(item!.label).toBe('sectional sofa');
    expect(item!.category).toBe('Furniture');
    expect(item!.tags).toContain('velvet');
    expect(item!.tags).toContain('mid-century modern');
    expect(item!.tags).not.toContain('unknown');
    expect(item!.description.length).toBeGreaterThan(0);
    expect(item!.box).toEqual(box);
  });

  it('defaults an unrecognized category to Other', () => {
    const item = rawItemToDetectedItem({ object: 'thing', category: 'Nonsense' }, box);
    expect(item!.category).toBe('Nonsense');
  });

  it('caps tags at 8 and drops unknown/none/null', () => {
    const item = rawItemToDetectedItem(
      {
        object: 'x',
        tags: {
          color: 'blue',
          material: 'unknown',
          style: 'none',
          condition: 'good',
          size_estimate: 'small',
          notable_features: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
        },
      },
      box,
    );
    expect(item!.tags).not.toContain('unknown');
    expect(item!.tags).not.toContain('none');
    expect(item!.tags.length).toBeLessThanOrEqual(8);
  });

  it('returns null without a label or box', () => {
    expect(rawItemToDetectedItem({ category: 'Furniture' }, box)).toBeNull();
    expect(rawItemToDetectedItem({ object: 'sofa' }, null)).toBeNull();
  });

  it('drops architectural surfaces but keeps compound labels', () => {
    expect(rawItemToDetectedItem({ object: 'wall' }, box)).toBeNull();
    expect(rawItemToDetectedItem({ object: 'Floor' }, box)).toBeNull();
    expect(rawItemToDetectedItem({ object: 'archway' }, box)).toBeNull();
    expect(rawItemToDetectedItem({ object: 'floor lamp' }, box)).not.toBeNull();
    expect(rawItemToDetectedItem({ object: 'window curtain' }, box)).not.toBeNull();
  });
});

describe('dedupeItems', () => {
  const mk = (label: string, x: number): DetectedItem => ({
    label,
    description: '',
    category: 'Furniture',
    tags: [],
    box: { x, y: 0, width: 0.2, height: 0.2 },
  });

  it('drops same-label heavily overlapping boxes', () => {
    const out = dedupeItems([mk('sofa', 0.1), mk('sofa', 0.11)]);
    expect(out).toHaveLength(1);
  });

  it('keeps same-label boxes that do not overlap', () => {
    const out = dedupeItems([mk('sofa', 0.1), mk('sofa', 0.7)]);
    expect(out).toHaveLength(2);
  });

  it('keeps different labels at the same location', () => {
    const out = dedupeItems([mk('sofa', 0.1), mk('pillow', 0.1)]);
    expect(out).toHaveLength(2);
  });

  it('caps runaway repetition of one label', () => {
    // Non-overlapping tiny boxes so IoU dedup does not remove them first; the
    // per-label cap is what limits the count.
    const lamps: DetectedItem[] = Array.from({ length: 20 }, (_, i) => ({
      label: 'floor lamp',
      description: '',
      category: 'Lighting',
      tags: [],
      box: { x: (i % 20) * 0.045, y: 0, width: 0.01, height: 0.01 },
    }));
    const out = dedupeItems(lamps, 0.6, 12);
    expect(out).toHaveLength(12);
  });
});

describe('parseSceneInfo', () => {
  it('parses a full scene block', () => {
    const scene = parseSceneInfo({
      scene: {
        type: 'room',
        estimated_total_items: 24,
        photo_quality: { verdict: 'ok', reason: null },
      },
      items: [],
    });
    expect(scene).toEqual({
      type: 'room',
      estimatedTotalItems: 24,
      verdict: 'ok',
      verdictReason: null,
    });
  });

  it('parses a reject verdict with reason', () => {
    const scene = parseSceneInfo({
      scene: {
        type: 'closeup',
        estimated_total_items: 0,
        photo_quality: { verdict: 'too_blurry', reason: 'severe motion blur' },
      },
    });
    expect(scene.verdict).toBe('too_blurry');
    expect(scene.verdictReason).toBe('severe motion blur');
  });

  it('defaults safely when the scene block is missing or junk', () => {
    const fallback = {
      type: 'unknown',
      estimatedTotalItems: null,
      verdict: 'ok',
      verdictReason: null,
    };
    expect(parseSceneInfo({ items: [] })).toEqual(fallback);
    expect(parseSceneInfo(null)).toEqual(fallback);
    expect(parseSceneInfo({ scene: { type: 'castle', photo_quality: { verdict: 'meh' } } })).toEqual(
      fallback,
    );
  });
});

describe('prompt builders', () => {
  it('pass-1 prompt names categories and dimensions', () => {
    const p = buildPass1Prompt(1024, 768);
    expect(p).toContain('1024x768');
    expect(p).toContain('Furniture');
    expect(p).toContain('NORMALIZED');
  });

  it('pass-1 prompt demands the scene assessment block', () => {
    const p = buildPass1Prompt(1024, 768);
    expect(p).toContain('"scene"');
    expect(p).toContain('estimated_total_items');
    expect(p).toContain('photo_quality');
  });

  it('pass-2 prompt lists prior items and continues IDs', () => {
    const p = buildPass2Prompt(1024, 768, [{ id: 1, object: 'sofa' }]);
    expect(p).toContain('sofa');
    expect(p).toContain('Continue IDs from 2');
  });
});

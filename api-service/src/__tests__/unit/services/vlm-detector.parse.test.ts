import { describe, it, expect } from 'vitest';
import {
  stripAndParseJson,
  salvageObjects,
  extractCorners,
  inferCoordMode,
  cornersToNormBox,
  rawItemToDetectedItem,
  dedupeItems,
  classifyMergeTier,
  ItemAccumulator,
  parsePossessionFlag,
  isDegenerateBox,
  buildPass1Prompt,
  buildPass2Prompt,
  buildLabelPrompt,
  POSSESSION_RULE,
  POSSESSION_RULE_DETAILED,
  parseSceneInfo,
  salvageScene,
  type DedupeOptions,
} from '../../../services/vlm-detector.parse';
import type { DetectedItem } from '../../../types/detected-item';

/**
 * Label equivalence is deterministic: no embeddings, no synonym table. These
 * options exist only to name the intent at call sites.
 */
const DEFAULT_OPTS: DedupeOptions = {};

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

  it('salvages the corner array stuffed into a single key (mid-generation drift)', () => {
    // Observed qwen3-vl failure mode: {"x_min": [x1, y1, x2, y2], "y_min": [...junk]}.
    expect(extractCorners({ x_min: [197, 498, 368, 738], y_min: [0.25, 0.45, 0.65, 0.85] })).toEqual(
      [197, 498, 368, 738],
    );
    expect(extractCorners({ bbox_2d: [10, 20, 30, 40] })).toEqual([10, 20, 30, 40]);
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

  it('drops degenerate boxes', () => {
    expect(
      rawItemToDetectedItem({ object: 'sofa' }, { x: 0.568, y: 1, width: 0.063, height: 0 }),
    ).toBeNull();
  });

  it('builds tags from the keys the model emitted, in its own order', () => {
    // No key whitelist: a model that invents "finish" still gets it as a tag.
    const item = rawItemToDetectedItem(
      { object: 'stool', tags: { finish: 'matte', color: 'oak' } },
      box,
    );
    expect(item!.tags).toEqual(['matte', 'oak']);
  });
});

describe('is_possession filtering', () => {
  const box = { x: 0.1, y: 0.1, width: 0.2, height: 0.2 };

  it('drops what the MODEL flags as not a possession, regardless of label', () => {
    expect(rawItemToDetectedItem({ object: 'wall', is_possession: false }, box)).toBeNull();
    expect(rawItemToDetectedItem({ object: 'kitchen countertop', is_possession: false }, box)).toBeNull();
    // A label no word list would ever contain still gets filtered.
    expect(rawItemToDetectedItem({ object: 'recessed niche shelf ledge', is_possession: false }, box)).toBeNull();
  });

  it('keeps what the model flags as a possession, even for surface-sounding labels', () => {
    // The old head-noun list dropped these; the model knows better.
    expect(rawItemToDetectedItem({ object: 'wall mirror', is_possession: true }, box)).not.toBeNull();
    expect(rawItemToDetectedItem({ object: 'floor lamp', is_possession: true }, box)).not.toBeNull();
    expect(rawItemToDetectedItem({ object: 'window curtain', is_possession: true }, box)).not.toBeNull();
  });

  it('accepts the string booleans models emit despite a boolean schema', () => {
    expect(parsePossessionFlag({ is_possession: 'false' })).toBe(false);
    expect(parsePossessionFlag({ is_possession: 'TRUE' })).toBe(true);
    expect(parsePossessionFlag({ isPossession: false })).toBe(false);
    expect(parsePossessionFlag({ object: 'sofa' })).toBeNull();
    expect(parsePossessionFlag({ is_possession: 'maybe' })).toBeNull();
    expect(parsePossessionFlag(null)).toBeNull();
  });

  it('falls back to the cached LLM judge when the flag is missing', () => {
    const judgePossession = (label: string): boolean | null =>
      ({
        wall: false,
        'white doorframe': false,
        'person wearing a uniform': false,
        'yellow armchair': true,
      })[label.toLowerCase()] ?? null;

    expect(rawItemToDetectedItem({ object: 'wall' }, box, { judgePossession })).toBeNull();
    expect(rawItemToDetectedItem({ object: 'white doorframe' }, box, { judgePossession })).toBeNull();
    expect(
      rawItemToDetectedItem({ object: 'person wearing a uniform' }, box, { judgePossession }),
    ).toBeNull();
    expect(
      rawItemToDetectedItem({ object: 'yellow armchair' }, box, { judgePossession }),
    ).not.toBeNull();
    // null (unjudged — judge outage or truncated answer) keeps the item.
    expect(rawItemToDetectedItem({ object: 'brass whatsit' }, box, { judgePossession })).not.toBeNull();
  });

  it('rescues a possession named in a trailing clause and relabels it', () => {
    // Measured production shape: the head really IS fabric ("window"), but the
    // model named the belonging in the clause. Dropping it loses the curtains,
    // and no oracle can see that — answer keys list what they list.
    const judgePossession = (label: string): boolean | null =>
      ({
        window: false,
        wall: false,
        'wooden floor': false,
        'white baseboard': false,
        'sheer white curtains': true,
        'window blinds': true,
      })[label.toLowerCase()] ?? null;

    const kept = rawItemToDetectedItem(
      { object: 'window with sheer white curtains', is_possession: false },
      box,
      { judgePossession },
    );
    expect(kept).not.toBeNull();
    // Renamed to the object, not the fixture it hangs in.
    expect(kept!.label).toBe('sheer white curtains');
    expect(kept!.description).toContain('sheer white curtains');
  });

  it('still drops when the clause head is fabric too', () => {
    const judgePossession = (label: string): boolean | null =>
      ({ wall: false, 'white baseboard': false })[label.toLowerCase()] ?? null;
    expect(
      rawItemToDetectedItem({ object: 'wall with white baseboard', is_possession: false }, box, {
        judgePossession,
      }),
    ).toBeNull();
  });

  it('still drops a plain fabric label with no clause', () => {
    const judgePossession = (label: string): boolean | null =>
      ({ 'wooden floor': false })[label.toLowerCase()] ?? null;
    expect(
      rawItemToDetectedItem({ object: 'wooden floor', is_possession: false }, box, {
        judgePossession,
      }),
    ).toBeNull();
  });

  it('keeps a possession-headed label via the head rule, unrelabelled', () => {
    const judgePossession = (label: string): boolean | null =>
      ({ 'window blinds': true })[label.toLowerCase()] ?? null;
    const kept = rawItemToDetectedItem(
      { object: 'window blinds behind curtains', is_possession: false },
      box,
      { judgePossession },
    );
    expect(kept).not.toBeNull();
    expect(kept!.label).toBe('window blinds behind curtains');
  });

  it('honours the flag when the judge cannot answer either question', () => {
    // Outage: no verdicts at all -> model is trusted, so walls cannot flood in.
    expect(
      rawItemToDetectedItem({ object: 'window with sheer white curtains', is_possession: false }, box, {
        judgePossession: () => null,
      }),
    ).toBeNull();
  });

  it('prefers the model flag over the judge when both are present', () => {
    const judgePossession = (): boolean => false;
    // Model says it is a belonging: the fallback judge does not get a vote.
    expect(
      rawItemToDetectedItem({ object: 'wall-mounted mirror', is_possession: true }, box, {
        judgePossession,
      }),
    ).not.toBeNull();
  });

  it('keeps everything when neither flag nor judge is available (never over-filters)', () => {
    // Full degradation. A stray structural row the user can delete beats
    // silently discarding a real belonging.
    expect(rawItemToDetectedItem({ object: 'wall' }, box)).not.toBeNull();
    expect(rawItemToDetectedItem({ object: 'person' }, box)).not.toBeNull();
  });
});

describe('isDegenerateBox', () => {
  it('rejects zero-extent edge-clamped boxes', () => {
    // Observed artifact: {x: 0.568, y: 1, width: 0.063, height: 0} x11.
    expect(isDegenerateBox({ x: 0.568, y: 1, width: 0.063, height: 0 })).toBe(true);
    expect(isDegenerateBox({ x: 1, y: 0.121, width: 0, height: 0.164 })).toBe(true);
  });

  it('rejects sub-threshold slivers on either axis', () => {
    expect(isDegenerateBox({ x: 0.5, y: 0.5, width: 0.003, height: 0.2 })).toBe(true);
    expect(isDegenerateBox({ x: 0.5, y: 0.5, width: 0.2, height: 0.003 })).toBe(true);
  });

  it('keeps small but real boxes', () => {
    expect(isDegenerateBox({ x: 0.5, y: 0.5, width: 0.01, height: 0.008 })).toBe(false);
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
    const out = dedupeItems([mk('sofa', 0.1), mk('sofa', 0.11)]).items;
    expect(out).toHaveLength(1);
  });

  it('keeps same-label boxes that do not overlap', () => {
    const out = dedupeItems([mk('sofa', 0.1), mk('sofa', 0.7)]).items;
    expect(out).toHaveLength(2);
  });

  it('keeps different labels in the same area (pillow on sofa)', () => {
    // Nested distinct objects: the pillow's box sits inside the sofa's box
    // (IoMin 1.0) but strict IoU is low, so both survive.
    const items: DetectedItem[] = [
      { label: 'sofa', description: '', category: 'Furniture', tags: [], box: { x: 0.1, y: 0.4, width: 0.5, height: 0.4 } },
      { label: 'pillow', description: '', category: 'Textile', tags: [], box: { x: 0.15, y: 0.45, width: 0.15, height: 0.12 } },
    ];
    expect(dedupeItems(items).items).toHaveLength(2);
  });

  it('collapses same-object detections whose labels are token-subsets', () => {
    // Overlapping tiles often re-detect one object under a more/less specific
    // name: "area rug" vs "white area rug" on the same box must collapse.
    const box = { x: 0.3, y: 0.8, width: 0.5, height: 0.2 };
    const items: DetectedItem[] = [
      { label: 'area rug', description: '', category: 'Textile', tags: [], box },
      { label: 'white area rug', description: '', category: 'Textile', tags: [], box },
    ];
    expect(dedupeItems(items).items).toHaveLength(1);
  });

  it('keeps distinct nested objects (contained but low IoU)', () => {
    // A coaster ON a side table: fully contained (IoMin 1.0) yet IoU ~0.1 —
    // cross-label merging must use strict IoU only, so both survive.
    const items: DetectedItem[] = [
      mkBox('side table', { x: 0.615, y: 0.643, width: 0.104, height: 0.219 }),
      mkBox('coaster', { x: 0.65, y: 0.792, width: 0.064, height: 0.069 }),
    ];
    expect(dedupeItems(items).items).toHaveLength(2);
  });

  it('keeps a vase in front of a plant despite full containment', () => {
    // Measured mockup pair: vase box inside the plant box, IoMin 1.0, IoU 0.15.
    const items: DetectedItem[] = [
      mkBox('plant', { x: 0.638, y: 0.378, width: 0.104, height: 0.271 }),
      mkBox('vase', { x: 0.648, y: 0.531, width: 0.036, height: 0.118 }),
    ];
    expect(dedupeItems(items).items).toHaveLength(2);
  });

  const mkBox = (
    label: string,
    box: { x: number; y: number; width: number; height: number },
  ): DetectedItem => ({ label, description: '', category: 'Other', tags: [], box });

  it('collapses exact-duplicate label+box repetitions to one', () => {
    // Model-repetition artifact: the same detection emitted verbatim many times.
    const items = Array.from({ length: 5 }, () =>
      mkBox('black and white book', { x: 0.568, y: 0.2, width: 0.063, height: 0.05 }),
    );
    expect(dedupeItems(items).items).toHaveLength(1);
  });

  it('merges same-label small boxes that near-contain each other (IoMin)', () => {
    // Observed bathroom cluster: one towel rack detected 3x with tiny offsets;
    // raw IoU between the flat slivers stays under 0.6.
    const items = [
      mkBox('towel rack', { x: 0.4644, y: 0.4751, width: 0.0535, height: 0.0086 }),
      mkBox('towel rack', { x: 0.4671, y: 0.474, width: 0.0524, height: 0.0144 }),
      mkBox('towel rack', { x: 0.4633, y: 0.4685, width: 0.0512, height: 0.0351 }),
    ];
    expect(dedupeItems(items).items).toHaveLength(1);
  });

  it('merges same-label boxes whose centers nearly coincide relative to box size', () => {
    const items = [
      mkBox('towel rack', { x: 0.462, y: 0.4691, width: 0.052, height: 0.02 }),
      mkBox('towel rack', { x: 0.465, y: 0.472, width: 0.048, height: 0.019 }),
    ];
    expect(dedupeItems(items).items).toHaveLength(1);
  });

  it('keeps genuinely distinct identical products at separated positions', () => {
    // Real pantry inventory: 9 distinct cans of the same soup on shelves.
    // Adjacent cans sit roughly one box-width apart and must all survive.
    const cans = [
      { x: 0.6486, y: 0.0205, width: 0.1362, height: 0.123 },
      { x: 0.6442, y: 0.1416, width: 0.1113, height: 0.1152 },
      { x: 0.5695, y: 0.4639, width: 0.1332, height: 0.0791 },
      { x: 0.571, y: 0.0264, width: 0.0849, height: 0.1152 },
      { x: 0.5271, y: 0.1436, width: 0.0703, height: 0.1006 },
      { x: 0.5798, y: 0.1436, width: 0.0761, height: 0.1074 },
      { x: 0.4524, y: 0.0371, width: 0.0805, height: 0.1045 },
      { x: 0.366, y: 0.0469, width: 0.082, height: 0.0986 },
      { x: 0.2855, y: 0.0488, width: 0.0761, height: 0.0908 },
    ].map((box) => mkBox("can of Campbell's Organic Soup", box));
    expect(dedupeItems(cans).items).toHaveLength(9);
  });

  it('merges cross-label duplicates of one region at strict IoU', () => {
    // Measured mockup pair: the same small object named "book" and "black
    // remote control", IoU 0.47 — one region, two names.
    const items: DetectedItem[] = [
      mkBox('book', { x: 0.913, y: 0.689, width: 0.063, height: 0.02 }),
      mkBox('black remote control', { x: 0.908, y: 0.69, width: 0.043, height: 0.017 }),
    ];
    const out = dedupeItems(items).items;
    expect(out).toHaveLength(1);
    expect(out[0]!.label).toBe('black remote control'); // more tokens wins
  });

  it('merges an artwork cluster through head-phrase subsumption', () => {
    // Measured mockup cluster: one framed artwork detected under three names.
    // "framed painting"/"framed artwork" share the modifier but not the head,
    // so only the pair that genuinely subsumes collapses — no synonym table and
    // no embedding round-trip.
    const items: DetectedItem[] = [
      mkBox('framed painting', { x: 0.446, y: 0.187, width: 0.184, height: 0.326 }),
      mkBox('painting', { x: 0.457, y: 0.17, width: 0.118, height: 0.294 }),
    ];
    expect(dedupeItems(items, DEFAULT_OPTS).items).toHaveLength(1);
  });

  it('merges verbatim re-detections and leaves unrelated heads alone', () => {
    // Measured mockup cluster: TV as "television" x2 + "black flat-screen tv".
    // The two "television" boxes collapse on the exact-label rule. The third
    // keeps its slot: cosine would have scored it 0.710, but that is the same
    // band as measured NON-synonyms (table/chair 0.589, stool/chair 0.626), so
    // the pipeline does not guess from a similarity score.
    const items: DetectedItem[] = [
      mkBox('television', { x: 0.87, y: 0.317, width: 0.106, height: 0.22 }),
      mkBox('black flat-screen tv', { x: 0.894, y: 0.289, width: 0.106, height: 0.198 }),
      mkBox('television', { x: 0.893, y: 0.425, width: 0.107, height: 0.062 }),
    ];
    const out = dedupeItems(items, DEFAULT_OPTS);
    expect(out.items).toHaveLength(2);
  });

  it('keeps a plant stand distinct from a sideboard', () => {
    // Contained in the sideboard region (IoMin 1.0, IoU low) yet a distinct
    // object: unrelated head nouns never reach the merge rules.
    const items: DetectedItem[] = [
      mkBox('wooden sideboard', { x: 0.2, y: 0.4, width: 0.4, height: 0.4 }),
      mkBox('gold plant stand', { x: 0.25, y: 0.5, width: 0.12, height: 0.25 }),
    ];
    const out = dedupeItems(items, DEFAULT_OPTS);
    expect(out.items).toHaveLength(2);
    expect(out.suggestions).toHaveLength(0);
  });

  it('never merges a plant into its planter despite total overlap', () => {
    // A plant sits inside its pot, so IoMin is ~1.0 and cosine is a misleading
    // 0.722. Different head nouns, so both survive as separate oracle items.
    const items: DetectedItem[] = [
      mkBox('plant', { x: 0.3, y: 0.3, width: 0.1, height: 0.3 }),
      mkBox('planter', { x: 0.3, y: 0.5, width: 0.1, height: 0.1 }),
    ];
    const out = dedupeItems(items, DEFAULT_OPTS);
    expect(out.items).toHaveLength(2);
    expect(out.suggestions).toHaveLength(0);
  });

  it('collapses token-subset labels with no embedding backend involved', () => {
    // The structural test alone handles the case a synonym table was never
    // needed for.
    const box = { x: 0.3, y: 0.8, width: 0.5, height: 0.2 };
    expect(
      dedupeItems([mkBox('area rug', box), mkBox('white area rug', box)]).items,
    ).toHaveLength(1);
    const unrelated = dedupeItems([
      mkBox('television', { x: 0.87, y: 0.317, width: 0.106, height: 0.22 }),
      mkBox('black flat-screen tv', { x: 0.88, y: 0.32, width: 0.1, height: 0.21 }),
    ]);
    // Strict cross-label IoU still applies (one region, two names).
    expect(unrelated.items).toHaveLength(1);
    expect(unrelated.suggestions).toHaveLength(0);
  });

  it('merges same-vase detections that differ only in contents qualifier', () => {
    // "glass vase with branches" vs "vase with flowers": head phrase "vase",
    // measured IoMin 0.87.
    const items: DetectedItem[] = [
      mkBox('glass vase with branches', { x: 0.655, y: 0.343, width: 0.104, height: 0.231 }),
      mkBox('vase with flowers', { x: 0.669, y: 0.484, width: 0.035, height: 0.104 }),
    ];
    expect(dedupeItems(items).items).toHaveLength(1);
  });

  it('merges rug/area-rug synonym pair via center distance', () => {
    // Measured mockup pair: IoU 0.37, IoMin 0.72, center ratio 0.38.
    const items: DetectedItem[] = [
      mkBox('rug', { x: 0.742, y: 0.902, width: 0.234, height: 0.098 }),
      mkBox('area rug', { x: 0.762, y: 0.817, width: 0.238, height: 0.163 }),
    ];
    const out = dedupeItems(items).items;
    expect(out).toHaveLength(1);
    expect(out[0]!.label).toBe('area rug');
  });

  it('merges an exact-label offset re-detection at the lower IoU floor', () => {
    // Measured mockup pair: "side table" x2 offset vertically, IoU 0.37.
    const items: DetectedItem[] = [
      mkBox('side table', { x: 0.615, y: 0.643, width: 0.104, height: 0.219 }),
      mkBox('side table', { x: 0.632, y: 0.582, width: 0.104, height: 0.193 }),
    ];
    expect(dedupeItems(items).items).toHaveLength(1);
  });

  it('absorbs a clipped tile-edge sliver of the same object', () => {
    // Measured mockup pair: the armchair's backrest strip re-detected by the
    // upper tile — x-contained, 13% of the parent area, IoMin only 0.31.
    const items: DetectedItem[] = [
      mkBox('yellow armchair', { x: 0.342, y: 0.551, width: 0.29, height: 0.361 }),
      mkBox('yellow armchair', { x: 0.351, y: 0.5, width: 0.188, height: 0.074 }),
    ];
    expect(dedupeItems(items).items).toHaveLength(1);
  });

  it('does not absorb stacked same-label objects of similar size', () => {
    // Two cans stacked on shelves: x-contained and touching in y, but their
    // areas are near-equal, so both are real.
    const items: DetectedItem[] = [
      mkBox('can of soup', { x: 0.6486, y: 0.0205, width: 0.1362, height: 0.123 }),
      mkBox('can of soup', { x: 0.6442, y: 0.1416, width: 0.1113, height: 0.1152 }),
    ];
    expect(dedupeItems(items).items).toHaveLength(2);
  });

  it('keeps multiple books at genuinely distinct positions', () => {
    // Real inventories contain many books; separated/stacked books survive.
    const items: DetectedItem[] = [
      mkBox('book', { x: 0.807, y: 0.689, width: 0.068, height: 0.02 }),
      mkBox('book', { x: 0.913, y: 0.689, width: 0.063, height: 0.02 }),
      mkBox('book', { x: 0.826, y: 0.62, width: 0.07, height: 0.01 }),
      mkBox('book', { x: 0.826, y: 0.63, width: 0.07, height: 0.012 }),
      mkBox('book', { x: 0.933, y: 0.624, width: 0.067, height: 0.022 }),
    ];
    expect(dedupeItems(items).items).toHaveLength(5);
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
    const out = dedupeItems(lamps, { maxPerLabel: 12 }).items;
    expect(out).toHaveLength(12);
  });
});

describe('classifyMergeTier', () => {
  const mk = (
    label: string,
    box: { x: number; y: number; width: number; height: number },
  ): DetectedItem => ({ label, description: '', category: 'Other', tags: [], box });

  // Same spot by containment (IoMin 1.0) but strict IoU 0.16, i.e. below
  // CROSS_LABEL_IOU — so the label test, not raw geometry, decides the tier.
  const overlapping = { x: 0.3, y: 0.3, width: 0.2, height: 0.2 };
  const nudged = { x: 0.32, y: 0.32, width: 0.08, height: 0.08 };
  const faraway = { x: 0.8, y: 0.8, width: 0.1, height: 0.1 };

  it('auto-merges an identical label on the same region', () => {
    const v = classifyMergeTier(mk('sofa', overlapping), mk('sofa', nudged), DEFAULT_OPTS);
    expect(v.tier).toBe('auto');
    expect(v.confidence).toBe(1);
  });

  it('auto-merges a label that subsumes another on the same region', () => {
    const v = classifyMergeTier(
      mk('framed painting', overlapping),
      mk('painting', nudged),
      DEFAULT_OPTS,
    );
    expect(v.tier).toBe('auto');
    expect(v.reason).toContain('subsumes');
  });

  it('does not merge unrelated head nouns however close their embeddings are', () => {
    // Cosine is not monotone in synonymy on this vocabulary: stool/chair scores
    // 0.626 and table/chair 0.589, ABOVE true synonyms like cabinet/sideboard
    // (0.444) and daybed/futon (0.440). No threshold separates them, so
    // similarity gets no vote at all.
    for (const [a, b] of [
      ['stool', 'chair'],
      ['table', 'chair'],
      ['candle', 'brass sconce'],
      ['plant stand', 'sideboard'],
    ] as const) {
      expect(classifyMergeTier(mk(a, overlapping), mk(b, nudged), DEFAULT_OPTS).tier).toBe(
        'distinct',
      );
    }
  });

  it('suggests an equivalent label pair that overlaps below the auto floor', () => {
    // Production shape: one object re-detected with an offset, same label,
    // IoU 0.34 — under EXACT_LABEL_IOU, so it is asked rather than applied.
    const v = classifyMergeTier(
      mk('green glass bottle', { x: 0.3, y: 0.3, width: 0.2, height: 0.2 }),
      mk('green glass bottle', { x: 0.4, y: 0.3, width: 0.2, height: 0.2 }),
      DEFAULT_OPTS,
    );
    expect(v.tier).toBe('suggest');
    expect(v.confidence).toBeGreaterThan(0);
    expect(v.confidence).toBeLessThanOrEqual(1);
  });

  it('never merges when the boxes disagree, whatever the labels say', () => {
    const v = classifyMergeTier(mk('sofa', overlapping), mk('sofa', faraway), DEFAULT_OPTS);
    expect(v.tier).toBe('distinct');
  });

  it('keeps the geometric cross-label rule for unrelated labels', () => {
    // "book" and "black remote control" share no head noun, but they name one
    // region — strict IoU alone carries the merge.
    const v = classifyMergeTier(
      mk('book', { x: 0.913, y: 0.689, width: 0.063, height: 0.02 }),
      mk('black remote control', { x: 0.908, y: 0.69, width: 0.043, height: 0.017 }),
      DEFAULT_OPTS,
    );
    expect(v.tier).toBe('auto');
    expect(v.reason).toContain('one region under two names');
  });
});

describe('ItemAccumulator', () => {
  const mk = (
    label: string,
    box: { x: number; y: number; width: number; height: number },
  ): DetectedItem => ({ label, description: '', category: 'Other', tags: [], box });

  it('reports suggestion indices in emitted order', () => {
    const acc = new ItemAccumulator(DEFAULT_OPTS, false);
    expect(acc.add(mk('lamp', { x: 0, y: 0, width: 0.1, height: 0.1 })).accepted).toBe(true);
    expect(acc.add(mk('rug', { x: 0.3, y: 0.3, width: 0.2, height: 0.2 })).accepted).toBe(true);
    const third = acc.add(mk('white rug', { x: 0.4, y: 0.3, width: 0.2, height: 0.2 }));
    expect(third.accepted).toBe(true);
    expect(third.suggestions).toEqual([
      expect.objectContaining({ itemIndexA: 1, itemIndexB: 2 }),
    ]);
    expect(acc.items.map((i) => i.label)).toEqual(['lamp', 'rug', 'white rug']);
  });

  it('rejects an auto-duplicate without emitting a suggestion', () => {
    const acc = new ItemAccumulator(DEFAULT_OPTS, false);
    acc.add(mk('framed painting', { x: 0.3, y: 0.3, width: 0.2, height: 0.2 }));
    const dup = acc.add(mk('painting', { x: 0.32, y: 0.32, width: 0.08, height: 0.08 }));
    expect(dup.accepted).toBe(false);
    expect(acc.suggestions).toHaveLength(0);
  });

  it('does not replace the incumbent label when winner replacement is off', () => {
    // Streamed items cannot be retracted, so the first emitted label stands.
    const acc = new ItemAccumulator({}, false);
    acc.add(mk('rug', { x: 0.3, y: 0.8, width: 0.5, height: 0.2 }));
    acc.add(mk('white area rug', { x: 0.3, y: 0.8, width: 0.5, height: 0.2 }));
    expect(acc.items.map((i) => i.label)).toEqual(['rug']);
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

describe('salvageScene', () => {
  it('recovers the scene block from truncated output', () => {
    const truncated =
      '{"scene": {"type": "room", "estimated_total_items": 18, "photo_quality": {"verdict": "ok", "reason": null}}, "items": [{"object": "sofa", "bbox_2d": [1, 2, 3';
    const scene = salvageScene(truncated);
    expect(scene.type).toBe('room');
    expect(scene.estimatedTotalItems).toBe(18);
    expect(scene.verdict).toBe('ok');
  });

  it('defaults safely when no scene block exists', () => {
    expect(salvageScene('{"items": []}').type).toBe('unknown');
    expect(salvageScene('').type).toBe('unknown');
  });
});

describe('prompt builders', () => {
  it('pass-1 prompt names categories, dimensions, and the bbox contract', () => {
    const p = buildPass1Prompt(1024, 768);
    expect(p).toContain('1024x768');
    expect(p).toContain('Furniture');
    expect(p).toContain('bbox_2d');
    expect(p).toContain('0-1000');
    expect(p).toContain('ONE entry per physical object instance');
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
    expect(p).toContain('bbox_2d');
    expect(p).toContain('NEVER use "count"');
  });

  it('every prompt demands is_possession and defines it by contrast, not by list', () => {
    for (const p of [
      buildPass1Prompt(1024, 768),
      buildPass2Prompt(1024, 768, []),
      buildLabelPrompt(),
    ]) {
      expect(p).toContain('is_possession');
      // Defined as a principle with contrasts...
      expect(p).toContain('could carry or move it out of the home');
      expect(p).toContain('the ceiling it hangs from is not');
      // ...never as an enumeration of the objects to exclude.
      expect(p).not.toContain('Do NOT include wall, walls, floor');
    }
  });

  it('tells the model to name the belonging, not the fixture holding it', () => {
    // A measured regression: the model labelled blinds "window with blinds",
    // then honestly flagged that as not-a-possession, losing a real item.
    expect(buildPass1Prompt(1024, 768)).toContain('"blinds", not "window with blinds"');
  });

  it('keeps the vision-pass rule compact so it cannot crowd out the naming rule', () => {
    // Measured: a three-paragraph rule here produced systematically terser
    // labels across the 8-fixture oracle.
    expect(POSSESSION_RULE.split('\n')).toHaveLength(1);
    expect(POSSESSION_RULE_DETAILED.length).toBeGreaterThan(POSSESSION_RULE.length);
  });
});

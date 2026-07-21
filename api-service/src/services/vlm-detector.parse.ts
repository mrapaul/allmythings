import type { DetectedItem } from '../types/detected-item';

/**
 * Pure parsing/prompt helpers for the two-pass VLM detector.
 *
 * Ported and hardened from research/home_inventory_pipeline.py. No I/O here so
 * every function is unit-testable in isolation. The detector class wires these
 * together around the Ollama client.
 */

export const VALID_CATEGORIES = [
  'Furniture',
  'Lighting',
  'Decor',
  'Textile',
  'Plant',
  'Art',
  'Accessory',
  'Tableware',
  'Electronics',
  'Storage',
  'Kitchenware',
  'Flooring',
  'Window_Treatment',
  'Other',
] as const;

const MAX_TAGS = 8;
const TAG_KEYS_IN_ORDER = [
  'color',
  'material',
  'style',
  'condition',
  'size_estimate',
  'size',
  'brand',
] as const;

export interface NormBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CoordMode = 'norm' | 'thousand' | 'pixel';

// ---------------------------------------------------------------------------
// Scene assessment (pass 1)
// ---------------------------------------------------------------------------

export const SCENE_TYPES = ['shelf', 'drawer', 'room', 'closeup', 'unknown'] as const;
export type SceneType = (typeof SCENE_TYPES)[number];

export const PHOTO_VERDICTS = ['ok', 'too_dark', 'too_blurry', 'too_far', 'not_a_scene'] as const;
export type PhotoVerdict = (typeof PHOTO_VERDICTS)[number];

export interface SceneInfo {
  type: SceneType;
  estimatedTotalItems: number | null;
  verdict: PhotoVerdict;
  verdictReason: string | null;
}

export const DEFAULT_SCENE: SceneInfo = {
  type: 'unknown',
  estimatedTotalItems: null,
  verdict: 'ok',
  verdictReason: null,
};

/**
 * Extract the pass-1 scene assessment from parsed model JSON. Tolerant of any
 * missing/junk field: an unusable block degrades to DEFAULT_SCENE rather than
 * failing detection, because scene info is advisory (tiling + photo QA).
 */
export function parseSceneInfo(parsed: unknown): SceneInfo {
  if (parsed === null || typeof parsed !== 'object') return { ...DEFAULT_SCENE };
  const scene = (parsed as Record<string, unknown>).scene;
  if (scene === null || typeof scene !== 'object') return { ...DEFAULT_SCENE };
  const o = scene as Record<string, unknown>;

  const rawType = typeof o.type === 'string' ? o.type.toLowerCase() : '';
  const type = (SCENE_TYPES as readonly string[]).includes(rawType)
    ? (rawType as SceneType)
    : 'unknown';

  const est = o.estimated_total_items;
  const estimatedTotalItems =
    typeof est === 'number' && Number.isFinite(est) && est >= 0 ? Math.round(est) : null;

  const quality =
    o.photo_quality !== null && typeof o.photo_quality === 'object'
      ? (o.photo_quality as Record<string, unknown>)
      : {};
  const rawVerdict = typeof quality.verdict === 'string' ? quality.verdict.toLowerCase() : '';
  const verdict = (PHOTO_VERDICTS as readonly string[]).includes(rawVerdict)
    ? (rawVerdict as PhotoVerdict)
    : 'ok';
  const verdictReason = str(quality.reason) ?? null;

  // A junk type together with a junk verdict means the model ignored the
  // contract — treat the whole block as absent.
  if (type === 'unknown' && verdict === 'ok' && estimatedTotalItems === null) {
    return { ...DEFAULT_SCENE };
  }
  return { type, estimatedTotalItems, verdict, verdictReason };
}

// ---------------------------------------------------------------------------
// JSON extraction
// ---------------------------------------------------------------------------

/**
 * Strip markdown fences and isolate the JSON object/array from raw model text,
 * then parse it. Tolerant of ```json fences and leading/trailing prose.
 */
export function stripAndParseJson(raw: string): unknown {
  let text = raw.trim();

  if (text.startsWith('```')) {
    text = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
  }

  // Fast path: already valid.
  try {
    return JSON.parse(text);
  } catch {
    // Fall through to brace/bracket isolation.
  }

  const firstObj = text.indexOf('{');
  const firstArr = text.indexOf('[');
  const start =
    firstArr === -1 ? firstObj : firstObj === -1 ? firstArr : Math.min(firstObj, firstArr);
  if (start === -1) {
    throw new Error('No JSON found in model output');
  }
  const lastObj = text.lastIndexOf('}');
  const lastArr = text.lastIndexOf(']');
  const end = Math.max(lastObj, lastArr);
  if (end <= start) {
    throw new Error('Malformed JSON in model output');
  }
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * Recover item objects from possibly-truncated model output by walking the
 * string with a brace stack (string-aware) and parsing every balanced object
 * that looks like a detection. Lets a response cut off by the token limit still
 * contribute all of its complete items instead of failing wholesale.
 */
export function salvageObjects(raw: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const stack: number[] = [];
  let inStr = false;
  let esc = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') stack.push(i);
    else if (ch === '}') {
      const start = stack.pop();
      if (start === undefined) continue;
      try {
        const o = JSON.parse(raw.slice(start, i + 1));
        if (
          o &&
          typeof o === 'object' &&
          !Array.isArray(o) &&
          ('object' in o || 'bounding_box' in o || 'bbox_2d' in o || 'box' in o)
        ) {
          out.push(o as Record<string, unknown>);
        }
      } catch {
        // Incomplete object (e.g. the truncated tail) — skip it.
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Bounding-box normalization
// ---------------------------------------------------------------------------

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Extract [x1, y1, x2, y2] corners from the many shapes a VLM may emit:
 * {x_min,y_min,x_max,y_max}, {x,y,width,height}, {left,top,right,bottom},
 * or an array [x1,y1,x2,y2]. Returns null if no usable box is present.
 */
export function extractCorners(box: unknown): [number, number, number, number] | null {
  if (Array.isArray(box) && box.length === 4) {
    const [a, b, c, d] = box.map(num);
    if (a === null || b === null || c === null || d === null) return null;
    return [a, b, c, d];
  }
  if (box === null || typeof box !== 'object') return null;
  const o = box as Record<string, unknown>;

  const xMin = num(o.x_min ?? o.xmin ?? o.left ?? o.x1);
  const yMin = num(o.y_min ?? o.ymin ?? o.top ?? o.y1);
  const xMax = num(o.x_max ?? o.xmax ?? o.right ?? o.x2);
  const yMax = num(o.y_max ?? o.ymax ?? o.bottom ?? o.y2);
  if (xMin !== null && yMin !== null && xMax !== null && yMax !== null) {
    return [xMin, yMin, xMax, yMax];
  }

  // {x, y, width, height} form.
  const x = num(o.x);
  const y = num(o.y);
  const w = num(o.width ?? o.w);
  const h = num(o.height ?? o.h);
  if (x !== null && y !== null && w !== null && h !== null) {
    return [x, y, x + w, y + h];
  }
  return null;
}

/**
 * Decide the coordinate convention for a whole pass.
 *
 * Done at pass level (not per box) using the global maximum across every box,
 * because a single edge-spanning object reliably reveals the scale. Image
 * dimensions disambiguate the hard case: a coordinate that fits within the
 * image is pixels (Qwen2.5-VL), while one that exceeds the image must be on the
 * 0-1000 scale (Qwen3-VL). Values <= 1.5 are already normalized.
 */
export function inferCoordMode(
  allCorners: number[][],
  imgW: number,
  imgH: number,
  forced?: CoordMode,
): CoordMode {
  if (forced) return forced;
  let max = 0;
  for (const c of allCorners) {
    for (const v of c) max = Math.max(max, Math.abs(v));
  }
  if (max <= 1.5) return 'norm';
  // 2% slack absorbs models that round slightly past the true image edge.
  const pixelCeiling = Math.max(imgW, imgH) * 1.02;
  if (max <= pixelCeiling) return 'pixel';
  return 'thousand';
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Convert raw corners to a normalized {x,y,width,height} box in [0,1], given the
 * resolved coordinate mode and the processed image dimensions.
 */
export function cornersToNormBox(
  corners: [number, number, number, number],
  mode: CoordMode,
  imgW: number,
  imgH: number,
): NormBox {
  let [x1, y1, x2, y2] = corners;
  if (mode === 'thousand') {
    x1 /= 1000;
    x2 /= 1000;
    y1 /= 1000;
    y2 /= 1000;
  } else if (mode === 'pixel') {
    x1 /= imgW;
    x2 /= imgW;
    y1 /= imgH;
    y2 /= imgH;
  }
  // Order corners defensively.
  const left = clamp01(Math.min(x1, x2));
  const top = clamp01(Math.min(y1, y2));
  const right = clamp01(Math.max(x1, x2));
  const bottom = clamp01(Math.max(y1, y2));
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

// ---------------------------------------------------------------------------
// Item mapping
// ---------------------------------------------------------------------------

function str(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim()) return v.trim();
  return undefined;
}

function buildDescription(label: string, tags: Record<string, unknown>): string {
  const explicit = str(tags.description) ?? str(tags.desc);
  if (explicit) return explicit;
  const parts = [str(tags.style), str(tags.color), str(tags.material), label]
    .filter((p): p is string => Boolean(p) && p !== 'unknown');
  // De-duplicate words while preserving order.
  const seen = new Set<string>();
  const words: string[] = [];
  for (const part of parts) {
    for (const w of part.split(/\s+/)) {
      const key = w.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      words.push(w);
    }
  }
  return words.join(' ').slice(0, 120);
}

function buildTags(tags: Record<string, unknown>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (v: unknown): void => {
    const s = str(v)?.toLowerCase();
    if (!s || s === 'unknown' || s === 'none' || s === 'null' || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  for (const key of TAG_KEYS_IN_ORDER) push(tags[key]);
  const features = tags.notable_features;
  if (Array.isArray(features)) for (const f of features) push(f);
  return out.slice(0, MAX_TAGS);
}

function normalizeCategory(raw: unknown): string {
  const c = str(raw);
  if (!c) return 'Other';
  const match = VALID_CATEGORIES.find((v) => v.toLowerCase() === c.toLowerCase());
  if (match) return match;
  // Guard against models that echo the whole enum or emit junk: only accept a
  // short, single-token category; otherwise fall back to Other.
  if (c.includes('|') || c.length > 24 || c.split(/\s+/).length > 3) return 'Other';
  return c;
}

/**
 * Architectural surfaces are not inventory items. Models sometimes emit them
 * despite the prompt, so we drop them deterministically. Exact-match only, so
 * compounds like "floor lamp", "window curtain", or "door handle" survive.
 */
const ARCHITECTURAL_LABELS = new Set([
  'wall',
  'walls',
  'floor',
  'floors',
  'flooring',
  'ceiling',
  'ceilings',
  'archway',
  'arch',
  'doorway',
  'doorways',
  'baseboard',
  'baseboards',
  'molding',
  'moulding',
  'crown molding',
  'wainscoting',
  'beam',
  'ceiling beam',
  'column',
  'pillar',
  'window',
  'windows',
  'door',
  'doors',
  'room',
  'background',
  'corner',
]);

export function isArchitectural(label: string): boolean {
  return ARCHITECTURAL_LABELS.has(label.trim().toLowerCase());
}

/**
 * Map one raw VLM item dict + its already-normalized box into a DetectedItem.
 * Returns null when the item has no label or no usable box.
 */
export function rawItemToDetectedItem(raw: unknown, box: NormBox | null): DetectedItem | null {
  if (raw === null || typeof raw !== 'object' || !box) return null;
  const o = raw as Record<string, unknown>;
  const label = str(o.object) ?? str(o.name) ?? str(o.label);
  if (!label || isArchitectural(label)) return null;
  const tags = (o.tags && typeof o.tags === 'object' ? o.tags : {}) as Record<string, unknown>;
  return {
    label,
    description: buildDescription(label, tags),
    category: normalizeCategory(o.category),
    tags: buildTags(tags),
    box,
  };
}

/**
 * Deduplicate items that refer to the same physical object. Two items collide
 * when they share a label (case-insensitive) and their boxes overlap heavily
 * (IoU >= threshold). The first occurrence wins.
 */
export function dedupeItems(
  items: DetectedItem[],
  iouThreshold = 0.6,
  maxPerLabel = 12,
): DetectedItem[] {
  const kept: DetectedItem[] = [];
  const perLabel = new Map<string, number>();
  for (const item of items) {
    const key = item.label.toLowerCase();
    const dup = kept.find(
      (k) => k.label.toLowerCase() === key && iou(k.box, item.box) >= iouThreshold,
    );
    if (dup) continue;
    // Cap runaway repetition (a known small-VLM failure mode where one label is
    // emitted dozens of times) while still allowing many genuine repeats.
    if ((perLabel.get(key) ?? 0) >= maxPerLabel) continue;
    perLabel.set(key, (perLabel.get(key) ?? 0) + 1);
    kept.push(item);
  }
  return kept;
}

function iou(a: NormBox, b: NormBox): number {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;
  const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const union = a.width * a.height + b.width * b.height - inter;
  return union <= 0 ? 0 : inter / union;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

export function buildPass1Prompt(imgW: number, imgH: number): string {
  const categories = VALID_CATEGORIES.join('|');
  return `You are a precise home inventory vision system. Analyze this room photograph (${imgW}x${imgH} pixels) and identify EVERY distinct home object visible.

For EACH object, return a JSON object with:
- "id": sequential integer starting at 1
- "object": specific object name (e.g. "tufted sofa", not just "sofa")
- "category": one of [${categories}]
- "bounding_box": {"x_min": float, "y_min": float, "x_max": float, "y_max": float} as NORMALIZED coordinates (0.0 to 1.0 relative to image dimensions)
- "confidence": float 0.0-1.0
- "tags": {"color": "...", "material": "...", "style": "...", "condition": "new|good|fair|worn|damaged|unknown", "size_estimate": "small|medium|large", "brand": null, "notable_features": ["..."]}

Rules:
- Be exhaustive: list EVERY movable object, including small decorative items — throw pillows, vases, plants, lamps, artwork, rugs, books, candles, bowls, trays, remotes, coasters, figurines.
- Bounding boxes must be tight and accurate, and NORMALIZED 0.0-1.0.
- CRITICAL: NEVER output architectural surfaces as items. Do NOT include wall, walls, floor, flooring, ceiling, window, door, doorway, archway, baseboard, molding, beam, column, or "room"/"background". These are structure, not inventory.
- DO include window treatments (curtains, blinds), light fixtures, and wall-mounted objects (mirrors, art, sconces).
- Count clustered decorative objects separately, not as one.
- Also assess the photo itself in a top-level "scene" object:
  "scene": {"type": "shelf|drawer|room|closeup", "estimated_total_items": <integer, your best estimate of ALL distinct objects present including ones you could not list>, "photo_quality": {"verdict": "ok|too_dark|too_blurry|too_far|not_a_scene", "reason": "<short reason, or null when ok>"}}
  Use "room" when the frame shows a wide view of a whole room. Use a non-ok verdict when the photo is unusable for inventory (severely dark/blurry, subject too far to identify objects, or not a home scene at all).
- Return ONLY valid JSON: {"scene": {...}, "room_type": "...", "items": [...]}
- No markdown, no explanation.`;
}

export function buildLabelPrompt(): string {
  const categories = VALID_CATEGORIES.join('|');
  return `You are labeling a cropped photo showing ONE home object for an inventory. Identify the single main object in this crop.

Return ONLY valid JSON (no markdown, no explanation):
{"object": "specific object name (e.g. 'tufted velvet armchair', not just 'chair')", "category": "one of [${categories}]", "description": "short human-friendly description", "tags": {"color": "...", "material": "...", "style": "...", "condition": "new|good|fair|worn|damaged|unknown", "size_estimate": "small|medium|large", "brand": null, "notable_features": ["..."]}}`;
}

export function buildPass2Prompt(
  imgW: number,
  imgH: number,
  found: Array<{ id?: number; object?: string }>,
): string {
  const summary = JSON.stringify(found.map((i, idx) => ({ id: i.id ?? idx + 1, object: i.object })));
  const nextId = found.length + 1;
  const categories = VALID_CATEGORIES.join('|');
  return `You are a meticulous home inventory auditor. A first pass found these ${found.length} items in this room photo (${imgW}x${imgH} pixels):

${summary}

Find EVERY object that was MISSED. Look for: items hidden behind/under others, small items on tables/shelves (candles, coasters, remotes, trays, figurines), items at frame edges, hardware/fixtures, picture frames separate from the art, throw blankets, clustered decor counted as one, side/end tables, baskets/boxes used as organizers, flowers separate from vases.

Return ONLY newly found items. Continue IDs from ${nextId}. Same JSON shape:
{"new_items": [{"id": int, "object": "specific name", "category": "${categories}", "bounding_box": {"x_min": float, "y_min": float, "x_max": float, "y_max": float}, "confidence": float, "tags": {"color":"...","material":"...","style":"...","condition":"good","size_estimate":"...","brand":null,"notable_features":["..."]}, "missed_reason": "why missed"}]}

All bounding_box values must be NORMALIZED (0.0 to 1.0). If nothing was missed, return {"new_items": []}. Return ONLY valid JSON.`;
}

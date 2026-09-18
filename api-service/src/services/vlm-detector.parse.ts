import type { DetectedItem } from '../types/detected-item';
/**
 * Pure parsing/prompt helpers for the two-pass VLM detector.
 *
 * No I/O here so every function is unit-testable in isolation. The detector
 * class wires these together around the VLM client.
 *
 * Deliberately vocabulary-free: nothing in this file enumerates home objects.
 * Whether an item belongs in an inventory is decided by the model's own
 * `is_possession` flag (falling back to the cached LLM judge in
 * possession-judge.service). Whether two labels name the same kind of object is
 * decided structurally — token-subset and head-phrase subsumption — NOT by
 * embedding similarity: cosine was measured to be non-monotone in synonymy on
 * this vocabulary (cabinet/sideboard 0.444 and daybed/futon 0.440 score BELOW
 * table/chair 0.589 and stool/chair 0.626), so no threshold separates synonyms
 * from co-occurring distinct objects, and anything a threshold did catch was a
 * near-identical string that the structural test already catches for free.
 * The only word lists left are closed-class English function words used for
 * grammatical head-noun analysis.
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

/**
 * Tag keys carrying prose rather than a tag value. Not a vocabulary of objects
 * or attributes — just the two schema fields that feed the description instead
 * of the tag list. Every other key the model emits becomes a tag, in the order
 * the model emitted it.
 */
const PROSE_TAG_KEYS = new Set(['description', 'desc']);

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

/**
 * Recover the scene block from raw model text even when the surrounding JSON is
 * truncated (token-limit cutoffs lose the closing braces, which would otherwise
 * cost us the tiling trigger and photo verdict). Finds the balanced object that
 * follows a top-level "scene" key and parses just that.
 */
export function salvageScene(raw: string): SceneInfo {
  const keyIdx = raw.indexOf('"scene"');
  if (keyIdx === -1) return { ...DEFAULT_SCENE };
  const start = raw.indexOf('{', keyIdx);
  if (start === -1) return { ...DEFAULT_SCENE };
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return parseSceneInfo({ scene: JSON.parse(raw.slice(start, i + 1)) });
        } catch {
          return { ...DEFAULT_SCENE };
        }
      }
    }
  }
  return { ...DEFAULT_SCENE };
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

  // Degenerate drift some models produce mid-generation: the full corner array
  // stuffed into a single key, e.g. {"x_min": [197, 498, 368, 738], ...}.
  // Salvage the array as [x1, y1, x2, y2] instead of dropping the item.
  for (const key of ['x_min', 'bbox_2d', 'box'] as const) {
    const v = o[key];
    if (Array.isArray(v) && v.length === 4) {
      const [a, b, c, d] = v.map(num);
      if (a !== null && b !== null && c !== null && d !== null) return [a, b, c, d];
    }
  }

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
 * Decide the coordinate convention for a whole pass by VALUE INFERENCE alone.
 *
 * Done at pass level (not per box) using the global maximum across every box,
 * because a single edge-spanning object reliably reveals the scale. Values
 * <= 1.5 are already normalized; a coordinate that exceeds the image must be
 * on the 0-1000 scale (Qwen3-VL).
 *
 * WARNING — known systematic bias: for production-sized images (long side
 * >= ~981 px) pixelCeiling exceeds 1000, so prompt-compliant 0-1000 output
 * (the pass prompts MANDATE that scale) is always classified 'pixel' and
 * divided by the image size instead of 1000 — a ~2.3% shrink on both axes of
 * every box. Values alone cannot disambiguate the ambiguous band (see
 * vlm-detector.factory.ts#resolveLocalCoordMode, which pins known models by
 * name and only falls back here for unknown ones). Keep that pin in place;
 * do not widen this heuristic to "fix" it.
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

/** Scalar tag values in the order the model emitted them (no key whitelist). */
function emittedTagValues(tags: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(tags)) {
    if (PROSE_TAG_KEYS.has(key)) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        const s = str(v);
        if (s) out.push(s);
      }
      continue;
    }
    const s = str(value);
    if (s) out.push(s);
  }
  return out;
}

function buildDescription(label: string, tags: Record<string, unknown>): string {
  const explicit = str(tags.description) ?? str(tags.desc);
  if (explicit) return explicit;
  const parts = [...emittedTagValues(tags), label].filter((p) => p !== 'unknown');
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
  for (const value of emittedTagValues(tags)) {
    const s = value.toLowerCase();
    if (s === 'unknown' || s === 'none' || s === 'null' || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
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
 * Closed-class English function words that end the head noun phrase: a trailing
 * prepositional phrase ("mirror on wall") or participial clause ("vase holding
 * branches") modifies the head, it does not replace it. This is grammar, not a
 * vocabulary of objects — it never needs maintaining as the world of home
 * objects changes. Participles like "mounted"/"hanging" are deliberately absent
 * — "wall mounted tv" heads at "tv", "wall hanging" is decor.
 */
const HEAD_PHRASE_BREAKERS = new Set([
  'on',
  'in',
  'at',
  'of',
  'with',
  'above',
  'over',
  'under',
  'underneath',
  'beneath',
  'behind',
  'beside',
  'near',
  'against',
  'atop',
  'along',
  'inside',
  'around',
  'wearing',
  'holding',
  'carrying',
  'standing',
  'sitting',
]);

/**
 * Extract the head noun phrase of a label: the tokens before the first
 * preposition/participle. Returns lowercase tokens; empty when the label is
 * blank or starts with a breaker.
 */
/**
 * The head noun phrase of a label as a string: "window blinds behind curtains"
 * -> "window blinds". Used to ask the possession judge about the OBJECT rather
 * than the fixture a model mentioned alongside it.
 */
export function headPhrase(label: string): string {
  const tokens = headPhraseTokens(label);
  return tokens.length > 0 ? tokens.join(' ') : label.trim().toLowerCase();
}

/**
 * The possession named inside a trailing clause, when the label's head is the
 * fixture rather than the object: "window with sheer white curtains" ->
 * "sheer white curtains". Returns null when there is no trailing clause.
 *
 * Grammar only — the breaker set is closed-class English function words, so
 * this never needs maintaining as the world of home objects changes.
 */
export function trailingClause(label: string): string | null {
  const tokens = label.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const breakerIdx = tokens.findIndex((t) => HEAD_PHRASE_BREAKERS.has(t));
  if (breakerIdx === -1 || breakerIdx === tokens.length - 1) return null;
  const rest = tokens.slice(breakerIdx + 1);
  // Stop at any further breaker so the clause keeps its own head phrase.
  const nextBreaker = rest.findIndex((t) => HEAD_PHRASE_BREAKERS.has(t));
  const clause = nextBreaker === -1 ? rest : rest.slice(0, nextBreaker);
  return clause.length > 0 ? clause.join(' ') : null;
}

function headPhraseTokens(label: string): string[] {
  const tokens = label.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const breakerIdx = tokens.findIndex((t) => HEAD_PHRASE_BREAKERS.has(t));
  return breakerIdx === -1 ? tokens : tokens.slice(0, breakerIdx);
}

/**
 * Read the model's `is_possession` verdict: true = a movable belonging that
 * belongs in a home inventory, false = building structure/surface/fixture in
 * place/person/body part. Returns null when the field is absent or unusable, so
 * the caller can fall back to the concept-anchor net.
 *
 * Accepts the string forms models occasionally emit despite a boolean schema.
 */
export function parsePossessionFlag(raw: unknown): boolean | null {
  if (raw === null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const value = o.is_possession ?? o.isPossession ?? o.possession;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === 'yes') return true;
    if (v === 'false' || v === 'no') return false;
  }
  return null;
}

/**
 * Minimum normalized box extent per axis. Below this a box carries no spatial
 * information — observed as edge-clamped zero-area repetition artifacts (e.g.
 * {x: 1, width: 0}) from mid-generation model drift.
 */
export const MIN_BOX_EXTENT = 0.004;

/** True when a box is too small on either axis to describe a real object. */
export function isDegenerateBox(box: NormBox): boolean {
  return box.width < MIN_BOX_EXTENT || box.height < MIN_BOX_EXTENT;
}

export interface ItemMapOptions {
  /**
   * Cached LLM judge. Consulted twice over:
   *  - when the model omitted `is_possession`, on the full label;
   *  - when the model said `false`, on the HEAD NOUN, as a second independent
   *    signal before deleting something the user owns.
   * Returns null when it has no answer.
   */
  judgePossession?: (label: string) => boolean | null;
}

/**
 * Map one raw VLM item dict + its already-normalized box into a DetectedItem.
 * Returns null when the item has no label, no usable box, or is not a
 * possession.
 *
 * Inventory-ness is the MODEL's call (`is_possession`), but deleting a belonging
 * is the one error a user actually notices, so a `false` needs TWO independent
 * signals: the model's flag AND the judge's verdict on the label's head noun.
 * Measured failure this prevents — "window blinds behind curtains" flagged false
 * for the window, silently costing the owner their blinds. Genuine structure
 * ("wooden floor", "white wall") heads at the surface itself and both signals
 * agree.
 *
 * A third case survives both signals honestly: the head really IS fabric, but a
 * possession is named in a trailing clause — "window with sheer white curtains".
 * Dropping that loses the curtains, and no oracle can see it (answer keys list
 * what they list). So when the head is fabric we ask the judge about the
 * clause's own head; if that is a belonging we keep the item and RELABEL it to
 * the clause, so the inventory names the object rather than the fixture.
 * Limitation: the box stays the fixture's region — the possession is inside it,
 * which is good enough to show the user, but it is not a tight box.
 *
 * When the flag is missing we consult the judge on the full label; whenever the
 * judge has no answer we fall back to honouring the model, so an outage cannot
 * flood the inventory with walls.
 */
export function rawItemToDetectedItem(
  raw: unknown,
  box: NormBox | null,
  opts: ItemMapOptions = {},
): DetectedItem | null {
  if (raw === null || typeof raw !== 'object' || !box || isDegenerateBox(box)) return null;
  const o = raw as Record<string, unknown>;
  const label = str(o.object) ?? str(o.name) ?? str(o.label);
  if (!label) return null;

  const flag = parsePossessionFlag(o);
  let effectiveLabel = label;
  if (flag === false) {
    // Second signal: the judge sees only the head noun, so a fixture named as a
    // modifier cannot drag the object down with it. `true` overrules the model;
    // `false` or no answer honours it.
    if (opts.judgePossession?.(headPhrase(label)) !== true) {
      // Third signal: the head is fabric, but a belonging may be named in the
      // trailing clause ("window with sheer white curtains").
      const clause = trailingClause(label);
      if (!clause || opts.judgePossession?.(headPhrase(clause)) !== true) return null;
      effectiveLabel = clause;
    }
  } else if (flag === null && opts.judgePossession?.(label) === false) {
    return null;
  }

  const tags = (o.tags && typeof o.tags === 'object' ? o.tags : {}) as Record<string, unknown>;
  return {
    label: effectiveLabel,
    description: buildDescription(effectiveLabel, tags),
    category: normalizeCategory(o.category),
    tags: buildTags(tags),
    box,
  };
}

function tokenSetSubsumes(a: string[], b: string[]): boolean {
  const ta = new Set(a);
  const tb = new Set(b);
  const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  for (const t of small) if (!large.has(t)) return false;
  return true;
}

const splitTokens = (s: string): string[] => s.toLowerCase().split(/\s+/).filter(Boolean);

/**
 * Structural (vocabulary-free) label equivalence, also the graceful-degradation
 * path when embeddings are unavailable:
 * - one label's word set is contained in the other's ("area rug" ⊆ "white area rug"), or
 * - their head phrases subsume once trailing qualifiers are stripped
 *   ("vase with branches" / "vase with flowers" both head at "vase").
 *
 * Synonymy that needs world knowledge ("television" / "wall-mounted screen")
 * is handled by embedding similarity, not here.
 */
function labelsSubsume(a: string, b: string): boolean {
  if (tokenSetSubsumes(splitTokens(a), splitTokens(b))) return true;
  const ha = headPhraseTokens(a);
  const hb = headPhraseTokens(b);
  return ha.length > 0 && hb.length > 0 && tokenSetSubsumes(ha, hb);
}

/**
 * Intersection-over-min-area threshold for same-label pairs: catches one box
 * (near-)contained in another, where raw IoU stays low because the areas differ.
 * Measured: re-detected slivers score 0.78-1.0; distinct same-label neighbors
 * (adjacent shelf cans, separate towel racks) score <= 0.31.
 */
const IOMIN_THRESHOLD = 0.75;

/**
 * Same-label boxes whose centers sit closer than this fraction of the smaller
 * box's size refer to one physical object re-detected with a small offset.
 * Measured: re-detections score <= 0.38; the closest genuinely distinct pairs
 * (stacked thin books 0.42, adjacent identical cans 0.65+) stay above.
 */
const CENTER_DISTANCE_RATIO = 0.4;

/** Coordinate tolerance under which two boxes count as the exact same box. */
const EXACT_BOX_EPSILON = 0.005;

/**
 * Strict-IoU floor for a verbatim-identical label re-detected with an offset.
 * Distinct identical products sit side by side with IoU <= 0.15; offset
 * re-detections of one object measure 0.37+.
 */
const EXACT_LABEL_IOU = 0.35;

/**
 * Cross-label merges (no label relationship at all) use STRICT IoU only —
 * IoMin/center-distance would swallow genuinely nested distinct objects
 * (coaster on a table, vase in front of a plant, books on a console, all
 * IoMin ~1.0 but IoU <= 0.19). Measured synonym re-detections that reach this
 * path score IoU 0.46-0.53.
 */
const CROSS_LABEL_IOU = 0.45;

/**
 * Strict-IoU floor for surfacing a cross-label overlap as a SUGGESTION. Below
 * CROSS_LABEL_IOU we no longer merge silently, but a semantically similar label
 * pair sharing this much of a region is worth asking the user about.
 */
const SUGGEST_CROSS_LABEL_IOU = 0.3;

/** How a candidate pair relates: merge silently, ask the user, or keep both. */
export type MergeTier = 'auto' | 'suggest' | 'distinct';

/** A merge the pipeline declined to make on its own. Rides the detect payload. */
export interface MergeSuggestion {
  /** Index of the incumbent item in the emitted item list. */
  itemIndexA: number;
  /** Index of the newer item in the emitted item list. */
  itemIndexB: number;
  reason: string;
  /** 0-1 blend of semantic and geometric agreement. */
  confidence: number;
}

export interface DedupeOptions {
  iouThreshold?: number;
  maxPerLabel?: number;
}

export interface DedupeResult {
  items: DetectedItem[];
  suggestions: MergeSuggestion[];
}

const DEFAULT_IOU_THRESHOLD = 0.6;
const DEFAULT_MAX_PER_LABEL = 12;

export interface PairVerdict {
  tier: MergeTier;
  reason: string;
  confidence: number;
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

/**
 * Classify how two items relate.
 *
 * Geometry is unchanged from the tuned pipeline (IoU / IoMin / center distance /
 * sliver absorption / verbatim box repetition), and label equivalence is the
 * deterministic structural test — exactly what the 96.1%-era pipeline used.
 *
 *  - `auto`: same spot AND labels equivalent (verbatim or token/head-phrase
 *    subsumed), or one region under two names at strict IoU >= CROSS_LABEL_IOU.
 *  - `suggest`: equivalent labels that overlap materially but land under the
 *    auto floor — measured in production as one object re-detected with an
 *    offset ("green glass bottle" twice at IoU 0.34). Both items are kept and
 *    the user decides.
 *  - `distinct`: everything else.
 */
export function classifyMergeTier(
  a: DetectedItem,
  b: DetectedItem,
  opts: DedupeOptions = {},
): PairVerdict {
  const iouThreshold = opts.iouThreshold ?? DEFAULT_IOU_THRESHOLD;
  const strictIou = iou(a.box, b.box);
  const exactLabel = a.label.toLowerCase() === b.label.toLowerCase();
  const equivalent = exactLabel || labelsSubsume(a.label, b.label);
  const geometric = geometricScore(a.box, b.box, strictIou);

  if (exactLabel && boxesReferToSameObject(a.box, b.box, EXACT_LABEL_IOU)) {
    return { tier: 'auto', reason: 'identical label on the same region', confidence: 1 };
  }
  if (equivalent && boxesReferToSameObject(a.box, b.box, iouThreshold)) {
    return { tier: 'auto', reason: 'one label subsumes the other on the same region', confidence: 1 };
  }
  if (strictIou >= CROSS_LABEL_IOU) {
    return { tier: 'auto', reason: `one region under two names (IoU ${round2(strictIou)})`, confidence: 1 };
  }

  if (equivalent && strictIou >= SUGGEST_CROSS_LABEL_IOU) {
    return {
      tier: 'suggest',
      reason: `same kind of object sharing a region (IoU ${round2(strictIou)})`,
      confidence: round2(clamp01(geometric)),
    };
  }
  return { tier: 'distinct', reason: 'distinct objects', confidence: 0 };
}

/** 0-1 geometric agreement: how much of the smaller box the overlap explains. */
function geometricScore(a: NormBox, b: NormBox, strictIou: number): number {
  return clamp01(Math.max(strictIou / CROSS_LABEL_IOU, ioMin(a, b)));
}

/**
 * Incremental deduplicator.
 *
 * Kept separate from dedupeItems because the streaming detector yields items as
 * they are found and can never retract one: it needs "may I emit this?" per
 * item, plus the suggestion indices in emitted order. `replaceWinners` is off in
 * that mode for exactly that reason, and on for batch dedupe where the more
 * specific label may still take the slot.
 */
export class ItemAccumulator {
  private readonly kept: DetectedItem[] = [];
  private readonly perLabel = new Map<string, number>();
  private readonly collected: MergeSuggestion[] = [];

  constructor(
    private readonly opts: DedupeOptions = {},
    private readonly replaceWinners = false,
  ) {}

  get items(): DetectedItem[] {
    return [...this.kept];
  }

  get suggestions(): MergeSuggestion[] {
    return [...this.collected];
  }

  /**
   * Offer one item. Returns whether it was accepted (and therefore may be
   * streamed) plus any merge suggestions it raised against already-kept items.
   */
  add(item: DetectedItem): { accepted: boolean; suggestions: MergeSuggestion[] } {
    const maxPerLabel = this.opts.maxPerLabel ?? DEFAULT_MAX_PER_LABEL;
    const pending: Array<{ index: number; verdict: PairVerdict }> = [];
    for (let i = 0; i < this.kept.length; i++) {
      const verdict = classifyMergeTier(this.kept[i] as DetectedItem, item, this.opts);
      if (verdict.tier === 'auto') {
        if (this.replaceWinners) this.replaceIfMoreSpecific(i, item);
        return { accepted: false, suggestions: [] };
      }
      if (verdict.tier === 'suggest') pending.push({ index: i, verdict });
    }

    // Cap runaway repetition (a known small-VLM failure mode where one label is
    // emitted dozens of times) while still allowing many genuine repeats.
    const key = item.label.toLowerCase();
    const count = this.perLabel.get(key) ?? 0;
    if (count >= maxPerLabel) return { accepted: false, suggestions: [] };
    this.perLabel.set(key, count + 1);

    const newIndex = this.kept.length;
    this.kept.push(item);
    const suggestions = pending.map(({ index, verdict }) => ({
      itemIndexA: index,
      itemIndexB: newIndex,
      reason: verdict.reason,
      confidence: verdict.confidence,
    }));
    this.collected.push(...suggestions);
    return { accepted: true, suggestions };
  }

  /**
   * The more specific item (more label tokens) wins the slot, keeping its own
   * box: the specific detection localizes better, and a box union would inflate
   * the region and cascade-merge neighbors.
   */
  private replaceIfMoreSpecific(index: number, item: DetectedItem): void {
    const incumbent = this.kept[index] as DetectedItem;
    if (splitTokens(item.label).length > splitTokens(incumbent.label).length) {
      this.kept[index] = item;
    }
  }
}

/**
 * Batch deduplication of items that refer to the same physical object, plus the
 * merge suggestions the pipeline declined to apply. See classifyMergeTier for
 * the collision rules. Suggestion indices refer to the returned `items` array.
 */
export function dedupeItems(items: DetectedItem[], opts: DedupeOptions = {}): DedupeResult {
  const accumulator = new ItemAccumulator(opts, true);
  for (const item of items) accumulator.add(item);
  return { items: accumulator.items, suggestions: accumulator.suggestions };
}

/**
 * Partial re-detection ("sliver") absorption: a much smaller same-label box
 * whose extent is contained in the larger box along one axis and overlaps it on
 * the other is a clipped tile-edge re-detection of the same object, even when
 * IoMin stays low (e.g. an armchair's backrest strip: IoMin 0.31, x-contained).
 * Distinct stacked/adjacent same-label objects have near-equal areas (ratio >
 * 0.4) or fail axis containment, so they survive.
 */
const SLIVER_AREA_RATIO_MAX = 0.4;
const SLIVER_AXIS_CONTAINMENT_MIN = 0.85;

function isAbsorbedSliver(a: NormBox, b: NormBox): boolean {
  const [small, large] = a.width * a.height <= b.width * b.height ? [a, b] : [b, a];
  const largeArea = large.width * large.height;
  if (largeArea <= 0) return false;
  if (small.width * small.height > SLIVER_AREA_RATIO_MAX * largeArea) return false;
  const xOverlap = Math.max(
    0,
    Math.min(small.x + small.width, large.x + large.width) - Math.max(small.x, large.x),
  );
  const yOverlap = Math.max(
    0,
    Math.min(small.y + small.height, large.y + large.height) - Math.max(small.y, large.y),
  );
  const xContained = small.width > 0 && xOverlap / small.width >= SLIVER_AXIS_CONTAINMENT_MIN;
  const yContained = small.height > 0 && yOverlap / small.height >= SLIVER_AXIS_CONTAINMENT_MIN;
  return (xContained && yOverlap > 0) || (yContained && xOverlap > 0);
}

/** Spatial collision test for two boxes carrying the same (or subsuming) label. */
function boxesReferToSameObject(a: NormBox, b: NormBox, iouThreshold: number): boolean {
  if (iou(a, b) >= iouThreshold) return true;
  if (isExactSameBox(a, b)) return true;
  if (ioMin(a, b) >= IOMIN_THRESHOLD) return true;
  if (isAbsorbedSliver(a, b)) return true;
  const scale = Math.min(Math.sqrt(a.width * a.height), Math.sqrt(b.width * b.height));
  return scale > 0 && centerDistance(a, b) <= CENTER_DISTANCE_RATIO * scale;
}

function isExactSameBox(a: NormBox, b: NormBox): boolean {
  return (
    Math.abs(a.x - b.x) < EXACT_BOX_EPSILON &&
    Math.abs(a.y - b.y) < EXACT_BOX_EPSILON &&
    Math.abs(a.width - b.width) < EXACT_BOX_EPSILON &&
    Math.abs(a.height - b.height) < EXACT_BOX_EPSILON
  );
}

function centerDistance(a: NormBox, b: NormBox): number {
  const dx = a.x + a.width / 2 - (b.x + b.width / 2);
  const dy = a.y + a.height / 2 - (b.y + b.height / 2);
  return Math.hypot(dx, dy);
}

function intersectionArea(a: NormBox, b: NormBox): number {
  const ix = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return ix * iy;
}

function iou(a: NormBox, b: NormBox): number {
  const inter = intersectionArea(a, b);
  const union = a.width * a.height + b.width * b.height - inter;
  return union <= 0 ? 0 : inter / union;
}

/** Intersection over the smaller box's area: 1.0 when one box contains the other. */
function ioMin(a: NormBox, b: NormBox): number {
  const minArea = Math.min(a.width * a.height, b.width * b.height);
  return minArea <= 0 ? 0 : intersectionArea(a, b) / minArea;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

/**
 * The `is_possession` contract for the VISION passes — deliberately one compact
 * line. It shares the prompt with the rule that makes labels specific
 * ("navy blue couch", not "couch"), and a long block here measurably crowded
 * that rule out: an 8-fixture run with a three-paragraph version came back with
 * systematically terser labels ("gold tray" for "gold tray with decorative
 * items", "striped sofa" for "white sofa with red and white patterned fabric").
 *
 * Stated as a principle with contrasts rather than a list of objects: the model
 * knows what a home contains far better than any table we could maintain, so we
 * ask it to make the call and only teach it where the boundary runs. The judge
 * (possession-judge.service) uses the longer POSSESSION_RULE_DETAILED, because
 * there it is the only instruction competing for attention.
 */
export const POSSESSION_RULE = `- "is_possession" (REQUIRED JSON boolean, never a string, never omitted): true if the owner could carry or move it out of the home; false for the building itself, a surface or fixture that stays with the property, or a person. A lamp is a possession — the ceiling it hangs from is not; a rug is — the floor under it is not; blinds are — the window they hang in is not. Name the BELONGING, never the fixture it sits on or hangs in ("blinds", not "window with blinds"). Plain building parts may be left out entirely, but anything you DO list carries an honest flag.`;

/** Long-form version for the text-only judge, which has no competing rules. */
export const POSSESSION_RULE_DETAILED = `Decide whether each thing is a POSSESSION: something a person owns and could carry or move out of the home when they leave. It is NOT a possession if it is part of the building itself, a surface or fixture that stays with the property, or a person or body part.

Contrasts to calibrate on: a lamp you could carry out is a possession — the ceiling it hangs from is not. A rug lying on the floor is a possession — the floor is not. Curtains you could unhook are possessions — the window and its frame are not. A person is never a possession, and neither is any part of their body.

When unsure, decide by asking whether it leaves with the owner.`;

export function buildPass1Prompt(imgW: number, imgH: number): string {
  const categories = VALID_CATEGORIES.join('|');
  return `You are a precise home inventory vision system. Analyze this photograph (${imgW}x${imgH} pixels) and list EVERY distinct physical home object visible.

Output exactly ONE JSON object with this structure and NOTHING else:
{"scene": {"type": "shelf|drawer|room|closeup", "estimated_total_items": <int>, "photo_quality": {"verdict": "ok|too_dark|too_blurry|too_far|not_a_scene", "reason": null}}, "items": [{"id": 1, "object": "specific object name", "category": "<one of ${categories}>", "is_possession": true, "bbox_2d": [x1, y1, x2, y2], "tags": {"color": "...", "material": "..."}}, ...]}

Schema rules (MANDATORY):
- "items" is a flat array with exactly ONE entry per physical object instance. Three pillows = three separate entries. NEVER merge multiple objects into one entry. NEVER use "count" or quantity fields.
- "bbox_2d" is [x1, y1, x2, y2]: exactly four integers on a 0-1000 scale (0,0 = top-left corner, 1000,1000 = bottom-right corner of the image). Boxes must be tight around the object. Do NOT use any other box format or key.
- "object" is a specific, self-describing name that includes the visible color/material/type qualifiers: "white ceramic planter" not "plant pot", "sheer white curtains" not "curtain", "framed painting" not "artwork", "navy blue couch" not "couch", "gold candle holder" not "holder". Keep tag values short; use "unknown" when unsure.
${POSSESSION_RULE}
- Emit "scene" BEFORE "items". No markdown, no explanation, no keys other than those shown.

Detection rules:
- Be exhaustive: list EVERY movable object, including small decorative items — throw pillows, vases, plants and their pots, lamps, wall art (each frame is its own entry), rugs (even partially covered), books, candles, bowls, trays, remotes, coasters, figurines. Include stands/stools under plants as separate items, transparent/acrylic furniture, and window blinds behind curtains.
- DO include window treatments (curtains, blinds), light fixtures, and wall-mounted objects (mirrors, art, sconces) — these are possessions.
- Count clustered decorative objects separately, not as one.
- "scene".type is "room" when the frame shows a wide view of a whole room. "estimated_total_items" is your best estimate of ALL distinct objects present, including ones you could not list. Use a non-ok "photo_quality" verdict only when the photo is unusable for inventory (severely dark/blurry, subject too far to identify objects, or not a home scene at all).`;
}

export function buildLabelPrompt(): string {
  const categories = VALID_CATEGORIES.join('|');
  return `You are labeling a cropped photo showing ONE home object for an inventory. Identify the single main object in this crop.

Return ONLY valid JSON (no markdown, no explanation):
{"object": "specific object name (e.g. 'tufted velvet armchair', not just 'chair')", "category": "one of [${categories}]", "is_possession": true, "description": "short human-friendly description", "tags": {"color": "...", "material": "...", "style": "...", "condition": "new|good|fair|worn|damaged|unknown", "size_estimate": "small|medium|large", "brand": null, "notable_features": ["..."]}}

${POSSESSION_RULE}`;
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

Find EVERY object that was MISSED. Look for: items hidden behind/under others, small items on tables/shelves (candles, coasters, remotes, trays, figurines), items at frame edges, hardware/fixtures, picture frames separate from the art, throw blankets, clustered decor counted as one, side/end tables, baskets/boxes used as organizers, flowers separate from vases, stands/stools/tables UNDERNEATH plants or lamps (the support is its own item), transparent or acrylic furniture (easy to overlook), pillows/blankets/books lying ON sofas and beds, small electronics (mouse, keyboard, remote, chargers), footwear on the floor, window blinds behind curtains, and rugs even when mostly covered by furniture.

Output exactly ONE JSON object with this structure and NOTHING else:
{"new_items": [{"id": <int>, "object": "specific self-describing name with visible color/material (e.g. 'white ceramic planter', 'sheer white curtains', 'framed painting')", "category": "<one of ${categories}>", "is_possession": true, "bbox_2d": [x1, y1, x2, y2], "tags": {"color": "...", "material": "..."}}, ...]}

Schema rules (MANDATORY):
- "new_items" contains ONLY objects missing from the list above — never re-list or summarize items already found.
- Exactly ONE entry per missed physical object instance. NEVER merge multiple objects into one entry. NEVER use "count" or quantity fields. NEVER aggregate.
- "bbox_2d" is [x1, y1, x2, y2]: exactly four integers on a 0-1000 scale (0,0 = top-left, 1000,1000 = bottom-right of the image). Do NOT use any other box format or key.
${POSSESSION_RULE}
- Continue IDs from ${nextId}. If nothing was missed, output {"new_items": []}.
- No markdown, no explanation, no keys other than those shown.`;
}

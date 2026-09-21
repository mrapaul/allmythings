import sharp from 'sharp';
import type { DetectedItem } from '../types/detected-item';
import { DetectorUnavailableError, type VlmClient } from '../clients/vlm-client';
import { logger } from '../utils/logger';
import {
  buildPass1Prompt,
  buildPass2Prompt,
  stripAndParseJson,
  salvageObjects,
  extractCorners,
  inferCoordMode,
  cornersToNormBox,
  rawItemToDetectedItem,
  dedupeItems,
  parseSceneInfo,
  salvageScene,
  DEFAULT_SCENE,
  ItemAccumulator,
  headPhrase,
  trailingClause,
  isDegenerateBox,
  parsePossessionFlag,
  type CoordMode,
  type NormBox,
  type DedupeOptions,
  type MergeSuggestion,
  type SceneInfo,
} from './vlm-detector.parse';
import { shouldTile, computeTileRects, mapTileBoxToFull } from './vlm-detector.tiling';
import { normalizeText } from './embeddings.service';
import type { PossessionJudge } from './possession-judge.service';

/**
 * Two-pass VLM home-inventory detector.
 *
 * Pass 1 detects every object; pass 2 audits for items the first pass missed.
 * Each pass is a single JSON-constrained call to a self-hosted vision model
 * (Ollama). Coordinates are normalized to [0,1] regardless of whether the model
 * emits 0-1, 0-1000, or absolute pixels (see inferCoordMode).
 *
 * Output is the stable DetectedItem contract, so the mobile app, DB, and SSE
 * stream are unchanged from the legacy pipeline path.
 */

export interface VlmDetectorOptions {
  twoPass: boolean;
  maxImageSize: number;
  /** Force a coordinate convention; 'auto' infers it per pass. */
  coordMode: CoordMode | 'auto';
}

/**
 * Per-request detect overrides (the `mode` query param on the detect routes).
 * Any field left undefined keeps the detector's configured default — the
 * routes only ever set `twoPass: false` (scout mode), never `true`, so an
 * env-configured single-pass detector stays single-pass.
 */
export interface DetectOptions {
  /** false = scout: pass 1 + adaptive tiles only, skip the pass-2 audit. */
  twoPass?: boolean;
}

/**
 * Streamed detection event: the pass-1 scene assessment, then items, with
 * merge suggestions interleaved as the pairs are discovered.
 */
export type DetectorEvent =
  | { kind: 'scene'; scene: SceneInfo }
  | { kind: 'item'; item: DetectedItem }
  | { kind: 'merge-suggestion'; suggestion: MergeSuggestion };

export interface DetectionResult {
  scene: SceneInfo;
  items: DetectedItem[];
  /** Pairs the pipeline suspects are one object but declined to merge itself. */
  mergeSuggestions: MergeSuggestion[];
}

/** Public surface every detector (single-backend or composed) exposes. */
export interface Detector {
  detect(imageBuffer: Buffer, opts?: DetectOptions): Promise<DetectionResult>;
  detectStream(imageBuffer: Buffer, opts?: DetectOptions): AsyncGenerator<DetectorEvent>;
}

/** The label a raw model item carries, under any of the keys models emit. */
function labelOf(raw: unknown): string | null {
  if (raw === null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  for (const key of ['object', 'name', 'label'] as const) {
    const v = o[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/** Drain a detector stream into the batch DetectionResult shape. */
export async function collectDetection(
  stream: AsyncGenerator<DetectorEvent>,
): Promise<DetectionResult> {
  let scene: SceneInfo = { ...DEFAULT_SCENE };
  const items: DetectedItem[] = [];
  const mergeSuggestions: MergeSuggestion[] = [];
  for await (const ev of stream) {
    if (ev.kind === 'scene') scene = ev.scene;
    else if (ev.kind === 'item') items.push(ev.item);
    else mergeSuggestions.push(ev.suggestion);
  }
  return { scene, items, mergeSuggestions };
}

interface PreparedImage {
  base64: string;
  width: number;
  height: number;
  /** Resized JPEG bytes, kept so tile passes can crop without re-decoding the original. */
  buffer: Buffer;
}

export class VlmDetector {
  constructor(
    private readonly client: VlmClient,
    private readonly opts: VlmDetectorOptions,
    /** Optional fallback judge for items missing `is_possession`. */
    private readonly possessionJudge: PossessionJudge | null = null,
  ) {}

  /** Run the full pipeline and return the scene assessment plus all items. */
  async detect(imageBuffer: Buffer, opts?: DetectOptions): Promise<DetectionResult> {
    return collectDetection(this.detectStream(imageBuffer, opts));
  }

  /**
   * Stream the pass-1 scene assessment first, then items as each pass
   * completes: all pass-1 items, then all pass-2 items. Lets the SSE route
   * emit events incrementally.
   */
  async *detectStream(imageBuffer: Buffer, opts?: DetectOptions): AsyncGenerator<DetectorEvent> {
    const img = await this.prepareImage(imageBuffer);
    const twoPass = opts?.twoPass ?? this.opts.twoPass;

    // --- Pass 1: detect everything + assess the scene ---
    const pass1Raw = await this.client.generateJson(
      buildPass1Prompt(img.width, img.height),
      img.base64,
    );
    const pass1Items = await this.parsePass(pass1Raw, img, 'items');
    const scene = this.parseScene(pass1Raw);
    logger.info(
      {
        count: pass1Items.detected.length,
        model: this.client.modelName,
        sceneType: scene.type,
        verdict: scene.verdict,
      },
      'vlm_pass1_complete',
    );
    yield { kind: 'scene', scene };

    // One accumulator for the whole run: it owns the emitted item order, so
    // suggestion indices line up with what the client received. Winner
    // replacement is off here because streamed items cannot be retracted.
    const seen = new ItemAccumulator(pass1Items.dedupeOpts, false);
    yield* this.absorb(pass1Items.detected, seen, pass1Items.dedupeOpts);

    // --- Tile passes: only for dense wide-room scenes (model-output-driven) ---
    if (shouldTile(scene, seen.items.length)) {
      yield* this.tilePasses(img, seen);
    }

    if (!twoPass) return;

    // --- Pass 2: audit for missed items ---
    try {
      const pass2Raw = await this.client.generateJson(
        buildPass2Prompt(img.width, img.height, pass1Items.rawForAudit),
        img.base64,
      );
      const pass2Items = await this.parsePass(pass2Raw, img, 'new_items');
      logger.info({ count: pass2Items.detected.length }, 'vlm_pass2_complete');
      yield* this.absorb(pass2Items.detected, seen, pass2Items.dedupeOpts);
    } catch (err: unknown) {
      // With zero items on the board, the pass-2 audit is the only remaining
      // signal that could contradict "empty scene". If it fails, "200 + zero
      // items" is a backend outage dressed as a legitimately empty room, so
      // fail loud. Once items exist, pass 2 stays an enhancement and its
      // failure stays soft.
      if (seen.items.length === 0) {
        const wrapped =
          err instanceof DetectorUnavailableError
            ? err
            : new DetectorUnavailableError(err instanceof Error ? err.message : String(err));
        logger.error({ err: wrapped.message }, 'vlm_pass2_failed_fatal');
        throw wrapped;
      }
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'vlm_pass2_failed_continuing',
      );
    }
    logger.info(
      { items: seen.items.length, suggestions: seen.suggestions.length },
      'vlm_detection_complete',
    );
  }

  /**
   * Batch-dedupe one pass's items (winner selection still applies inside a
   * batch), then offer the survivors to the run-wide accumulator, yielding the
   * accepted items and any merge suggestions they raise.
   */
  private async *absorb(
    batch: DetectedItem[],
    seen: ItemAccumulator,
    dedupeOpts: DedupeOptions,
  ): AsyncGenerator<DetectorEvent> {
    for (const item of dedupeItems(batch, dedupeOpts).items) {
      const { accepted, suggestions } = seen.add(item);
      if (!accepted) continue;
      yield { kind: 'item', item };
      for (const suggestion of suggestions) {
        yield { kind: 'merge-suggestion', suggestion };
      }
    }
  }

  /**
   * Run one detection pass per overlapping tile, map boxes back into
   * full-image coordinates, and yield only items that survive dedupe against
   * everything already seen. A failed tile is skipped, never fatal — unless
   * EVERY tile fails, which means the backend is down, not the scene empty:
   * returning zero items then would be indistinguishable from a legitimately
   * empty room, so the run fails loud instead.
   */
  private async *tilePasses(
    img: PreparedImage,
    seen: ItemAccumulator,
  ): AsyncGenerator<DetectorEvent> {
    const rects = computeTileRects(img.width, img.height);
    logger.info({ tiles: rects.length }, 'vlm_tiling_started');
    let succeeded = 0;
    const failures: string[] = [];
    for (const rect of rects) {
      try {
        const tileJpeg = await sharp(img.buffer)
          .extract(rect)
          .jpeg({ quality: 85 })
          .toBuffer();
        const tileImg: PreparedImage = {
          base64: tileJpeg.toString('base64'),
          width: rect.width,
          height: rect.height,
          buffer: tileJpeg,
        };
        const raw = await this.client.generateJson(
          buildPass1Prompt(rect.width, rect.height),
          tileImg.base64,
        );
        const parsed = await this.parsePass(raw, tileImg, 'items');
        const mappedItems = parsed.detected.map((item) => ({
          ...item,
          box: mapTileBoxToFull(item.box, rect, img.width, img.height),
        }));
        let yielded = 0;
        for await (const ev of this.absorb(mappedItems, seen, parsed.dedupeOpts)) {
          if (ev.kind === 'item') yielded += 1;
          yield ev;
        }
        succeeded += 1;
        logger.info({ rect, found: parsed.detected.length, yielded }, 'vlm_tile_complete');
      } catch (err: unknown) {
        failures.push(err instanceof Error ? err.message : String(err));
        logger.warn(
          { rect, err: err instanceof Error ? err.message : String(err) },
          'vlm_tile_failed_continuing',
        );
      }
    }
    if (succeeded === 0) {
      throw new DetectorUnavailableError(
        `all ${rects.length} VLM tile passes failed; first error: ${failures[0] ?? 'unknown'}`,
      );
    }
    if (failures.length > 0) {
      logger.warn({ failed: failures.length, succeeded }, 'vlm_tiles_partial_failure');
    }
  }

  private parseScene(raw: string): SceneInfo {
    try {
      return parseSceneInfo(stripAndParseJson(raw));
    } catch {
      // Truncated output (token-limit cutoff) still usually contains the scene
      // block near the start — recover it so tiling and photo QA keep working.
      return salvageScene(raw);
    }
  }

  private async parsePass(
    raw: string,
    img: PreparedImage,
    itemsKey: 'items' | 'new_items',
  ): Promise<{
    detected: DetectedItem[];
    rawForAudit: Array<{ id?: number; object?: string }>;
    dedupeOpts: DedupeOptions;
  }> {
    let rawItems: unknown[] = [];
    try {
      rawItems = this.extractItemArray(stripAndParseJson(raw), itemsKey);
    } catch {
      // Fall through to salvage.
    }
    // Recover from truncated/oversized output (model hit the token limit).
    if (rawItems.length === 0) {
      const salvaged = salvageObjects(raw);
      if (salvaged.length > 0) {
        logger.warn({ recovered: salvaged.length }, 'vlm_salvaged_truncated_json');
        rawItems = salvaged;
      }
    }

    // Infer the coordinate convention once for the whole pass.
    const allCorners: number[][] = [];
    for (const it of rawItems) {
      const c = extractCorners((it as Record<string, unknown>)?.bounding_box ?? (it as Record<string, unknown>)?.bbox_2d ?? (it as Record<string, unknown>)?.box);
      if (c) allCorners.push(c);
    }
    const mode =
      this.opts.coordMode === 'auto'
        ? inferCoordMode(allCorners, img.width, img.height)
        : this.opts.coordMode;

    const dedupeOpts: DedupeOptions = {};

    // Two judge inputs, one batched call:
    //  - items with no flag at all -> judge the full label;
    //  - items the model flagged false -> judge the HEAD NOUN, so a belonging
    //    named after the fixture holding it is not deleted on one signal.
    // Both sets are tiny and repeat constantly ("floor", "wall", "blinds"), so
    // the judge's LRU turns this into ~zero calls in steady state.
    const unflagged = rawItems
      .filter((it) => parsePossessionFlag(it) === null)
      .map(labelOf)
      .filter((l): l is string => l !== null);
    const flaggedFalse = rawItems
      .filter((it) => parsePossessionFlag(it) === false)
      .map(labelOf)
      .filter((l): l is string => l !== null);
    // Head noun of each flagged-false label, plus the head of any trailing
    // clause, so a possession named inside a fixture's label can be rescued.
    const dropHeads = flaggedFalse.flatMap((l) => {
      const clause = trailingClause(l);
      return clause ? [headPhrase(l), headPhrase(clause)] : [headPhrase(l)];
    });
    const toJudge = [...new Set([...unflagged, ...dropHeads])];
    const verdicts = toJudge.length > 0 && this.possessionJudge
      ? await this.possessionJudge.judge(toJudge)
      : new Map<string, boolean>();
    const judgePossession = (label: string): boolean | null =>
      verdicts.get(normalizeText(label)) ?? null;

    const detected: DetectedItem[] = [];
    const rawForAudit: Array<{ id?: number; object?: string }> = [];
    let judgeDrops = 0;
    let flagDrops = 0;
    let overruled = 0;
    // Audit trail: every dropped item, so a false drop (a real belonging the
    // model mislabels as building fabric) is visible instead of silent.
    const dropped: Array<{ label: string; box: NormBox; by: 'flag' | 'judge' }> = [];
    for (const it of rawItems) {
      const o = it as Record<string, unknown>;
      rawForAudit.push({
        id: typeof o.id === 'number' ? o.id : undefined,
        object: typeof o.object === 'string' ? o.object : undefined,
      });
      const corners = extractCorners(o.bounding_box ?? o.bbox_2d ?? o.box);
      const box = corners ? cornersToNormBox(corners, mode, img.width, img.height) : null;
      const item = rawItemToDetectedItem(o, box, { judgePossession });
      if (item) {
        if (parsePossessionFlag(o) === false) {
          overruled += 1;
          const original = labelOf(o) ?? item.label;
          logger.info(
            {
              original,
              kept: item.label,
              relabelled: item.label !== original,
              head: headPhrase(item.label),
            },
            'possession_flag_overruled_by_judge',
          );
        }
        detected.push(item);
        continue;
      }
      // Distinguish "the model said no" from "the judge said no" for tuning;
      // items without a usable label/box were dropped for other reasons.
      const droppedLabel = labelOf(o);
      if (!droppedLabel || !box || isDegenerateBox(box)) continue;
      const byFlag = parsePossessionFlag(o) === false;
      if (byFlag) flagDrops += 1;
      else judgeDrops += 1;
      dropped.push({ label: droppedLabel, box, by: byFlag ? 'flag' : 'judge' });
    }
    if (flagDrops > 0 || judgeDrops > 0 || unflagged.length > 0) {
      logger.info(
        {
          flagDrops,
          judgeDrops,
          unflagged: unflagged.length,
          judged: toJudge.length,
          overruled,
          dropped,
        },
        'vlm_non_possessions_filtered',
      );
    }
    return { detected, rawForAudit, dedupeOpts };
  }

  private extractItemArray(parsed: unknown, itemsKey: string): unknown[] {
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') {
      const o = parsed as Record<string, unknown>;
      if (Array.isArray(o[itemsKey])) return o[itemsKey] as unknown[];
      if (Array.isArray(o.items)) return o.items as unknown[];
      if (Array.isArray(o.new_items)) return o.new_items as unknown[];
      if (Array.isArray(o.objects)) return o.objects as unknown[];
    }
    return [];
  }

  private async prepareImage(buffer: Buffer): Promise<PreparedImage> {
    const pipeline = sharp(buffer)
      .rotate() // honor EXIF orientation
      .resize(this.opts.maxImageSize, this.opts.maxImageSize, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    const { data, info } = await pipeline
      .jpeg({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    return {
      base64: data.toString('base64'),
      width: info.width,
      height: info.height,
      buffer: data,
    };
  }
}

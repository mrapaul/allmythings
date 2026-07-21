import sharp from 'sharp';
import type { DetectedItem } from '../types/detected-item';
import type { VlmClient } from '../clients/vlm-client';
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
  type CoordMode,
} from './vlm-detector.parse';

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

interface PreparedImage {
  base64: string;
  width: number;
  height: number;
}

export class VlmDetector {
  constructor(
    private readonly client: VlmClient,
    private readonly opts: VlmDetectorOptions,
  ) {}

  /** Run the full pipeline and return all detected items. */
  async detect(imageBuffer: Buffer): Promise<DetectedItem[]> {
    const items: DetectedItem[] = [];
    for await (const item of this.detectStream(imageBuffer)) {
      items.push(item);
    }
    return items;
  }

  /**
   * Stream items as each pass completes: all pass-1 items, then all pass-2
   * items. Lets the SSE route emit 'item' events incrementally.
   */
  async *detectStream(imageBuffer: Buffer): AsyncGenerator<DetectedItem> {
    const img = await this.prepareImage(imageBuffer);

    // --- Pass 1: detect everything ---
    const pass1Raw = await this.client.generateJson(
      buildPass1Prompt(img.width, img.height),
      img.base64,
    );
    const pass1Items = this.parsePass(pass1Raw, img, 'items');
    logger.info({ count: pass1Items.detected.length, model: this.client.modelName }, 'vlm_pass1_complete');

    const seen: DetectedItem[] = [];
    for (const item of pass1Items.detected) {
      const deduped = dedupeItems([...seen, item]);
      if (deduped.length > seen.length) {
        seen.push(item);
        yield item;
      }
    }

    if (!this.opts.twoPass) return;

    // --- Pass 2: audit for missed items ---
    try {
      const pass2Raw = await this.client.generateJson(
        buildPass2Prompt(img.width, img.height, pass1Items.rawForAudit),
        img.base64,
      );
      const pass2Items = this.parsePass(pass2Raw, img, 'new_items');
      logger.info({ count: pass2Items.detected.length }, 'vlm_pass2_complete');
      for (const item of pass2Items.detected) {
        const deduped = dedupeItems([...seen, item]);
        if (deduped.length > seen.length) {
          seen.push(item);
          yield item;
        }
      }
    } catch (err: unknown) {
      // Pass 2 is an enhancement; never fail the whole detection on it.
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'vlm_pass2_failed_continuing',
      );
    }
  }

  private parsePass(
    raw: string,
    img: PreparedImage,
    itemsKey: 'items' | 'new_items',
  ): { detected: DetectedItem[]; rawForAudit: Array<{ id?: number; object?: string }> } {
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

    const detected: DetectedItem[] = [];
    const rawForAudit: Array<{ id?: number; object?: string }> = [];
    for (const it of rawItems) {
      const o = it as Record<string, unknown>;
      rawForAudit.push({
        id: typeof o.id === 'number' ? o.id : undefined,
        object: typeof o.object === 'string' ? o.object : undefined,
      });
      const corners = extractCorners(o.bounding_box ?? o.bbox_2d ?? o.box);
      const box = corners ? cornersToNormBox(corners, mode, img.width, img.height) : null;
      const item = rawItemToDetectedItem(o, box);
      if (item) detected.push(item);
    }
    return { detected, rawForAudit };
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
    };
  }
}
